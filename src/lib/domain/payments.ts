/**
 * Payment amount/fee math, per-salon payment configuration, PaymentIntent
 * creation, and refunds (docs/STRIPE_SPEC.md §3, §4, §5.3, §6, §7, §8).
 */
import type { DepositType, PaymentKind, PaymentMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getStripeClient } from "@/lib/integrations/stripe";
import { reportError } from "@/lib/observability/reportError";
import type { PaymentsConfigUpdate } from "@/lib/validation/adminJson";

/** How long a payment hold reserves a slot before the sweeper releases it (§1.3, §6). */
export const PAYMENT_HOLD_MINUTES = 15;

/**
 * Stripe's practical minimum charge (~$0.50 USD equivalent). A computed
 * deposit/price below this is bumped up to it rather than silently skipping
 * the charge (docs/STRIPE_SPEC.md §8 — decided default: always actually
 * collect the configured payment).
 */
export const STRIPE_MIN_CHARGE_CENTS = 50;

function bumpToStripeMinimum(amountCents: number): number {
  return amountCents < STRIPE_MIN_CHARGE_CENTS ? STRIPE_MIN_CHARGE_CENTS : amountCents;
}

export interface SalonPaymentConfig {
  paymentsEnabled: boolean;
  paymentMode: PaymentMode;
  depositType: DepositType;
  depositCents: number | null;
  depositPercent: number | null;
}

export interface BookingCharge {
  amountCents: number;
  kind: PaymentKind;
}

/**
 * What (if anything) to charge for a booking. Returns `null` when no online
 * payment is required: payments off, mode NONE, or a free service.
 */
export function amountForBooking(
  salon: SalonPaymentConfig,
  service: { priceCents: number }
): BookingCharge | null {
  if (!salon.paymentsEnabled || salon.paymentMode === "NONE") return null;
  if (service.priceCents <= 0) return null;

  if (salon.paymentMode === "FULL") {
    return { amountCents: bumpToStripeMinimum(service.priceCents), kind: "FULL" };
  }

  const deposit =
    salon.depositType === "PERCENT"
      ? Math.round(service.priceCents * ((salon.depositPercent ?? 0) / 100))
      : (salon.depositCents ?? 0);
  const capped = Math.min(deposit, service.priceCents);
  if (capped <= 0) return null;
  return { amountCents: bumpToStripeMinimum(capped), kind: "DEPOSIT" };
}

/** Platform's cut, as a plain percent (e.g. "10" → 10%), read from env. */
export function getPlatformFeePercent(): number {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function computeApplicationFeeCents(amountCents: number): number {
  return Math.round((amountCents * getPlatformFeePercent()) / 100);
}

export interface PaymentsConfig extends SalonPaymentConfig {
  stripeChargesEnabled: boolean;
}

export async function getPaymentsConfig(salonId: string): Promise<PaymentsConfig> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: {
      paymentsEnabled: true,
      paymentMode: true,
      depositType: true,
      depositCents: true,
      depositPercent: true,
      stripeChargesEnabled: true,
    },
  });
  return salon;
}

/**
 * Persists the admin's payment config. Payments can only be turned on once
 * the salon's Connect account has `stripeChargesEnabled` (§2.2/§3) — this is
 * re-checked server-side rather than trusting the greyed-out UI toggle.
 * Deposit fields are cleared for whichever `depositType` isn't active so a
 * stale value never lingers and gets picked up after a later mode switch.
 */
export async function updatePaymentsConfig(
  salonId: string,
  patch: PaymentsConfigUpdate
): Promise<void> {
  if (patch.paymentsEnabled) {
    const salon = await prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { stripeChargesEnabled: true },
    });
    if (!salon.stripeChargesEnabled) {
      throw new Error(
        "Connect Stripe and finish onboarding before enabling payments."
      );
    }
  }

  await prisma.salon.update({
    where: { id: salonId },
    data: {
      paymentsEnabled: patch.paymentsEnabled,
      paymentMode: patch.paymentMode,
      depositType: patch.depositType,
      depositCents: patch.depositType === "FIXED" ? (patch.depositCents ?? null) : null,
      depositPercent: patch.depositType === "PERCENT" ? (patch.depositPercent ?? null) : null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                    Booking-time PaymentIntent creation (§4)                */
/* -------------------------------------------------------------------------- */

export interface BookingPaymentContext extends SalonPaymentConfig {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  currency: string;
}

/** Everything the booking routes need to decide whether — and how — to charge. */
export async function getBookingPaymentContext(
  salonId: string
): Promise<BookingPaymentContext> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: {
      paymentsEnabled: true,
      paymentMode: true,
      depositType: true,
      depositCents: true,
      depositPercent: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      currency: true,
    },
  });
  return salon;
}

export interface PaymentHoldResult {
  clientSecret: string;
  publishableKey: string;
  connectedAccountId: string;
  amountCents: number;
  currency: string;
}

/**
 * Creates a PaymentIntent on the salon's connected account for a freshly
 * created `PENDING_PAYMENT` appointment, and persists the local `Payment`
 * row (`REQUIRES_PAYMENT`). `postPaymentStatus` is stashed in the PI's
 * metadata so the webhook (which has no other way to know whether this was
 * an immediate-book or a propose/approval request) knows what status to
 * flip the appointment to on success (§4.3, §5.1).
 */
export async function createPaymentIntentForAppointment(opts: {
  appointmentId: string;
  salonId: string;
  stripeAccountId: string;
  amountCents: number;
  currency: string;
  kind: PaymentKind;
  postPaymentStatus: "CONFIRMED" | "PENDING";
}): Promise<PaymentHoldResult> {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.");
  }

  const stripe = getStripeClient();
  const applicationFeeCents = computeApplicationFeeCents(opts.amountCents);
  const pi = await stripe.paymentIntents.create(
    {
      amount: opts.amountCents,
      currency: opts.currency,
      application_fee_amount: applicationFeeCents,
      automatic_payment_methods: { enabled: true },
      metadata: {
        appointmentId: opts.appointmentId,
        salonId: opts.salonId,
        kind: opts.kind,
        postPaymentStatus: opts.postPaymentStatus,
      },
    },
    {
      stripeAccount: opts.stripeAccountId,
      idempotencyKey: `pi_create_${opts.appointmentId}`,
    }
  );
  if (!pi.client_secret) {
    throw new Error("Stripe did not return a client secret.");
  }

  await prisma.payment.create({
    data: {
      salonId: opts.salonId,
      appointmentId: opts.appointmentId,
      stripePaymentIntentId: pi.id,
      stripeAccountId: opts.stripeAccountId,
      amountCents: opts.amountCents,
      applicationFeeCents,
      currency: opts.currency,
      status: "REQUIRES_PAYMENT",
      kind: opts.kind,
    },
  });

  return {
    clientSecret: pi.client_secret,
    publishableKey,
    connectedAccountId: opts.stripeAccountId,
    amountCents: opts.amountCents,
    currency: opts.currency,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Refunds (§5.3)                                */
/* -------------------------------------------------------------------------- */

export type RefundResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Refunds a payment on Stripe (full by default, or a specific `amountCents`
 * for a partial refund) and optimistically updates the local row — the
 * `charge.refunded` webhook is the authoritative reconciliation (§5.1) in
 * case this update races with a webhook delivery.
 *
 * Application-fee policy (§5.3, locked default): the platform fee is only
 * returned on a refund that fully zeroes out the payment; a partial refund
 * (or a no-show/late-cancel forfeit, which never calls this at all) keeps
 * the platform's cut.
 */
export async function refundPayment(
  salonId: string,
  paymentId: string,
  amountCents?: number
): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.salonId !== salonId) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    return { ok: false, status: 409, error: "Only a succeeded payment can be refunded." };
  }

  const remaining = payment.amountCents - payment.refundedCents;
  const refundAmount = amountCents ?? remaining;
  if (refundAmount <= 0 || refundAmount > remaining) {
    return { ok: false, status: 400, error: "Invalid refund amount." };
  }
  const isFullRefund = refundAmount === remaining && payment.refundedCents === 0;

  try {
    const stripe = getStripeClient();
    await stripe.refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmount,
        refund_application_fee: isFullRefund,
      },
      {
        stripeAccount: payment.stripeAccountId,
        idempotencyKey: `refund_${paymentId}_${payment.refundedCents}_${refundAmount}`,
      }
    );
  } catch (err) {
    reportError(err, { where: "payments.refund", paymentId });
    return { ok: false, status: 502, error: "Stripe refund failed. Try again." };
  }

  const newRefunded = payment.refundedCents + refundAmount;
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      refundedCents: newRefunded,
      status: newRefunded >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
    },
  });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                      Hold expiry sweeper (§1.3, §6)                        */
/* -------------------------------------------------------------------------- */

/**
 * Releases one expired `PENDING_PAYMENT` hold: cancels the appointment,
 * best-effort cancels the PaymentIntent on Stripe (so it can't be paid after
 * the slot's already gone), and marks the local `Payment` row `CANCELLED`.
 * A no-op (returns quietly) if the appointment was already moved out of
 * `PENDING_PAYMENT` by a concurrent webhook — the cron's `findMany` +
 * per-row `updateMany` guard makes this safe to run repeatedly.
 */
export async function expireHold(appointmentId: string): Promise<void> {
  const released = await prisma.appointment.updateMany({
    where: { id: appointmentId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", holdExpiresAt: null },
  });
  if (released.count === 0) return;

  const payment = await prisma.payment.findFirst({
    where: { appointmentId, status: "REQUIRES_PAYMENT" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) return;

  try {
    const stripe = getStripeClient();
    await stripe.paymentIntents.cancel(payment.stripePaymentIntentId, undefined, {
      stripeAccount: payment.stripeAccountId,
    });
  } catch (err) {
    // Best-effort — the hold is already released locally either way.
    reportError(err, {
      where: "payments.expireHold.cancelPaymentIntent",
      appointmentId,
      paymentId: payment.id,
    });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "CANCELLED" },
  });
}
