/**
 * Covers the Stripe payment branch shared by both public booking endpoints
 * (docs/STRIPE_SPEC.md §4.1, §4.3): when a charge is required, the
 * appointment is created as `PENDING_PAYMENT` with a hold, a PaymentIntent
 * is created, the response carries `requiresPayment: true`, and the normal
 * post-create notifications are skipped (they fire from the webhook once
 * payment actually succeeds — never from this response).
 *
 * The route-level validation/conflict/rate-limit rules are already covered
 * in appointments.test.ts for the unpaid path; this file only exercises the
 * payment-required branch, mocking `@/lib/domain/payments` so it doesn't
 * re-test amountForBooking/createPaymentIntentForAppointment themselves
 * (see payments.test.ts for those).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SALON_ID = "salon_1";
const SALON_SLUG = "test-salon";

const prismaMock = vi.hoisted(() => ({
  salon: { findUnique: vi.fn() },
  service: { findUnique: vi.fn(), findMany: vi.fn() },
  appointment: { findFirst: vi.fn(), create: vi.fn() },
  appointmentAddOn: { createMany: vi.fn() },
  clientPackage: { findMany: vi.fn(async () => []) },
  client: { upsert: vi.fn() },
  setting: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));
const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn(() => true));
const getBookingPaymentContextMock = vi.hoisted(() => vi.fn());
const amountForBookingMock = vi.hoisted(() => vi.fn());
const createPaymentIntentForAppointmentMock = vi.hoisted(() => vi.fn());
const sendNotificationsMock = vi.hoisted(() => vi.fn(async () => undefined));
const notifyAdminsOfBookingMock = vi.hoisted(() => vi.fn());
const pushToAdminsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/clients", () => ({ findClientIdByEmail: vi.fn(async () => null) }));
vi.mock("@/lib/integrations/notifications", () => ({ sendNotifications: sendNotificationsMock }));
vi.mock("@/lib/integrations/adminSms", () => ({ notifyAdminsOfBooking: notifyAdminsOfBookingMock }));
vi.mock("@/lib/integrations/push", () => ({ pushToAdmins: pushToAdminsMock }));
vi.mock("@/lib/flags", () => ({ isStripePaymentsEnabled: isStripePaymentsEnabledMock }));
vi.mock("@/lib/domain/payments", () => ({
  getBookingPaymentContext: getBookingPaymentContextMock,
  amountForBooking: amountForBookingMock,
  createPaymentIntentForAppointment: createPaymentIntentForAppointmentMock,
  PAYMENT_HOLD_MINUTES: 15,
}));

import { POST as postImmediate } from "@/app/api/appointments/route";
import { POST as postPropose } from "@/app/api/appointments/propose/route";
import { _resetCaptchaDedupeForTests } from "@/lib/integrations/captcha";
import { _resetRateLimitStoreForTests } from "@/lib/rateLimit";

function req(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      "x-salon-slug": SALON_SLUG,
    },
    body: JSON.stringify(body),
  });
}

const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PROPOSE_ISO = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

const BASE_BODY = {
  serviceId: "svc_1",
  name: "Pat Smith",
  email: "pat@example.com",
  phone: "+15555551212",
  smsOptIn: true,
};

const PAYMENT_CTX = {
  paymentsEnabled: true,
  paymentMode: "DEPOSIT",
  depositType: "FIXED",
  depositCents: 2_000,
  depositPercent: null,
  stripeAccountId: "acct_1",
  stripeChargesEnabled: true,
  currency: "usd",
};

const HOLD_RESULT = {
  clientSecret: "pi_1_secret_abc",
  publishableKey: "pk_test_123",
  connectedAccountId: "acct_1",
  amountCents: 2_000,
  currency: "usd",
};

beforeEach(() => {
  _resetRateLimitStoreForTests();
  _resetCaptchaDedupeForTests();
  delete process.env.TURNSTILE_SECRET_KEY;

  prismaMock.salon.findUnique.mockReset().mockResolvedValue({
    id: SALON_ID,
    slug: SALON_SLUG,
    name: "Test Salon",
    timezone: "America/Los_Angeles",
    instagram: null,
    brandColor: "#db2777",
    accentColor: "#db2777",
    backgroundColor: "#fdf2f8",
    fontKey: "geist",
    logoUrl: null,
    status: "ACTIVE",
  });
  prismaMock.service.findUnique.mockReset().mockResolvedValue({
    id: "svc_1",
    salonId: SALON_ID,
    name: "Manicure",
    durationMinutes: 60,
    priceCents: 10_000,
    active: true,
  });
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.appointment.create.mockReset();
  prismaMock.client.upsert.mockReset().mockResolvedValue({ id: "client_1" });
  prismaMock.setting.upsert.mockReset().mockResolvedValue({
    id: "default",
    slotGranularityMin: 15,
    allowStartAtClose: false,
    maxAdvanceDays: null,
  });

  isStripePaymentsEnabledMock.mockReset().mockReturnValue(true);
  getBookingPaymentContextMock.mockReset().mockResolvedValue(PAYMENT_CTX);
  amountForBookingMock.mockReset().mockReturnValue({ amountCents: 2_000, kind: "DEPOSIT" });
  createPaymentIntentForAppointmentMock.mockReset().mockResolvedValue(HOLD_RESULT);
  sendNotificationsMock.mockClear();
  notifyAdminsOfBookingMock.mockClear();
  pushToAdminsMock.mockClear();
});

describe("POST /api/appointments — payment required", () => {
  it("creates a PENDING_PAYMENT hold and returns the PaymentIntent envelope", async () => {
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt_1",
      managementToken: "mgmt-1",
    });

    const res = await postImmediate(req("http://localhost/api/appointments", { ...BASE_BODY, startISO: FUTURE_ISO }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        requiresPayment: true,
        appointmentId: "appt_1",
        managementToken: "mgmt-1",
        clientSecret: HOLD_RESULT.clientSecret,
        publishableKey: HOLD_RESULT.publishableKey,
        connectedAccountId: HOLD_RESULT.connectedAccountId,
        amountCents: HOLD_RESULT.amountCents,
      })
    );

    const createArgs = prismaMock.appointment.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING_PAYMENT");
    expect(createArgs.data.holdExpiresAt).toBeInstanceOf(Date);

    expect(createPaymentIntentForAppointmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appt_1",
        salonId: SALON_ID,
        stripeAccountId: "acct_1",
        amountCents: 2_000,
        currency: "usd",
        kind: "DEPOSIT",
        postPaymentStatus: "CONFIRMED",
      })
    );

    // Notifications are deferred to the webhook — never fired from this response.
    expect(sendNotificationsMock).not.toHaveBeenCalled();
    expect(notifyAdminsOfBookingMock).not.toHaveBeenCalled();
  });

  it("falls back to the unpaid flow when the platform flag is off", async () => {
    isStripePaymentsEnabledMock.mockReturnValue(false);
    prismaMock.appointment.create.mockResolvedValue({ id: "appt_2", managementToken: "mgmt-2" });

    const res = await postImmediate(req("http://localhost/api/appointments", { ...BASE_BODY, startISO: FUTURE_ISO }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresPayment).toBeUndefined();
    expect(getBookingPaymentContextMock).not.toHaveBeenCalled();
    expect(createPaymentIntentForAppointmentMock).not.toHaveBeenCalled();
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_2", "CONFIRMATION");
  });

  it("falls back to the unpaid flow when the connected account has no charges enabled yet", async () => {
    getBookingPaymentContextMock.mockResolvedValue({ ...PAYMENT_CTX, stripeChargesEnabled: false });
    prismaMock.appointment.create.mockResolvedValue({ id: "appt_3", managementToken: "mgmt-3" });

    const res = await postImmediate(req("http://localhost/api/appointments", { ...BASE_BODY, startISO: FUTURE_ISO }));
    expect(res.status).toBe(200);
    expect(amountForBookingMock).not.toHaveBeenCalled();
    expect(createPaymentIntentForAppointmentMock).not.toHaveBeenCalled();
  });

  it("falls back to the unpaid flow when amountForBooking returns null (e.g. free service)", async () => {
    amountForBookingMock.mockReturnValue(null);
    prismaMock.appointment.create.mockResolvedValue({ id: "appt_4", managementToken: "mgmt-4" });

    const res = await postImmediate(req("http://localhost/api/appointments", { ...BASE_BODY, startISO: FUTURE_ISO }));
    const json = await res.json();
    expect(json.requiresPayment).toBeUndefined();
    expect(createPaymentIntentForAppointmentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/appointments/propose — payment required", () => {
  it("creates a PENDING_PAYMENT hold with postPaymentStatus PENDING and skips admin alerts", async () => {
    prismaMock.appointment.create.mockResolvedValue({
      id: "appt_5",
      managementToken: "mgmt-5",
    });

    const res = await postPropose(
      req("http://localhost/api/appointments/propose", { ...BASE_BODY, startISO: PROPOSE_ISO })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresPayment).toBe(true);

    const createArgs = prismaMock.appointment.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING_PAYMENT");

    expect(createPaymentIntentForAppointmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ postPaymentStatus: "PENDING" })
    );
    expect(pushToAdminsMock).not.toHaveBeenCalled();
    expect(notifyAdminsOfBookingMock).not.toHaveBeenCalled();
  });
});
