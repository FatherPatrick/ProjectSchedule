import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";

export const DELETE = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;
    const { count } = await prisma.blackout.deleteMany({ where: { id, salonId } });
    if (count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
