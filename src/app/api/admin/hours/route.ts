import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { businessHoursJsonSaveSchema } from "@/lib/validation/adminJson";
import type { HoursResponse } from "@/lib/api-types";

/**
 * GET — returns all 7 weekly default rows (creating any missing rows on the
 * fly is the responsibility of the caller; this endpoint just reads).
 */
export const GET = withAdmin(async () => {
  const rows = await prisma.businessHours.findMany({
    orderBy: { dayOfWeek: "asc" },
  });
  // Always return 7 entries, defaulting missing days to inactive 9–18.
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
  const days = Array.from({ length: 7 }, (_, d) => {
    const r = byDay.get(d);
    return {
      dayOfWeek: d,
      openMin: r?.openMin ?? 9 * 60,
      closeMin: r?.closeMin ?? 18 * 60,
      active: r?.active ?? false,
    };
  });
  return NextResponse.json({ data: { days } } satisfies HoursResponse);
});

/**
 * PUT — replace all 7 weekly defaults atomically.
 */
export const PUT = withAdminJson(businessHoursJsonSaveSchema, async (data) => {
  for (const d of data.days) {
    if (d.closeMin < d.openMin) {
      return NextResponse.json(
        { error: `Day ${d.dayOfWeek}: close must be at or after open.` },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(
    data.days.map((day) =>
      prisma.businessHours.upsert({
        where: { dayOfWeek: day.dayOfWeek },
        update: {
          openMin: day.openMin,
          closeMin: day.closeMin,
          active: day.active,
        },
        create: {
          dayOfWeek: day.dayOfWeek,
          openMin: day.openMin,
          closeMin: day.closeMin,
          active: day.active,
        },
      })
    )
  );
  return NextResponse.json({ ok: true });
});
