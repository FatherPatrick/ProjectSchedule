import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { formatBiz } from "@/lib/timezone";

const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  serviceId: z.string().min(1),
  startISO: z.string().datetime(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(32),
  smsOptIn: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
  });
  if (!service || !service.active) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  const startsAt = new Date(data.startISO);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json(
      { error: "Selected time is invalid." },
      { status: 400 }
    );
  }
  if (startsAt.getTime() - Date.now() < MIN_LEAD_MS) {
    return NextResponse.json(
      { error: "Proposed time must be at least 24 hours in the future." },
      { status: 400 }
    );
  }
  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );

  // Don't let proposals overlap an existing CONFIRMED appointment.
  const conflict = await prisma.appointment.findFirst({
    where: {
      status: "CONFIRMED",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      {
        error:
          "That time overlaps an existing booking. Please propose a different time.",
      },
      { status: 409 }
    );
  }

  const existingClientId = await findClientId(data.email);
  const client = await prisma.client.upsert({
    where: { id: existingClientId ?? "__nope__" },
    create: {
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      smsOptIn: data.smsOptIn,
      emailOptIn: true,
    },
    update: {
      name: data.name,
      phone: data.phone,
      smsOptIn: data.smsOptIn,
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt,
      status: "PENDING",
      managementToken: nanoid(24),
      notes: data.notes,
    },
  });

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a"),
  });
}

async function findClientId(email: string): Promise<string | null> {
  const c = await prisma.client.findFirst({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return c?.id ?? null;
}
