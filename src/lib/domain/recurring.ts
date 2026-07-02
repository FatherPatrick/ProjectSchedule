import { nanoid } from "nanoid";
import type { RecurrenceRule } from "@prisma/client";
import { prisma } from "../db/prisma";

/** Admin picks how many visits to book in one go (docs/FEATURE_OPPORTUNITIES_SPEC.md #9). */
export const MIN_RECURRING_OCCURRENCES = 2;
export const MAX_RECURRING_OCCURRENCES = 12;

/** Next date in the cadence, computed from the *previous ideal* date — not
 *  from whatever actually got booked — so a single skipped occurrence
 *  doesn't shift the rest of the series. */
export function nextOccurrenceStart(date: Date, rule: RecurrenceRule): Date {
  if (rule === "MONTHLY") {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  const days = rule === "WEEKLY" ? 7 : 14;
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Same conflict rule the booking routes use: a CONFIRMED appointment or an
 *  unexpired payment hold overlapping the window counts as busy. */
async function isSlotTaken(salonId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
  const conflict = await prisma.appointment.findFirst({
    where: {
      salonId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } },
      ],
    },
    select: { id: true },
  });
  return Boolean(conflict);
}

export type RecurringSeriesResult =
  | {
      ok: true;
      firstAppointmentId: string;
      managementToken: string;
      createdCount: number;
      skippedDates: Date[];
    }
  | { ok: false; status: number; error: string };

/**
 * Books a recurring series (docs/FEATURE_OPPORTUNITIES_SPEC.md #9): the
 * first occurrence, then up to `occurrences - 1` more spaced by `rule`. The
 * *first* occurrence conflicting is a hard failure (it's the slot the admin
 * actually asked for) — a later occurrence conflicting is skipped instead
 * (not a series-blocking error), and the cadence keeps going from where
 * that occurrence *would* have been, not from the last one actually booked.
 * Admin-only — never charges, never carries add-ons or package redemption
 * (see the spec doc's scope decision for why).
 */
export async function createRecurringSeries(opts: {
  salonId: string;
  serviceId: string;
  clientId: string;
  firstStartsAt: Date;
  durationMinutes: number;
  rule: RecurrenceRule;
  occurrences: number;
  notes?: string;
}): Promise<RecurringSeriesResult> {
  const { salonId, serviceId, clientId, firstStartsAt, durationMinutes, rule, occurrences, notes } =
    opts;
  const durationMs = durationMinutes * 60_000;
  const firstEndsAt = new Date(firstStartsAt.getTime() + durationMs);

  if (await isSlotTaken(salonId, firstStartsAt, firstEndsAt)) {
    return {
      ok: false,
      status: 409,
      error: "That time overlaps an existing confirmed appointment.",
    };
  }

  const first = await prisma.appointment.create({
    data: {
      salonId,
      serviceId,
      clientId,
      startsAt: firstStartsAt,
      endsAt: firstEndsAt,
      status: "CONFIRMED",
      managementToken: nanoid(24),
      notes,
      recurrenceRule: rule,
    },
  });

  let createdCount = 1;
  const skippedDates: Date[] = [];
  let cursor = firstStartsAt;
  for (let i = 1; i < occurrences; i++) {
    cursor = nextOccurrenceStart(cursor, rule);
    const endsAt = new Date(cursor.getTime() + durationMs);
    if (await isSlotTaken(salonId, cursor, endsAt)) {
      skippedDates.push(cursor);
      continue;
    }
    await prisma.appointment.create({
      data: {
        salonId,
        serviceId,
        clientId,
        startsAt: cursor,
        endsAt,
        status: "CONFIRMED",
        managementToken: nanoid(24),
        notes,
        parentAppointmentId: first.id,
      },
    });
    createdCount++;
  }

  return {
    ok: true,
    firstAppointmentId: first.id,
    managementToken: first.managementToken,
    createdCount,
    skippedDates,
  };
}
