import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendNotifications } from "@/lib/notifications";

async function requireAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") return null;
  return s;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Already inactive" }, { status: 409 });
  }
  await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  sendNotifications(id, "CANCELLATION").catch((err) =>
    console.error("[admin cancel] notify failed", err)
  );
  return NextResponse.json({ ok: true });
}
