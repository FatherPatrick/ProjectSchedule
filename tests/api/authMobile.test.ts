/**
 * Integration tests for the four mobile auth endpoints. We mock the
 * Twilio Verify, prisma, admin-phone allow-list, and the mobileTokens
 * helpers (which have their own unit tests). The point is to lock
 * down the route-level wiring: rate limiting, status codes, the
 * "always 200" privacy contract on logout/non-admin OTP requests, and
 * the rotating-refresh path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  mobileSession: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const sendOtpMock = vi.hoisted(() => vi.fn());
const checkOtpMock = vi.hoisted(() => vi.fn());
const isAdminPhoneMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const signAccessTokenMock = vi.hoisted(() => vi.fn());
const generateRefreshTokenMock = vi.hoisted(() => vi.fn());
const hashRefreshTokenMock = vi.hoisted(() => vi.fn());
const refreshTokenExpiryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/verify", () => ({
  sendOtp: sendOtpMock,
  checkOtp: checkOtpMock,
}));
vi.mock("@/lib/auth/admin", () => ({
  isAdminPhone: isAdminPhoneMock,
}));
vi.mock("@/lib/observability/reportError", () => ({
  reportError: reportErrorMock,
}));
vi.mock("@/lib/auth/mobileTokens", () => ({
  ACCESS_TOKEN_TTL_SECONDS: 900,
  signAccessToken: signAccessTokenMock,
  generateRefreshToken: generateRefreshTokenMock,
  hashRefreshToken: hashRefreshTokenMock,
  refreshTokenExpiry: refreshTokenExpiryMock,
}));

import { POST as requestRoute } from "@/app/api/auth/mobile/otp/request/route";
import { POST as verifyRoute } from "@/app/api/auth/mobile/otp/verify/route";
import { POST as refreshRoute } from "@/app/api/auth/mobile/refresh/route";
import { POST as logoutRoute } from "@/app/api/auth/mobile/logout/route";
import { _resetRateLimitStoreForTests } from "@/lib/rateLimit";

function postJson(
  path: string,
  body: unknown,
  ip = "203.0.113.1"
): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetRateLimitStoreForTests();
  vi.clearAllMocks();
  isAdminPhoneMock.mockReturnValue(true);
  hashRefreshTokenMock.mockImplementation((t: string) => `hash(${t})`);
  generateRefreshTokenMock.mockReturnValue("new-refresh-token-1234567890");
  refreshTokenExpiryMock.mockReturnValue(new Date("2026-12-01T00:00:00Z"));
  signAccessTokenMock.mockReturnValue({
    token: "access-jwt",
    expiresAt: new Date("2026-05-13T13:00:00Z"),
  });
});

afterEach(() => {
  _resetRateLimitStoreForTests();
});

/* -------------------------------------------------------------------------- */
/*                          POST /api/auth/mobile/otp/request                 */
/* -------------------------------------------------------------------------- */

describe("POST /api/auth/mobile/otp/request", () => {
  it("400s on malformed JSON", async () => {
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", "{not json")
    );
    expect(res.status).toBe(400);
    expect(sendOtpMock).not.toHaveBeenCalled();
  });

  it("400s on invalid input", async () => {
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "123" })
    );
    expect(res.status).toBe(400);
  });

  it("400s on a phone that cannot be normalised to E.164", async () => {
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "not-a-phone-at-all" })
    );
    expect(res.status).toBe(400);
  });

  it("returns ok:true and sends the OTP for an admin phone", async () => {
    sendOtpMock.mockResolvedValueOnce(undefined);
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "+15555550123" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendOtpMock).toHaveBeenCalledWith("+15555550123");
  });

  it("returns ok:true (and does NOT call Twilio) for a non-admin phone — privacy", async () => {
    isAdminPhoneMock.mockReturnValue(false);
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "+15555550999" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendOtpMock).not.toHaveBeenCalled();
  });

  it("500s with a friendly error and reports when Twilio fails", async () => {
    const boom = new Error("twilio down");
    sendOtpMock.mockRejectedValueOnce(boom);
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "+15555550123" })
    );
    expect(res.status).toBe(500);
    expect(reportErrorMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ where: "mobile-otp.request.send" })
    );
  });

  it("rate-limits a single IP after 5 successful requests in the window", async () => {
    sendOtpMock.mockResolvedValue(undefined);
    // Rotate phone per call to dodge the per-phone limit (3) before
    // tripping the per-IP limit (5).
    for (let i = 0; i < 5; i++) {
      const res = await requestRoute(
        postJson("/api/auth/mobile/otp/request", {
          phone: `+1555555010${i}`,
        })
      );
      expect(res.status).toBe(200);
    }
    const res = await requestRoute(
      postJson("/api/auth/mobile/otp/request", { phone: "+15555550199" })
    );
    expect(res.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/*                          POST /api/auth/mobile/otp/verify                  */
/* -------------------------------------------------------------------------- */

describe("POST /api/auth/mobile/otp/verify", () => {
  it("401s on a non-admin phone (same generic error as wrong code)", async () => {
    isAdminPhoneMock.mockReturnValue(false);
    const res = await verifyRoute(
      postJson("/api/auth/mobile/otp/verify", {
        phone: "+15555550999",
        code: "000000",
      })
    );
    expect(res.status).toBe(401);
    expect(checkOtpMock).not.toHaveBeenCalled();
  });

  it("401s when Twilio rejects the code", async () => {
    checkOtpMock.mockResolvedValueOnce(false);
    const res = await verifyRoute(
      postJson("/api/auth/mobile/otp/verify", {
        phone: "+15555550123",
        code: "000000",
      })
    );
    expect(res.status).toBe(401);
    expect(prismaMock.mobileSession.create).not.toHaveBeenCalled();
  });

  it("issues an access + refresh pair on a valid code (existing user)", async () => {
    checkOtpMock.mockResolvedValueOnce(true);
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user_1",
      phone: "+15555550123",
      role: "ADMIN",
    });
    prismaMock.user.update.mockResolvedValueOnce({
      id: "user_1",
      role: "ADMIN",
    });
    prismaMock.mobileSession.create.mockResolvedValueOnce({
      id: "sess_1",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    prismaMock.mobileSession.findMany.mockResolvedValueOnce([
      { id: "sess_1" },
    ]);

    const res = await verifyRoute(
      postJson("/api/auth/mobile/otp/verify", {
        phone: "+15555550123",
        code: "654321",
        deviceLabel: "Pixel 9",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-jwt");
    expect(body.refreshToken).toBe("new-refresh-token-1234567890");
    expect(body.user).toEqual({ id: "user_1", role: "ADMIN" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.mobileSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          refreshHash: "hash(new-refresh-token-1234567890)",
          deviceLabel: "Pixel 9",
        }),
      })
    );
  });

  it("creates the user when no row exists for the phone", async () => {
    checkOtpMock.mockResolvedValueOnce(true);
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user_new",
      phone: "+15555550123",
      role: "ADMIN",
    });
    prismaMock.mobileSession.create.mockResolvedValueOnce({
      id: "sess_n",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    prismaMock.mobileSession.findMany.mockResolvedValueOnce([{ id: "sess_n" }]);

    const res = await verifyRoute(
      postJson("/api/auth/mobile/otp/verify", {
        phone: "+15555550123",
        code: "654321",
      })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: "+15555550123",
        role: "ADMIN",
      }),
    });
  });

  it("revokes oldest sessions when the per-user cap is exceeded", async () => {
    checkOtpMock.mockResolvedValueOnce(true);
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user_1",
      role: "ADMIN",
    });
    prismaMock.user.update.mockResolvedValueOnce({ id: "user_1", role: "ADMIN" });
    prismaMock.mobileSession.create.mockResolvedValueOnce({
      id: "sess_new",
      expiresAt: new Date(),
    });
    // 11 live sessions including the just-created one — oldest one (last)
    // must be revoked.
    prismaMock.mobileSession.findMany.mockResolvedValueOnce(
      Array.from({ length: 11 }, (_, i) => ({ id: `sess_${i}` }))
    );

    await verifyRoute(
      postJson("/api/auth/mobile/otp/verify", {
        phone: "+15555550123",
        code: "654321",
      })
    );

    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sess_10"] } },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                            POST /api/auth/mobile/refresh                   */
/* -------------------------------------------------------------------------- */

describe("POST /api/auth/mobile/refresh", () => {
  const validBody = { refreshToken: "x".repeat(40) };

  it("400s on malformed JSON", async () => {
    const res = await refreshRoute(
      postJson("/api/auth/mobile/refresh", "{nope")
    );
    expect(res.status).toBe(400);
  });

  it("400s on a refresh token shorter than the schema minimum", async () => {
    const res = await refreshRoute(
      postJson("/api/auth/mobile/refresh", { refreshToken: "short" })
    );
    expect(res.status).toBe(400);
  });

  it("401s when no session matches the presented hash", async () => {
    prismaMock.mobileSession.findUnique.mockResolvedValueOnce(null);
    const res = await refreshRoute(postJson("/api/auth/mobile/refresh", validBody));
    expect(res.status).toBe(401);
  });

  it("401s when the matching session is already revoked (token reuse)", async () => {
    prismaMock.mobileSession.findUnique.mockResolvedValueOnce({
      id: "s",
      userId: "u",
      revokedAt: new Date("2026-05-12T00:00:00Z"),
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      user: { role: "ADMIN" },
    });
    const res = await refreshRoute(postJson("/api/auth/mobile/refresh", validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("401s when the session is past its expiry", async () => {
    prismaMock.mobileSession.findUnique.mockResolvedValueOnce({
      id: "s",
      userId: "u",
      revokedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
      user: { role: "ADMIN" },
    });
    const res = await refreshRoute(postJson("/api/auth/mobile/refresh", validBody));
    expect(res.status).toBe(401);
  });

  it("revokes and 401s when the user is no longer an admin", async () => {
    prismaMock.mobileSession.findUnique.mockResolvedValueOnce({
      id: "s",
      userId: "u",
      revokedAt: null,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      user: { role: "USER" },
    });
    prismaMock.mobileSession.update.mockResolvedValueOnce({});
    const res = await refreshRoute(postJson("/api/auth/mobile/refresh", validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.mobileSession.update).toHaveBeenCalledWith({
      where: { id: "s" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rotates the session: revokes old + creates new, returns the new pair", async () => {
    prismaMock.mobileSession.findUnique.mockResolvedValueOnce({
      id: "old-sess",
      userId: "user_1",
      revokedAt: null,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      user: { role: "ADMIN" },
    });
    prismaMock.$transaction.mockResolvedValueOnce([
      {},
      { id: "fresh-sess", expiresAt: new Date("2026-12-15T00:00:00Z") },
    ]);

    const res = await refreshRoute(postJson("/api/auth/mobile/refresh", validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("access-jwt");
    expect(body.refreshToken).toBe("new-refresh-token-1234567890");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(signAccessTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        sessionId: "fresh-sess",
        role: "ADMIN",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/*                            POST /api/auth/mobile/logout                    */
/* -------------------------------------------------------------------------- */

describe("POST /api/auth/mobile/logout", () => {
  it("returns ok:true even on malformed JSON (fire-and-forget contract)", async () => {
    const res = await logoutRoute(postJson("/api/auth/mobile/logout", "{nope"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns ok:true on an unrecognised body shape", async () => {
    const res = await logoutRoute(
      postJson("/api/auth/mobile/logout", { not: "valid" })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.mobileSession.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the session matching the presented hash", async () => {
    prismaMock.mobileSession.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await logoutRoute(
      postJson("/api/auth/mobile/logout", { refreshToken: "x".repeat(40) })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.mobileSession.updateMany).toHaveBeenCalledWith({
      where: {
        refreshHash: `hash(${"x".repeat(40)})`,
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
