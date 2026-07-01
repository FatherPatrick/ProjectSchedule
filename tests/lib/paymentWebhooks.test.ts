/**
 * Covers the Stripe payment-event handlers in
 * `src/lib/domain/paymentWebhooks.ts` (docs/STRIPE_SPEC.md §5.1). These are
 * the only place a booking is confirmed from a payment — never from
 * client-reported success — so idempotency (a webhook replay must be a
 * no-op) is the main thing under test here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  payment: { findUnique: vi.fn(), update: vi.fn() },
  appointment: { updateMany: vi.fn(), findUnique: vi.fn() },
}));
const sendNotificationsMock = vi.hoisted(() => vi.fn(async () => undefined));
const notifyAdminsOfBookingMock = vi.hoisted(() => vi.fn());
const pushToAdminsMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/notifications", () => ({ sendNotifications: sendNotificationsMock }));
vi.mock("@/lib/integrations/adminSms", () => ({ notifyAdminsOfBooking: notifyAdminsOfBookingMock }));
vi.mock("@/lib/integrations/push", () => ({ pushToAdmins: pushToAdminsMock }));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import {
  handleChargeDisputeCreated,
  handleChargeRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentSucceeded,
} from "@/lib/domain/paymentWebhooks";

const APPT_BUNDLE = {
  id: "appt_1",
  salonId: "salon_1",
  startsAt: new Date("2026-08-01T18:00:00Z"),
  client: { name: "Pat Smith" },
  service: { name: "Manicure" },
  salon: { name: "Test Salon", timezone: "America/Los_Angeles" },
};

beforeEach(() => {
  prismaMock.payment.findUnique.mockReset();
  prismaMock.payment.update.mockReset();
  prismaMock.appointment.updateMany.mockReset();
  prismaMock.appointment.findUnique.mockReset();
  sendNotificationsMock.mockClear();
  notifyAdminsOfBookingMock.mockClear();
  pushToAdminsMock.mockClear();
  reportErrorMock.mockClear();
});

describe("handlePaymentIntentSucceeded", () => {
  it("is a no-op when no local Payment matches the PaymentIntent", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(null);
    await handlePaymentIntentSucceeded({ id: "pi_missing", metadata: {} } as never);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it("is idempotent when the Payment is already SUCCEEDED (webhook replay)", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: "pay_1",
      appointmentId: "appt_1",
      status: "SUCCEEDED",
    });
    await handlePaymentIntentSucceeded({ id: "pi_1", metadata: {} } as never);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("confirms an immediate-book appointment and notifies client + admins", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: "pay_1",
      appointmentId: "appt_1",
      status: "REQUIRES_PAYMENT",
    });
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.appointment.findUnique.mockResolvedValueOnce(APPT_BUNDLE);

    await handlePaymentIntentSucceeded({
      id: "pi_1",
      metadata: { postPaymentStatus: "CONFIRMED" },
    } as never);

    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { status: "SUCCEEDED" },
    });
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: "appt_1", status: "PENDING_PAYMENT" },
      data: { status: "CONFIRMED", holdExpiresAt: null },
    });
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_1", "CONFIRMATION");
    expect(notifyAdminsOfBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "booked", salonId: "salon_1", clientName: "Pat Smith" })
    );
    expect(pushToAdminsMock).not.toHaveBeenCalled();
  });

  it("moves a propose-flow appointment to PENDING and alerts admins instead of the client", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: "pay_2",
      appointmentId: "appt_1",
      status: "REQUIRES_PAYMENT",
    });
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.appointment.findUnique.mockResolvedValueOnce(APPT_BUNDLE);

    await handlePaymentIntentSucceeded({
      id: "pi_2",
      metadata: { postPaymentStatus: "PENDING" },
    } as never);

    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: "appt_1", status: "PENDING_PAYMENT" },
      data: { status: "PENDING", holdExpiresAt: null },
    });
    expect(sendNotificationsMock).not.toHaveBeenCalled();
    expect(pushToAdminsMock).toHaveBeenCalled();
    expect(notifyAdminsOfBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "requested" })
    );
  });

  it("skips notifications when the appointment already moved out of PENDING_PAYMENT (replay)", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({
      id: "pay_3",
      appointmentId: "appt_1",
      status: "REQUIRES_PAYMENT",
    });
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    await handlePaymentIntentSucceeded({ id: "pi_3", metadata: {} } as never);

    expect(prismaMock.appointment.findUnique).not.toHaveBeenCalled();
    expect(sendNotificationsMock).not.toHaveBeenCalled();
    expect(notifyAdminsOfBookingMock).not.toHaveBeenCalled();
  });
});

describe("handlePaymentIntentFailed", () => {
  it("records the failure reason", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ id: "pay_1", status: "REQUIRES_PAYMENT" });
    await handlePaymentIntentFailed({
      id: "pi_1",
      last_payment_error: { message: "Your card was declined." },
    } as never);
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { status: "FAILED", failureReason: "Your card was declined." },
    });
  });

  it("is a no-op when the payment already succeeded", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ id: "pay_1", status: "SUCCEEDED" });
    await handlePaymentIntentFailed({ id: "pi_1" } as never);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});

describe("handleChargeRefunded", () => {
  it("marks the payment fully REFUNDED when amount_refunded covers it", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ id: "pay_1", amountCents: 2_000 });
    await handleChargeRefunded({
      payment_intent: "pi_1",
      amount_refunded: 2_000,
    } as never);
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { refundedCents: 2_000, status: "REFUNDED" },
    });
  });

  it("marks PARTIALLY_REFUNDED for a partial amount", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ id: "pay_1", amountCents: 2_000 });
    await handleChargeRefunded({
      payment_intent: "pi_1",
      amount_refunded: 500,
    } as never);
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { refundedCents: 500, status: "PARTIALLY_REFUNDED" },
    });
  });

  it("is a no-op when the charge has no matching local payment", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(null);
    await handleChargeRefunded({ payment_intent: "pi_missing", amount_refunded: 100 } as never);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});

describe("handleChargeDisputeCreated", () => {
  it("logs the dispute and alerts admins when a matching payment exists", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ id: "pay_1", salonId: "salon_1" });
    await handleChargeDisputeCreated({
      id: "dp_1",
      payment_intent: "pi_1",
      amount: 2_000,
      reason: "fraudulent",
    } as never);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ where: "paymentWebhooks.disputeCreated", disputeId: "dp_1" })
    );
    expect(pushToAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Payment disputed" }),
      expect.objectContaining({ salonId: "salon_1" })
    );
  });

  it("still logs the dispute (without alerting admins) when no local payment matches", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(null);
    await handleChargeDisputeCreated({ id: "dp_2", payment_intent: "pi_missing", amount: 500, reason: "fraudulent" } as never);
    expect(reportErrorMock).toHaveBeenCalled();
    expect(pushToAdminsMock).not.toHaveBeenCalled();
  });
});
