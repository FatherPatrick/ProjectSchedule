/**
 * Integration tests for `/api/admin/appointments` and its `[id]/approve`
 * + `[id]/cancel` siblings. The admin gate (`requireAdminEither`) is
 * mocked so we can flip auth on/off without setting up cookies +
 * MOBILE_TOKEN_SECRET. Domain helpers are also mocked since their
 * behavior is covered by their own unit tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminEitherMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
}));
const approveMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/appointments", () => ({
  approveAppointment: approveMock,
  cancelAppointment: cancelMock,
}));

import { GET } from "@/app/api/admin/appointments/route";
import { POST as approveRoute } from "@/app/api/admin/appointments/[id]/approve/route";
import { POST as cancelRoute } from "@/app/api/admin/appointments/[id]/cancel/route";

beforeEach(() => {
  requireAdminEitherMock.mockReset().mockResolvedValue(true);
  prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);
  approveMock.mockReset();
  cancelMock.mockReset();
});

function listReq(qs = ""): Request {
  return new Request(`http://localhost/api/admin/appointments${qs ? `?${qs}` : ""}`);
}

describe("GET /api/admin/appointments", () => {
  it("401s when the caller is not an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await GET(listReq());
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
  });

  it("400s when `to` is not after `from`", async () => {
    const res = await GET(
      listReq(
        `from=${encodeURIComponent("2026-05-14T00:00:00.000Z")}&to=${encodeURIComponent("2026-05-13T00:00:00.000Z")}`
      )
    );
    expect(res.status).toBe(400);
  });

  it("400s on a malformed `from` query parameter", async () => {
    const res = await GET(listReq("from=yesterday"));
    expect(res.status).toBe(400);
  });

  it("returns the joined appointment rows in the canonical envelope", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: "appt_1",
        startsAt: new Date("2026-05-14T13:00:00.000Z"),
        endsAt: new Date("2026-05-14T14:00:00.000Z"),
        status: "CONFIRMED",
        notes: null,
        client: {
          id: "c1",
          name: "Pat",
          email: "pat@example.com",
          phone: "+15555551212",
        },
        service: {
          id: "svc_1",
          name: "Manicure",
          durationMinutes: 60,
          priceCents: 4500,
        },
      },
    ]);
    const res = await GET(listReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; startsAt: string; status: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("appt_1");
    // Dates serialize back out as ISO strings.
    expect(body.data[0].startsAt).toBe("2026-05-14T13:00:00.000Z");
    expect(body.data[0].status).toBe("CONFIRMED");
  });

  it("filters by status when provided", async () => {
    await GET(listReq("status=PENDING"));
    const where = prismaMock.appointment.findMany.mock.calls[0][0].where as {
      status?: string;
    };
    expect(where.status).toBe("PENDING");
  });
});

describe("POST /api/admin/appointments/[id]/approve", () => {
  function call(id: string): Promise<Response> {
    return approveRoute(
      new Request(`http://localhost/api/admin/appointments/${id}/approve`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it("401s without an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await call("appt_1");
    expect(res.status).toBe(401);
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("returns the domain error code/message when approval fails", async () => {
    approveMock.mockResolvedValue({ ok: false, status: 409, error: "conflict" });
    const res = await call("appt_1");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conflict" });
  });

  it("returns { ok: true } on success", async () => {
    approveMock.mockResolvedValue({ ok: true });
    const res = await call("appt_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(approveMock).toHaveBeenCalledWith("appt_1");
  });
});

describe("POST /api/admin/appointments/[id]/cancel", () => {
  function call(id: string, body?: unknown): Promise<Response> {
    return cancelRoute(
      new Request(`http://localhost/api/admin/appointments/${id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? null : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it("401s without an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await call("appt_1");
    expect(res.status).toBe(401);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("400s when the body is present but invalid", async () => {
    const res = await call("appt_1", { message: 123 });
    expect(res.status).toBe(400);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("passes a trimmed message into the domain helper", async () => {
    cancelMock.mockResolvedValue({ ok: true });
    const res = await call("appt_1", { message: "  Sorry  " });
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith("appt_1", {
      byAdmin: true,
      note: "Sorry",
    });
  });

  it("treats an empty / whitespace-only message as undefined", async () => {
    cancelMock.mockResolvedValue({ ok: true });
    await call("appt_1", { message: "   " });
    expect(cancelMock).toHaveBeenCalledWith("appt_1", {
      byAdmin: true,
      note: undefined,
    });
  });

  it("forwards domain failure status + message", async () => {
    cancelMock.mockResolvedValue({ ok: false, status: 404, error: "not found" });
    const res = await call("missing", { message: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
