import { NextResponse } from "next/server";
import { sweepWaitlist } from "@/lib/domain/waitlist";

/**
 * Daily waitlist sweep (docs/FEATURE_OPPORTUNITIES_SPEC.md #5). Mirrors
 * `/api/cron/expire-holds`'s auth. Expires stale `WAITING` requests, expires
 * `NOTIFIED` offers past their claim window, and passes still-open slots to
 * the next waiting entry.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepWaitlist();
  return NextResponse.json(result);
}
