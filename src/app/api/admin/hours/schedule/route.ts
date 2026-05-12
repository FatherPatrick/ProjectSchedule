import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";
import { businessHoursScheduleJsonCreateSchema } from "@/lib/validation/adminJson";
import { bizDateKey } from "@/lib/timezone";

/**
 * GET — list future overrides (`effectiveFrom > today`), grouped by date.
 */
export async function GET(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const includePast = url.searchParams.get("includePast") === "true";

  const todayKey = bizDateKey(new Date());
  const todayMidnightUTC = new Date(`${todayKey}T00:00:00.000Z`);
  const rows = await prisma.businessHoursSchedule.findMany({
    where: includePast ? {} : { effectiveFrom: { gt: todayMidnightUTC } },
    orderBy: [{ effectiveFrom: "asc" }, { dayOfWeek: "asc" }],
  });

  // Group by date for caller convenience.
  type Group = {
    effectiveFrom: string;
    note: string | null;
    days: { dayOfWeek: number; openMin: number; closeMin: number; active: boolean }[];
  };
  const byDate = new Map<string, Group>();
  for (const r of rows) {
    const key = r.effectiveFrom.toISOString().slice(0, 10);
    let g = byDate.get(key);
    if (!g) {
      g = { effectiveFrom: key, note: r.note, days: [] };
      byDate.set(key, g);
    }
    g.days.push({
      dayOfWeek: r.dayOfWeek,
      openMin: r.openMin,
      closeMin: r.closeMin,
      active: r.active,
    });
  }
  return NextResponse.json({ data: [...byDate.values()] });
}

/**
 * POST — upsert all 7 override rows for one `effectiveFrom` date.
 */
export async function POST(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = businessHoursScheduleJsonCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const { effectiveFrom: dateStr, note, days } = parsed.data;
  if (dateStr <= bizDateKey(new Date())) {
    return NextResponse.json(
      { error: "Effective date must be in the future." },
      { status: 400 }
    );
  }
  for (const d of days) {
    if (d.closeMin < d.openMin) {
      return NextResponse.json(
        { error: `Day ${d.dayOfWeek}: close must be at or after open.` },
        { status: 400 }
      );
    }
  }
  const effectiveFrom = new Date(`${dateStr}T00:00:00.000Z`);

  await prisma.$transaction(
    days.map((day) =>
      prisma.businessHoursSchedule.upsert({
        where: {
          effectiveFrom_dayOfWeek: { effectiveFrom, dayOfWeek: day.dayOfWeek },
        },
        update: {
          openMin: day.openMin,
          closeMin: day.closeMin,
          active: day.active,
          note,
        },
        create: {
          effectiveFrom,
          dayOfWeek: day.dayOfWeek,
          openMin: day.openMin,
          closeMin: day.closeMin,
          active: day.active,
          note,
        },
      })
    )
  );
  return NextResponse.json({ ok: true });
}
