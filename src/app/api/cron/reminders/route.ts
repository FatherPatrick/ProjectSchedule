import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendNotifications } from "@/lib/integrations/notifications";
import { reportError } from "@/lib/observability/reportError";

// Vercel Cron will hit this hourly. We send reminders for any CONFIRMED
// appointment in the next 23–25 hour window that hasn't already been reminded.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Send reminders for any CONFIRMED appointment starting in the next ~26 hours
  // that hasn't been reminded yet. Window is wide enough to tolerate a
  // once-a-day cron (Vercel Hobby) but the reminderSentAt guard prevents
  // duplicates if the endpoint is also pinged more frequently.
  const now = new Date();
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true },
  });

  // Fan out the notification dispatches in parallel rather than awaiting
  // each in series — Twilio + Resend are network-bound and a serial loop
  // makes a busy week's batch take O(N) round-trips.
  const results = await Promise.allSettled(
    due.map((a) => sendNotifications(a.id, "REMINDER_24H"))
  );

  const sentIds: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sentIds.push(due[i].id);
    } else {
      reportError(r.reason, {
        where: "cron.reminders.send",
        appointmentId: due[i].id,
      });
    }
  });

  // Single round-trip to mark everything we successfully delivered.
  // A DB failure here means we'll re-send next tick (idempotent at the
  // notification provider level — duplicates are preferable to silently
  // missed reminders).
  let sent = sentIds.length;
  if (sentIds.length > 0) {
    try {
      await prisma.appointment.updateMany({
        where: { id: { in: sentIds } },
        data: { reminderSentAt: new Date() },
      });
    } catch (err) {
      reportError(err, {
        where: "cron.reminders.mark",
        appointmentIds: sentIds,
      });
      sent = 0;
    }
  }

  return NextResponse.json({ checked: due.length, sent });
}
