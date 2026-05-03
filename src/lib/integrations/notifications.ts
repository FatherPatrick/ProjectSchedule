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

function confirmationCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt);
  const url = manageUrl(b.managementToken);
  return {
    subject: `Confirmed: ${b.service.name} on ${when}`,
    text:
      `Hi ${b.client.name},\n\n` +
      `Your ${b.service.name} appointment at ${BUSINESS_NAME} is confirmed for ${when}.\n\n` +
      `Manage or cancel: ${url}\n\nSee you soon!`,
    html:
      `<p>Hi ${b.client.name},</p>` +
      `<p>Your <strong>${b.service.name}</strong> appointment at ${BUSINESS_NAME} is confirmed for <strong>${when}</strong>.</p>` +
      `<p><a href="${url}">Manage or cancel your appointment</a></p>` +
      `<p>See you soon!</p>`,
    sms:
      `${BUSINESS_NAME}: ${b.service.name} confirmed for ${when}. ` +
      `Manage: ${url}`,
  };
}

function reminderCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt);
  const url = manageUrl(b.managementToken);
  return {
    subject: `Reminder: ${b.service.name} tomorrow at ${formatBiz(b.startsAt, "h:mm a")}`,
    text:
      `Hi ${b.client.name},\n\nThis is a reminder of your ${b.service.name} appointment ${when}.\n\n` +
      `Need to cancel? ${url}`,
    html:
      `<p>Hi ${b.client.name},</p>` +
      `<p>Reminder: your <strong>${b.service.name}</strong> appointment is ${when}.</p>` +
      `<p><a href="${url}">Need to cancel?</a></p>`,
    sms:
      `${BUSINESS_NAME} reminder: ${b.service.name} ${when}. ` +
      `Cancel: ${url}`,
  };
}

function cancellationCopy(b: Bundle) {
  const when = fmtWhen(b.startsAt);
  return {
    subject: `Cancelled: ${b.service.name} on ${when}`,
    text: `Your ${b.service.name} appointment ${when} has been cancelled.`,
    html: `<p>Your <strong>${b.service.name}</strong> appointment ${when} has been cancelled.</p>`,
    sms: `${BUSINESS_NAME}: your ${b.service.name} appointment ${when} has been cancelled.`,
  };
}

export async function sendNotifications(
  appointmentId: string,
  kind: NotificationKind
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
        : cancellationCopy(appt);

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
