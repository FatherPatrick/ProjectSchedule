/**
 * Covers the payment amount/fee math and admin config persistence in
 * `src/lib/domain/payments.ts` (docs/STRIPE_SPEC.md §3, §7, §8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  salon: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  payment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  appointment: {
    updateMany: vi.fn(),
  },
}));
const stripeMock = vi.hoisted(() => ({
  paymentIntents: { create: vi.fn(), cancel: vi.fn() },
  refunds: { create: vi.fn() },
}));
const getStripeClientMock = vi.hoisted(() => vi.fn(() => stripeMock));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/stripe", () => ({ getStripeClient: getStripeClientMock }));

import {
  amountForBooking,
  computeApplicationFeeCents,
  createPaymentIntentForAppointment,
  expireHold,
  getPaymentsConfig,
  getPlatformFeePercent,
  refundPayment,
  STRIPE_MIN_CHARGE_CENTS,
  updatePaymentsConfig,
} from "@/lib/domain/payments";

const SALON_ID = "salon_1";

beforeEach(() => {
  prismaMock.salon.findUniqueOrThrow.mockReset();
  prismaMock.salon.update.mockReset();
  prismaMock.payment.create.mockReset();
  prismaMock.payment.findUnique.mockReset();
  prismaMock.payment.findFirst.mockReset();
  prismaMock.payment.update.mockReset();
  prismaMock.appointment.updateMany.mockReset();
  stripeMock.paymentIntents.create.mockReset();
  stripeMock.paymentIntents.cancel.mockReset();
  stripeMock.refunds.create.mockReset();
  getStripeClientMock.mockClear();
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
});

describe("amountForBooking", () => {
  const service = { priceCents: 10_000 }; // $100

  it("returns null when payments are disabled", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: false, paymentMode: "FULL", depositType: "FIXED", depositCents: null, depositPercent: null },
        service
      )
    ).toBeNull();
  });

  it("returns null when mode is NONE", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "NONE", depositType: "FIXED", depositCents: null, depositPercent: null },
        service
      )
    ).toBeNull();
  });

  it("returns null for a free service", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "FULL", depositType: "FIXED", depositCents: null, depositPercent: null },
        { priceCents: 0 }
      )
    ).toBeNull();
  });

  it("charges the full price in FULL mode", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "FULL", depositType: "FIXED", depositCents: null, depositPercent: null },
        service
      )
    ).toEqual({ amountCents: 10_000, kind: "FULL" });
  });

  it("charges a fixed deposit", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "DEPOSIT", depositType: "FIXED", depositCents: 2_000, depositPercent: null },
        service
      )
    ).toEqual({ amountCents: 2_000, kind: "DEPOSIT" });
  });

  it("charges a percent deposit, rounded", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "DEPOSIT", depositType: "PERCENT", depositCents: null, depositPercent: 33 },
        { priceCents: 999 }
      )
    ).toEqual({ amountCents: Math.round(999 * 0.33), kind: "DEPOSIT" });
  });

  it("caps a fixed deposit at the service price", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "DEPOSIT", depositType: "FIXED", depositCents: 50_000, depositPercent: null },
        service
      )
    ).toEqual({ amountCents: 10_000, kind: "DEPOSIT" });
  });

  it("bumps a sub-minimum deposit up to the Stripe minimum", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "DEPOSIT", depositType: "FIXED", depositCents: 10, depositPercent: null },
        service
      )
    ).toEqual({ amountCents: STRIPE_MIN_CHARGE_CENTS, kind: "DEPOSIT" });
  });

  it("bumps a sub-minimum FULL price up to the Stripe minimum", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "FULL", depositType: "FIXED", depositCents: null, depositPercent: null },
        { priceCents: 10 }
      )
    ).toEqual({ amountCents: STRIPE_MIN_CHARGE_CENTS, kind: "FULL" });
  });

  it("returns null for a zero-value deposit configuration", () => {
    expect(
      amountForBooking(
        { paymentsEnabled: true, paymentMode: "DEPOSIT", depositType: "FIXED", depositCents: null, depositPercent: null },
        service
      )
    ).toBeNull();
  });
});

describe("getPlatformFeePercent / computeApplicationFeeCents", () => {
  const ORIGINAL = process.env.PLATFORM_FEE_PERCENT;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PLATFORM_FEE_PERCENT;
    else process.env.PLATFORM_FEE_PERCENT = ORIGINAL;
  });

  it("defaults to 0 when unset", () => {
    delete process.env.PLATFORM_FEE_PERCENT;
    expect(getPlatformFeePercent()).toBe(0);
    expect(computeApplicationFeeCents(10_000)).toBe(0);
  });

  it("computes the fee from the configured percent, rounded", () => {
    process.env.PLATFORM_FEE_PERCENT = "10";
    expect(computeApplicationFeeCents(999)).toBe(Math.round(999 * 0.1));
  });

  it("ignores an invalid value and falls back to 0", () => {
    process.env.PLATFORM_FEE_PERCENT = "not-a-number";
    expect(getPlatformFeePercent()).toBe(0);
  });
});

describe("getPaymentsConfig", () => {
  it("returns the salon's payment config fields", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      paymentsEnabled: true,
      paymentMode: "DEPOSIT",
      depositType: "FIXED",
      depositCents: 2_000,
      depositPercent: null,
      stripeChargesEnabled: true,
    });
    const config = await getPaymentsConfig(SALON_ID);
    expect(config).toEqual({
      paymentsEnabled: true,
      paymentMode: "DEPOSIT",
      depositType: "FIXED",
      depositCents: 2_000,
      depositPercent: null,
      stripeChargesEnabled: true,
    });
  });
});

describe("updatePaymentsConfig", () => {
  it("persists the config when charges are enabled", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({ stripeChargesEnabled: true });

    await updatePaymentsConfig(SALON_ID, {
      paymentsEnabled: true,
      paymentMode: "DEPOSIT",
      depositType: "FIXED",
      depositCents: 2_000,
      depositPercent: undefined,
    });

    expect(prismaMock.salon.update).toHaveBeenCalledWith({
      where: { id: SALON_ID },
      data: {
        paymentsEnabled: true,
        paymentMode: "DEPOSIT",
        depositType: "FIXED",
        depositCents: 2_000,
        depositPercent: null,
      },
    });
  });

  it("throws and does not write when enabling payments before charges are enabled", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({ stripeChargesEnabled: false });

    await expect(
      updatePaymentsConfig(SALON_ID, {
        paymentsEnabled: true,
        paymentMode: "FULL",
        depositType: "FIXED",
        depositCents: undefined,
        depositPercent: undefined,
      })
    ).rejects.toThrow("Connect Stripe and finish onboarding");
    expect(prismaMock.salon.update).not.toHaveBeenCalled();
  });

  it("allows disabling payments without checking charges-enabled", async () => {
    await updatePaymentsConfig(SALON_ID, {
      paymentsEnabled: false,
      paymentMode: "NONE",
      depositType: "FIXED",
      depositCents: undefined,
      depositPercent: undefined,
    });
    expect(prismaMock.salon.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.salon.update).toHaveBeenCalledWith({
      where: { id: SALON_ID },
      data: {
        paymentsEnabled: false,
        paymentMode: "NONE",
        depositType: "FIXED",
        depositCents: null,
        depositPercent: null,
      },
    });
  });

  it("clears the inactive deposit field when depositType is PERCENT", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({ stripeChargesEnabled: true });
    await updatePaymentsConfig(SALON_ID, {
      paymentsEnabled: true,
      paymentMode: "DEPOSIT",
      depositType: "PERCENT",
      depositCents: undefined,
      depositPercent: 25,
    });
    expect(prismaMock.salon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ depositCents: null, depositPercent: 25 }) })
    );
  });
});

describe("createPaymentIntentForAppointment", () => {
  it("creates a PI on the connected account and persists a REQUIRES_PAYMENT row", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    process.env.PLATFORM_FEE_PERCENT = "10";
    stripeMock.paymentIntents.create.mockResolvedValueOnce({
      id: "pi_1",
      client_secret: "pi_1_secret",
    });

    const result = await createPaymentIntentForAppointment({
      appointmentId: "appt_1",
      salonId: SALON_ID,
      stripeAccountId: "acct_1",
      amountCents: 2_000,
      currency: "usd",
      kind: "DEPOSIT",
      postPaymentStatus: "CONFIRMED",
    });

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2_000,
        currency: "usd",
        application_fee_amount: 200,
        metadata: expect.objectContaining({
          appointmentId: "appt_1",
          postPaymentStatus: "CONFIRMED",
        }),
      }),
      { stripeAccount: "acct_1", idempotencyKey: "pi_create_appt_1" }
    );
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salonId: SALON_ID,
        appointmentId: "appt_1",
        stripePaymentIntentId: "pi_1",
        stripeAccountId: "acct_1",
        amountCents: 2_000,
        applicationFeeCents: 200,
        currency: "usd",
        status: "REQUIRES_PAYMENT",
        kind: "DEPOSIT",
      }),
    });
    expect(result).toEqual({
      clientSecret: "pi_1_secret",
      publishableKey: "pk_test_123",
      connectedAccountId: "acct_1",
      amountCents: 2_000,
      currency: "usd",
    });

    delete process.env.PLATFORM_FEE_PERCENT;
  });

  it("throws when the publishable key is not configured", async () => {
    await expect(
      createPaymentIntentForAppointment({
        appointmentId: "appt_1",
        salonId: SALON_ID,
        stripeAccountId: "acct_1",
        amountCents: 2_000,
        currency: "usd",
        kind: "FULL",
        postPaymentStatus: "CONFIRMED",
      })
    ).rejects.toThrow("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("throws when Stripe doesn't return a client secret", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    stripeMock.paymentIntents.create.mockResolvedValueOnce({ id: "pi_1", client_secret: null });
    await expect(
      createPaymentIntentForAppointment({
        appointmentId: "appt_1",
        salonId: SALON_ID,
        stripeAccountId: "acct_1",
        amountCents: 2_000,
        currency: "usd",
        kind: "FULL",
        postPaymentStatus: "CONFIRMED",
      })
    ).rejects.toThrow("client secret");
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
});

describe("refundPayment", () => {
  const SUCCEEDED_PAYMENT = {
    id: "pay_1",
    salonId: SALON_ID,
    stripePaymentIntentId: "pi_1",
    stripeAccountId: "acct_1",
    amountCents: 2_000,
    refundedCents: 0,
    status: "SUCCEEDED",
  };

  it("404s when the payment doesn't exist or belongs to another salon", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(null);
    const result = await refundPayment(SALON_ID, "pay_missing");
    expect(result).toEqual({ ok: false, status: 404, error: "Not found" });
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it("rejects a payment that isn't refundable", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ ...SUCCEEDED_PAYMENT, status: "REQUIRES_PAYMENT" });
    const result = await refundPayment(SALON_ID, "pay_1");
    expect(result.ok).toBe(false);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it("issues a full refund with refund_application_fee true", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(SUCCEEDED_PAYMENT);
    stripeMock.refunds.create.mockResolvedValueOnce({ id: "re_1" });

    const result = await refundPayment(SALON_ID, "pay_1");
    expect(result).toEqual({ ok: true });
    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 2_000, refund_application_fee: true },
      { stripeAccount: "acct_1", idempotencyKey: "refund_pay_1_0_2000" }
    );
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { refundedCents: 2_000, status: "REFUNDED" },
    });
  });

  it("issues a partial refund with refund_application_fee false and keeps SUCCEEDED→PARTIALLY_REFUNDED", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(SUCCEEDED_PAYMENT);
    stripeMock.refunds.create.mockResolvedValueOnce({ id: "re_1" });

    const result = await refundPayment(SALON_ID, "pay_1", 500);
    expect(result).toEqual({ ok: true });
    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 500, refund_application_fee: false },
      expect.any(Object)
    );
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { refundedCents: 500, status: "PARTIALLY_REFUNDED" },
    });
  });

  it("rejects a refund amount larger than what remains", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce({ ...SUCCEEDED_PAYMENT, refundedCents: 1_500 });
    const result = await refundPayment(SALON_ID, "pay_1", 1_000);
    expect(result).toEqual({ ok: false, status: 400, error: "Invalid refund amount." });
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it("returns a 502 and does not update the local row when Stripe rejects the refund", async () => {
    prismaMock.payment.findUnique.mockResolvedValueOnce(SUCCEEDED_PAYMENT);
    stripeMock.refunds.create.mockRejectedValueOnce(new Error("stripe down"));
    const result = await refundPayment(SALON_ID, "pay_1");
    expect(result.ok).toBe(false);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});

describe("expireHold", () => {
  it("cancels the appointment, cancels the PI, and marks the payment CANCELLED", async () => {
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      id: "pay_1",
      stripePaymentIntentId: "pi_1",
      stripeAccountId: "acct_1",
    });
    stripeMock.paymentIntents.cancel.mockResolvedValueOnce({});

    await expireHold("appt_1");

    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: "appt_1", status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", holdExpiresAt: null },
    });
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith("pi_1", undefined, {
      stripeAccount: "acct_1",
    });
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { status: "CANCELLED" },
    });
  });

  it("is a no-op when the appointment already left PENDING_PAYMENT", async () => {
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 0 });
    await expireHold("appt_1");
    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
  });

  it("still marks the payment CANCELLED even if the Stripe cancel call fails", async () => {
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      id: "pay_1",
      stripePaymentIntentId: "pi_1",
      stripeAccountId: "acct_1",
    });
    stripeMock.paymentIntents.cancel.mockRejectedValueOnce(new Error("already canceled"));

    await expireHold("appt_1");

    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { status: "CANCELLED" },
    });
  });
});
