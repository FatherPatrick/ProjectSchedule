/**
 * Integration tests for `/api/admin/appointments` and its `[id]/approve`
 * + `[id]/cancel` siblings. The admin gate (`requireAdminEither`) is
 * mocked so we can flip auth on/off without setting up cookies +
 * MOBILE_TOKEN_SECRET. Domain helpers are also mocked since their
 * behavior is covered by their own unit tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminEitherMock = vi.hoisted(() => vi.fn());
const requireAdminSalonMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  appointment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  appointmentAddOn: { createMany: vi.fn() },
  clientPackage: { findMany: vi.fn(async () => []) },
  service: { findUnique: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));
const approveMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const findClientIdByEmailMock = vi.hoisted(() => vi.fn());
const sendNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
  requireAdminSalon: requireAdminSalonMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/appointments", () => ({
  approveAppointment: approveMock,
  cancelAppointment: cancelMock,
}));
vi.mock("@/lib/domain/clients", () => ({
  findClientIdByEmail: findClientIdByEmailMock,
}));
vi.mock("@/lib/integrations/notifications", () => ({
  sendNotifications: sendNotificationsMock,
}));

import { GET, POST } from "@/app/api/admin/appointments/route";
import { POST as approveRoute } from "@/app/api/admin/appointments/[id]/approve/route";
import { POST as cancelRoute } from "@/app/api/admin/appointments/[id]/cancel/route";
import { POST as clearCancelledRoute } from "@/app/api/admin/appointments/clear-cancelled/route";

beforeEach(() => {
  requireAdminEitherMock.mockReset().mockResolvedValue(true);
  requireAdminSalonMock
    .mockReset()
    .mockResolvedValue({ salonId: "salon_1", userId: "user_1" });
  prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.appointment.create.mockReset().mockResolvedValue({
    id: "appt_new",
    managementToken: "tok_123",
  });
  prismaMock.service.findUnique.mockReset().mockResolvedValue({
    id: "svc_1",
    name: "Manicure",
    durationMinutes: 60,
    active: true,
  });
  prismaMock.client.findUnique.mockReset().mockResolvedValue({ id: "client_1" });
  prismaMock.client.upsert.mockReset().mockResolvedValue({ id: "client_new" });
  prismaMock.appointment.deleteMany.mockReset().mockResolvedValue({ count: 3 });
  approveMock.mockReset();
  cancelMock.mockReset();
  findClientIdByEmailMock.mockReset().mockResolvedValue(null);
  sendNotificationsMock.mockReset().mockResolvedValue(undefined);
});

const ADMIN_FUTURE_ISO = new Date(
  Date.now() + 3 * 24 * 60 * 60 * 1000
).toISOString();

function createReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/appointments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

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
    expect(approveMock).toHaveBeenCalledWith("salon_1", "appt_1");
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
    expect(cancelMock).toHaveBeenCalledWith("salon_1", "appt_1", {
      byAdmin: true,
      note: "Sorry",
    });
  });

  it("treats an empty / whitespace-only message as undefined", async () => {
    cancelMock.mockResolvedValue({ ok: true });
    await call("appt_1", { message: "   " });
    expect(cancelMock).toHaveBeenCalledWith("salon_1", "appt_1", {
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


describe("POST /api/admin/appointments — admin books for a client", () => {
  const EXISTING_BODY = {
    serviceId: "svc_1",
    startISO: ADMIN_FUTURE_ISO,
    clientId: "client_1",
  };

  it("401s when the caller is not an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await POST(createReq(EXISTING_BODY));
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("400s when neither a clientId nor new-client details are given", async () => {
    const res = await POST(
      createReq({ serviceId: "svc_1", startISO: ADMIN_FUTURE_ISO })
    );
    expect(res.status).toBe(400);
  });

  it("404s when the service is missing", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(createReq(EXISTING_BODY));
    expect(res.status).toBe(404);
  });

  it("400s when the start time is in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(createReq({ ...EXISTING_BODY, startISO: past }));
    expect(res.status).toBe(400);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("409s when the slot overlaps a confirmed appointment", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue({ id: "other" });
    const res = await POST(createReq(EXISTING_BODY));
    expect(res.status).toBe(409);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("creates a CONFIRMED appointment for an existing client and notifies", async () => {
    const res = await POST(createReq(EXISTING_BODY));
    expect(res.status).toBe(200);
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CONFIRMED", clientId: "client_1" }),
      })
    );
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_new", "CONFIRMATION");
  });

  it("does not notify when notify:false", async () => {
    const res = await POST(createReq({ ...EXISTING_BODY, notify: false }));
    expect(res.status).toBe(200);
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("upserts a new client by email when details are provided", async () => {
    const res = await POST(
      createReq({
        serviceId: "svc_1",
        startISO: ADMIN_FUTURE_ISO,
        name: "New Person",
        email: "New@Example.com",
        phone: "+15555551212",
      })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.client.upsert).toHaveBeenCalled();
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "client_new" }),
      })
    );
  });

  it("creates a new client with name + phone only (email optional)", async () => {
    const res = await POST(
      createReq({
        serviceId: "svc_1",
        startISO: ADMIN_FUTURE_ISO,
        name: "No Email",
        phone: "+15555551212",
      })
    );
    expect(res.status).toBe(200);
    // No email → no email-dedupe lookup, and the client is stored with a
    // blank email + emailOptIn disabled.
    expect(findClientIdByEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "", emailOptIn: false }),
      })
    );
  });
});

describe("POST /api/admin/appointments — recurring bookings", () => {
  const RECURRING_BODY = {
    serviceId: "svc_1",
    startISO: ADMIN_FUTURE_ISO,
    clientId: "client_1",
    recurrence: { rule: "WEEKLY" as const, occurrences: 3 },
  };

  it("400s when add-ons are combined with a recurrence request", async () => {
    const res = await POST(
      createReq({ ...RECURRING_BODY, addOnServiceIds: ["svc_2"] })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("400s on an occurrence count outside 2–12", async () => {
    const res = await POST(
      createReq({ ...RECURRING_BODY, recurrence: { rule: "WEEKLY", occurrences: 1 } })
    );
    expect(res.status).toBe(400);
  });

  it("books every occurrence and returns createdCount/skippedCount", async () => {
    const res = await POST(createReq(RECURRING_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { createdCount: number; skippedCount: number };
    expect(body.createdCount).toBe(3);
    expect(body.skippedCount).toBe(0);
    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(3);
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_new", "CONFIRMATION");
  });

  it("409s when the first occurrence's slot is already taken, without creating any of the series", async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: "existing" });
    const res = await POST(createReq(RECURRING_BODY));
    expect(res.status).toBe(409);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

});

describe("POST /api/admin/appointments/clear-cancelled", () => {
  function call(): Promise<Response> {
    return clearCancelledRoute(
      new Request("http://localhost/api/admin/appointments/clear-cancelled", {
        method: "POST",
      })
    );
  }

  it("401s when the caller is not an admin", async () => {
    requireAdminEitherMock.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes all CANCELLED appointments and returns the count", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 3 });
    expect(prismaMock.appointment.deleteMany).toHaveBeenCalledWith({
      where: { salonId: "salon_1", status: "CANCELLED" },
    });
  });
});
