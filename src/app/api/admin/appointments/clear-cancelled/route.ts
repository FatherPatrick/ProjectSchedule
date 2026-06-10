import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminEither } from "@/lib/auth/admin";

/**
 * Permanently delete every CANCELLED appointment (all time). Used by the
 * "Clear cancelled" button on the admin calendar to tidy the view. Related
 * NotificationLog rows are removed via the schema's onDelete: Cascade.
 */
export async function POST(req: Request) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await prisma.appointment.deleteMany({
    where: { status: "CANCELLED" },
  });
  return NextResponse.json({ ok: true, count: result.count });
}
