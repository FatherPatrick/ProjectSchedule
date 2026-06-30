import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/domain/availability";
import { availabilityQuerySchema } from "@/lib/validation/appointments";
import { getSalonFromRequest } from "@/lib/domain/salon";

export async function GET(req: Request) {
  const salon = await getSalonFromRequest(req);
  if (!salon) {
    return NextResponse.json({ error: "Salon not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const parsed = availabilityQuerySchema.safeParse({
    serviceId: url.searchParams.get("serviceId"),
    date: url.searchParams.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }
  const slots = await getAvailableSlots({
    salonId: salon.id,
    serviceId: parsed.data.serviceId,
    dateKey: parsed.data.date,
  });
  return NextResponse.json({ slots });
}
