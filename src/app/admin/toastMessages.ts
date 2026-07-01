/**
 * Centralized admin toast copy, keyed by the `?saved=` / `?error=` query-param
 * value that server actions redirect to. `AdminToaster` looks these up so every
 * admin page shows a specific message (previously only the admins page mapped
 * them; services/hours fell back to a generic "Changes saved.").
 */
export const SAVED_MESSAGES: Record<string, string> = {
  // hours
  hours: "Business hours saved.",
  schedule: "Scheduled change added.",
  // services
  created: "Service added.",
  toggled: "Service updated.",
  // admins
  added: "Admin added.",
  removed: "Admin removed.",
  notify: "Notification preference updated.",
  // shared (services delete + scheduled-change delete)
  deleted: "Deleted.",
  // appearance
  appearance: "Appearance updated.",
  logo: "Logo uploaded.",
  logo_removed: "Logo removed.",
  // payments
  stripe_returned: "Welcome back. Stripe status updates automatically once onboarding is confirmed.",
  payments_config: "Payment settings updated.",
  refund_issued: "Refund issued.",
};

export const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That doesn't look like a valid phone number.",
  env: "This phone is managed via the ADMIN_PHONES env var and can't be removed here.",
  self: "You can't remove your own admin access.",
  // appearance / logo upload
  logo_empty: "Choose a file to upload.",
  logo_invalid_type: "Logo must be a PNG, JPEG, WebP, or SVG image.",
  logo_too_large: "Logo must be 1 MB or smaller.",
  logo_sanitize_failed: "That SVG couldn't be sanitized safely — try a PNG/JPEG/WebP instead.",
  // payments
  stripe_connect_failed: "Couldn't start Stripe onboarding. Try again in a moment.",
  stripe_login_link_failed: "Couldn't open the Stripe dashboard. Try again in a moment.",
  payments_not_ready: "Finish connecting Stripe before enabling payments.",
  refund_failed: "Couldn't issue the refund. Try again in a moment.",
};
