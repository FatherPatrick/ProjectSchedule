import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/prisma";
import { findClientIdByEmail } from "@/lib/domain/clients";
import { verifyTurnstileToken } from "@/lib/integrations/captcha";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { formatBiz } from "@/lib/timezone";
import { pushToAdmins } from "@/lib/integrations/push";
import { getClientIp } from "@/lib/rateLimit";
import { appointmentRequestSchema } from "@/lib/validation/appointments";
import {
  getSettings,
  isBeyondBookingWindow,
  BEYOND_WINDOW_MESSAGE,
} from "@/lib/domain/settings";

const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const raw = body.data;

  const captchaToken =
    typeof raw === "object" && raw !== null && "captchaToken" in raw
      ? (raw as { captchaToken?: unknown }).captchaToken
      : undefined;
  const captcha = await verifyTurnstileToken(
    typeof captchaToken === "string" ? captchaToken : undefined,
    getClientIp(req)
  );
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const parsed = appointmentRequestSchema.safeParse(raw);
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
  const settings = await getSettings();
  if (isBeyondBookingWindow(startsAt, settings.maxAdvanceDays)) {
    return NextResponse.json(
      { error: BEYOND_WINDOW_MESSAGE },
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

  const email = data.email?.trim().toLowerCase() ?? "";
  const existingClientId = email ? await findClientIdByEmail(email) : null;
  const client = await prisma.client.upsert({
    where: { id: existingClientId ?? "__nope__" },
    create: {
      name: data.name,
      email,
      phone: data.phone,
      smsOptIn: data.smsOptIn,
      emailOptIn: Boolean(email),
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

  // Notify admins on their phones (fire-and-forget).
  pushToAdmins(
    {
      title: "New appointment request",
      body: `${data.name} · ${service.name} · ${formatBiz(startsAt, "EEE MMM d, h:mm a")}`,
      data: { appointmentId: appointment.id, kind: "PENDING_REQUEST" },
    },
    { appointmentId: appointment.id }
  );

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a"),
  });
}
