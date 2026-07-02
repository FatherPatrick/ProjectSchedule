import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

/** Admin housekeeping: remove a waitlist entry (e.g. the client called and asked to be taken off). */
export const DELETE = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;

    const entry = await prisma.waitlist.findUnique({ where: { id } });
    if (!entry || entry.salonId !== salonId) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    await prisma.waitlist.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }
);
