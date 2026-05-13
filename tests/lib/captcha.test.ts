/**
 * `verifyTurnstileToken` covers:
 *   - skipped when TURNSTILE_SECRET_KEY is unset (dev / test)
 *   - rejects missing / non-string tokens
 *   - posts secret + response + remoteip to siteverify
 *   - dedupe cache: a second call with the same just-validated token is a free pass
 *   - friendly error mapping for known Cloudflare error codes
 *   - fail-closed when siteverify is unreachable / 5xx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/reportError", () => ({
  reportError: vi.fn(),
}));

import {
  _resetCaptchaDedupeForTests,
  verifyTurnstileToken,
} from "@/lib/integrations/captcha";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  _resetCaptchaDedupeForTests();
  delete process.env.TURNSTILE_SECRET_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe("verifyTurnstileToken — disabled (no secret)", () => {
  it("returns ok+skipped without calling fetch when the secret is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken("anything", "1.2.3.4");
    expect(out).toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstileToken — enabled", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
  });

  it("rejects a missing token without hitting Cloudflare", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken(undefined, "1.2.3.4");
    expect(out).toEqual({ ok: false, error: "Missing captcha token." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts secret + response + remoteip and accepts a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await verifyTurnstileToken("token-1", "203.0.113.7");
    expect(out).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("token-1");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("dedupes a second call with the same just-validated token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyTurnstileToken("token-x", "1.1.1.1")).toEqual({ ok: true });
    expect(await verifyTurnstileToken("token-x", "1.1.1.1")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps timeout-or-duplicate to a user-friendly message", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken("expired", "1.1.1.1");
    expect(out).toEqual({
      ok: false,
      error: "Captcha expired or was already used. Please try again.",
    });
  });

  it("falls back to a generic message for unknown error codes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: false, "error-codes": ["bad-request"] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken("bad", "1.1.1.1");
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toMatch(/Captcha verification failed/);
  });

  it("fails closed when siteverify returns a 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken("tok", "1.1.1.1");
    expect(out).toEqual({ ok: false, error: "Captcha service unavailable." });
  });

  it("fails closed when the network throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyTurnstileToken("tok", "1.1.1.1");
    expect(out).toEqual({ ok: false, error: "Captcha service unavailable." });
  });
});
