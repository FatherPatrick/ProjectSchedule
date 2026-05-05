/**
 * Small date/time helpers shared by admin business-hours and blackouts code.
 *
 * Conventions:
 *  - "hhmm" strings are 24h with a colon separator, e.g. "09:00", "18:30".
 *  - "minutes" means minutes-since-midnight (0..1440).
 *  - "yyyy-mm-dd" strings are calendar dates (no timezone).
 */

/** Parse "HH:MM" into minutes since midnight. Invalid parts are treated as 0. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Format minutes since midnight back into "HH:MM". */
export function minutesToHhmm(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Given a "yyyy-mm-dd" date, returns the "yyyy-mm-dd" of the next calendar
 * day. Pure string math (no timezone conversion) so callers retain control
 * of how the resulting day is interpreted.
 */
export function nextDay(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
