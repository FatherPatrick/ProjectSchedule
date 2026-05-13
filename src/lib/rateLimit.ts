/**
 * Lightweight in-memory fixed-window rate limiter.
 *
 * This raises the bar against trivial abuse (a `for` loop hammering an
 * unauthenticated endpoint) without taking on a Redis dependency. It is
 * intentionally simple:
 *
 *   - Fixed window keyed by `${bucket}:${key}` (the calling code chooses
 *     bucket / key — typically `ip` and/or `phone`).
 *   - Counts live in a process-local `Map`. On Vercel / serverless, each
 *     warm instance has its own Map, so the effective limit is
 *     `instanceCount * limit`. That is fine as a first-pass: it still
 *     bounds Twilio spend by a small constant factor and forces an
 *     attacker to maintain a much higher request rate to be effective.
 *   - When we need exact, cross-instance limits (going public, abuse seen
 *     in logs, etc.), swap the `MemoryStore` for an Upstash Redis-backed
 *     store. The `RateLimitStore` interface is the only seam needed.
 *
 * Not a replacement for a captcha on truly hot paths (e.g. the booking
 * endpoint), but a useful defense in depth.
 */

export type RateLimitResult = {
  /** True when the request is under the limit and may proceed. */
  ok: boolean;
  /** Requests remaining in the current window after this one. */
  remaining: number;
  /** Seconds until the current window resets. Always >= 0. */
  retryAfter: number;
  /** Total limit for the window (echoed for debug / headers). */
  limit: number;
};

export type RateLimitStore = {
  /**
   * Atomically increment the counter for `key` (creating it if needed) and
   * return the new count plus the absolute reset time in ms since epoch.
   */
  hit(key: string, windowMs: number, now: number): {
    count: number;
    resetAt: number;
  };
  /** Test-only hook to clear all counters. */
  reset(): void;
};

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, windowMs: number, now: number) {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      // Opportunistic GC: every ~1k inserts, drop expired entries so we
      // don't grow without bound on a long-lived process.
      if (this.buckets.size > 1024) this.gc(now);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  reset() {
    this.buckets.clear();
  }

  private gc(now: number) {
    for (const [k, v] of this.buckets) {
      if (v.resetAt <= now) this.buckets.delete(k);
    }
  }
}

const defaultStore: RateLimitStore = new MemoryStore();

export function _resetRateLimitStoreForTests(): void {
  defaultStore.reset();
}

export type RateLimitOptions = {
  /** Logical bucket name, e.g. `"otp:request:ip"`. */
  bucket: string;
  /** Caller-supplied identifier (IP address, normalized phone, user id). */
  key: string;
  /** Max hits allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Override for tests / future Redis store. */
  store?: RateLimitStore;
  /** Override for tests. Defaults to `Date.now()`. */
  now?: number;
};

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const store = opts.store ?? defaultStore;
  const now = opts.now ?? Date.now();
  const composite = `${opts.bucket}:${opts.key}`;
  const { count, resetAt } = store.hit(composite, opts.windowMs, now);
  const retryAfter = Math.max(0, Math.ceil((resetAt - now) / 1000));
  return {
    ok: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfter,
    limit: opts.limit,
  };
}

/**
 * Best-effort caller IP extraction. Trusts the leftmost entry of
 * `x-forwarded-for` (Vercel sets this), falling back to other common
 * proxy headers, then to a literal `"unknown"` so we still rate-limit a
 * shared bucket rather than skipping enforcement entirely.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Build a JSON 429 response body + headers for a blocked request. The
 * caller wraps this in `NextResponse.json(..., { status: 429, headers })`.
 */
export function rateLimitResponseInit(result: RateLimitResult): {
  body: { error: string; retryAfter: number };
  headers: Record<string, string>;
} {
  return {
    body: {
      error: "Too many requests. Please try again shortly.",
      retryAfter: result.retryAfter,
    },
    headers: {
      "Retry-After": String(result.retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
    },
  };
}
