import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sendNotifications } from "@/lib/integrations/notifications";

async function requireAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") return null;
  return s;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Optional JSON body: { message?: string } (clipped to a sane SMS-friendly
  // length so the resulting text doesn't get split into many segments).
  let note: string | undefined;
  try {
    const body = (await req.json().catch(() => null)) as
      | { message?: unknown }
      | null;
    if (body && typeof body.message === "string") {
      const trimmed = body.message.trim();
      if (trimmed) note = trimmed.slice(0, 280);
    }
  } catch {
    // ignore — body is optional
  }

  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.status !== "CONFIRMED" && a.status !== "PENDING") {
    return NextResponse.json({ error: "Already inactive" }, { status: 409 });
  }
  const wasConfirmed = a.status === "CONFIRMED";
  await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  // Notify the client whenever we cancel a confirmed appointment, or whenever
  // the admin explicitly attached a message (e.g. when declining a pending
  // request and wanting to explain why).
  if (wasConfirmed || note) {
    sendNotifications(id, "CANCELLATION", { note }).catch((err) =>
      console.error("[admin cancel] notify failed", err)
    );
  }
  return NextResponse.json({ ok: true });
}
