/**
 * Covers GET /api/cron/expire-holds (docs/STRIPE_SPEC.md §6). Mirrors
 * cronReminders.test.ts's auth conventions; `expireHold` itself is
 * unit-tested in payments.test.ts, so this only checks the route's
 * find-then-dispatch-then-count wiring and per-row failure isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
}));
const expireHoldMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/payments", () => ({ expireHold: expireHoldMock }));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import { GET } from "@/app/api/cron/expire-holds/route";

function call(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return GET(new Request("http://localhost/api/cron/expire-holds", { headers }));
}

beforeEach(() => {
  prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);
  expireHoldMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset();
  process.env.CRON_SECRET = "secret-x";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/expire-holds — auth", () => {
  it("401s when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await call("Bearer anything");
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
  });

  it("401s when the bearer token does not match", async () => {
    const res = await call("Bearer wrong");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/expire-holds — happy path", () => {
  it("returns checked=0 released=0 when nothing is expired", async () => {
    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 0, released: 0 });
  });

  it("queries PENDING_PAYMENT appointments past their holdExpiresAt", async () => {
    await call("Bearer secret-x");
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: expect.any(Date) } },
      select: { id: true },
    });
  });

  it("releases every expired hold and reports the count", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 2, released: 2 });
    expect(expireHoldMock).toHaveBeenCalledWith("a");
    expect(expireHoldMock).toHaveBeenCalledWith("b");
  });

  it("reports a per-row failure but still releases the others", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([{ id: "ok" }, { id: "fails" }]);
    const boom = new Error("db hiccup");
    expireHoldMock.mockImplementation(async (id: string) => {
      if (id === "fails") throw boom;
    });

    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 2, released: 1 });
    expect(reportErrorMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ where: "cron.expireHolds", appointmentId: "fails" })
    );
  });
});
