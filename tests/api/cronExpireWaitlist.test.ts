/**
 * Covers GET /api/cron/expire-waitlist. Mirrors cronExpireHolds.test.ts's
 * auth conventions; `sweepWaitlist` itself is unit-tested in
 * waitlist.test.ts, so this only checks the route's auth + delegation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweepWaitlistMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain/waitlist", () => ({ sweepWaitlist: sweepWaitlistMock }));

import { GET } from "@/app/api/cron/expire-waitlist/route";

function call(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return GET(new Request("http://localhost/api/cron/expire-waitlist", { headers }));
}

beforeEach(() => {
  sweepWaitlistMock.mockReset().mockResolvedValue({
    expiredWaiting: 0,
    expiredNotified: 0,
    reNotified: 0,
  });
  process.env.CRON_SECRET = "secret-x";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/expire-waitlist — auth", () => {
  it("401s when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await call("Bearer anything");
    expect(res.status).toBe(401);
    expect(sweepWaitlistMock).not.toHaveBeenCalled();
  });

  it("401s when the bearer token does not match", async () => {
    const res = await call("Bearer wrong");
    expect(res.status).toBe(401);
    expect(sweepWaitlistMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/expire-waitlist — happy path", () => {
  it("returns the sweep result", async () => {
    sweepWaitlistMock.mockResolvedValueOnce({ expiredWaiting: 2, expiredNotified: 1, reNotified: 1 });
    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expiredWaiting: 2, expiredNotified: 1, reNotified: 1 });
  });
});
