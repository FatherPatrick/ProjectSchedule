import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/prisma";
import { findClientIdByEmail } from "@/lib/domain/clients";
import { verifyTurnstileToken } from "@/lib/integrations/captcha";
import { parseJsonBody } from "@/lib/http/parseJsonBody";
import { sendNotifications } from "@/lib/integrations/notifications";
import { reportError } from "@/lib/observability/reportError";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";
import { formatBiz } from "@/lib/timezone";
import { appointmentRequestSchema } from "@/lib/validation/appointments";

// First-pass anti-abuse for the public booking endpoint. A captcha
// (Turnstile / hCaptcha) is the long-term answer — see README TODO.
const BOOKING_IP_LIMIT = 5;
const BOOKING_WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipCheck = checkRateLimit({
    bucket: "appointments:create:ip",
    key: ip,
    limit: BOOKING_IP_LIMIT,
    windowMs: BOOKING_WINDOW_MS,
  });
  if (!ipCheck.ok) {
    const init = rateLimitResponseInit(ipCheck);
    return NextResponse.json(init.body, { status: 429, headers: init.headers });
  }

  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const raw = body.data;

  // Captcha is verified BEFORE the Zod parse so a bad token can't be
  // hidden behind unrelated validation noise. No-op when
  // TURNSTILE_SECRET_KEY is unset (dev / local).
  const captchaToken =
    typeof raw === "object" && raw !== null && "captchaToken" in raw
      ? (raw as { captchaToken?: unknown }).captchaToken
      : undefined;
  const captcha = await verifyTurnstileToken(
    typeof captchaToken === "string" ? captchaToken : undefined,
    ip
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
    where: { id: (await findClientIdByEmail(data.email)) ?? "__nope__" },
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
    reportError(err, { where: "appointments.create.notify", appointmentId: appointment.id })
  );

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a"),
  });
}
