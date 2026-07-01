import { Prisma } from "@prisma/client";
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
 *
 * The read (status + overlap check) and the write run inside a single
 * Serializable transaction so two admins approving overlapping PENDING
 * slots at the same instant cannot both observe "no conflict" and then
 * both write CONFIRMED. With Serializable isolation Postgres detects the
 * write-skew and aborts the second transaction with a 40001 error
 * (Prisma surfaces this as `P2034`); we retry once, which is enough to
 * cover the realistic admin-double-click scenario without an open-ended
 * loop.
 */
export async function approveAppointment(
  salonId: string,
  id: string
): Promise<AppointmentActionResult> {
  const result = await runApproveTxnWithRetry(salonId, id);
  if (result.ok) {
    sendNotifications(id, "CONFIRMATION").catch((err) =>
      reportError(err, {
        where: "appointments.approve.notify",
        appointmentId: id,
      })
    );
  }
  return result;
}

const APPROVE_MAX_ATTEMPTS = 3;

async function runApproveTxnWithRetry(
  salonId: string,
  id: string
): Promise<AppointmentActionResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= APPROVE_MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const appt = await tx.appointment.findUnique({ where: { id } });
          if (!appt || appt.salonId !== salonId) {
            return { ok: false, status: 404, error: "Not found" } as const;
          }
          if (appt.status !== "PENDING") {
            return {
              ok: false,
              status: 409,
              error: "Only pending appointments can be approved.",
            } as const;
          }

          const conflict = await tx.appointment.findFirst({
            where: {
              salonId: appt.salonId,
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
            } as const;
          }

          await tx.appointment.update({
            where: { id },
            data: { status: "CONFIRMED" },
          });
          return { ok: true } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      lastErr = err;
      if (!isSerializationFailure(err) || attempt === APPROVE_MAX_ATTEMPTS) {
        break;
      }
      // Fall through and retry: a peer transaction got there first.
    }
  }
  reportError(lastErr, {
    where: "appointments.approve.txn",
    appointmentId: id,
    attempts: APPROVE_MAX_ATTEMPTS,
  });
  return {
    ok: false,
    status: 409,
    error:
      "Could not approve right now due to a conflicting change. Please try again.",
  };
}

/**
 * Postgres serialization failure: surfaced by Prisma as known error
 * `P2034` ("Transaction failed due to a write conflict or a deadlock").
 */
function isSerializationFailure(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034"
  );
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
  salonId: string,
  id: string,
  opts: CancelAppointmentOptions
): Promise<AppointmentActionResult> {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt || appt.salonId !== salonId) return { ok: false, status: 404, error: "Not found" };
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
