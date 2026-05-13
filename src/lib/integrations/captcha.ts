/**
 * Cloudflare Turnstile token verification.
 *
 * The booking form (and any other unauthenticated POST that wants extra
 * abuse protection) sends the Turnstile widget's token in the request
 * body as `captchaToken`. The server hands that off to Cloudflare's
 * siteverify endpoint along with the caller's IP, and only proceeds if
 * Cloudflare confirms the token is valid.
 *
 * Configuration:
 *   - `TURNSTILE_SECRET_KEY` (server)  — required to enforce. When unset
 *     (typical in dev), `verifyTurnstileToken` returns `{ ok: true,
 *     skipped: true }` so the booking flow keeps working without
 *     Cloudflare credentials.
 *   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client) — required to render the
 *     widget. The booking form treats its absence the same way: render
 *     nothing and skip the body field. The two keys are paired — if you
 *     set one without the other, requests will start failing.
 *
 * No SDK / extra deps: just a fetch to the documented endpoint, exactly
 * like the rest of our integrations layer.
 *
 * The exported {@link verifyTurnstileToken} keeps a small in-memory dedupe
 * cache of recently-validated tokens so a quick double-submit (network
 * retry, double-click) doesn't hit Cloudflare twice. Cloudflare considers
 * tokens single-use, so seeing the same token twice in the dedupe window
 * counts as a *successful* re-presentation.
 */
import { reportError } from "../observability/reportError";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Tokens are valid for ~5 min from issue; cache for 2 min on success. */
const DEDUPE_TTL_MS = 2 * 60_000;
const recentTokens = new Map<string, number>();

export type CaptchaResult =
  | { ok: true; skipped?: true }
  | { ok: false; error: string };

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
  action?: string;
}

/**
 * Verify a Turnstile widget token against Cloudflare. When
 * `TURNSTILE_SECRET_KEY` is unset, returns `{ ok: true, skipped: true }`
 * so dev / test environments keep working.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp: string | undefined
): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing captcha token." };
  }

  // Cheap dedupe: a second submission carrying the same just-validated
  // token (browser retry, double-click) gets a free pass.
  const cached = recentTokens.get(token);
  if (cached && cached > Date.now()) return { ok: true };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  let json: SiteverifyResponse | null = null;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      // Cloudflare itself is unreachable / 5xx. Fail closed: an attacker
      // could otherwise just point the request at a poisoned DNS.
      return { ok: false, error: "Captcha service unavailable." };
    }
    json = (await res.json()) as SiteverifyResponse;
  } catch (err) {
    reportError(err, { where: "captcha.siteverify" });
    return { ok: false, error: "Captcha service unavailable." };
  }

  if (!json?.success) {
    return {
      ok: false,
      error: friendlyError(json?.["error-codes"] ?? []),
    };
  }

  recentTokens.set(token, Date.now() + DEDUPE_TTL_MS);
  // Opportunistic GC: keep the map small so a long-running process
  // doesn't accumulate a slow memory leak.
  if (recentTokens.size > 1_000) sweepRecentTokens();
  return { ok: true };
}

function sweepRecentTokens(): void {
  const now = Date.now();
  for (const [tok, expiresAt] of recentTokens) {
    if (expiresAt <= now) recentTokens.delete(tok);
  }
}

function friendlyError(codes: readonly string[]): string {
  // Cloudflare-documented error codes:
  // https://developers.cloudflare.com/turnstile/get-started/server-side-validation/#error-codes
  if (codes.includes("timeout-or-duplicate")) {
    return "Captcha expired or was already used. Please try again.";
  }
  if (codes.includes("invalid-input-response")) {
    return "Captcha challenge failed. Please try again.";
  }
  return "Captcha verification failed. Please try again.";
}

/** Test-only hook: drop the dedupe cache so vitest cases stay isolated. */
export function _resetCaptchaDedupeForTests(): void {
  recentTokens.clear();
}
