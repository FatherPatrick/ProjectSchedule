import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/prisma";
import { findClientIdByEmail } from "@/lib/domain/clients";
import { verifyTurnstileToken } from "@/lib/integrations/captcha";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { formatBiz } from "@/lib/timezone";
import { pushToAdmins } from "@/lib/integrations/push";
import { notifyAdminsOfBooking } from "@/lib/integrations/adminSms";
import { getClientIp } from "@/lib/rateLimit";
import { appointmentRequestSchema } from "@/lib/validation/appointments";
import {
  getSettings,
  isBeyondBookingWindow,
  BEYOND_WINDOW_MESSAGE,
} from "@/lib/domain/settings";
import { getPublicSalon } from "@/lib/domain/salon";

const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const result = await getPublicSalon(req);
  if (!result.ok) return result.response;
  const { salon } = result;

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
  if (!service || !service.active || service.salonId !== salon.id) {
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
  const settings = await getSettings(salon.id);
  if (isBeyondBookingWindow(startsAt, settings.maxAdvanceDays)) {
    return NextResponse.json(
      { error: BEYOND_WINDOW_MESSAGE },
      { status: 400 }
    );
  }
  const endsAt = new Date(
    startsAt.getTime() + service.durationMinutes * 60_000
  );

  // Don't let proposals overlap an existing CONFIRMED appointment (or an
  // unexpired payment hold) for this salon.
  const conflict = await prisma.appointment.findFirst({
    where: {
      salonId: salon.id,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } },
      ],
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
  const existingClientId = email ? await findClientIdByEmail(salon.id, email) : null;
  const client = await prisma.client.upsert({
    where: { id: existingClientId ?? "__nope__" },
    create: {
      salonId: salon.id,
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
      salonId: salon.id,
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt,
      status: "PENDING",
      managementToken: nanoid(24),
      notes: data.notes,
    },
  });

  const whenLabel = formatBiz(startsAt, "EEE MMM d, h:mm a", salon.timezone);

  // Notify admins on their phones (fire-and-forget).
  pushToAdmins(
    {
      title: "New appointment request",
      body: `${data.name} · ${service.name} · ${whenLabel}`,
      data: { appointmentId: appointment.id, kind: "PENDING_REQUEST" },
    },
    { appointmentId: appointment.id, salonId: salon.id }
  );
  // SMS the admins who opted in.
  notifyAdminsOfBooking({
    kind: "requested",
    salonId: salon.id,
    salonName: salon.name,
    clientName: data.name,
    serviceName: service.name,
    whenLabel,
  });

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a", salon.timezone),
  });
}
