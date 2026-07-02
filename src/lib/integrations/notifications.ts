import { prisma } from "../db/prisma";
import { sendEmail } from "./email";
import { sendSMS, withSmsFooter } from "./sms";
import { formatBiz } from "../timezone";
import { salonAppUrl } from "../config";
import { contrastTextColor, isValidHex } from "../theme/color";
import type {
  Appointment,
  Client,
  Service,
  Salon,
  Waitlist,
  LoyaltyReward,
  NotificationKind,
} from "@prisma/client";

type SalonFields = Pick<
  Salon,
  "name" | "instagram" | "slug" | "timezone" | "brandColor" | "logoUrl"
>;
type Bundle = Appointment & {
  client: Client;
  service: Service;
  salon: SalonFields;
  addOns: { service: Service }[];
};
type WaitlistBundle = Waitlist & { client: Client; service: Service; salon: SalonFields };
type LoyaltyRewardBundle = LoyaltyReward & { client: Client; salon: SalonFields };

/** "Gel Manicure" or "Gel Manicure + Pedicure" for a multi-service booking
 *  (docs/FEATURE_OPPORTUNITIES_SPEC.md #6). */
function serviceListLabel(b: Bundle): string {
  return [b.service.name, ...b.addOns.map((a) => a.service.name)].join(" + ");
}

const PLATFORM_DEFAULT_BRAND = "#db2777";

/** Validated brand color for email inlining — falls back to the platform default. */
function emailBrandColor(salon: SalonFields): string {
  return isValidHex(salon.brandColor) ? salon.brandColor : PLATFORM_DEFAULT_BRAND;
}

/** Email clients strip external stylesheets and most <style> blocks, so branding is inlined per-element. */
function logoBlockHtml(salon: SalonFields): string {
  if (!salon.logoUrl) return "";
  return `<p style="margin:0 0 16px;"><img src="${salon.logoUrl}" alt="${escapeHtml(salon.name)}" style="max-height:48px;height:48px;width:auto;" /></p>`;
}

function brandLinkStyle(salon: SalonFields): string {
  return `color:${emailBrandColor(salon)};`;
}

/** Pill-button style for the primary CTA link — contrast-checked so light brand colors don't produce unreadable button text. */
function brandButtonStyle(salon: SalonFields): string {
  const brand = emailBrandColor(salon);
  return `display:inline-block;background:${brand};color:${contrastTextColor(brand)};padding:10px 18px;border-radius:9999px;text-decoration:none;font-weight:600;`;
}

function manageUrl(slug: string, token: string) {
  return `${salonAppUrl(slug)}/appointments/${token}`;
}

function rebookUrl(slug: string, serviceId: string) {
  return `${salonAppUrl(slug)}/book?serviceId=${serviceId}`;
}

function bookingUrl(slug: string) {
  return `${salonAppUrl(slug)}/book`;
}

/** Format a Date to iCal UTC string: YYYYMMDDTHHmmssZ */
function toIcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalendarUrl(b: Bundle, manageLink: string): string {
  const title = `${serviceListLabel(b)} at ${b.salon.name}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toIcalDate(b.startsAt)}/${toIcalDate(b.endsAt)}`,
    details: `Manage or cancel: ${manageLink}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function icalDownloadUrl(slug: string, token: string): string {
  return `${salonAppUrl(slug)}/api/appointments/${token}/ical`;
}

function waitlistClaimUrl(slug: string, token: string) {
  return `${salonAppUrl(slug)}/waitlist/${token}`;
}

function fmtWhen(d: Date, timezone: string) {
  return formatBiz(d, "EEEE, MMM d 'at' h:mm a", timezone);
}

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );
}

/**
 * Shared branded message for confirmations and reminders. `lead` is the single
 * sentence after the greeting — the only part that differs between the two.
 * Keeps the tokenized manage/cancel link so self-service cancellation still
 * works, and reuses the same body for email (html + text) and SMS.
 */
function buildClientMessage(b: Bundle, lead: string) {
  const url = manageUrl(b.salon.slug, b.managementToken);
  const gcalUrl = googleCalendarUrl(b, url);
  const icalUrl = icalDownloadUrl(b.salon.slug, b.managementToken);
  const reUrl = rebookUrl(b.salon.slug, b.service.id);
  const greeting = `Hi there from ${b.salon.name}!`;
  const instagramLine = b.salon.instagram
    ? `If you have any questions please send a DM to our Instagram: ${b.salon.instagram}`
    : `If you have any questions, please reach out and we'll be happy to help.`;
  const body = [
    "Please remember our cancellation policy: let us know at least 24 hours in advance if you need to cancel or reschedule, or a $20 deposit will be required for future bookings.",
    instagramLine,
    "Due to limited space, please do not bring children or other guests.",
    "Upon arrival, kindly send me a message to let me know you've arrived. Please remain in your vehicle until I respond and let you know I'm ready for you.",
  ];
  const signoff = ["Can't wait to see you and make your nails divine✨", "Xoxo💋"];

  const textParas = [
    greeting,
    lead,
    ...body,
    `Add to Google Calendar: ${gcalUrl}`,
    `Download calendar file (.ics): ${icalUrl}`,
    `Book again: ${reUrl}`,
    `Manage or cancel your appointment: ${url}`,
    ...signoff,
  ];
  const text = textParas.join("\n\n");

  const linkStyle = brandLinkStyle(b.salon);
  const html =
    logoBlockHtml(b.salon) +
    [greeting, lead, ...body].map((p) => `<p>${escapeHtml(p)}</p>`).join("") +
    `<p>` +
    `<a href="${gcalUrl}" style="${linkStyle}">Add to Google Calendar</a> &nbsp;|&nbsp; ` +
    `<a href="${icalUrl}" style="${linkStyle}">Download calendar file (.ics)</a>` +
    `</p>` +
    `<p><a href="${url}" style="${linkStyle}">Manage or cancel your appointment</a></p>` +
    `<p><a href="${reUrl}" style="${brandButtonStyle(b.salon)}">Book again</a></p>` +
    signoff.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  // SMS carries a shorter version without the calendar links to stay concise.
  const sms = [
    greeting,
    lead,
    ...body,
    `Book again: ${reUrl}`,
    `Manage or cancel: ${url}`,
    ...signoff,
  ].join("\n\n");

  return { text, html, sms };
}

function confirmationCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  return {
    subject: `Confirmed: ${serviceListLabel(b)} on ${when}`,
    ...buildClientMessage(
      b,
      `Your ${serviceListLabel(b)} appointment is confirmed for: ${when}`
    ),
  };
}

function reminderCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  return {
    subject: `Reminder: ${serviceListLabel(b)} on ${when}`,
    ...buildClientMessage(
      b,
      `Just a friendly reminder for your upcoming nail appointment on: ${when}`
    ),
  };
}

function reviewRequestCopy(b: Bundle, reviewUrl: string) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  const reUrl = rebookUrl(b.salon.slug, b.service.id);
  const label = serviceListLabel(b);
  const text = [
    `Hi ${b.client.name}!`,
    `Thank you so much for your ${label} appointment on ${when}. We hope you love your nails!`,
    `If you have a moment, we'd love it if you left us a review — it helps us so much:`,
    reviewUrl,
    `We'd love to see you again soon. Book your next appointment here:`,
    reUrl,
    `Xoxo💋`,
    b.salon.name,
  ].join("\n\n");

  const linkStyle = brandLinkStyle(b.salon);
  const html =
    logoBlockHtml(b.salon) +
    `<p>Hi ${escapeHtml(b.client.name)}!</p>` +
    `<p>Thank you so much for your <strong>${escapeHtml(label)}</strong> appointment on ${escapeHtml(when)}. We hope you love your nails!</p>` +
    `<p>If you have a moment, we'd love it if you left us a review — it helps us so much:</p>` +
    `<p><a href="${reviewUrl}" style="${brandButtonStyle(b.salon)}">Leave a review</a></p>` +
    `<p>We'd love to see you again soon. <a href="${reUrl}" style="${linkStyle}">Book your next appointment</a></p>` +
    `<p>Xoxo💋<br/>${escapeHtml(b.salon.name)}</p>`;

  const sms =
    `${b.salon.name}: Thanks for your ${label} on ${when}! ` +
    `Would you mind leaving us a review? ${reviewUrl} ` +
    `Book again: ${reUrl}`;

  return {
    subject: `Thank you for visiting ${b.salon.name}!`,
    text,
    html,
    sms,
  };
}

function cancellationCopy(b: Bundle, note?: string) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  const noteBlockText = note ? `\n\nA note from ${b.salon.name}:\n${note}` : "";
  const noteBlockHtml = note
    ? `<p><strong>A note from ${b.salon.name}:</strong><br/>${note
        .split(/\n+/)
        .map((line) => line.replace(/[<>&]/g, (c) =>
          c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
        ))
        .join("<br/>")}</p>`
    : "";
  const noteBlockSms = note ? ` Note: ${note}` : "";
  const label = serviceListLabel(b);
  return {
    subject: `Cancelled: ${label} on ${when}`,
    text: `Your ${label} appointment ${when} has been cancelled.${noteBlockText}`,
    html: `${logoBlockHtml(b.salon)}<p>Your <strong>${label}</strong> appointment ${when} has been cancelled.</p>${noteBlockHtml}`,
    sms: `${b.salon.name}: your ${label} appointment ${when} has been cancelled.${noteBlockSms}`,
  };
}

function waitlistOfferCopy(entry: WaitlistBundle) {
  // Only ever called once offeredStartsAt is set (sendWaitlistOffer guards this).
  const when = fmtWhen(entry.offeredStartsAt!, entry.salon.timezone);
  const claimUrl = waitlistClaimUrl(entry.salon.slug, entry.claimToken);
  const text = [
    `Hi ${entry.client.name}!`,
    `A spot just opened up for ${entry.service.name} at ${entry.salon.name}: ${when}.`,
    `This is first-come, first-served — claim it here before it's gone:`,
    claimUrl,
    `If you don't want it, no action is needed — you'll stay on the waitlist for the next opening.`,
  ].join("\n\n");

  const html =
    logoBlockHtml(entry.salon) +
    `<p>Hi ${escapeHtml(entry.client.name)}!</p>` +
    `<p>A spot just opened up for <strong>${escapeHtml(entry.service.name)}</strong> at ${escapeHtml(entry.salon.name)}: ${escapeHtml(when)}.</p>` +
    `<p>This is first-come, first-served — claim it before it's gone:</p>` +
    `<p><a href="${claimUrl}" style="${brandButtonStyle(entry.salon)}">Claim this spot</a></p>` +
    `<p>If you don't want it, no action is needed — you'll stay on the waitlist for the next opening.</p>`;

  const sms =
    `${entry.salon.name}: A spot opened up for ${entry.service.name} on ${when}! ` +
    `Claim it (first come, first served): ${claimUrl}`;

  return {
    subject: `A spot opened up: ${entry.service.name} at ${entry.salon.name}`,
    text,
    html,
    sms,
  };
}

function loyaltyRewardCopy(reward: LoyaltyRewardBundle) {
  const bookUrl = bookingUrl(reward.salon.slug);
  const text = [
    `Hi ${reward.client.name}!`,
    `You've earned a loyalty reward at ${reward.salon.name}: ${reward.description}.`,
    `Just mention it at your next visit to redeem it.`,
    `Book your next appointment here:`,
    bookUrl,
  ].join("\n\n");

  const html =
    logoBlockHtml(reward.salon) +
    `<p>Hi ${escapeHtml(reward.client.name)}!</p>` +
    `<p>You've earned a loyalty reward at ${escapeHtml(reward.salon.name)}: <strong>${escapeHtml(reward.description)}</strong>.</p>` +
    `<p>Just mention it at your next visit to redeem it.</p>` +
    `<p><a href="${bookUrl}" style="${brandButtonStyle(reward.salon)}">Book your next appointment</a></p>`;

  const sms =
    `${reward.salon.name}: You earned a loyalty reward — ${reward.description}! ` +
    `Mention it at your next visit. Book: ${bookUrl}`;

  return {
    subject: `You earned a reward at ${reward.salon.name}!`,
    text,
    html,
    sms,
  };
}

const SALON_SELECT = {
  name: true,
  instagram: true,
  slug: true,
  timezone: true,
  brandColor: true,
  logoUrl: true,
} as const;

/**
 * Send a review request to the client for a completed appointment.
 * Call this after marking an appointment COMPLETED if reviewRequestEnabled is set.
 */
export async function sendReviewRequest(
  appointmentId: string,
  reviewUrl: string
) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      client: true,
      service: true,
      salon: { select: SALON_SELECT },
      addOns: { include: { service: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!appt) return;

  const copy = reviewRequestCopy(appt, reviewUrl);
  const kind: NotificationKind = "REVIEW_REQUEST";

  if (appt.client.emailOptIn && appt.client.email) {
    try {
      const r = await sendEmail({
        to: appt.client.email,
        subject: copy.subject,
        html: copy.html,
        text: copy.text,
      });
      await prisma.notificationLog.create({
        data: { appointmentId: appt.id, channel: "EMAIL", kind, status: "SENT", providerId: r.id },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "EMAIL",
          kind,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  if (appt.client.smsOptIn && appt.client.phone) {
    try {
      const r = await sendSMS({ to: appt.client.phone, body: withSmsFooter(copy.sms) });
      await prisma.notificationLog.create({
        data: { appointmentId: appt.id, channel: "SMS", kind, status: "SENT", providerId: r.sid },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "SMS",
          kind,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}

/**
 * Notify a client that a waitlist entry of theirs has been offered a freed
 * slot. There's no `Appointment` yet at this point (the client hasn't
 * claimed it), so unlike the other notifications here this isn't logged via
 * `NotificationLog` — it's best-effort, matching `notifyAdminsOfBooking`.
 */
export async function sendWaitlistOffer(waitlistId: string) {
  const entry = await prisma.waitlist.findUnique({
    where: { id: waitlistId },
    include: { client: true, service: true, salon: { select: SALON_SELECT } },
  });
  if (!entry || !entry.offeredStartsAt) return;

  const copy = waitlistOfferCopy(entry);

  if (entry.client.emailOptIn && entry.client.email) {
    await sendEmail({
      to: entry.client.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    }).catch(() => {});
  }
  if (entry.client.smsOptIn && entry.client.phone) {
    await sendSMS({ to: entry.client.phone, body: withSmsFooter(copy.sms) }).catch(() => {});
  }
}

/**
 * Notify a client they've earned a loyalty reward (docs/FEATURE_OPPORTUNITIES_SPEC.md
 * #8). Best-effort, same reasoning as `sendWaitlistOffer` — no `Appointment`
 * to log this against.
 */
export async function sendLoyaltyRewardEarned(rewardId: string) {
  const reward = await prisma.loyaltyReward.findUnique({
    where: { id: rewardId },
    include: { client: true, salon: { select: SALON_SELECT } },
  });
  if (!reward) return;

  const copy = loyaltyRewardCopy(reward);

  if (reward.client.emailOptIn && reward.client.email) {
    await sendEmail({
      to: reward.client.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    }).catch(() => {});
  }
  if (reward.client.smsOptIn && reward.client.phone) {
    await sendSMS({ to: reward.client.phone, body: withSmsFooter(copy.sms) }).catch(() => {});
  }
}

export async function sendNotifications(
  appointmentId: string,
  kind: NotificationKind,
  options?: { note?: string }
) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      client: true,
      service: true,
      salon: { select: SALON_SELECT },
      addOns: { include: { service: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!appt) return;

  const copy =
    kind === "CONFIRMATION"
      ? confirmationCopy(appt)
      : kind === "REMINDER_24H"
        ? reminderCopy(appt)
        : cancellationCopy(appt, options?.note);

  // Email
  if (appt.client.emailOptIn && appt.client.email) {
    try {
      const r = await sendEmail({
        to: appt.client.email,
        subject: copy.subject,
        html: copy.html,
        text: copy.text,
      });
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "EMAIL",
          kind,
          status: "SENT",
          providerId: r.id,
        },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "EMAIL",
          kind,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  // SMS
  if (appt.client.smsOptIn && appt.client.phone) {
    try {
      const r = await sendSMS({
        to: appt.client.phone,
        body: withSmsFooter(copy.sms),
      });
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "SMS",
          kind,
          status: "SENT",
          providerId: r.sid,
        },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          appointmentId: appt.id,
          channel: "SMS",
          kind,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}
