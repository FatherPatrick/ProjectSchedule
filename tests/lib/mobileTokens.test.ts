import { describe, expect, it, beforeAll } from "vitest";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "@/lib/auth/mobileTokens";

beforeAll(() => {
  process.env.MOBILE_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
});

describe("mobile access tokens", () => {
  it("round-trips a valid token", () => {
    const { token, expiresAt } = signAccessToken({
      userId: "u1",
      sessionId: "s1",
      role: "ADMIN",
    });
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("u1");
    expect(payload!.sid).toBe("s1");
    expect(payload!.role).toBe("ADMIN");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000
    );
  });

  it("rejects a token with a tampered payload", () => {
    const { token } = signAccessToken({
      userId: "u1",
      sessionId: "s1",
      role: "ADMIN",
    });
    const [, sig] = token.split(".");
    // Re-encode a payload claiming a different user, keep the original sig.
    const tampered =
      Buffer.from(JSON.stringify({ sub: "u2", sid: "s1", role: "ADMIN", iat: 1, exp: 9_999_999_999 }))
        .toString("base64url") +
      "." +
      sig;
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token } = signAccessToken({
      userId: "u1",
      sessionId: "s1",
      role: "ADMIN",
      ttlSeconds: -10,
    });
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyAccessToken("")).toBeNull();
    expect(verifyAccessToken("nope")).toBeNull();
    expect(verifyAccessToken("a.b.c")).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("hashes deterministically", () => {
    const t = generateRefreshToken();
    expect(hashRefreshToken(t)).toBe(hashRefreshToken(t));
    expect(hashRefreshToken(t)).not.toBe(t);
  });

  it("generates distinct tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
  });
});
