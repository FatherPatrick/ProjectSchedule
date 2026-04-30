export const BUSINESS_NAME =
  process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Polished Nail Studio";

export const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE ?? "America/Los_Angeles";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Cancellation window in hours — clients cannot self-cancel inside this window.
export const CANCELLATION_WINDOW_HOURS = 24;

// Slot granularity in minutes for the booking calendar.
export const SLOT_GRANULARITY_MIN = 15;

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
