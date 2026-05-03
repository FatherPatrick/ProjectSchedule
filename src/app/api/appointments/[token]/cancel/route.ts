import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendNotifications } from "@/lib/integrations/notifications";
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
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING") {
    return NextResponse.json(
      { error: "Appointment is not active." },
      { status: 409 }
    );
  }
  if (appt.status === "CONFIRMED") {
    const hoursAway = (appt.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursAway < CANCELLATION_WINDOW_HOURS) {
      return NextResponse.json(
        {
          error: `Cancellations require at least ${CANCELLATION_WINDOW_HOURS} hours notice.`,
        },
        { status: 403 }
      );
    }
  }

  const wasConfirmed = appt.status === "CONFIRMED";
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "CANCELLED" },
  });

  if (wasConfirmed) {
    sendNotifications(appt.id, "CANCELLATION").catch((err) =>
      console.error("[notify] cancellation failed", err)
    );
  }

  return NextResponse.json({ ok: true });
}
