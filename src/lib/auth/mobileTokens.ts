/**
 * Tiny HMAC-signed token format for the mobile admin app.
 *
 * Access tokens are stateless: `base64url(payloadJSON).base64url(sig)` where
 * `sig = HMAC-SHA256(secret, payloadBase64Url)`. They are short-lived (15 min)
 * and verified without a DB hit.
 *
 * Refresh tokens are opaque random strings whose SHA-256 hash is stored on
 * `MobileSession`. They are long-lived (30 days) and rotated on every use.
 *
 * The signing secret comes from `MOBILE_TOKEN_SECRET` (or, as a dev fallback,
 * `NEXTAUTH_SECRET` / `AUTH_SECRET`).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type MobileAccessPayload = {
  /** User id (cuid). */
  sub: string;
  /** Mobile session id (cuid) — for audit / revocation. */
  sid: string;
  /** Role at issue time. */
  role: "ADMIN" | "CLIENT";
  /** The salon this admin manages. Required for ADMIN tokens (Phase 4+). */
  salonId: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expires-at, seconds since epoch. */
  exp: number;
};

function getSecret(): string {
  const s =
    process.env.MOBILE_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error(
      "MOBILE_TOKEN_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) must be set."
    );
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Sign a stateless mobile access token. */
export function signAccessToken(input: {
  userId: string;
  sessionId: string;
  role: "ADMIN" | "CLIENT";
  salonId: string;
  /** Override TTL (seconds). Defaults to 15 minutes. */
  ttlSeconds?: number;
}): { token: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS);
  const payload: MobileAccessPayload = {
    sub: input.userId,
    sid: input.sessionId,
    role: input.role,
    salonId: input.salonId,
    iat: now,
    exp,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  const token = `${payloadB64}.${b64url(sig)}`;
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify an access token. Returns the payload on success, or `null` if the
 * signature is invalid, the format is wrong, or the token has expired.
 */
export function verifyAccessToken(token: string): MobileAccessPayload | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const expected = createHmac("sha256", getSecret()).update(payloadB64).digest();
  let actual: Buffer;
  try {
    actual = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  if (!timingSafeEqual(actual, expected)) return null;

  let payload: MobileAccessPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as MobileAccessPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== "string" ||
    typeof payload?.sid !== "string" ||
    typeof payload?.salonId !== "string" ||
    typeof payload?.exp !== "number" ||
    typeof payload?.iat !== "number"
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Generate a fresh opaque refresh token (32 bytes, base64url). */
export function generateRefreshToken(): string {
  return b64url(randomBytes(32));
}

/** SHA-256 hash of a refresh token, hex-encoded. Used as the DB lookup key. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Convenience: compute the refresh token's expiry from "now". */
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}
