/**
 * Covers `cancelAppointment`'s refund wiring (docs/STRIPE_SPEC.md §5.3):
 * a timely client self-cancel always auto-refunds; an admin cancel keeps
 * the payment by default and only refunds when explicitly opted in.
 * `refundPayment` itself is unit-tested in payments.test.ts — this file
 * only checks that `cancelAppointment` calls it with the right args under
 * the right conditions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findFirst: vi.fn() },
}));
const sendNotificationsMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportErrorMock = vi.hoisted(() => vi.fn());
const refundPaymentMock = vi.hoisted(() => vi.fn());
const notifyWaitlistOfOpeningMock = vi.hoisted(() => vi.fn(async () => false));
const refundPackageSessionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/notifications", () => ({ sendNotifications: sendNotificationsMock }));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/domain/payments", () => ({ refundPayment: refundPaymentMock }));
vi.mock("@/lib/domain/waitlist", () => ({ notifyWaitlistOfOpening: notifyWaitlistOfOpeningMock }));
vi.mock("@/lib/domain/packages", () => ({ refundPackageSession: refundPackageSessionMock }));

import { cancelAppointment } from "@/lib/domain/appointments";

const SALON_ID = "salon_1";
const APPT_ID = "appt_1";
const SERVICE_ID = "svc_1";

function confirmedAppt(overrides: Partial<{ startsAt: Date }> = {}) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h out — within window
  return {
    id: APPT_ID,
    salonId: SALON_ID,
    serviceId: SERVICE_ID,
    status: "CONFIRMED" as const,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
  };
}

function pendingAppt() {
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  return {
    id: APPT_ID,
    salonId: SALON_ID,
    serviceId: SERVICE_ID,
    status: "PENDING" as const,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
  };
}

const SUCCEEDED_PAYMENT = { id: "pay_1", appointmentId: APPT_ID, status: "SUCCEEDED" };

beforeEach(() => {
  prismaMock.appointment.findUnique.mockReset();
  prismaMock.appointment.update.mockReset().mockResolvedValue({});
  prismaMock.payment.findFirst.mockReset();
  refundPackageSessionMock.mockClear();
  sendNotificationsMock.mockClear();
  reportErrorMock.mockClear();
  refundPaymentMock.mockReset().mockResolvedValue({ ok: true });
  notifyWaitlistOfOpeningMock.mockReset().mockResolvedValue(false);
});

describe("cancelAppointment — refund policy", () => {
  it("auto-refunds a timely client self-cancel with a SUCCEEDED payment", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(SUCCEEDED_PAYMENT);

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });
    expect(result).toEqual({ ok: true });
    expect(refundPaymentMock).toHaveBeenCalledWith(SALON_ID, "pay_1");
  });

  it("does not look up a payment for an unpaid client self-cancel", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });
    expect(result).toEqual({ ok: true });
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });

  it("keeps the payment on an admin cancel by default (no-show / late-cancel forfeit)", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: true });
    expect(result).toEqual({ ok: true });
    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });

  it("always refunds when an admin declines a paid, never-confirmed (PENDING) request", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(pendingAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(SUCCEEDED_PAYMENT);

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: true });
    expect(result).toEqual({ ok: true });
    expect(refundPaymentMock).toHaveBeenCalledWith(SALON_ID, "pay_1");
  });

  it("refunds on an admin cancel when the admin explicitly opts in", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(SUCCEEDED_PAYMENT);

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: true, refund: true });
    expect(result).toEqual({ ok: true });
    expect(refundPaymentMock).toHaveBeenCalledWith(SALON_ID, "pay_1");
  });

  it("still cancels (and reports) when the refund itself fails", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(SUCCEEDED_PAYMENT);
    refundPaymentMock.mockResolvedValueOnce({ ok: false, status: 502, error: "Stripe refund failed. Try again." });

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });
    expect(result).toEqual({ ok: true });
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "CANCELLED" },
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ where: "appointments.cancel.refund", appointmentId: APPT_ID })
    );
  });

  it("still blocks a late client self-cancel before ever checking for a payment to refund", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(
      confirmedAppt({ startsAt: new Date(Date.now() + 60 * 60 * 1000) }) // 1h out — inside the window
    );

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });
    expect(result.ok).toBe(false);
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });
});

describe("cancelAppointment — waitlist notification", () => {
  it("offers the freed slot to the waitlist when a CONFIRMED appointment is cancelled", async () => {
    const appt = confirmedAppt();
    prismaMock.appointment.findUnique.mockResolvedValueOnce(appt);
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);

    await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });

    expect(notifyWaitlistOfOpeningMock).toHaveBeenCalledWith(
      SALON_ID,
      SERVICE_ID,
      appt.startsAt,
      appt.endsAt
    );
  });

  it("does not touch the waitlist when a never-confirmed PENDING request is cancelled", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(pendingAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);

    await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: true });

    expect(notifyWaitlistOfOpeningMock).not.toHaveBeenCalled();
  });
});

describe("cancelAppointment — package session refund", () => {
  it("gives the session back on a timely client self-cancel of a package-redeemed booking", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce({
      ...confirmedAppt(),
      clientPackageId: "cp_1",
    });
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });

    expect(result).toEqual({ ok: true });
    expect(refundPackageSessionMock).toHaveBeenCalledWith("cp_1");
  });

  it("keeps the session on an admin cancel by default (no-show / late-cancel forfeit)", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce({
      ...confirmedAppt(),
      clientPackageId: "cp_1",
    });

    await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: true });

    expect(refundPackageSessionMock).not.toHaveBeenCalled();
  });

  it("does nothing when the appointment wasn't paid for with a package", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce(confirmedAppt());
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);

    await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });

    expect(refundPackageSessionMock).not.toHaveBeenCalled();
  });

  it("still cancels (and reports) when the package refund itself fails", async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce({
      ...confirmedAppt(),
      clientPackageId: "cp_1",
    });
    prismaMock.payment.findFirst.mockResolvedValueOnce(null);
    refundPackageSessionMock.mockRejectedValueOnce(new Error("db hiccup"));

    const result = await cancelAppointment(SALON_ID, APPT_ID, { byAdmin: false });

    expect(result).toEqual({ ok: true });
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        where: "appointments.cancel.packageRefund",
        appointmentId: APPT_ID,
        clientPackageId: "cp_1",
      })
    );
  });
});
