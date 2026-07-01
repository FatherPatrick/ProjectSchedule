export const BUSINESS_NAME =
  process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Polished Nail Studio";

export const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE ?? "America/Los_Angeles";

/** Platform base domain, e.g. "app.com". Per-salon URLs: https://<slug>.<domain>. */
export const APP_BASE_DOMAIN =
  process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "localhost:3000";

/** Build the canonical public URL for a salon by slug. */
export function salonAppUrl(slug: string): string {
  const domain = APP_BASE_DOMAIN;
  const isLocal =
    domain.startsWith("localhost") || domain.startsWith("127.0.0.1");
  return isLocal
    ? `http://${slug}.${domain}`
    : `https://${slug}.${domain}`;
}

// Cancellation window in hours — clients cannot self-cancel inside this window.
export const CANCELLATION_WINDOW_HOURS = 24;

// Default weekly hours seeded into BusinessHours table.
// dayOfWeek: 0=Sun, 1=Mon ... 6=Sat. Open 9am-6pm Thu-Sun.
export const DEFAULT_BUSINESS_HOURS: ReadonlyArray<{
  dayOfWeek: number;
  openMin: number;
  closeMin: number;
  active: boolean;
}> = [
  { dayOfWeek: 0, openMin: 9 * 60, closeMin: 18 * 60, active: true }, // Sun
  { dayOfWeek: 1, openMin: 0, closeMin: 0, active: false }, // Mon
  { dayOfWeek: 2, openMin: 0, closeMin: 0, active: false }, // Tue
  { dayOfWeek: 3, openMin: 0, closeMin: 0, active: false }, // Wed
  { dayOfWeek: 4, openMin: 9 * 60, closeMin: 18 * 60, active: true }, // Thu
  { dayOfWeek: 5, openMin: 9 * 60, closeMin: 18 * 60, active: true }, // Fri
  { dayOfWeek: 6, openMin: 9 * 60, closeMin: 18 * 60, active: true }, // Sat
];
