/** Formatting + parsing helpers shared across mobile admin screens. */

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Convert minutes since midnight (0–1440) to "HH:MM". */
export function minutesToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse "HH:MM" or "H:MM" to minutes since midnight. Returns null on
 * malformed input. Accepts 0–24 for the hour and 0–59 for the minute;
 * 24:00 is allowed and returns 1440.
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

/** YYYY-MM-DD ↔ Date (interpreted as a local-day boundary, no TZ shift). */
export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isValidYMD(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayLabel(d: number): string {
  return DAY_LABELS[d] ?? "?";
}
