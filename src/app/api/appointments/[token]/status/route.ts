import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { formatBiz } from "@/lib/timezone";
import type { AppointmentStatusResponse } from "@/lib/api-types";

/**
 * Lets the post-payment booking UI poll for the webhook-confirmed status
 * (docs/STRIPE_SPEC.md §4.1 — the client never trusts its own "payment
 * succeeded" read; it just watches for the webhook to land). The
 * `managementToken` is the same opaque token already used for cancel/ical.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
    select: {
      status: true,
      startsAt: true,
      service: { select: { name: true } },
      salon: { select: { timezone: true } },
    },
  });
  if (!appt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: appt.status,
    serviceName: appt.service.name,
    whenLabel: formatBiz(appt.startsAt, "EEEE, MMM d 'at' h:mm a", appt.salon.timezone),
  } satisfies AppointmentStatusResponse);
}
