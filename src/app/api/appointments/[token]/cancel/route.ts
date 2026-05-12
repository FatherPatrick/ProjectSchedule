import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { cancelAppointment } from "@/lib/domain/appointments";
import { pushToAdmins } from "@/lib/integrations/push";
import { formatBiz } from "@/lib/timezone";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
    select: {
      id: true,
      startsAt: true,
      client: { select: { name: true } },
      service: { select: { name: true } },
    },
  });
  if (!appt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const result = await cancelAppointment(appt.id, { byAdmin: false });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  pushToAdmins(
    {
      title: "Appointment cancelled",
      body: `${appt.client.name} · ${appt.service.name} · ${formatBiz(appt.startsAt, "EEE MMM d, h:mm a")}`,
      data: { appointmentId: appt.id, kind: "CLIENT_CANCELLED" },
    },
    { appointmentId: appt.id }
  );

  return NextResponse.json({ ok: true });
}
