import { validateEnv } from "./env";

/**
 * Global kill-switch for the Stripe Connect payments feature
 * (docs/STRIPE_SPEC.md). Defaults off. Later phases gate admin nav/pages,
 * API routes, and the webhook behind this — nothing consumes it yet.
 *
 * A salon's own `paymentsEnabled` toggle additionally gates whether that
 * salon actually charges clients once this global flag is on.
 */
export function isStripePaymentsEnabled(): boolean {
  return validateEnv().STRIPE_PAYMENTS_ENABLED === "true";
}
