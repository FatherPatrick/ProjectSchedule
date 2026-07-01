import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";

/**
 * Delete every override row for a given `effectiveFrom` date (YYYY-MM-DD)
 * belonging to this salon. Always returns `{ ok: true }`, even if no rows existed.
 */
export const DELETE = withAdmin(
  async (req, { params }: { params: Promise<{ effectiveFrom: string }> }) => {
    const { effectiveFrom } = await params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json({ error: "Use YYYY-MM-DD." }, { status: 400 });
    }
    const { salonId } = (await requireAdminSalon(req))!;
    await prisma.businessHoursSchedule.deleteMany({
      where: {
        salonId,
        effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
      },
    });
    return NextResponse.json({ ok: true });
  }
);
