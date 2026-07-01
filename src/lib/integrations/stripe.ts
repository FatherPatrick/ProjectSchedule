import Stripe from "stripe";

let _client: Stripe | null = null;

/**
 * Lazily-constructed Stripe client, keyed off `STRIPE_SECRET_KEY`. Throws if
 * the key isn't set — callers only reach this once `isStripePaymentsEnabled()`
 * has already gated the code path, and env validation requires the key in
 * production whenever that flag is on, so a missing key here means a dev
 * environment exercising a Stripe-only path without configuring it.
 */
export function getStripeClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — Stripe payments are not configured.");
  }
  _client = new Stripe(key);
  return _client;
}
