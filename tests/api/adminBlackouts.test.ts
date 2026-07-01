/**
 * Covers `DELETE /api/admin/blackouts/[id]`. The handler is salon-scoped:
 * it resolves `salonId` via `requireAdminSalon` and deletes with
 * `deleteMany({ where: { id, salonId } })` so an id from another salon
 * can never be deleted (returns 404, same as a genuinely missing id,
 * instead of a P2025 throw from a plain `delete`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminEitherMock = vi.hoisted(() => vi.fn());
const requireAdminSalonMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  blackout: { deleteMany: vi.fn() },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
  requireAdminSalon: requireAdminSalonMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

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
  requireAdminSalonMock
    .mockReset()
    .mockResolvedValue({ salonId: "salon_1", userId: "user_1" });
  prismaMock.blackout.deleteMany.mockReset();
});

describe("DELETE /api/admin/blackouts/[id]", () => {
  it("401s when the caller is not an admin and does not touch the DB", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await call("blk_1");
    expect(res.status).toBe(401);
    expect(prismaMock.blackout.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 200 on a clean delete, scoped to the caller's salon", async () => {
    prismaMock.blackout.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await call("blk_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.blackout.deleteMany).toHaveBeenCalledWith({
      where: { id: "blk_1", salonId: "salon_1" },
    });
  });

  it("returns 404 when the id doesn't exist (or belongs to another salon)", async () => {
    prismaMock.blackout.deleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await call("missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
