/**
 * Unit coverage for the DB-backed admin allow-list helpers in
 * `src/lib/auth/admin.ts`. These tests mock `prisma` so they don't need a
 * live database. Every helper is salon-scoped — a phone is only an admin
 * of the specific salon it was added to, keyed by the `(salonId, phone)`
 * composite key. There is no more env-based (`ADMIN_PHONES`) allow-list
 * bootstrap — that was removed once signup seeds the first admin.
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

import {
  addAdminPhone,
  isAdminPhone,
  listAdminPhones,
  removeAdminPhone,
} from "@/lib/auth/admin";

const SALON_ID = "salon_1";

beforeEach(() => {
  prismaMock.adminPhone.findUnique.mockReset();
  prismaMock.adminPhone.findMany.mockReset();
  prismaMock.adminPhone.upsert.mockReset();
  prismaMock.adminPhone.deleteMany.mockReset();
});

describe("isAdminPhone", () => {
  it("returns true when the DB has a row for this salon + phone", async () => {
    prismaMock.adminPhone.findUnique.mockResolvedValueOnce({
      phone: "+15555550001",
    });
    expect(await isAdminPhone(SALON_ID, "+15555550001")).toBe(true);
    expect(prismaMock.adminPhone.findUnique).toHaveBeenCalledWith({
      where: { salonId_phone: { salonId: SALON_ID, phone: "+15555550001" } },
      select: { phone: true },
    });
  });

  it("returns false when no row matches this salon + phone", async () => {
    prismaMock.adminPhone.findUnique.mockResolvedValueOnce(null);
    expect(await isAdminPhone(SALON_ID, "+15555550003")).toBe(false);
  });
});

describe("listAdminPhones", () => {
  it("returns the salon's DB rows in createdAt order", async () => {
    const rows = [
      {
        phone: "+15555550001",
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
    ];
    prismaMock.adminPhone.findMany.mockResolvedValueOnce(rows);
    expect(await listAdminPhones(SALON_ID)).toEqual(rows);
    expect(prismaMock.adminPhone.findMany).toHaveBeenCalledWith({
      where: { salonId: SALON_ID },
      orderBy: { createdAt: "asc" },
      select: { phone: true, createdAt: true, createdById: true, notify: true },
    });
  });

  it("returns empty when the salon has no admin phones", async () => {
    prismaMock.adminPhone.findMany.mockResolvedValueOnce([]);
    expect(await listAdminPhones(SALON_ID)).toEqual([]);
  });
});

describe("addAdminPhone", () => {
  it("upserts scoped to the salon with the inviter id, so re-invites are no-ops", async () => {
    prismaMock.adminPhone.upsert.mockResolvedValueOnce({});
    await addAdminPhone(SALON_ID, "+15555550001", "u-inviter");
    expect(prismaMock.adminPhone.upsert).toHaveBeenCalledWith({
      where: { salonId_phone: { salonId: SALON_ID, phone: "+15555550001" } },
      create: { salonId: SALON_ID, phone: "+15555550001", createdById: "u-inviter" },
      update: {},
    });
  });
});

describe("removeAdminPhone", () => {
  it("returns true when a row was deleted", async () => {
    prismaMock.adminPhone.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await removeAdminPhone(SALON_ID, "+15555550001")).toBe(true);
    expect(prismaMock.adminPhone.deleteMany).toHaveBeenCalledWith({
      where: { salonId: SALON_ID, phone: "+15555550001" },
    });
  });

  it("returns false when no row matched", async () => {
    prismaMock.adminPhone.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await removeAdminPhone(SALON_ID, "+15555550001")).toBe(false);
  });
});
