import { NextResponse } from "next/server";
import { requireAdminEither } from "@/lib/admin";
import { cancelAppointment } from "@/lib/domain/appointments";
import { appointmentCancelBodySchema } from "@/lib/validation/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminEither(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Body is optional. If present, parse with Zod so we get consistent
  // trimming + length-limit handling instead of ad-hoc casting.
  let note: string | undefined;
  const raw = await req.json().catch(() => null);
  if (raw !== null) {
    const parsed = appointmentCancelBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    note = parsed.data.message?.trim() || undefined;
  }

  const result = await cancelAppointment(id, { byAdmin: true, note });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
