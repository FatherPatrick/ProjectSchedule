import { prisma } from "../db/prisma";
import { sendEmail } from "./email";
import { sendSMS, withSmsFooter } from "./sms";
import { formatBiz } from "../timezone";
import { salonAppUrl } from "../config";
import type {
  Appointment,
  Client,
  Service,
  Salon,
  NotificationKind,
} from "@prisma/client";

type SalonFields = Pick<Salon, "name" | "instagram" | "slug" | "timezone">;
type Bundle = Appointment & { client: Client; service: Service; salon: SalonFields };

function manageUrl(slug: string, token: string) {
  return `${salonAppUrl(slug)}/appointments/${token}`;
}

function rebookUrl(slug: string, serviceId: string) {
  return `${salonAppUrl(slug)}/book?serviceId=${serviceId}`;
}

/** Format a Date to iCal UTC string: YYYYMMDDTHHmmssZ */
function toIcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalendarUrl(b: Bundle, manageLink: string): string {
  const title = `${b.service.name} at ${b.salon.name}`;
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

  const html =
    [greeting, lead, ...body].map((p) => `<p>${escapeHtml(p)}</p>`).join("") +
    `<p>` +
    `<a href="${gcalUrl}">Add to Google Calendar</a> &nbsp;|&nbsp; ` +
    `<a href="${icalUrl}">Download calendar file (.ics)</a>` +
    `</p>` +
    `<p><a href="${url}">Manage or cancel your appointment</a> &nbsp;|&nbsp; <a href="${reUrl}">Book again</a></p>` +
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
    subject: `Confirmed: ${b.service.name} on ${when}`,
    ...buildClientMessage(
      b,
      `Your ${b.service.name} appointment is confirmed for: ${when}`
    ),
  };
}

function reminderCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  return {
    subject: `Reminder: ${b.service.name} on ${when}`,
    ...buildClientMessage(
      b,
      `Just a friendly reminder for your upcoming nail appointment on: ${when}`
    ),
  };
}

function reviewRequestCopy(b: Bundle, reviewUrl: string) {
  const when = fmtWhen(b.startsAt, b.salon.timezone);
  const reUrl = rebookUrl(b.salon.slug, b.service.id);
  const text = [
    `Hi ${b.client.name}!`,
    `Thank you so much for your ${b.service.name} appointment on ${when}. We hope you love your nails!`,
    `If you have a moment, we'd love it if you left us a review — it helps us so much:`,
    reviewUrl,
    `We'd love to see you again soon. Book your next appointment here:`,
    reUrl,
    `Xoxo💋`,
    b.salon.name,
  ].join("\n\n");

  const html =
    `<p>Hi ${escapeHtml(b.client.name)}!</p>` +
    `<p>Thank you so much for your <strong>${escapeHtml(b.service.name)}</strong> appointment on ${escapeHtml(when)}. We hope you love your nails!</p>` +
    `<p>If you have a moment, we'd love it if you left us a review — it helps us so much: <a href="${reviewUrl}">Leave a review</a></p>` +
    `<p>We'd love to see you again soon. <a href="${reUrl}">Book your next appointment</a></p>` +
    `<p>Xoxo💋<br/>${escapeHtml(b.salon.name)}</p>`;

  const sms =
    `${b.salon.name}: Thanks for your ${b.service.name} on ${when}! ` +
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
  return {
    subject: `Cancelled: ${b.service.name} on ${when}`,
    text: `Your ${b.service.name} appointment ${when} has been cancelled.${noteBlockText}`,
    html: `<p>Your <strong>${b.service.name}</strong> appointment ${when} has been cancelled.</p>${noteBlockHtml}`,
    sms: `${b.salon.name}: your ${b.service.name} appointment ${when} has been cancelled.${noteBlockSms}`,
  };
}

const SALON_SELECT = {
  name: true,
  instagram: true,
  slug: true,
  timezone: true,
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
    include: { client: true, service: true, salon: { select: SALON_SELECT } },
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

export async function sendNotifications(
  appointmentId: string,
  kind: NotificationKind,
  options?: { note?: string }
) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, service: true, salon: { select: SALON_SELECT } },
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
