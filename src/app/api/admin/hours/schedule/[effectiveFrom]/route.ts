import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";

/**
 * Delete every override row for a given `effectiveFrom` date (YYYY-MM-DD).
 * Always returns `{ ok: true }`, even if no rows existed.
 */
export const DELETE = withAdmin(
  async (_req, { params }: { params: Promise<{ effectiveFrom: string }> }) => {
    const { effectiveFrom } = await params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json({ error: "Use YYYY-MM-DD." }, { status: 400 });
    }
    await prisma.businessHoursSchedule.deleteMany({
      where: { effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`) },
    });
    return NextResponse.json({ ok: true });
  }
);
