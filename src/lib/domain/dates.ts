/**
 * Small date/time helpers shared by admin business-hours and blackouts code.
 *
 * Conventions:
 *  - "hhmm" strings are 24h with a colon separator, e.g. "09:00", "18:30".
 *  - "minutes" means minutes-since-midnight (0..1440).
 *  - "yyyy-mm-dd" strings are calendar dates (no timezone).
 *
 * This module intentionally has zero dependencies (no Node, no Prisma,
 * no Next) so it can be consumed from the mobile package via the
 * `@shared/domain/dates` alias as well as the web app via
 * `@/lib/domain/dates`. Keeping all hh:mm parsing in one place prevents
 * the previous drift where mobile had a strict `parseHHMM` and the
 * server had a lax `hhmmToMinutes` that silently coerced bad input.
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
 * Strict variant of {@link hhmmToMinutes}. Parses "HH:MM" or "H:MM"
 * and returns minutes since midnight, or `null` if the input does not
 * match the grammar / range. Accepts 0..24 for hours and 0..59 for
 * minutes; "24:00" is allowed (== 1440) but "24:30" is not.
 *
 * Use this for untrusted user input (mobile + admin form submissions).
 * Use {@link hhmmToMinutes} only for internally normalised values.
 */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  if (h === 24 && mm !== 0) return null;
  return h * 60 + mm;
}

/**
 * Strict variant of {@link minutesToHhmm} — clamps to the 0..1440
 * window so out-of-range inputs still produce a valid HH:MM string
 * instead of "-1:60" / "25:00" garbage. Mobile + admin UIs should
 * prefer this when rendering values that originated from user input.
 */
export function minutesToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
