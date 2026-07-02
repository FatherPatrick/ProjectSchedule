/**
 * Integration tests for `GET /api/availability`.
 *
 * Scope: drives the route handler the same way a Next.js dispatcher
 * would (real `Request`, real Zod validation), with the domain layer
 * mocked so we focus on the wiring — query parsing, error shape,
 * response envelope. Domain math itself is covered by
 * `tests/lib/availability.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddOnServiceLite } from "@/lib/domain/appointmentServices";

const getAvailableSlotsMock = vi.hoisted(() => vi.fn());
const getPublicSalonMock = vi.hoisted(() => vi.fn());
const resolveAddOnServicesMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AddOnServiceLite[] | null> => [])
);
vi.mock("@/lib/domain/availability", () => ({
  getAvailableSlots: getAvailableSlotsMock,
}));
vi.mock("@/lib/domain/salon", () => ({
  getPublicSalon: getPublicSalonMock,
}));
vi.mock("@/lib/domain/appointmentServices", () => ({
  resolveAddOnServices: resolveAddOnServicesMock,
  MAX_ADD_ON_SERVICES: 4,
}));

import { GET } from "@/app/api/availability/route";

function req(qs: string): Request {
  return new Request(`http://localhost/api/availability?${qs}`);
}

const SALON_ID = "salon_1";

describe("GET /api/availability", () => {
  beforeEach(() => {
    getPublicSalonMock.mockReset().mockResolvedValue({
      ok: true,
      salon: {
        id: SALON_ID,
        slug: "test-salon",
        name: "Test Salon",
        timezone: "America/Los_Angeles",
        instagram: null,
        status: "ACTIVE",
      },
    });
    getAvailableSlotsMock.mockReset();
    resolveAddOnServicesMock.mockReset().mockResolvedValue([]);
  });

  it("400s on missing query parameters", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid query." });
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });

  it("400s on a malformed date", async () => {
    const res = await GET(req("serviceId=svc_1&date=2026/05/13"));
    expect(res.status).toBe(400);
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });

  it("returns the slots returned by the domain layer in a `{ slots }` envelope", async () => {
    getAvailableSlotsMock.mockResolvedValueOnce([
      { startISO: "2026-05-13T13:00:00.000Z" },
      { startISO: "2026-05-13T13:30:00.000Z" },
    ]);
    const res = await GET(req("serviceId=svc_1&date=2026-05-13"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slots: [
        { startISO: "2026-05-13T13:00:00.000Z" },
        { startISO: "2026-05-13T13:30:00.000Z" },
      ],
    });
    expect(getAvailableSlotsMock).toHaveBeenCalledWith({
      salonId: SALON_ID,
      serviceId: "svc_1",
      dateKey: "2026-05-13",
      additionalDurationMinutes: 0,
    });
  });

  it("resolves add-on services and passes their combined duration through", async () => {
    resolveAddOnServicesMock.mockResolvedValueOnce([
      { id: "svc_2", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
      { id: "svc_3", name: "Nail Art", durationMinutes: 15, priceCents: 1000 },
    ]);
    getAvailableSlotsMock.mockResolvedValueOnce([]);

    await GET(req("serviceId=svc_1&date=2026-05-13&addOnServiceIds=svc_2,svc_3"));

    expect(resolveAddOnServicesMock).toHaveBeenCalledWith(SALON_ID, "svc_1", ["svc_2", "svc_3"]);
    expect(getAvailableSlotsMock).toHaveBeenCalledWith({
      salonId: SALON_ID,
      serviceId: "svc_1",
      dateKey: "2026-05-13",
      additionalDurationMinutes: 45,
    });
  });

  it("400s when an add-on service id is invalid", async () => {
    resolveAddOnServicesMock.mockResolvedValueOnce(null);

    const res = await GET(req("serviceId=svc_1&date=2026-05-13&addOnServiceIds=bad_id"));
    expect(res.status).toBe(400);
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });
});
