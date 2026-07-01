/**
 * Stripe Connect onboarding (docs/STRIPE_SPEC.md §2). Creates and tracks the
 * per-salon Express account; the account's actual charges/payouts capability
 * is authoritatively synced from the `account.updated` webhook, not from the
 * onboarding redirect (the redirect only means "they came back").
 */
import { prisma } from "@/lib/db/prisma";
import { getStripeClient } from "@/lib/integrations/stripe";

export interface ConnectStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  updatedAt: Date | null;
}

export async function getConnectStatus(salonId: string): Promise<ConnectStatus> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeAccountUpdatedAt: true,
    },
  });
  return {
    accountId: salon.stripeAccountId,
    chargesEnabled: salon.stripeChargesEnabled,
    payoutsEnabled: salon.stripePayoutsEnabled,
    detailsSubmitted: salon.stripeDetailsSubmitted,
    updatedAt: salon.stripeAccountUpdatedAt,
  };
}

/**
 * Creates the salon's Connect Express account if it doesn't have one yet,
 * then returns a fresh Account Link URL to redirect the admin to
 * Stripe-hosted onboarding. Safe to call again for an already-connected but
 * incomplete account — "Connect Stripe" and "Finish onboarding" are the same
 * action once an account id exists.
 */
export async function startConnectOnboarding(
  salonId: string,
  urls: { refreshUrl: string; returnUrl: string }
): Promise<string> {
  const stripe = getStripeClient();
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { stripeAccountId: true, name: true },
  });

  let accountId = salon.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      business_profile: { name: salon.name },
    });
    accountId = account.id;
    await prisma.salon.update({
      where: { id: salonId },
      data: { stripeAccountId: accountId },
    });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Express-hosted dashboard login link so the admin can view payouts, balance,
 * and bank details on Stripe's side (§2.3) — we don't rebuild any of that.
 */
export async function createExpressLoginLink(salonId: string): Promise<string> {
  const salon = await prisma.salon.findUniqueOrThrow({
    where: { id: salonId },
    select: { stripeAccountId: true },
  });
  if (!salon.stripeAccountId) {
    throw new Error("Salon has no connected Stripe account.");
  }
  const stripe = getStripeClient();
  const link = await stripe.accounts.createLoginLink(salon.stripeAccountId);
  return link.url;
}

/**
 * Applies an `account.updated` webhook payload to the owning salon. Payments
 * can only be "on" when charges are enabled (§2.2) — if Stripe later flips
 * charges off (KYC lapse, dispute threshold), auto-disable the salon's
 * payments toggle too so the booking flow reverts to pay-in-person instead of
 * silently trying to charge cards through a disabled account.
 */
export async function syncAccountFromWebhook(
  accountId: string,
  update: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }
): Promise<void> {
  const salon = await prisma.salon.findUnique({
    where: { stripeAccountId: accountId },
    select: { id: true, paymentsEnabled: true },
  });
  if (!salon) return;

  await prisma.salon.update({
    where: { id: salon.id },
    data: {
      stripeChargesEnabled: update.chargesEnabled,
      stripePayoutsEnabled: update.payoutsEnabled,
      stripeDetailsSubmitted: update.detailsSubmitted,
      stripeAccountUpdatedAt: new Date(),
      paymentsEnabled: update.chargesEnabled ? salon.paymentsEnabled : false,
    },
  });
}
