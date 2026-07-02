import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/domain/availability";
import { resolveAddOnServices } from "@/lib/domain/appointmentServices";
import { availabilityQuerySchema } from "@/lib/validation/appointments";
import { getPublicSalon } from "@/lib/domain/salon";

export async function GET(req: Request) {
  const result = await getPublicSalon(req);
  if (!result.ok) return result.response;
  const { salon } = result;

  const url = new URL(req.url);
  const parsed = availabilityQuerySchema.safeParse({
    serviceId: url.searchParams.get("serviceId"),
    date: url.searchParams.get("date"),
    addOnServiceIds: url.searchParams.get("addOnServiceIds") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }

  let additionalDurationMinutes = 0;
  if (parsed.data.addOnServiceIds.length > 0) {
    const addOns = await resolveAddOnServices(
      salon.id,
      parsed.data.serviceId,
      parsed.data.addOnServiceIds
    );
    if (!addOns) {
      return NextResponse.json({ error: "Invalid service selection." }, { status: 400 });
    }
    additionalDurationMinutes = addOns.reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  const slots = await getAvailableSlots({
    salonId: salon.id,
    serviceId: parsed.data.serviceId,
    dateKey: parsed.data.date,
    additionalDurationMinutes,
  });
  return NextResponse.json({ slots });
}
