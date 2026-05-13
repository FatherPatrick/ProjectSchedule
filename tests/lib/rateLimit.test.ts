import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimitStoreForTests,
  checkRateLimit,
  getClientIp,
  rateLimitResponseInit,
} from "@/lib/rateLimit";

beforeEach(() => {
  _resetRateLimitStoreForTests();
});

describe("checkRateLimit", () => {
  it("allows up to `limit` hits then blocks", () => {
    const opts = {
      bucket: "test",
      key: "k1",
      limit: 3,
      windowMs: 60_000,
      now: 1_000,
    };
    expect(checkRateLimit(opts).ok).toBe(true);
    expect(checkRateLimit(opts).ok).toBe(true);
    const third = checkRateLimit(opts);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = checkRateLimit(opts);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfter).toBeGreaterThan(0);
    expect(fourth.retryAfter).toBeLessThanOrEqual(60);
  });

  it("isolates buckets and keys", () => {
    expect(checkRateLimit({ bucket: "a", key: "x", limit: 1, windowMs: 1000 }).ok).toBe(true);
    expect(checkRateLimit({ bucket: "a", key: "x", limit: 1, windowMs: 1000 }).ok).toBe(false);
    // Different key, same bucket — fresh allowance.
    expect(checkRateLimit({ bucket: "a", key: "y", limit: 1, windowMs: 1000 }).ok).toBe(true);
    // Different bucket, same key — fresh allowance.
    expect(checkRateLimit({ bucket: "b", key: "x", limit: 1, windowMs: 1000 }).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    const base = { bucket: "t", key: "k", limit: 1, windowMs: 10_000 };
    expect(checkRateLimit({ ...base, now: 0 }).ok).toBe(true);
    expect(checkRateLimit({ ...base, now: 1_000 }).ok).toBe(false);
    expect(checkRateLimit({ ...base, now: 11_000 }).ok).toBe(true);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no header is present", () => {
    expect(getClientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("rateLimitResponseInit", () => {
  it("includes Retry-After and X-RateLimit-* headers", () => {
    const init = rateLimitResponseInit({
      ok: false,
      limit: 5,
      remaining: 0,
      retryAfter: 42,
    });
    expect(init.body.error).toMatch(/too many/i);
    expect(init.body.retryAfter).toBe(42);
    expect(init.headers["Retry-After"]).toBe("42");
    expect(init.headers["X-RateLimit-Limit"]).toBe("5");
    expect(init.headers["X-RateLimit-Remaining"]).toBe("0");
  });
});
