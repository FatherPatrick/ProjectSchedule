import { prisma } from "../db/prisma";
import {
  bizDateKey,
  bizDayOfWeek,
  bizWallClockToUTC,
  formatBiz,
} from "../timezone";
import { getSettings } from "./settings";

export interface Slot {
  /** ISO start time (UTC). */
  startISO: string;
  /** Display label like "9:00 AM" in business timezone. */
  label: string;
}

/** Convert a YYYY-MM-DD business-tz date key into a midnight-UTC Date used to
 *  match against `BusinessHoursSchedule.effectiveFrom` (date-only semantics). */
function dateKeyToEffectiveFrom(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Resolve the hours that apply to a specific business-tz date. Returns the
 *  most recent scheduled override for that day-of-week with effectiveFrom <=
 *  the date, falling back to the default `BusinessHours` row.
 *
 *  Returns null if the day is closed or unconfigured.
 */
export async function getEffectiveHoursForDate(opts: {
  salonId: string;
  dateKey: string;
  dayOfWeek: number;
}): Promise<{ openMin: number; closeMin: number; active: boolean } | null> {
  const { salonId, dateKey, dayOfWeek } = opts;
  const cutoff = dateKeyToEffectiveFrom(dateKey);

  const override = await prisma.businessHoursSchedule.findFirst({
    where: { salonId, dayOfWeek, effectiveFrom: { lte: cutoff } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (override) {
    return {
      openMin: override.openMin,
      closeMin: override.closeMin,
      active: override.active,
    };
  }

  // BusinessHours.dayOfWeek is no longer globally unique after Phase 1c —
  // the unique constraint is now @@unique([salonId, dayOfWeek]).
  const base = await prisma.businessHours.findUnique({
    where: { salonId_dayOfWeek: { salonId, dayOfWeek } },
  });
  if (!base) return null;
  return {
    openMin: base.openMin,
    closeMin: base.closeMin,
    active: base.active,
  };
}

/**
 * Compute available start-time slots for a given service on a given local date.
 * Honors business hours and excludes overlaps with existing confirmed
 * appointments and admin blackout ranges.
 */
export async function getAvailableSlots(opts: {
  salonId: string;
  serviceId: string;
  /** YYYY-MM-DD in business timezone. */
  dateKey: string;
}): Promise<Slot[]> {
  const { salonId, serviceId, dateKey } = opts;

  const [service, settings] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    getSettings(salonId),
  ]);
  if (!service || !service.active) return [];

  // Determine the day's business hours.
  const dateMidUTC = bizWallClockToUTC(dateKey, 12 * 60); // noon to avoid DST edges
  const dow = bizDayOfWeek(dateMidUTC);
  const hours = await getEffectiveHoursForDate({ salonId, dateKey, dayOfWeek: dow });
  if (!hours || !hours.active || hours.openMin >= hours.closeMin) return [];

  const dayStart = bizWallClockToUTC(dateKey, 0);
  const dayEnd = bizWallClockToUTC(dateKey, 24 * 60);

  const now = new Date();

  // Pull existing confirmed appointments (plus unexpired payment holds) and
  // blackouts overlapping this day, scoped to this salon so cross-tenant
  // data never blocks slots.
  const [appts, blackouts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        salonId,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
        ],
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.blackout.findMany({
      where: {
        salonId,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const busy = [...appts, ...blackouts];
  // Latest start permitted by the "max book-out" setting (null = no limit).
  const maxStart =
    settings.maxAdvanceDays == null
      ? null
      : new Date(now.getTime() + settings.maxAdvanceDays * 86_400_000);
  const slots: Slot[] = [];

  // Last possible start so the appointment ends by closeMin.
  const lastStart = hours.closeMin - service.durationMinutes;

  for (
    let m = hours.openMin;
    m <= lastStart;
    m += settings.slotGranularityMin
  ) {
    const start = bizWallClockToUTC(dateKey, m);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);

    if (start <= now) continue; // no past slots
    if (maxStart && start > maxStart) continue; // beyond the book-out window

    const overlaps = busy.some((b) => b.startsAt < end && b.endsAt > start);
    if (overlaps) continue;

    slots.push({
      startISO: start.toISOString(),
      label: formatBiz(start, "h:mm a"),
    });
  }

  return slots;
}

export { bizDateKey };
