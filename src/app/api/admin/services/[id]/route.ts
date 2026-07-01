import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";
import { serviceJsonUpdateSchema } from "@/lib/validation/adminJson";

export const PATCH = withAdminJson(
  serviceJsonUpdateSchema,
  async (data, req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one field." },
        { status: 400 }
      );
    }

    const { count } = await prisma.service.updateMany({
      where: { id, salonId },
      data,
    });
    if (count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;
    await prisma.service.deleteMany({ where: { id, salonId } });
    return NextResponse.json({ ok: true });
  }
);
