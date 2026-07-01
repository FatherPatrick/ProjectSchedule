import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { expireHold } from "@/lib/domain/payments";
import { reportError } from "@/lib/observability/reportError";

/**
 * Hold-expiry sweeper (docs/STRIPE_SPEC.md §6). Vercel Cron hits this
 * alongside `/api/cron/reminders`. Unpaid `PENDING_PAYMENT` holds don't
 * block availability once `holdExpiresAt` has passed (§1.4 already excludes
 * them from the busy-set), so this is cleanup + PaymentIntent-cancellation
 * hygiene, not a correctness requirement for booking.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expired = await prisma.appointment.findMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: new Date() } },
    select: { id: true },
  });

  let released = 0;
  for (const appt of expired) {
    try {
      await expireHold(appt.id);
      released++;
    } catch (err) {
      reportError(err, { where: "cron.expireHolds", appointmentId: appt.id });
    }
  }

  return NextResponse.json({ checked: expired.length, released });
}
