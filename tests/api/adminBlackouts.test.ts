/**
 * Covers `DELETE /api/admin/blackouts/[id]`. Previously the handler did
 * `prisma.blackout.delete(...).catch(() => null)` and always returned
 * 200, hiding both real "id doesn't exist" cases and genuine DB faults.
 * The new handler distinguishes:
 *   - 401 when the caller is not an admin
 *   - 404 when Prisma returns P2025 ("record to delete does not exist")
 *   - 500 when Prisma raises any other error (and forwards via reportError)
 *   - 200 on a clean delete
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const requireAdminEitherMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  blackout: { delete: vi.fn() },
}));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/observability/reportError", () => ({
  reportError: reportErrorMock,
}));

import { DELETE } from "@/app/api/admin/blackouts/[id]/route";

function call(id: string) {
  return DELETE(
    new Request(`http://localhost/api/admin/blackouts/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  requireAdminEitherMock.mockReset().mockResolvedValue(true);
  prismaMock.blackout.delete.mockReset();
  reportErrorMock.mockReset();
});

describe("DELETE /api/admin/blackouts/[id]", () => {
  it("401s when the caller is not an admin and does not touch the DB", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await call("blk_1");
    expect(res.status).toBe(401);
    expect(prismaMock.blackout.delete).not.toHaveBeenCalled();
  });

  it("returns 200 on a clean delete", async () => {
    prismaMock.blackout.delete.mockResolvedValueOnce({ id: "blk_1" });
    const res = await call("blk_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.blackout.delete).toHaveBeenCalledWith({
      where: { id: "blk_1" },
    });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("returns 404 when Prisma reports P2025 (row already gone)", async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError(
      "Record to delete does not exist",
      { code: "P2025", clientVersion: "test" }
    );
    prismaMock.blackout.delete.mockRejectedValueOnce(p2025);
    const res = await call("missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    // P2025 is an expected condition, not a fault — don't pollute observability.
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("returns 500 and reports unexpected Prisma errors", async () => {
    const boom = new Prisma.PrismaClientKnownRequestError("connection lost", {
      code: "P1001",
      clientVersion: "test",
    });
    prismaMock.blackout.delete.mockRejectedValueOnce(boom);
    const res = await call("blk_1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not remove blackout." });
    expect(reportErrorMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        where: "admin.blackouts.delete",
        blackoutId: "blk_1",
      })
    );
  });

  it("returns 500 and reports non-Prisma errors", async () => {
    const boom = new Error("network down");
    prismaMock.blackout.delete.mockRejectedValueOnce(boom);
    const res = await call("blk_1");
    expect(res.status).toBe(500);
    expect(reportErrorMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ where: "admin.blackouts.delete" })
    );
  });
});
