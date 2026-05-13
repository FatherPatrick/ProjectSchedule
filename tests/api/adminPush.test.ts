/**
 * Integration tests for `/api/admin/push/{register,unregister}`. Both
 * routes are bearer-only (cookie sessions don't carry a sessionId to
 * pin a push token to). We mock `requireAdminFromBearer` to flip auth
 * on/off and assert the prisma side-effects + status codes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminFromBearerMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  mobileSession: { update: vi.fn() },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminFromBearer: requireAdminFromBearerMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { POST as registerRoute } from "@/app/api/admin/push/register/route";
import { POST as unregisterRoute } from "@/app/api/admin/push/unregister/route";

function postJson(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAdminFromBearerMock.mockReset().mockResolvedValue({
    sessionId: "sess_1",
    userId: "user_1",
    role: "ADMIN",
  });
  prismaMock.mobileSession.update.mockReset().mockResolvedValue({});
});

describe("POST /api/admin/push/register", () => {
  const validBody = {
    pushToken: "ExponentPushToken[abcdefghij1234567890]",
    platform: "ios" as const,
  };

  it("401s when bearer auth fails and does not touch the DB", async () => {
    requireAdminFromBearerMock.mockResolvedValueOnce(null);
    const res = await registerRoute(postJson("/api/admin/push/register", validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.mobileSession.update).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    const res = await registerRoute(
      postJson("/api/admin/push/register", "{not json")
    );
    expect(res.status).toBe(400);
    expect(prismaMock.mobileSession.update).not.toHaveBeenCalled();
  });

  it("400s on a body that fails the pushRegisterSchema", async () => {
    const res = await registerRoute(
      postJson("/api/admin/push/register", {
        pushToken: "short",
        platform: "ios",
      })
    );
    expect(res.status).toBe(400);
  });

  it("400s on an unsupported platform", async () => {
    const res = await registerRoute(
      postJson("/api/admin/push/register", {
        pushToken: validBody.pushToken,
        platform: "windows",
      })
    );
    expect(res.status).toBe(400);
  });

  it("stores the token + platform on the caller's MobileSession", async () => {
    const res = await registerRoute(postJson("/api/admin/push/register", validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.mobileSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: {
        pushToken: validBody.pushToken,
        deviceLabel: "ios",
      },
    });
  });
});

describe("POST /api/admin/push/unregister", () => {
  it("401s when bearer auth fails", async () => {
    requireAdminFromBearerMock.mockResolvedValueOnce(null);
    const res = await unregisterRoute(
      new Request("http://localhost/api/admin/push/unregister", { method: "POST" })
    );
    expect(res.status).toBe(401);
    expect(prismaMock.mobileSession.update).not.toHaveBeenCalled();
  });

  it("nulls the pushToken on the caller's MobileSession", async () => {
    const res = await unregisterRoute(
      new Request("http://localhost/api/admin/push/unregister", { method: "POST" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.mobileSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { pushToken: null },
    });
  });
});
