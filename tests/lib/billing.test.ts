/**
 * Covers the billing dashboard's revenue queries (docs/STRIPE_SPEC.md §9):
 * gross/net math, only counting reconciled (SUCCEEDED-family) payments, and
 * per-service grouping.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  payment: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  getBillingSummary,
  getRevenueByService,
  listPayments,
  resolveBillingRange,
} from "@/lib/domain/billing";

const SALON_ID = "salon_1";
const RANGE = resolveBillingRange("30d");

beforeEach(() => {
  prismaMock.payment.findMany.mockReset();
});

describe("resolveBillingRange", () => {
  it("returns a from/to window for every range key", () => {
    for (const key of ["today", "7d", "30d", "month", "all"] as const) {
      const r = resolveBillingRange(key);
      expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime());
    }
  });
});

describe("getBillingSummary", () => {
  it("sums gross, refunded, and platform fee, and computes net = gross - refunded - fee", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([
      { amountCents: 10_000, refundedCents: 0, applicationFeeCents: 1_000 },
      { amountCents: 5_000, refundedCents: 2_000, applicationFeeCents: 500 },
    ]);

    const summary = await getBillingSummary(SALON_ID, RANGE);
    expect(summary).toEqual({
      grossCents: 15_000,
      refundedCents: 2_000,
      platformFeeCents: 1_500,
      netCents: 15_000 - 2_000 - 1_500,
      paymentCount: 2,
    });
  });

  it("only queries reconciled statuses, scoped to the salon and range", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([]);
    await getBillingSummary(SALON_ID, RANGE);
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          salonId: SALON_ID,
          createdAt: { gte: RANGE.from, lte: RANGE.to },
          status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        },
      })
    );
  });

  it("returns all zeros when there are no payments in range", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([]);
    const summary = await getBillingSummary(SALON_ID, RANGE);
    expect(summary).toEqual({
      grossCents: 0,
      refundedCents: 0,
      platformFeeCents: 0,
      netCents: 0,
      paymentCount: 0,
    });
  });
});

describe("getRevenueByService", () => {
  it("groups gross revenue and count by service name, sorted descending", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([
      { amountCents: 1_000, appointment: { service: { name: "Manicure" } } },
      { amountCents: 5_000, appointment: { service: { name: "Pedicure" } } },
      { amountCents: 2_000, appointment: { service: { name: "Manicure" } } },
    ]);

    const result = await getRevenueByService(SALON_ID, RANGE);
    expect(result).toEqual([
      { serviceName: "Pedicure", grossCents: 5_000, count: 1 },
      { serviceName: "Manicure", grossCents: 3_000, count: 2 },
    ]);
  });
});

describe("listPayments", () => {
  it("maps payments to flat rows with client/service names", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([
      {
        id: "pay_1",
        amountCents: 2_000,
        refundedCents: 0,
        currency: "usd",
        status: "SUCCEEDED",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        stripePaymentIntentId: "pi_1",
        appointment: { client: { name: "Pat Smith" }, service: { name: "Manicure" } },
      },
    ]);

    const rows = await listPayments(SALON_ID, RANGE);
    expect(rows).toEqual([
      {
        id: "pay_1",
        clientName: "Pat Smith",
        serviceName: "Manicure",
        amountCents: 2_000,
        refundedCents: 0,
        currency: "usd",
        status: "SUCCEEDED",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        stripePaymentIntentId: "pi_1",
      },
    ]);
  });

  it("caps the query at 50 rows, newest first", async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([]);
    await listPayments(SALON_ID, RANGE);
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 50 })
    );
  });
});
