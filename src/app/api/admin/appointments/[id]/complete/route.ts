import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/domain/settings";
import { getAdminSalonId } from "@/lib/domain/salon";
import { sendReviewRequest } from "@/lib/integrations/notifications";

export const POST = withAdmin(
  async (_req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const salonId = await getAdminSalonId();

    const appt = await prisma.appointment.findUnique({ where: { id } });
    if (!appt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (appt.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Only CONFIRMED appointments can be marked complete" },
        { status: 422 }
      );
    }

    await prisma.appointment.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    const settings = await getSettings(salonId);
    if (settings.reviewRequestEnabled && settings.reviewRequestUrl) {
      sendReviewRequest(id, settings.reviewRequestUrl).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }
);
