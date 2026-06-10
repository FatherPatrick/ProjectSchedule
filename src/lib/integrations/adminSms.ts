import { getNotifiableAdminPhones } from "../auth/admin";
import { sendSMS } from "./sms";
import { reportError } from "../observability/reportError";
import { BUSINESS_NAME } from "../config";

export interface AdminBookingAlert {
  /** "booked" = auto-confirmed booking; "requested" = pending request to review. */
  kind: "booked" | "requested";
  clientName: string;
  serviceName: string;
  /** Human-readable appointment time, e.g. "Thu Jun 12, 2:00 PM". */
  whenLabel: string;
}

/**
 * Fire-and-forget SMS alert to every admin who has booking notifications
 * enabled. Best-effort: never blocks or throws into the caller.
 *
 * These are internal operational texts to the studio's own admins (not
 * marketing to clients), so they intentionally skip the STOP/HELP footer. The
 * copy is branded and professional so the recipient knows it's from the booking
 * system.
 */
export function notifyAdminsOfBooking(alert: AdminBookingAlert): void {
  const headline =
    alert.kind === "booked"
      ? "A new appointment has been booked."
      : "A new appointment request needs your review.";
  const message =
    `${BUSINESS_NAME} booking alert\n\n` +
    `${headline}\n\n` +
    `Client: ${alert.clientName}\n` +
    `Service: ${alert.serviceName}\n` +
    `When: ${alert.whenLabel}`;

  void (async () => {
    const phones = await getNotifiableAdminPhones();
    await Promise.all(
      phones.map((to) =>
        sendSMS({ to, body: message }).catch((err) =>
          reportError(err, { where: "adminSms.notify", to })
        )
      )
    );
  })().catch((err) => reportError(err, { where: "adminSms.dispatch" }));
}
