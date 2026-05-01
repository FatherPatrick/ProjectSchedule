import { prisma } from "./prisma";
import {
  bizDateKey,
  bizDayOfWeek,
  bizWallClockToUTC,
  formatBiz,
} from "./timezone";
import { getSettings } from "./settings";

export interface Slot {
  /** ISO start time (UTC). */
  startISO: string;
  /** Display label like "9:00 AM" in business timezone. */
  label: string;
}

/**
 * Compute available start-time slots for a given service on a given local date.
 * Honors business hours and excludes overlaps with existing confirmed
 * appointments and admin blackout ranges.
 */
export async function getAvailableSlots(opts: {
  serviceId: string;
  /** YYYY-MM-DD in business timezone. */
  dateKey: string;
}): Promise<Slot[]> {
  const { serviceId, dateKey } = opts;

  const [service, settings] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    getSettings(),
  ]);
  if (!service || !service.active) return [];

  // Determine the day's business hours.
  const dateMidUTC = bizWallClockToUTC(dateKey, 12 * 60); // noon to avoid DST edges
  const dow = bizDayOfWeek(dateMidUTC);
  const hours = await prisma.businessHours.findUnique({
    where: { dayOfWeek: dow },
  });
  if (!hours || !hours.active || hours.openMin >= hours.closeMin) return [];

  const dayStart = bizWallClockToUTC(dateKey, 0);
  const dayEnd = bizWallClockToUTC(dateKey, 24 * 60);

  // Pull existing confirmed appointments and blackouts overlapping this day.
  const [appts, blackouts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.blackout.findMany({
      where: {
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const busy = [...appts, ...blackouts];
  const now = new Date();
  const slots: Slot[] = [];

  // Optionally allow appointments to start exactly at close time.
  const lastStart = settings.allowStartAtClose
    ? hours.closeMin
    : hours.closeMin - service.durationMinutes;

  for (
    let m = hours.openMin;
    m <= lastStart;
    m += settings.slotGranularityMin
  ) {
    const start = bizWallClockToUTC(dateKey, m);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);

    if (start <= now) continue; // no past slots

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
