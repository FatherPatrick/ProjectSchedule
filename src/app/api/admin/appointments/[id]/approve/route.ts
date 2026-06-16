import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { approveAppointment } from "@/lib/domain/appointments";

export const POST = withAdmin(
  async (_req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const result = await approveAppointment(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }
);
