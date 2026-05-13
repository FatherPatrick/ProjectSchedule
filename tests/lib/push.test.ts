/**
 * Covers the dead-token reaping introduced for Expo push:
 *   1. Tickets returning `details.error: "DeviceNotRegistered"` must
 *      null `MobileSession.pushToken` for the affected token.
 *   2. Healthy tickets must NOT trigger a reap.
 *   3. The receipt-flow helper (`reapPushReceipts`) reaps tokens whose
 *      receipts come back with the same error code.
 *   4. `reapDeadTokens` is idempotent / no-op for empty input.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  mobileSession: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  notificationLog: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/observability/reportError", () => ({
  reportError: vi.fn(),
}));

import {
  pushToAdmins,
  reapDeadTokens,
  reapPushReceipts,
} from "@/lib/integrations/push";

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(body: unknown, ok = true): FetchMock {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  prismaMock.mobileSession.findMany.mockReset();
  prismaMock.mobileSession.updateMany.mockReset().mockResolvedValue({ count: 0 });
  prismaMock.notificationLog.create.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Wait for the fire-and-forget `pushToAdmins` chain to settle. */
async function flushAsync(): Promise<void> {
  // Two microtask flushes cover: (1) sendPushInternal awaits, (2) any
  // chained .then in the .catch wrapper.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("pushToAdmins ticket-level reaping", () => {
  it("nulls pushToken for a token Expo reported as DeviceNotRegistered", async () => {
    prismaMock.mobileSession.findMany.mockResolvedValue([
      { id: "s1", pushToken: "ExponentPushToken[dead]" },
      { id: "s2", pushToken: "ExponentPushToken[live]" },
    ]);
    prismaMock.mobileSession.updateMany.mockResolvedValue({ count: 1 });
    mockFetchOnce({
      data: [
        {
          status: "error",
          message: "...",
          details: { error: "DeviceNotRegistered" },
        },
        { status: "ok", id: "ticket-2" },
      ],
    });

    pushToAdmins({ title: "t", body: "b" });
    await flushAsync();

    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { pushToken: { in: ["ExponentPushToken[dead]"] } },
      data: { pushToken: null },
    });
  });

  it("does NOT reap when every ticket succeeds", async () => {
    prismaMock.mobileSession.findMany.mockResolvedValue([
      { id: "s1", pushToken: "ExponentPushToken[a]" },
    ]);
    mockFetchOnce({ data: [{ status: "ok", id: "ticket-1" }] });

    pushToAdmins({ title: "t", body: "b" });
    await flushAsync();

    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });

  it("does NOT reap on non-DeviceNotRegistered errors (e.g. MessageRateExceeded)", async () => {
    prismaMock.mobileSession.findMany.mockResolvedValue([
      { id: "s1", pushToken: "ExponentPushToken[rated]" },
    ]);
    mockFetchOnce({
      data: [
        {
          status: "error",
          message: "Too many",
          details: { error: "MessageRateExceeded" },
        },
      ],
    });

    pushToAdmins({ title: "t", body: "b" });
    await flushAsync();

    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });
});

describe("reapPushReceipts", () => {
  it("reaps tokens whose receipts come back DeviceNotRegistered", async () => {
    prismaMock.mobileSession.updateMany.mockResolvedValue({ count: 1 });
    mockFetchOnce({
      data: {
        "ticket-dead": {
          status: "error",
          message: "...",
          details: { error: "DeviceNotRegistered" },
        },
        "ticket-ok": { status: "ok" },
      },
    });

    const result = await reapPushReceipts([
      { ticketId: "ticket-dead", pushToken: "ExponentPushToken[dead]" },
      { ticketId: "ticket-ok", pushToken: "ExponentPushToken[live]" },
    ]);

    expect(result.checked).toBe(2);
    expect(result.reaped).toBe(1);
    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { pushToken: { in: ["ExponentPushToken[dead]"] } },
      data: { pushToken: null },
    });
  });

  it("is a no-op for empty input", async () => {
    const result = await reapPushReceipts([]);
    expect(result).toEqual({ checked: 0, reaped: 0 });
    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });
});

describe("reapDeadTokens", () => {
  it("deduplicates tokens before issuing the updateMany", async () => {
    prismaMock.mobileSession.updateMany.mockResolvedValue({ count: 2 });
    const reaped = await reapDeadTokens(["a", "b", "a", ""]);
    expect(reaped).toBe(2);
    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { pushToken: { in: ["a", "b"] } },
      data: { pushToken: null },
    });
  });

  it("returns 0 without hitting prisma when given no tokens", async () => {
    expect(await reapDeadTokens([])).toBe(0);
    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });
});
