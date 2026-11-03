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
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));
const getSingleActiveSalonIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/salon", () => ({
  getSingleActiveSalonId: getSingleActiveSalonIdMock,
}));
// `auth.ts` pulls in NextAuth + the full Prisma adapter; we don't exercise
// requireAdmin here so a thin stub is enough.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/mobileTokens", () => ({ verifyAccessToken: vi.fn() }));

beforeEach(() => {
  getSingleActiveSalonIdMock.mockReset().mockResolvedValue("salon_1");
  prismaMock.$queryRaw.mockReset();
  prismaMock.$executeRaw.mockReset();
});

async function importFresh() {
  vi.resetModules();
  return import("@/lib/auth/admin");
}

describe("isAdminPhone", () => {
  it("returns true when the DB has the phone", async () => {
    process.env.ADMIN_PHONES = "";
    const { isAdminPhone } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([{ phone: "+15555550001" }]);
    expect(await isAdminPhone("+15555550001")).toBe(true);
    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('FROM "AdminPhone"');
    expect(values).toEqual(["salon_1", "+15555550001"]);
  });

  it("falls back to the env allow-list when the DB misses", async () => {
    process.env.ADMIN_PHONES = "+15555550002";
    const { isAdminPhone } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    expect(await isAdminPhone("+15555550002")).toBe(true);
  });

  it("returns false when both DB and env miss", async () => {
    process.env.ADMIN_PHONES = "+15555559999";
    const { isAdminPhone } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    expect(await isAdminPhone("+15555550003")).toBe(false);
  });
});

describe("listAdminPhones", () => {
  it("unions DB rows + env-only rows and tags source", async () => {
    process.env.ADMIN_PHONES = "+15555550001,+15555550002";
    const { listAdminPhones } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        phone: "+15555550001", // also in env → stays env-managed (non-removable)
        createdAt: new Date("2026-05-13T00:00:00Z"),
        createdById: "u1",
        notify: false,
      },
      {
        phone: "+15555550010",
        createdAt: new Date("2026-05-14T00:00:00Z"),
        createdById: null,
        notify: true,
      },
    ]);
    const rows = await listAdminPhones();
    // DB rows first, env-only entries after. A phone present in ADMIN_PHONES is
    // reported as source "env" even when a DB row carries its notify setting.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      phone: "+15555550001",
      source: "env",
      notify: false,
    });
    expect(rows[1]).toMatchObject({
      phone: "+15555550010",
      source: "db",
      notify: true,
    });
    expect(rows[2]).toMatchObject({ phone: "+15555550002", source: "env" });
    // env-only entries default notify=on and use the sentinel timestamp.
    expect(rows[2].notify).toBe(true);
    expect(rows[2].createdAt.getTime()).toBe(0);
    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain('WHERE "salonId" =');
    expect(values).toEqual(["salon_1"]);
  });

  it("returns empty when DB is empty and env is empty", async () => {
    process.env.ADMIN_PHONES = "";
    const { listAdminPhones } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    expect(await listAdminPhones()).toEqual([]);
  });
});

describe("addAdminPhone", () => {
  it("upserts with the inviter id so re-invites are no-ops", async () => {
    const { addAdminPhone } = await importFresh();
    prismaMock.$executeRaw.mockResolvedValueOnce(1);
    await addAdminPhone("+15555550001", "u-inviter");
    const [query, ...values] = prismaMock.$executeRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain("DO NOTHING");
    expect(values).toEqual(["salon_1", "+15555550001", "u-inviter"]);
  });
});

describe("setAdminNotify", () => {
  it("upserts notification settings for the sole active salon", async () => {
    const { setAdminNotify } = await importFresh();
    prismaMock.$executeRaw.mockResolvedValueOnce(1);
    await setAdminNotify("+15555550001", false);

    const [query, ...values] = prismaMock.$executeRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain("DO UPDATE SET notify");
    expect(values).toEqual(["salon_1", "+15555550001", false]);
  });
});

describe("removeAdminPhone", () => {
  it("returns true when a row was deleted", async () => {
    const { removeAdminPhone } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([{ phone: "+15555550001" }]);
    expect(await removeAdminPhone("+15555550001")).toBe(true);
    const [query, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect((query as TemplateStringsArray).join(" ")).toContain("DELETE FROM");
    expect(values).toEqual(["salon_1", "+15555550001"]);
  });

  it("returns false when no row matched", async () => {
    const { removeAdminPhone } = await importFresh();
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    expect(await removeAdminPhone("+15555550001")).toBe(false);
  });
});
