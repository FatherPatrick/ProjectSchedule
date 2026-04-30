import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bizWallClockToUTC } from "@/lib/timezone";

async function requireAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") return null;
  return s;
}

const bodySchema = z.object({
  fromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  reason: z.string().max(200).nullable(),
});

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function nextDay(yyyyMMdd: string) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { fromDay, toDay, allDay, startTime, endTime, reason } = parsed.data;

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
    const sMin = toMin(startTime);
    const eMin = toMin(endTime);
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
    data: { startsAt, endsAt, reason },
  });
  return NextResponse.json({ id: created.id });
}
