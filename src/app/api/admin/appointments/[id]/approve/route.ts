import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";
import { approveAppointment } from "@/lib/domain/appointments";

export const POST = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;
    const result = await approveAppointment(salonId, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }
);
