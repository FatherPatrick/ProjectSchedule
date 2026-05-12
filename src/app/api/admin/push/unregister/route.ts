import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminFromBearer } from "@/lib/auth/admin";

export async function POST(req: Request) {
  const session = await requireAdminFromBearer(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.mobileSession.update({
    where: { id: session.sessionId },
    data: { pushToken: null },
  });
  return NextResponse.json({ ok: true });
}
