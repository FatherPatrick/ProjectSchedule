import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { salonAppUrl } from "@/lib/config";

function toIcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const appt = await prisma.appointment.findUnique({
    where: { managementToken: token },
    include: {
      service: true,
      salon: { select: { name: true, slug: true } },
    },
  });

  if (!appt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const manageUrl = `${salonAppUrl(appt.salon.slug)}/appointments/${token}`;
  const uid = `${appt.id}@projectschedule`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeIcal(appt.salon.name)}//Appointment Scheduler//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${toIcalDate(appt.startsAt)}`,
    `DTEND:${toIcalDate(appt.endsAt)}`,
    `SUMMARY:${escapeIcal(`${appt.service.name} at ${appt.salon.name}`)}`,
    `DESCRIPTION:${escapeIcal(`Manage or cancel your appointment: ${manageUrl}`)}`,
    `DTSTAMP:${toIcalDate(new Date())}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment.ics"`,
    },
  });
}
