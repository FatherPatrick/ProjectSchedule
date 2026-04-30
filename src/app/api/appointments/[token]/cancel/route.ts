import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotifications } from "@/lib/notifications";
import { CANCELLATION_WINDOW_HOURS } from "@/lib/config";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
  });
  if (!appt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (appt.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Appointment is not active." },
      { status: 409 }
    );
  }
  const hoursAway = (appt.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursAway < CANCELLATION_WINDOW_HOURS) {
    return NextResponse.json(
      {
        error: `Cancellations require at least ${CANCELLATION_WINDOW_HOURS} hours notice.`,
      },
      { status: 403 }
    );
  }

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "CANCELLED" },
  });

  sendNotifications(appt.id, "CANCELLATION").catch((err) =>
    console.error("[notify] cancellation failed", err)
  );

  return NextResponse.json({ ok: true });
}
