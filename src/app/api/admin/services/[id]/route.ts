import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { serviceJsonUpdateSchema } from "@/lib/validation/adminJson";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = serviceJsonUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
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

  await prisma.service.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.service.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
