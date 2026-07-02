/**
 * Covers prepaid-package redemption lookup + refund
 * (docs/FEATURE_OPPORTUNITIES_SPEC.md #7). The atomic "create appointment +
 * draw down a session" path is covered in appointmentServices.test.ts;
 * this file only covers finding a usable package and reversing a session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  clientPackage: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { findRedeemablePackage, refundPackageSession } from "@/lib/domain/packages";

const SALON_ID = "salon_1";
const CLIENT_ID = "client_1";
const SERVICE_ID = "svc_1";

beforeEach(() => {
  prismaMock.clientPackage.findMany.mockReset();
  prismaMock.clientPackage.update.mockReset();
});

describe("findRedeemablePackage", () => {
  it("returns null when the client has no packages for this service", async () => {
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([]);
    const result = await findRedeemablePackage(SALON_ID, CLIENT_ID, SERVICE_ID);
    expect(result).toBeNull();
  });

  it("scopes the lookup to this salon, client, and the package's service", async () => {
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([]);
    await findRedeemablePackage(SALON_ID, CLIENT_ID, SERVICE_ID);
    expect(prismaMock.clientPackage.findMany).toHaveBeenCalledWith({
      where: { salonId: SALON_ID, clientId: CLIENT_ID, package: { serviceId: SERVICE_ID } },
      select: { id: true, sessionsUsed: true, sessionsTotal: true },
      orderBy: { purchasedAt: "asc" },
    });
  });

  it("skips a fully-used package and returns the next one with sessions left", async () => {
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([
      { id: "cp_used_up", sessionsUsed: 5, sessionsTotal: 5 },
      { id: "cp_has_room", sessionsUsed: 2, sessionsTotal: 5 },
    ]);
    const result = await findRedeemablePackage(SALON_ID, CLIENT_ID, SERVICE_ID);
    expect(result).toEqual({ id: "cp_has_room", sessionsUsed: 2, sessionsTotal: 5 });
  });

  it("returns null when every package for this service is fully used", async () => {
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([
      { id: "cp_1", sessionsUsed: 5, sessionsTotal: 5 },
    ]);
    const result = await findRedeemablePackage(SALON_ID, CLIENT_ID, SERVICE_ID);
    expect(result).toBeNull();
  });

  it("prefers the oldest package (relies on the orderBy, not a re-sort)", async () => {
    // findMany already returns purchasedAt-ascending; the function just takes
    // the first usable one in that order.
    prismaMock.clientPackage.findMany.mockResolvedValueOnce([
      { id: "cp_oldest", sessionsUsed: 1, sessionsTotal: 5 },
      { id: "cp_newest", sessionsUsed: 0, sessionsTotal: 5 },
    ]);
    const result = await findRedeemablePackage(SALON_ID, CLIENT_ID, SERVICE_ID);
    expect(result?.id).toBe("cp_oldest");
  });
});

describe("refundPackageSession", () => {
  it("decrements sessionsUsed by 1", async () => {
    await refundPackageSession("cp_1");
    expect(prismaMock.clientPackage.update).toHaveBeenCalledWith({
      where: { id: "cp_1" },
      data: { sessionsUsed: { decrement: 1 } },
    });
  });
});
