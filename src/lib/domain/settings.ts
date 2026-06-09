import { prisma } from "../db/prisma";

const DEFAULT_GRANULARITY = 15;
/** Default booking window for fresh installs: 1 month. */
export const DEFAULT_MAX_ADVANCE_DAYS = 30;

export interface AppSettings {
  slotGranularityMin: number;
  /**
   * When true, the booking UI offers a final slot whose start time equals the
   * business close time (zero-length availability tail). Default false.
   */
  allowStartAtClose: boolean;
  /**
   * How far in advance clients may book, in days. `null` means no limit.
   * Defaults to {@link DEFAULT_MAX_ADVANCE_DAYS} (1 month) for new installs.
   */
  maxAdvanceDays: number | null;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      slotGranularityMin: DEFAULT_GRANULARITY,
      maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
    },
  });
  return {
    slotGranularityMin: row.slotGranularityMin,
    allowStartAtClose: row.allowStartAtClose,
    maxAdvanceDays: row.maxAdvanceDays,
  };
}

/** User-facing message when a requested time exceeds the book-out window. */
export const BEYOND_WINDOW_MESSAGE =
  "That date is further out than we're currently booking. Please choose a sooner date.";

/**
 * True when `startsAt` is past the configured "max book-out" window. Returns
 * false when no limit is set (`maxAdvanceDays === null`). Centralized so the
 * availability API and both public booking routes agree on the rule.
 */
export function isBeyondBookingWindow(
  startsAt: Date,
  maxAdvanceDays: number | null,
  nowMs: number = Date.now()
): boolean {
  if (maxAdvanceDays == null) return false;
  return startsAt.getTime() - nowMs > maxAdvanceDays * 86_400_000;
}

export async function updateSettings(patch: Partial<AppSettings>) {
  return prisma.setting.upsert({
    where: { id: "default" },
    update: patch,
    create: {
      id: "default",
      slotGranularityMin: DEFAULT_GRANULARITY,
      maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
      ...patch,
    },
  });
}
