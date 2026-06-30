import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAdmin } from "@/lib/http/withAdmin";
import { getAdminSalonId } from "@/lib/domain/salon";

/**
 * Permanently delete every CANCELLED appointment for this salon (all time).
 * Used by the "Clear cancelled" button on the admin calendar to tidy the view.
 * Related NotificationLog rows are removed via the schema's onDelete: Cascade.
 */
export const POST = withAdmin(async () => {
  const salonId = await getAdminSalonId();
  const result = await prisma.appointment.deleteMany({
    where: { salonId, status: "CANCELLED" },
  });
  return NextResponse.json({ ok: true, count: result.count });
});
