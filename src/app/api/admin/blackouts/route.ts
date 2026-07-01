import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { bizWallClockToUTC } from "@/lib/timezone";
import { hhmmToMinutes, nextDay } from "@/lib/domain/dates";
import { blackoutCreateSchema } from "@/lib/validation/blackouts";
import { requireAdminSalon } from "@/lib/auth/admin";
import type { BlackoutsListResponse } from "@/lib/api-types";

export const GET = withAdmin(async (req) => {
  const { salonId } = (await requireAdminSalon(req))!;
  const url = new URL(req.url);
  const includePast = url.searchParams.get("includePast") === "true";
  const rows = await prisma.blackout.findMany({
    where: includePast ? { salonId } : { salonId, endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  return NextResponse.json({
    data: rows.map((b) => ({
      id: b.id,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      reason: b.reason,
    })),
  } satisfies BlackoutsListResponse);
});

export const POST = withAdminJson(blackoutCreateSchema, async (data, req) => {
  const { salonId } = (await requireAdminSalon(req))!;
  const { fromDay, toDay, allDay, startTime, endTime, reason } = data;

  let startsAt: Date;
  let endsAt: Date;
  if (allDay) {
    // Cover the entire local day(s): from 00:00 of fromDay to 00:00 of (toDay+1).
    startsAt = bizWallClockToUTC(fromDay, 0);
    endsAt = bizWallClockToUTC(nextDay(toDay), 0);
  } else {
    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: "Provide start and end times." },
        { status: 400 }
      );
    }
    const sMin = hhmmToMinutes(startTime);
    const eMin = hhmmToMinutes(endTime);
    if (eMin <= sMin && fromDay === toDay) {
      return NextResponse.json(
        { error: "End time must be after start time." },
        { status: 400 }
      );
    }
    startsAt = bizWallClockToUTC(fromDay, sMin);
    endsAt = bizWallClockToUTC(toDay, eMin);
  }

  if (endsAt <= startsAt) {
    return NextResponse.json(
      { error: "End must be after start." },
      { status: 400 }
    );
  }

  const created = await prisma.blackout.create({
    data: { salonId, startsAt, endsAt, reason },
  });
  return NextResponse.json({ id: created.id });
});
