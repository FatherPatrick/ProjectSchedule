import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isStripePaymentsEnabled } from "@/lib/flags";
import { getStripeClient } from "@/lib/integrations/stripe";
import { syncAccountFromWebhook } from "@/lib/domain/stripeConnect";
import {
  handleChargeDisputeCreated,
  handleChargeRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentSucceeded,
} from "@/lib/domain/paymentWebhooks";
import { reportError } from "@/lib/observability/reportError";

/**
 * Stripe webhook receiver (docs/STRIPE_SPEC.md §5). Handles both Connect
 * account events and payment events on one platform endpoint.
 *
 * The platform kill-switch gates this route the same way it gates admin
 * nav/pages — while `STRIPE_PAYMENTS_ENABLED` is off, Stripe shouldn't be
 * pointed at this endpoint at all, so an unexpected hit 404s instead of
 * touching the DB.
 */
export async function POST(req: Request) {
  if (!isStripePaymentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  // Signature verification requires the exact raw bytes Stripe signed —
  // read as text before any JSON parsing.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    reportError(err, { where: "stripe.webhook.verify" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency (§5): Stripe retries delivery on anything but a 2xx, so skip
  // work we've already completed for this `event.id`. Recorded *after*
  // successful processing (not before) so a crash mid-handler still gets
  // retried — each handler below is independently idempotent against
  // current DB state, so a concurrent duplicate delivery racing this check
  // is still safe even though the record-after ordering can't fully prevent it.
  const alreadyProcessed = await prisma.processedStripeEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await syncAccountFromWebhook(account.id, {
          chargesEnabled: Boolean(account.charges_enabled),
          payoutsEnabled: Boolean(account.payouts_enabled),
          detailsSubmitted: Boolean(account.details_submitted),
        });
        break;
      }
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        break;
    }
  } catch (err) {
    reportError(err, { where: "stripe.webhook.handle", eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }

  try {
    await prisma.processedStripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    // A concurrent duplicate delivery may have recorded it first — the
    // business-logic side effects above are already idempotent, so this is
    // just bookkeeping; a P2002 here means no harm was done.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      reportError(err, { where: "stripe.webhook.dedupe_record", eventId: event.id });
    }
  }

  return NextResponse.json({ received: true });
}
