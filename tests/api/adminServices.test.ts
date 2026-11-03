/**
 * Integration tests for `/api/admin/services` (GET + POST). Auth is
 * mocked at the boundary; prisma is mocked to surface input shape
 * + response envelope contracts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminEitherMock = vi.hoisted(() => vi.fn());
const createServiceForSingleSalonMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  service: { findMany: vi.fn() },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/services", () => ({
  createServiceForSingleSalon: createServiceForSingleSalonMock,
}));

import { GET, POST } from "@/app/api/admin/services/route";

function getReq(qs = ""): Request {
  return new Request(`http://localhost/api/admin/services${qs ? `?${qs}` : ""}`);
}
function postReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAdminEitherMock.mockReset().mockResolvedValue(true);
  prismaMock.service.findMany.mockReset().mockResolvedValue([]);
  createServiceForSingleSalonMock.mockReset().mockResolvedValue("svc_new");
});

describe("GET /api/admin/services", () => {
  it("401s without an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("includes inactive rows by default and excludes them when ?includeInactive=false", async () => {
    await GET(getReq());
    expect(prismaMock.service.findMany.mock.calls[0][0].where).toEqual({});

    await GET(getReq("includeInactive=false"));
    expect(prismaMock.service.findMany.mock.calls[1][0].where).toEqual({
      active: true,
    });
  });

  it("returns the canonical service envelope", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: "svc_1",
        name: "Manicure",
        description: null,
        durationMinutes: 60,
        priceCents: 4500,
        active: true,
        sortOrder: 0,
      },
    ]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          id: "svc_1",
          name: "Manicure",
          description: null,
          durationMinutes: 60,
          priceCents: 4500,
          active: true,
          sortOrder: 0,
        },
      ],
    });
  });
});

describe("POST /api/admin/services", () => {
  const VALID = {
    name: "Pedicure",
    description: null,
    durationMinutes: 60,
    priceCents: 5000,
  };

  it("401s without an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await POST(postReq(VALID));
    expect(res.status).toBe(401);
  });

  it("400s on a non-JSON body", async () => {
    const res = await POST(postReq("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON." });
  });

  it("400s on a sub-floor duration (canonical schema rule)", async () => {
    const res = await POST(postReq({ ...VALID, durationMinutes: 3 }));
    expect(res.status).toBe(400);
    expect(createServiceForSingleSalonMock).not.toHaveBeenCalled();
  });

  it("400s on a missing name", async () => {
    const { name: _drop, ...rest } = VALID;
    void _drop;
    const res = await POST(postReq(rest));
    expect(res.status).toBe(400);
  });

  it("creates the service and returns 201 with the new id", async () => {
    const res = await POST(postReq(VALID));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: "svc_new" } });

    expect(createServiceForSingleSalonMock).toHaveBeenCalledWith(VALID);
  });
});
