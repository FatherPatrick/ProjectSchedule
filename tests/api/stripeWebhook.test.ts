/**
 * Covers POST /api/stripe/webhook (docs/STRIPE_SPEC.md §5): signature
 * verification, per-event-id idempotency, and dispatch to the
 * account/payment handlers. The handlers' own business logic is unit-tested
 * separately in paymentWebhooks.test.ts and stripeConnect.test.ts — this
 * file only covers the route's wiring (gating, verification, dedupe,
 * dispatch, error handling).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn());
const constructEventMock = vi.hoisted(() => vi.fn());
const getStripeClientMock = vi.hoisted(() =>
  vi.fn(() => ({ webhooks: { constructEvent: constructEventMock } }))
);
const syncAccountFromWebhookMock = vi.hoisted(() => vi.fn());
const handlePaymentIntentSucceededMock = vi.hoisted(() => vi.fn());
const handlePaymentIntentFailedMock = vi.hoisted(() => vi.fn());
const handleChargeRefundedMock = vi.hoisted(() => vi.fn());
const handleChargeDisputeCreatedMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  processedStripeEvent: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/flags", () => ({ isStripePaymentsEnabled: isStripePaymentsEnabledMock }));
vi.mock("@/lib/integrations/stripe", () => ({ getStripeClient: getStripeClientMock }));
vi.mock("@/lib/domain/stripeConnect", () => ({
  syncAccountFromWebhook: syncAccountFromWebhookMock,
}));
vi.mock("@/lib/domain/paymentWebhooks", () => ({
  handlePaymentIntentSucceeded: handlePaymentIntentSucceededMock,
  handlePaymentIntentFailed: handlePaymentIntentFailedMock,
  handleChargeRefunded: handleChargeRefundedMock,
  handleChargeDisputeCreated: handleChargeDisputeCreatedMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import { POST } from "@/app/api/stripe/webhook/route";

function call(body: string, signature?: string) {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers,
      body,
    })
  );
}

beforeEach(() => {
  isStripePaymentsEnabledMock.mockReset().mockReturnValue(true);
  constructEventMock.mockReset();
  syncAccountFromWebhookMock.mockReset().mockResolvedValue(undefined);
  handlePaymentIntentSucceededMock.mockReset().mockResolvedValue(undefined);
  handlePaymentIntentFailedMock.mockReset().mockResolvedValue(undefined);
  handleChargeRefundedMock.mockReset().mockResolvedValue(undefined);
  handleChargeDisputeCreatedMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset();
  getStripeClientMock.mockClear();
  prismaMock.processedStripeEvent.findUnique.mockReset().mockResolvedValue(null);
  prismaMock.processedStripeEvent.create.mockReset().mockResolvedValue({});
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/stripe/webhook — gating", () => {
  it("404s when the platform flag is off, without reading the signature", async () => {
    isStripePaymentsEnabledMock.mockReturnValue(false);
    const res = await call("{}", "sig");
    expect(res.status).toBe(404);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("400s when STRIPE_WEBHOOK_SECRET is unset", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await call("{}", "sig");
    expect(res.status).toBe(400);
  });

  it("400s when the stripe-signature header is missing", async () => {
    const res = await call("{}");
    expect(res.status).toBe(400);
    expect(constructEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — signature verification", () => {
  it("400s and reports the error when signature verification fails", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const res = await call("{}", "bad-sig");
    expect(res.status).toBe(400);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ where: "stripe.webhook.verify" })
    );
    expect(syncAccountFromWebhookMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — idempotency", () => {
  it("skips processing and returns 200 when the event id was already recorded", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dup",
      type: "account.updated",
      data: { object: { id: "acct_1" } },
    });
    prismaMock.processedStripeEvent.findUnique.mockResolvedValueOnce({ id: "evt_dup" });

    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deduped: true });
    expect(syncAccountFromWebhookMock).not.toHaveBeenCalled();
  });

  it("records the event id after successful processing", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });

    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(prismaMock.processedStripeEvent.create).toHaveBeenCalledWith({
      data: { id: "evt_1", type: "account.updated" },
    });
  });

  it("does not fail the request if recording the dedupe row races (P2002)", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_race",
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });
    const { Prisma } = await import("@prisma/client");
    prismaMock.processedStripeEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
    );

    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});

describe("POST /api/stripe/webhook — account.updated", () => {
  it("syncs the account status and returns 200", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "account.updated",
      data: {
        object: {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        },
      },
    });

    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(syncAccountFromWebhookMock).toHaveBeenCalledWith("acct_1", {
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });

  it("500s, reports the error, and does not record the event as processed when the handler fails", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_2",
      type: "account.updated",
      data: {
        object: { id: "acct_1", charges_enabled: true, payouts_enabled: true, details_submitted: true },
      },
    });
    const dbErr = new Error("connection lost");
    syncAccountFromWebhookMock.mockRejectedValueOnce(dbErr);

    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(500);
    expect(reportErrorMock).toHaveBeenCalledWith(
      dbErr,
      expect.objectContaining({ where: "stripe.webhook.handle", eventType: "account.updated", eventId: "evt_2" })
    );
    expect(prismaMock.processedStripeEvent.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — payment events", () => {
  it("dispatches payment_intent.succeeded to its handler", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_pi_succeeded",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1" } },
    });
    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(handlePaymentIntentSucceededMock).toHaveBeenCalledWith({ id: "pi_1" });
  });

  it("dispatches payment_intent.payment_failed to its handler", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_pi_failed",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_2" } },
    });
    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(handlePaymentIntentFailedMock).toHaveBeenCalledWith({ id: "pi_2" });
  });

  it("dispatches charge.refunded to its handler", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_refund",
      type: "charge.refunded",
      data: { object: { id: "ch_1" } },
    });
    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(handleChargeRefundedMock).toHaveBeenCalledWith({ id: "ch_1" });
  });

  it("dispatches charge.dispute.created to its handler", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_dispute",
      type: "charge.dispute.created",
      data: { object: { id: "dp_1" } },
    });
    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(handleChargeDisputeCreatedMock).toHaveBeenCalledWith({ id: "dp_1" });
  });
});

describe("POST /api/stripe/webhook — other event types", () => {
  it("acknowledges unhandled event types without dispatching anywhere", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_unhandled",
      type: "customer.created",
      data: { object: { id: "cus_1" } },
    });
    const res = await call("{}", "valid-sig");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(syncAccountFromWebhookMock).not.toHaveBeenCalled();
    expect(handlePaymentIntentSucceededMock).not.toHaveBeenCalled();
  });
});
