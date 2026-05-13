/** Formatting + parsing helpers shared across mobile admin screens. */

// HH:MM <-> minutes parsing/formatting now lives in the shared domain
// module so the web app and the mobile app are guaranteed to apply the
// same validation rules. Re-export so existing imports from
// "@/lib/format" keep working without touching every screen.
export { minutesToHHMM, parseHHMM } from "@shared/domain/dates";

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
