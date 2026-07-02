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
import {
  createAppointmentWithAddOns,
  resolveAddOnServices,
  totalDurationMinutes,
  totalPriceCents,
} from "@/lib/domain/appointmentServices";
import { findRedeemablePackage } from "@/lib/domain/packages";
import {
  getSettings,
  isBeyondBookingWindow,
  BEYOND_WINDOW_MESSAGE,
} from "@/lib/domain/settings";
import { notifyAdminsOfBooking } from "@/lib/integrations/adminSms";
import { getPublicSalon } from "@/lib/domain/salon";
import { isStripePaymentsEnabled } from "@/lib/flags";
import {
  amountForBooking,
  createPaymentIntentForAppointment,
  getBookingPaymentContext,
  PAYMENT_HOLD_MINUTES,
} from "@/lib/domain/payments";
import type { PublicBookingResponse } from "@/lib/api-types";

// First-pass anti-abuse for the public booking endpoint. A captcha
// (Turnstile / hCaptcha) is the long-term answer — see README TODO.
const BOOKING_IP_LIMIT = 5;
const BOOKING_WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const result = await getPublicSalon(req);
  if (!result.ok) return result.response;
  const { salon } = result;

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
  if (!service || !service.active || service.salonId !== salon.id) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }
  const addOns = await resolveAddOnServices(salon.id, service.id, data.addOnServiceIds);
  if (!addOns) {
    return NextResponse.json({ error: "Invalid service selection." }, { status: 400 });
  }

  const startsAt = new Date(data.startISO);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    return NextResponse.json(
      { error: "Selected time is invalid." },
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

  // Race-safe overlap check scoped to this salon. Counts unexpired payment
  // holds as busy too, so two clients can't both pay for the same slot.
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
      { error: "That time was just taken. Please pick another." },
      { status: 409 }
    );
  }

  // Look up or create client. Email is optional; when present we dedupe by it
  // and enable email notifications, otherwise we store "" and go SMS-only.
  const email = data.email?.trim().toLowerCase() ?? "";
  const existingId = email ? await findClientIdByEmail(salon.id, email) : null;
  const client = await prisma.client.upsert({
    where: { id: existingId ?? "__nope__" },
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

  // A prepaid package session covers the booking outright — no Stripe charge,
  // and no partial-package/partial-card split, so this only applies when the
  // booking is exactly the package's service with no add-ons
  // (docs/FEATURE_OPPORTUNITIES_SPEC.md #7).
  const redeemable =
    addOns.length === 0
      ? await findRedeemablePackage(salon.id, client.id, service.id)
      : null;

  // Only attempt a charge when the platform-wide kill-switch is on — a
  // stale per-salon `paymentsEnabled` value must never take effect while
  // Stripe is off platform-wide.
  const paymentCtx =
    !redeemable && isStripePaymentsEnabled()
      ? await getBookingPaymentContext(salon.id)
      : null;
  const charge =
    !redeemable && paymentCtx?.stripeAccountId && paymentCtx.stripeChargesEnabled
      ? amountForBooking(paymentCtx, { priceCents: totalPriceCents(service, addOns) })
      : null;

  const appointment = await createAppointmentWithAddOns(
    {
      salonId: salon.id,
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt,
      managementToken: nanoid(24),
      notes: data.notes,
      ...(redeemable ? { clientPackageId: redeemable.id } : {}),
      ...(charge
        ? {
            status: "PENDING_PAYMENT",
            holdExpiresAt: new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000),
          }
        : {}),
    },
    addOns,
    redeemable?.id
  );

  const whenLabel = formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a", salon.timezone);

  if (charge) {
    // Truth comes from the webhook, not this response — notifications and
    // the actual CONFIRMED transition happen there once Stripe confirms the
    // charge succeeded (§4.1 Appendix: never trust client-reported payment).
    const hold = await createPaymentIntentForAppointment({
      appointmentId: appointment.id,
      salonId: salon.id,
      stripeAccountId: paymentCtx!.stripeAccountId!,
      amountCents: charge.amountCents,
      currency: paymentCtx!.currency,
      kind: charge.kind,
      postPaymentStatus: "CONFIRMED",
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

  // Fire-and-forget notifications.
  sendNotifications(appointment.id, "CONFIRMATION").catch((err) =>
    reportError(err, { where: "appointments.create.notify", appointmentId: appointment.id })
  );
  // Alert admins (those who opted in) that a booking came in.
  notifyAdminsOfBooking({
    kind: "booked",
    salonId: salon.id,
    salonName: salon.name,
    clientName: data.name,
    serviceName: service.name,
    whenLabel: formatBiz(startsAt, "EEE MMM d, h:mm a", salon.timezone),
  });

  return NextResponse.json({
    id: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: service.name,
    whenLabel,
  } satisfies PublicBookingResponse);
}
