import { NextResponse } from "next/server";
import { z } from "zod";
import { getAvailableSlots } from "@/lib/availability";

const querySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    serviceId: url.searchParams.get("serviceId"),
    date: url.searchParams.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }
  const slots = await getAvailableSlots({
    serviceId: parsed.data.serviceId,
    dateKey: parsed.data.date,
  });
  return NextResponse.json({ slots });
}
