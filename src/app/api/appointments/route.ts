import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { sendNotifications } from "@/lib/notifications";
import { formatBiz } from "@/lib/timezone";

const bodySchema = z.object({
  serviceId: z.string().min(1),
  startISO: z.string().datetime(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(32),
  smsOptIn: z.boolean().default(true),
  notes: z.string().max(500).optional(),
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
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return NextResponse.json(
      { error: "Selected time is invalid." },
      { status: 400 }
    );
  }
  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );

  // Race-safe overlap check.
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
      { error: "That time was just taken. Please pick another." },
      { status: 409 }
    );
  }

  // Look up or create client by email (lightweight dedupe).
  const client = await prisma.client.upsert({
    where: { id: (await findClientId(data.email)) ?? "__nope__" },
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
      managementToken: nanoid(24),
      notes: data.notes,
    },
  });

  // Fire-and-forget notifications.
  sendNotifications(appointment.id, "CONFIRMATION").catch((err) =>
    console.error("[notify] confirmation failed", err)
  );

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
