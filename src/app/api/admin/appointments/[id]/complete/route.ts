import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/domain/settings";
import { requireAdminSalon } from "@/lib/auth/admin";
import { sendReviewRequest } from "@/lib/integrations/notifications";

export const POST = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;

    const appt = await prisma.appointment.findFirst({
      where: { id, salonId },
    });
    if (!appt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (appt.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Only CONFIRMED appointments can be marked complete" },
        { status: 422 }
      );
    }

    const { count } = await prisma.appointment.updateMany({
      where: { id, salonId },
      data: { status: "COMPLETED" },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const settings = await getSettings(salonId);
    if (settings.reviewRequestEnabled && settings.reviewRequestUrl) {
      sendReviewRequest(id, settings.reviewRequestUrl).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }
);
