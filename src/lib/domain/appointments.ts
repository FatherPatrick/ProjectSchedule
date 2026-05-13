import { prisma } from "../db/prisma";
import { sendNotifications } from "../integrations/notifications";
import { reportError } from "../observability/reportError";
import { CANCELLATION_WINDOW_HOURS } from "../config";

/**
 * Result type for appointment state-change operations. Lets callers translate
 * domain failures into HTTP responses (or other UIs) without throwing for
 * expected, user-visible problems.
 */
export type AppointmentActionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Promote a PENDING appointment to CONFIRMED, re-checking for any newly-
 * introduced overlap with another confirmed booking. On success a
 * confirmation notification is dispatched (fire-and-forget).
 */
export async function approveAppointment(
  id: string
): Promise<AppointmentActionResult> {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) return { ok: false, status: 404, error: "Not found" };
  if (appt.status !== "PENDING") {
    return {
      ok: false,
      status: 409,
      error: "Only pending appointments can be approved.",
    };
  }

  // Re-check overlap with confirmed appointments before promoting.
  const conflict = await prisma.appointment.findFirst({
    where: {
      id: { not: appt.id },
      status: "CONFIRMED",
      startsAt: { lt: appt.endsAt },
      endsAt: { gt: appt.startsAt },
    },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      status: 409,
      error:
        "This proposed time now overlaps a confirmed appointment. Decline it or contact the client.",
    };
  }

  await prisma.appointment.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  sendNotifications(id, "CONFIRMATION").catch((err) =>
    reportError(err, { where: "appointments.approve.notify", appointmentId: id })
  );
  return { ok: true };
}

export interface CancelAppointmentOptions {
  /**
   * `true` when an admin is performing the cancellation; `false` when it's
   * the client cancelling via their management link. Admins may attach a
   * `note`; clients are subject to the cancellation-window policy.
   */
  byAdmin: boolean;
  /** Optional message included in the cancellation email/SMS (admin only). */
  note?: string;
}

/**
 * Cancel a CONFIRMED or PENDING appointment. Returns a discriminated result;
 * notifications are fired (and awaited only enough to schedule them) when:
 *   - the appointment was previously CONFIRMED, OR
 *   - an admin attached an explanatory note (e.g. when declining a request).
 */
export async function cancelAppointment(
  id: string,
  opts: CancelAppointmentOptions
): Promise<AppointmentActionResult> {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) return { ok: false, status: 404, error: "Not found" };
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING") {
    return { ok: false, status: 409, error: "Already inactive" };
  }

  // Client-initiated cancellations of confirmed bookings must respect the
  // configured notice window. Admins can cancel at any time.
  if (!opts.byAdmin && appt.status === "CONFIRMED") {
    const hoursAway = (appt.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursAway < CANCELLATION_WINDOW_HOURS) {
      return {
        ok: false,
        status: 403,
        error: `Cancellations require at least ${CANCELLATION_WINDOW_HOURS} hours notice.`,
      };
    }
  }

  const wasConfirmed = appt.status === "CONFIRMED";
  await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  // Notify the client whenever we cancel a confirmed appointment, or whenever
  // the admin explicitly attached a message (e.g. when declining a pending
  // request and wanting to explain why).
  if (wasConfirmed || (opts.byAdmin && opts.note)) {
    sendNotifications(id, "CANCELLATION", { note: opts.note }).catch((err) =>
      reportError(err, { where: "appointments.cancel.notify", appointmentId: id, byAdmin: opts.byAdmin })
    );
  }

  return { ok: true };
}
