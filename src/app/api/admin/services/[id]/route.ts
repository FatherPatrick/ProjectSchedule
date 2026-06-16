import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { serviceJsonUpdateSchema } from "@/lib/validation/adminJson";

export const PATCH = withAdminJson(
  serviceJsonUpdateSchema,
  async (data, _req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one field." },
        { status: 400 }
      );
    }

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await prisma.service.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withAdmin(
  async (_req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await prisma.service.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
);
