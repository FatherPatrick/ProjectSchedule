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
  /** When true, marking an appointment COMPLETED fires a review-request email/SMS. */
  reviewRequestEnabled: boolean;
  /** URL clients are directed to when leaving a review (e.g. Google Maps review link). */
  reviewRequestUrl: string | null;
  /** When true, clients can join a per-service waitlist. */
  waitlistEnabled: boolean;
  /** Minutes a notified waitlist entry has to claim a freed slot. */
  waitlistClaimWindowMinutes: number;
}

export async function getSettings(salonId: string): Promise<AppSettings> {
  const row = await prisma.setting.upsert({
    where: { salonId },
    update: {},
    create: {
      // Use salonId as the Setting id — unique and stable per salon.
      id: salonId,
      salonId,
      slotGranularityMin: DEFAULT_GRANULARITY,
      maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
    },
  });
  return {
    slotGranularityMin: row.slotGranularityMin,
    allowStartAtClose: row.allowStartAtClose,
    maxAdvanceDays: row.maxAdvanceDays,
    reviewRequestEnabled: row.reviewRequestEnabled,
    reviewRequestUrl: row.reviewRequestUrl,
    waitlistEnabled: row.waitlistEnabled,
    waitlistClaimWindowMinutes: row.waitlistClaimWindowMinutes,
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

export async function updateSettings(
  salonId: string,
  patch: Partial<AppSettings>
) {
  return prisma.setting.upsert({
    where: { salonId },
    update: patch,
    create: {
      id: salonId,
      salonId,
      slotGranularityMin: DEFAULT_GRANULARITY,
      maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
      ...patch,
    },
  });
}
