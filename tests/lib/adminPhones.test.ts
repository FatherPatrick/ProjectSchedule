/**
 * Unit coverage for the DB-backed admin allow-list helpers in
 * `src/lib/auth/admin.ts`. These tests mock `prisma` so they don't need
 * a live database — the goal is to lock in the contract (env fallback,
 * union shape, idempotent upsert) rather than re-test Prisma itself.
 *
 * `ENV_ADMIN_PHONES` is captured at import time from `process.env`, so
 * we set the env var before the dynamic import and re-import the module
 * fresh in each test block when we need different env values.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adminPhone: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
// `auth.ts` pulls in NextAuth + the full Prisma adapter; we don't exercise
// requireAdmin here so a thin stub is enough.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/mobileTokens", () => ({ verifyAccessToken: vi.fn() }));

beforeEach(() => {
  prismaMock.adminPhone.findUnique.mockReset();
  prismaMock.adminPhone.findMany.mockReset();
  prismaMock.adminPhone.upsert.mockReset();
  prismaMock.adminPhone.deleteMany.mockReset();
});

async function importFresh() {
  vi.resetModules();
  return import("@/lib/auth/admin");
}

describe("isAdminPhone", () => {
  it("returns true when the DB has the phone", async () => {
    process.env.ADMIN_PHONES = "";
    const { isAdminPhone } = await importFresh();
    prismaMock.adminPhone.findUnique.mockResolvedValueOnce({
      phone: "+15555550001",
    });
    expect(await isAdminPhone("+15555550001")).toBe(true);
  });

  it("falls back to the env allow-list when the DB misses", async () => {
    process.env.ADMIN_PHONES = "+15555550002";
    const { isAdminPhone } = await importFresh();
    prismaMock.adminPhone.findUnique.mockResolvedValueOnce(null);
    expect(await isAdminPhone("+15555550002")).toBe(true);
  });

  it("returns false when both DB and env miss", async () => {
    process.env.ADMIN_PHONES = "+15555559999";
    const { isAdminPhone } = await importFresh();
    prismaMock.adminPhone.findUnique.mockResolvedValueOnce(null);
    expect(await isAdminPhone("+15555550003")).toBe(false);
  });
});

describe("listAdminPhones", () => {
  it("unions DB rows + env-only rows and tags source", async () => {
    process.env.ADMIN_PHONES = "+15555550001,+15555550002";
    const { listAdminPhones } = await importFresh();
    prismaMock.adminPhone.findMany.mockResolvedValueOnce([
      {
        phone: "+15555550001", // shadows env entry
        createdAt: new Date("2026-05-13T00:00:00Z"),
        createdById: "u1",
      },
      {
        phone: "+15555550010",
        createdAt: new Date("2026-05-14T00:00:00Z"),
        createdById: null,
      },
    ]);
    const rows = await listAdminPhones();
    // DB rows first, env-only entries after.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ phone: "+15555550001", source: "db" });
    expect(rows[1]).toMatchObject({ phone: "+15555550010", source: "db" });
    expect(rows[2]).toMatchObject({ phone: "+15555550002", source: "env" });
    // env sentinel timestamp.
    expect(rows[2].createdAt.getTime()).toBe(0);
  });

  it("returns empty when DB is empty and env is empty", async () => {
    process.env.ADMIN_PHONES = "";
    const { listAdminPhones } = await importFresh();
    prismaMock.adminPhone.findMany.mockResolvedValueOnce([]);
    expect(await listAdminPhones()).toEqual([]);
  });
});

describe("addAdminPhone", () => {
  it("upserts with the inviter id so re-invites are no-ops", async () => {
    const { addAdminPhone } = await importFresh();
    prismaMock.adminPhone.upsert.mockResolvedValueOnce({});
    await addAdminPhone("+15555550001", "u-inviter");
    expect(prismaMock.adminPhone.upsert).toHaveBeenCalledWith({
      where: { phone: "+15555550001" },
      create: { phone: "+15555550001", createdById: "u-inviter" },
      update: {},
    });
  });
});

describe("removeAdminPhone", () => {
  it("returns true when a row was deleted", async () => {
    const { removeAdminPhone } = await importFresh();
    prismaMock.adminPhone.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await removeAdminPhone("+15555550001")).toBe(true);
  });

  it("returns false when no row matched", async () => {
    const { removeAdminPhone } = await importFresh();
    prismaMock.adminPhone.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await removeAdminPhone("+15555550001")).toBe(false);
  });
});
