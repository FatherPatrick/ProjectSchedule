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
  if (a.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only pending appointments can be approved." },
      { status: 409 }
    );
  }

  // Re-check overlap with confirmed appointments before promoting.
  const conflict = await prisma.appointment.findFirst({
    where: {
      id: { not: a.id },
      status: "CONFIRMED",
      startsAt: { lt: a.endsAt },
      endsAt: { gt: a.startsAt },
    },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      {
        error:
          "This proposed time now overlaps a confirmed appointment. Decline it or contact the client.",
      },
      { status: 409 }
    );
  }

  await prisma.appointment.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  sendNotifications(id, "CONFIRMATION").catch((err) =>
    console.error("[admin approve] notify failed", err)
  );
  return NextResponse.json({ ok: true });
}
