import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotifications } from "@/lib/notifications";

// Vercel Cron will hit this hourly. We send reminders for any CONFIRMED
// appointment in the next 23–25 hour window that hasn't already been reminded.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true },
  });

  let sent = 0;
  for (const a of due) {
    try {
      await sendNotifications(a.id, "REMINDER_24H");
      await prisma.appointment.update({
        where: { id: a.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error("[cron] reminder failed", a.id, err);
    }
  }

  return NextResponse.json({ checked: due.length, sent });
}
