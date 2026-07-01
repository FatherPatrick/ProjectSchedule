import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/http/withAdmin";
import { requireAdminSalon } from "@/lib/auth/admin";
import { cancelAppointment } from "@/lib/domain/appointments";
import { tryParseJsonBody } from "@/lib/http/parseJsonBody";
import { appointmentCancelBodySchema } from "@/lib/validation/admin";

export const POST = withAdmin(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { salonId } = (await requireAdminSalon(req))!;

    // Body is optional. If present, parse with Zod so we get consistent
    // trimming + length-limit handling instead of ad-hoc casting.
    let note: string | undefined;
    let refund: boolean | undefined;
    const raw = await tryParseJsonBody(req);
    if (raw !== null) {
      const parsed = appointmentCancelBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input." }, { status: 400 });
      }
      note = parsed.data.message?.trim() || undefined;
      refund = parsed.data.refund;
    }

    const result = await cancelAppointment(salonId, id, { byAdmin: true, note, refund });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }
);
