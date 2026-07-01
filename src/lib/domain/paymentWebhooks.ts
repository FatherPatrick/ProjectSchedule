/**
 * Stripe payment-event handlers (docs/STRIPE_SPEC.md §5.1). Called from
 * `/api/stripe/webhook` after signature verification + idempotency dedupe.
 * These are the *only* place a booking is confirmed from a payment — never
 * from client-reported success (§4.1, Appendix).
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { sendNotifications } from "@/lib/integrations/notifications";
import { notifyAdminsOfBooking } from "@/lib/integrations/adminSms";
import { pushToAdmins } from "@/lib/integrations/push";
import { reportError } from "@/lib/observability/reportError";
import { formatBiz } from "@/lib/timezone";

function resolvePostPaymentStatus(pi: Stripe.PaymentIntent): "CONFIRMED" | "PENDING" {
  return pi.metadata?.postPaymentStatus === "PENDING" ? "PENDING" : "CONFIRMED";
}

/**
 * Flips the appointment to CONFIRMED/PENDING and fires the same
 * post-create notifications the unpaid flow fires immediately — deferred
 * here until money has actually moved. Idempotent: a webhook replay after
 * the `Payment` is already SUCCEEDED (or the appointment already moved past
 * `PENDING_PAYMENT`) is a no-op.
 */
export async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId: pi.id } });
  if (!payment) return;
  if (payment.status === "SUCCEEDED") return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });

  const postPaymentStatus = resolvePostPaymentStatus(pi);
  const updated = await prisma.appointment.updateMany({
    where: { id: payment.appointmentId, status: "PENDING_PAYMENT" },
    data: { status: postPaymentStatus, holdExpiresAt: null },
  });
  if (updated.count === 0) return; // already transitioned by a prior delivery

  const appt = await prisma.appointment.findUnique({
    where: { id: payment.appointmentId },
    include: { client: true, service: true, salon: true },
  });
  if (!appt) return;

  const whenLabel = formatBiz(appt.startsAt, "EEE MMM d, h:mm a", appt.salon.timezone);

  if (postPaymentStatus === "CONFIRMED") {
    sendNotifications(appt.id, "CONFIRMATION").catch((err) =>
      reportError(err, { where: "paymentWebhooks.succeeded.notify", appointmentId: appt.id })
    );
    notifyAdminsOfBooking({
      kind: "booked",
      salonId: appt.salonId,
      salonName: appt.salon.name,
      clientName: appt.client.name,
      serviceName: appt.service.name,
      whenLabel,
    });
  } else {
    pushToAdmins(
      {
        title: "New appointment request",
        body: `${appt.client.name} · ${appt.service.name} · ${whenLabel}`,
        data: { appointmentId: appt.id, kind: "PENDING_REQUEST" },
      },
      { appointmentId: appt.id, salonId: appt.salonId }
    );
    notifyAdminsOfBooking({
      kind: "requested",
      salonId: appt.salonId,
      salonName: appt.salon.name,
      clientName: appt.client.name,
      serviceName: appt.service.name,
      whenLabel,
    });
  }
}

/**
 * Records the failure; the hold is intentionally left in place to expire
 * naturally (the client may retry within the same hold window) — the
 * sweeper (§6) cleans up whatever's left unpaid.
 */
export async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId: pi.id } });
  if (!payment || payment.status === "SUCCEEDED" || payment.status === "FAILED") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      failureReason: pi.last_payment_error?.message ?? null,
    },
  });
}

/**
 * Source of truth for refund reconciliation (§5.1) — applies whether the
 * refund was initiated by us (`refundPayment`) or directly in the Stripe
 * dashboard.
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!payment) return;

  const refundedCents = charge.amount_refunded;
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedCents,
      status:
        refundedCents >= payment.amountCents
          ? "REFUNDED"
          : refundedCents > 0
            ? "PARTIALLY_REFUNDED"
            : payment.status,
    },
  });
}

/**
 * Disputes hit the salon's connected account directly — we don't manage the
 * dispute lifecycle, just record + alert (§5.1: "at least record it").
 */
export async function handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  const payment = paymentIntentId
    ? await prisma.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } })
    : null;

  reportError(new Error("Stripe dispute created"), {
    where: "paymentWebhooks.disputeCreated",
    disputeId: dispute.id,
    paymentIntentId,
    paymentId: payment?.id,
    salonId: payment?.salonId,
    amount: dispute.amount,
    reason: dispute.reason,
  });

  if (payment) {
    pushToAdmins(
      {
        title: "Payment disputed",
        body: `A client disputed a $${(dispute.amount / 100).toFixed(2)} charge. Check Stripe for details.`,
        data: { paymentId: payment.id, kind: "PAYMENT_DISPUTED" },
      },
      { salonId: payment.salonId }
    );
  }
}
