import { prisma } from "../db/prisma";
import { sendEmail } from "./email";
import { sendSMS, withSmsFooter } from "./sms";
import { formatBiz } from "../timezone";
import { APP_URL, BUSINESS_NAME } from "../config";
import type {
  Appointment,
  Client,
  Service,
  NotificationKind,
} from "@prisma/client";

type Bundle = Appointment & { client: Client; service: Service };

function manageUrl(token: string) {
  return `${APP_URL}/appointments/${token}`;
}

function fmtWhen(d: Date) {
  return formatBiz(d, "EEEE, MMM d 'at' h:mm a");
}

const INSTAGRAM_HANDLE = "@virgonailz";

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
  const url = manageUrl(b.managementToken);
  const greeting = `Hi there from ${BUSINESS_NAME}!`;
  const body = [
    "Please remember our cancellation policy: let us know at least 24 hours in advance if you need to cancel or reschedule, or a $20 deposit will be required for future bookings.",
    `If you have any questions please send a DM to my Instagram: ${INSTAGRAM_HANDLE}`,
    "Due to limited space, please do not bring children or other guests.",
    "Upon arrival, kindly send me a message to let me know you've arrived. Please remain in your vehicle until I respond and let you know I'm ready for you.",
  ];
  const signoff = ["Can't wait to see you and make your nails divine✨", "Xoxo💋"];

  const textParas = [
    greeting,
    lead,
    ...body,
    `Manage or cancel your appointment: ${url}`,
    ...signoff,
  ];
  const text = textParas.join("\n\n");

  const html =
    [greeting, lead, ...body].map((p) => `<p>${escapeHtml(p)}</p>`).join("") +
    `<p><a href="${url}">Manage or cancel your appointment</a></p>` +
    signoff.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  // SMS carries the same message; withSmsFooter() appends the STOP/HELP line.
  return { text, html, sms: text };
}

function confirmationCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt);
  return {
    subject: `Confirmed: ${b.service.name} on ${when}`,
    ...buildClientMessage(
      b,
      `Your ${b.service.name} appointment is confirmed for: ${when}`
    ),
  };
}

function reminderCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt);
  return {
    subject: `Reminder: ${b.service.name} on ${when}`,
    ...buildClientMessage(
      b,
      `Just a friendly reminder for your upcoming nail appointment on: ${when}`
    ),
  };
}

function cancellationCopy(b: Bundle, note?: string) {
  const when = fmtWhen(b.startsAt);
  const noteBlockText = note ? `\n\nA note from ${BUSINESS_NAME}:\n${note}` : "";
  const noteBlockHtml = note
    ? `<p><strong>A note from ${BUSINESS_NAME}:</strong><br/>${note
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
    sms: `${BUSINESS_NAME}: your ${b.service.name} appointment ${when} has been cancelled.${noteBlockSms}`,
  };
}

export async function sendNotifications(
  appointmentId: string,
  kind: NotificationKind,
  options?: { note?: string }
) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, service: true },
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
