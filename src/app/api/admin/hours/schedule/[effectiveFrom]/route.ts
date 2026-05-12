import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/admin";

/**
 * Delete every override row for a given `effectiveFrom` date (YYYY-MM-DD).
 * Always returns `{ ok: true }`, even if no rows existed.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ effectiveFrom: string }> }
) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { effectiveFrom } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return NextResponse.json(
      { error: "Use YYYY-MM-DD." },
      { status: 400 }
    );
  }
  await prisma.businessHoursSchedule.deleteMany({
    where: { effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`) },
  });
  return NextResponse.json({ ok: true });
}
