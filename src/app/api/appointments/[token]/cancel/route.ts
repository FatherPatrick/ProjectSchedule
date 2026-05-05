import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { cancelAppointment } from "@/lib/domain/appointments";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
    select: { id: true },
  });
  if (!appt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const result = await cancelAppointment(appt.id, { byAdmin: false });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
