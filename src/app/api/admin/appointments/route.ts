import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db/prisma";
import { withAdmin, withAdminJson } from "@/lib/http/withAdmin";
import { findClientIdByEmail } from "@/lib/domain/clients";
import { sendNotifications } from "@/lib/integrations/notifications";
import { reportError } from "@/lib/observability/reportError";
import { toE164 } from "@/lib/phone";
import { formatBiz } from "@/lib/timezone";
import { adminAppointmentCreateSchema } from "@/lib/validation/appointments";
import { getAdminSalonId } from "@/lib/domain/salon";
import type { AppointmentsListResponse } from "@/lib/api-types";

/**
 * List appointments in `[from, to)`. Both bounds are ISO timestamps (UTC).
 *
 * Defaults: today (in server time) through 30 days out. Returns at most 500
 * rows ordered by start time, in a shape that matches the web admin calendar
 * loader (client + service joined).
 */
const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
});

const MAX_ROWS = 500;
const DEFAULT_RANGE_DAYS = 30;

export const GET = withAdmin(async (req) => {
  const salonId = await getAdminSalonId();

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 }
    );
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const from = parsed.data.from ? new Date(parsed.data.from) : startOfToday;
  const to = parsed.data.to
    ? new Date(parsed.data.to)
    : new Date(startOfToday.getTime() + DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (to <= from) {
    return NextResponse.json(
      { error: "`to` must be after `from`." },
      { status: 400 }
    );
  }

  const rows = await prisma.appointment.findMany({
    where: {
      salonId,
      startsAt: { gte: from, lt: to },
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: MAX_ROWS,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      notes: true,
      client: { select: { id: true, name: true, email: true, phone: true } },
      service: {
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      },
    },
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      notes: r.notes,
      client: r.client,
      service: r.service,
    })),
  } satisfies AppointmentsListResponse);
});

/**
 * Admin books on behalf of a client. Creates a CONFIRMED appointment directly
 * — no approval step, and (per product decision) no lead-time / book-out /
 * business-hours limits; admins may book any future slot. Still blocks overlap
 * with an existing confirmed appointment. Optionally notifies the client.
 */
export const POST = withAdminJson(
  adminAppointmentCreateSchema,
  async (data) => {
    const salonId = await getAdminSalonId();

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
    // Admins bypass lead-time / window / hours, but booking in the past makes no
    // sense (confirmations + reminders assume a future appointment).
    if (startsAt <= new Date()) {
      return NextResponse.json(
        { error: "Choose a date and time in the future." },
        { status: 400 }
      );
    }
    const endsAt = new Date(
      startsAt.getTime() + service.durationMinutes * 60_000
    );

    const conflict = await prisma.appointment.findFirst({
      where: {
        salonId,
        status: "CONFIRMED",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "That time overlaps an existing confirmed appointment." },
        { status: 409 }
      );
    }

    // Resolve the client: an explicit existing id, or upsert-by-email for a new
    // one (mirrors the public booking flow's dedupe).
    let clientId: string;
    if (data.clientId) {
      const exists = await prisma.client.findUnique({
        where: { id: data.clientId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Client not found." }, { status: 404 });
      }
      clientId = exists.id;
    } else {
      const e164 = toE164(data.phone!);
      if (!e164) {
        return NextResponse.json(
          { error: "Enter a valid phone number for the new client." },
          { status: 400 }
        );
      }
      // Email is optional for admin bookings. When present we dedupe by it (like
      // the public flow); when absent we store "" — the Client.email column is
      // non-null, and notifications already skip email sends for a blank address.
      const email = data.email?.trim().toLowerCase() ?? "";
      const existingId = email ? await findClientIdByEmail(salonId, email) : null;
      const client = await prisma.client.upsert({
        where: { id: existingId ?? "__nope__" },
        create: {
          salonId,
          name: data.name!,
          email,
          phone: e164,
          smsOptIn: data.smsOptIn,
          emailOptIn: Boolean(email),
        },
        update: { name: data.name!, phone: e164, smsOptIn: data.smsOptIn },
      });
      clientId = client.id;
    }

    const appointment = await prisma.appointment.create({
      data: {
        salonId,
        serviceId: service.id,
        clientId,
        startsAt,
        endsAt,
        status: "CONFIRMED",
        managementToken: nanoid(24),
        notes: data.notes,
      },
    });

    if (data.notify) {
      sendNotifications(appointment.id, "CONFIRMATION").catch((err) =>
        reportError(err, {
          where: "admin.appointments.create.notify",
          appointmentId: appointment.id,
        })
      );
    }

    return NextResponse.json({
      id: appointment.id,
      managementToken: appointment.managementToken,
      serviceName: service.name,
      whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a"),
    });
  }
);
