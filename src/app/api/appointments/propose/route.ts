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
import { isStripePaymentsEnabled } from "@/lib/flags";
import {
  amountForBooking,
  createPaymentIntentForAppointment,
  getBookingPaymentContext,
  PAYMENT_HOLD_MINUTES,
} from "@/lib/domain/payments";
import {
  createAppointmentWithAddOns,
  resolveAddOnServices,
  totalDurationMinutes,
  totalPriceCents,
} from "@/lib/domain/appointmentServices";
import type { PublicBookingResponse } from "@/lib/api-types";

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
  const addOns = await resolveAddOnServices(salon.id, service.id, data.addOnServiceIds);
  if (!addOns) {
    return NextResponse.json({ error: "Invalid service selection." }, { status: 400 });
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
    startsAt.getTime() + totalDurationMinutes(service, addOns) * 60_000
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

  // Only attempt a charge when the platform-wide kill-switch is on — a
  // stale per-salon `paymentsEnabled` value must never take effect while
  // Stripe is off platform-wide.
  const paymentCtx = isStripePaymentsEnabled()
    ? await getBookingPaymentContext(salon.id)
    : null;
  const charge =
    paymentCtx?.stripeAccountId && paymentCtx.stripeChargesEnabled
      ? amountForBooking(paymentCtx, { priceCents: totalPriceCents(service, addOns) })
      : null;

  const appointment = await createAppointmentWithAddOns(
    {
      salonId: salon.id,
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt,
      status: charge ? "PENDING_PAYMENT" : "PENDING",
      managementToken: nanoid(24),
      notes: data.notes,
      ...(charge
        ? { holdExpiresAt: new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000) }
        : {}),
    },
    addOns
  );

  const shortWhenLabel = formatBiz(startsAt, "EEE MMM d, h:mm a", salon.timezone);
  const whenLabel = formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a", salon.timezone);

  if (charge) {
    // The deposit is captured at request time (§4.3, locked default): the
    // slot is genuinely held by money, and it's auto-refunded if the admin
    // declines. Admin alerts + the PENDING transition happen via the
    // webhook once Stripe confirms the charge succeeded, not here.
    const hold = await createPaymentIntentForAppointment({
      appointmentId: appointment.id,
      salonId: salon.id,
      stripeAccountId: paymentCtx!.stripeAccountId!,
      amountCents: charge.amountCents,
      currency: paymentCtx!.currency,
      kind: charge.kind,
      postPaymentStatus: "PENDING",
    });
    return NextResponse.json({
      requiresPayment: true,
      appointmentId: appointment.id,
      managementToken: appointment.managementToken,
      clientSecret: hold.clientSecret,
      publishableKey: hold.publishableKey,
      connectedAccountId: hold.connectedAccountId,
      amountCents: hold.amountCents,
      currency: hold.currency,
      serviceName: service.name,
      whenLabel,
    } satisfies PublicBookingResponse);
  }

  // Notify admins on their phones (fire-and-forget).
  pushToAdmins(
    {
      title: "New appointment request",
      body: `${data.name} · ${service.name} · ${shortWhenLabel}`,
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
    whenLabel: shortWhenLabel,
  });

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel,
  } satisfies PublicBookingResponse);
}
