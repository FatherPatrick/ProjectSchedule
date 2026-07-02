/**
 * Thin wiring test for `POST /api/waitlist/[token]/claim` — the actual
 * claim logic (race-safe re-check, requeue-on-conflict) is covered in
 * waitlist.test.ts; this only checks the route translates the domain
 * result into the right HTTP response.
 */
import { describe, expect, it, vi } from "vitest";

const claimWaitlistEntryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain/waitlist", () => ({ claimWaitlistEntry: claimWaitlistEntryMock }));

import { POST } from "@/app/api/waitlist/[token]/claim/route";

function call(token: string) {
  return POST(new Request(`http://localhost/api/waitlist/${token}/claim`, { method: "POST" }), {
    params: Promise.resolve({ token }),
  });
}

describe("POST /api/waitlist/[token]/claim", () => {
  it("returns the booking envelope on success", async () => {
    claimWaitlistEntryMock.mockResolvedValueOnce({
      ok: true,
      appointmentId: "appt_1",
      managementToken: "tok_abc",
      serviceName: "Gel Manicure",
      whenLabel: "Monday, Jan 1 at 3:00 PM",
    });

    const res = await call("token_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      appointmentId: "appt_1",
      managementToken: "tok_abc",
      serviceName: "Gel Manicure",
      whenLabel: "Monday, Jan 1 at 3:00 PM",
    });
    expect(claimWaitlistEntryMock).toHaveBeenCalledWith("token_1");
  });

  it("passes through the domain error status and message", async () => {
    claimWaitlistEntryMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "This offer has expired.",
    });

    const res = await call("token_1");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This offer has expired." });
  });
});
