import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";

/**
 * List appointments in `[from, to)`. Both bounds are ISO timestamps (UTC).
 *
 * Defaults: today (in server time) through 30 days out. Returns at most 500
 * rows ordered by start time, in a shape that matches the web admin calendar
 * loader (client + service joined).
 */
const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
});

const MAX_ROWS = 500;
const DEFAULT_RANGE_DAYS = 30;

export async function GET(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 }
    );
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const from = parsed.data.from ? new Date(parsed.data.from) : startOfToday;
  const to = parsed.data.to
    ? new Date(parsed.data.to)
    : new Date(startOfToday.getTime() + DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (to <= from) {
    return NextResponse.json(
      { error: "`to` must be after `from`." },
      { status: 400 }
    );
  }

  const rows = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: MAX_ROWS,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      notes: true,
      client: { select: { id: true, name: true, email: true, phone: true } },
      service: {
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      },
    },
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      notes: r.notes,
      client: r.client,
      service: r.service,
    })),
  });
}
