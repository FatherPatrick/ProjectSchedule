import { nanoid } from "nanoid";
import { prisma } from "../db/prisma";
import { getSettings } from "./settings";
import { sendNotifications, sendWaitlistOffer } from "../integrations/notifications";
import { reportError } from "../observability/reportError";
import { formatBiz } from "../timezone";

/** How long a `WAITING` entry stays live if it's never notified. */
const STALE_REQUEST_DAYS = 7;

function staleRequestExpiry(from: Date): Date {
  return new Date(from.getTime() + STALE_REQUEST_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Join (or return the existing) waitlist entry for a client + service. A
 * client already `WAITING` or `NOTIFIED` for this service doesn't get a
 * second entry — that would let them jump the FCFS queue by re-joining.
 */
export async function joinWaitlist(
  salonId: string,
  serviceId: string,
  clientId: string
): Promise<{ id: string; alreadyOnList: boolean }> {
  const existing = await prisma.waitlist.findFirst({
    where: { salonId, serviceId, clientId, status: { in: ["WAITING", "NOTIFIED"] } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, alreadyOnList: true };

  const entry = await prisma.waitlist.create({
    data: {
      salonId,
      serviceId,
      clientId,
      expiresAt: staleRequestExpiry(new Date()),
    },
  });
  return { id: entry.id, alreadyOnList: false };
}

/**
 * Whether a CONFIRMED appointment overlapping [startsAt, endsAt) exists for
 * this salon, counting unexpired payment holds as busy too — the same
 * conflict rule the booking routes use (docs/FEATURE_OPPORTUNITIES_SPEC.md
 * Appendix #1). The waitlist doesn't hold the slot exclusively for the
 * notified client, so both the claim and the daily sweep re-check this
 * before trusting a slot is still free.
 */
async function slotIsTaken(salonId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
  const conflict = await prisma.appointment.findFirst({
    where: {
      salonId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } },
      ],
    },
    select: { id: true },
  });
  return Boolean(conflict);
}

/**
 * Offer a freshly-freed slot to the oldest `WAITING` entry for this service
 * (simple FCFS — docs/FEATURE_OPPORTUNITIES_SPEC.md "Waitlist architecture"
 * decision). No-op if the salon hasn't turned the waitlist on, or nobody is
 * waiting. Returns true when someone was actually notified.
 */
export async function notifyWaitlistOfOpening(
  salonId: string,
  serviceId: string,
  startsAt: Date,
  endsAt: Date
): Promise<boolean> {
  const settings = await getSettings(salonId);
  if (!settings.waitlistEnabled) return false;

  const entry = await prisma.waitlist.findFirst({
    where: { salonId, serviceId, status: "WAITING" },
    orderBy: { requestedAt: "asc" },
  });
  if (!entry) return false;

  const notifiedAt = new Date();
  await prisma.waitlist.update({
    where: { id: entry.id },
    data: {
      status: "NOTIFIED",
      notifiedAt,
      expiresAt: new Date(notifiedAt.getTime() + settings.waitlistClaimWindowMinutes * 60_000),
      offeredStartsAt: startsAt,
      offeredEndsAt: endsAt,
    },
  });

  sendWaitlistOffer(entry.id).catch((err) =>
    reportError(err, { where: "waitlist.notify", waitlistId: entry.id })
  );
  return true;
}

export type WaitlistClaimResult =
  | {
      ok: true;
      appointmentId: string;
      managementToken: string;
      serviceName: string;
      whenLabel: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Claim a waitlist offer, booking the previously-offered slot. Not exclusive
 * to the waitlisted client — the slot has been normally bookable since the
 * cancellation that freed it, so this re-checks availability the same way
 * the public booking routes do before committing.
 */
export async function claimWaitlistEntry(claimToken: string): Promise<WaitlistClaimResult> {
  const entry = await prisma.waitlist.findUnique({
    where: { claimToken },
    include: { service: true, salon: { select: { timezone: true } } },
  });
  if (!entry) return { ok: false, status: 404, error: "Not found." };
  if (entry.status !== "NOTIFIED" || !entry.offeredStartsAt || !entry.offeredEndsAt) {
    return { ok: false, status: 409, error: "This waitlist offer is no longer available." };
  }
  if (entry.expiresAt < new Date()) {
    return { ok: false, status: 409, error: "This offer has expired." };
  }

  const startsAt = entry.offeredStartsAt;
  const endsAt = entry.offeredEndsAt;

  if (await slotIsTaken(entry.salonId, startsAt, endsAt)) {
    // Bad luck, not the end of the line — put them back in the FCFS queue
    // (original requestedAt preserved) so the next opening still reaches them.
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: {
        status: "WAITING",
        notifiedAt: null,
        offeredStartsAt: null,
        offeredEndsAt: null,
        expiresAt: staleRequestExpiry(new Date()),
      },
    });
    return {
      ok: false,
      status: 409,
      error: "That slot was just taken. You're still on the waitlist for the next opening.",
    };
  }

  const appointment = await prisma.appointment.create({
    data: {
      salonId: entry.salonId,
      serviceId: entry.serviceId,
      clientId: entry.clientId,
      startsAt,
      endsAt,
      managementToken: nanoid(24),
    },
  });
  await prisma.waitlist.update({
    where: { id: entry.id },
    data: { status: "CLAIMED", claimedAt: new Date() },
  });

  sendNotifications(appointment.id, "CONFIRMATION").catch((err) =>
    reportError(err, { where: "waitlist.claim.notify", appointmentId: appointment.id })
  );

  return {
    ok: true,
    appointmentId: appointment.id,
    managementToken: appointment.managementToken,
    serviceName: entry.service.name,
    whenLabel: formatBiz(startsAt, "EEEE, MMM d 'at' h:mm a", entry.salon.timezone),
  };
}

export type WaitlistSweepResult = {
  expiredWaiting: number;
  expiredNotified: number;
  reNotified: number;
};

/**
 * Daily cleanup sweep (mirrors the hold-expiry cron's cadence — Vercel Cron
 * needs a paid plan for anything more frequent than daily, so escalation to
 * the next waitlist entry is coarse: up to ~24h after a claim window lapses,
 * not the exact `waitlistClaimWindowMinutes`). Two jobs:
 *   1. Expire `WAITING` entries nobody ever got to notify within 7 days.
 *   2. Expire `NOTIFIED` entries past their claim window, and — if the
 *      offered slot is still actually free — pass it to the next `WAITING`
 *      entry in line.
 */
export async function sweepWaitlist(): Promise<WaitlistSweepResult> {
  const now = new Date();

  const staleWaiting = await prisma.waitlist.updateMany({
    where: { status: "WAITING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const staleNotified = await prisma.waitlist.findMany({
    where: { status: "NOTIFIED", expiresAt: { lt: now } },
  });

  let reNotified = 0;
  for (const entry of staleNotified) {
    try {
      await prisma.waitlist.update({ where: { id: entry.id }, data: { status: "EXPIRED" } });
      if (!entry.offeredStartsAt || !entry.offeredEndsAt) continue;
      if (await slotIsTaken(entry.salonId, entry.offeredStartsAt, entry.offeredEndsAt)) continue;
      const notified = await notifyWaitlistOfOpening(
        entry.salonId,
        entry.serviceId,
        entry.offeredStartsAt,
        entry.offeredEndsAt
      );
      if (notified) reNotified++;
    } catch (err) {
      reportError(err, { where: "waitlist.sweep", waitlistId: entry.id });
    }
  }

  return {
    expiredWaiting: staleWaiting.count,
    expiredNotified: staleNotified.length,
    reNotified,
  };
}
