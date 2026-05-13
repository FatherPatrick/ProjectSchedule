/**
 * Coverage for `/api/admin/admins` (GET + POST) and
 * `/api/admin/admins/[phone]` (DELETE). The admin-allow-list helpers
 * are mocked so we don't go through Prisma in unit tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const listAdminPhonesMock = vi.hoisted(() => vi.fn());
const addAdminPhoneMock = vi.hoisted(() => vi.fn());
const removeAdminPhoneMock = vi.hoisted(() => vi.fn());
const envAdminPhonesMock = vi.hoisted(() => new Set<string>());
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: requireAdminMock,
  listAdminPhones: listAdminPhonesMock,
  addAdminPhone: addAdminPhoneMock,
  removeAdminPhone: removeAdminPhoneMock,
  ENV_ADMIN_PHONES: envAdminPhonesMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { GET, POST } from "@/app/api/admin/admins/route";
import { DELETE } from "@/app/api/admin/admins/[phone]/route";

const adminSession = { user: { id: "u1", role: "ADMIN" as const } };

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(adminSession);
  listAdminPhonesMock.mockReset();
  addAdminPhoneMock.mockReset().mockResolvedValue(undefined);
  removeAdminPhoneMock.mockReset();
  prismaMock.user.findUnique.mockReset();
  envAdminPhonesMock.clear();
});

describe("GET /api/admin/admins", () => {
  it("401s when not an admin", async () => {
    requireAdminMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the admin list with ISO timestamps", async () => {
    listAdminPhonesMock.mockResolvedValueOnce([
      {
        phone: "+15555550001",
        createdAt: new Date("2026-05-13T00:00:00Z"),
        createdById: "u1",
        source: "db",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admins).toEqual([
      {
        phone: "+15555550001",
        createdAt: "2026-05-13T00:00:00.000Z",
        createdById: "u1",
        source: "db",
      },
    ]);
  });
});

describe("POST /api/admin/admins", () => {
  function call(body: unknown) {
    return POST(
      new Request("http://localhost/api/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("401s when not an admin", async () => {
    requireAdminMock.mockResolvedValueOnce(null);
    const res = await call({ phone: "+15555550001" });
    expect(res.status).toBe(401);
    expect(addAdminPhoneMock).not.toHaveBeenCalled();
  });

  it("400s when the phone can't be normalised", async () => {
    const res = await call({ phone: "not-a-phone" });
    expect(res.status).toBe(400);
    expect(addAdminPhoneMock).not.toHaveBeenCalled();
  });

  it("normalises and calls addAdminPhone with the session user id", async () => {
    const res = await call({ phone: "5555550001" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBe("+15555550001");
    expect(addAdminPhoneMock).toHaveBeenCalledWith("+15555550001", "u1");
  });
});

describe("DELETE /api/admin/admins/[phone]", () => {
  function call(phone: string) {
    return DELETE(
      new Request(`http://localhost/api/admin/admins/${encodeURIComponent(phone)}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ phone: encodeURIComponent(phone) }) }
    );
  }

  it("401s when not an admin", async () => {
    requireAdminMock.mockResolvedValueOnce(null);
    const res = await call("+15555550001");
    expect(res.status).toBe(401);
    expect(removeAdminPhoneMock).not.toHaveBeenCalled();
  });

  it("400s when the phone can't be normalised", async () => {
    const res = await call("not-a-phone");
    expect(res.status).toBe(400);
  });

  it("409s when removing your own phone", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ phone: "+15555550001" });
    const res = await call("+15555550001");
    expect(res.status).toBe(409);
    expect(removeAdminPhoneMock).not.toHaveBeenCalled();
  });

  it("409s when removing an env-managed phone", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ phone: "+15555559999" });
    envAdminPhonesMock.add("+15555550002");
    const res = await call("+15555550002");
    expect(res.status).toBe(409);
    expect(removeAdminPhoneMock).not.toHaveBeenCalled();
  });

  it("404s when the row doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ phone: "+15555559999" });
    removeAdminPhoneMock.mockResolvedValueOnce(false);
    const res = await call("+15555550003");
    expect(res.status).toBe(404);
  });

  it("200s on success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ phone: "+15555559999" });
    removeAdminPhoneMock.mockResolvedValueOnce(true);
    const res = await call("+15555550004");
    expect(res.status).toBe(200);
    expect(removeAdminPhoneMock).toHaveBeenCalledWith("+15555550004");
  });
});
