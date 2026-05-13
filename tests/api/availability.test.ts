/**
 * Integration tests for `GET /api/availability`.
 *
 * Scope: drives the route handler the same way a Next.js dispatcher
 * would (real `Request`, real Zod validation), with the domain layer
 * mocked so we focus on the wiring — query parsing, error shape,
 * response envelope. Domain math itself is covered by
 * `tests/lib/availability.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

const getAvailableSlotsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain/availability", () => ({
  getAvailableSlots: getAvailableSlotsMock,
}));

import { GET } from "@/app/api/availability/route";

function req(qs: string): Request {
  return new Request(`http://localhost/api/availability?${qs}`);
}

describe("GET /api/availability", () => {
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
      serviceId: "svc_1",
      dateKey: "2026-05-13",
    });
  });
});
