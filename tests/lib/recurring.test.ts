/**
 * Covers admin-only recurring bookings (docs/FEATURE_OPPORTUNITIES_SPEC.md
 * #9): next-occurrence math for the three simplified cadences, and batch
 * series creation where the first occurrence conflicting is a hard failure
 * but a later one is skipped without shifting the rest of the cadence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { createRecurringSeries, nextOccurrenceStart } from "@/lib/domain/recurring";

const SALON_ID = "salon_1";
const SERVICE_ID = "svc_1";
const CLIENT_ID = "client_1";

describe("nextOccurrenceStart", () => {
  const base = new Date("2026-01-01T15:00:00.000Z");

  it("adds 7 days for WEEKLY", () => {
    expect(nextOccurrenceStart(base, "WEEKLY").toISOString()).toBe(
      "2026-01-08T15:00:00.000Z"
    );
  });

  it("adds 14 days for BIWEEKLY", () => {
    expect(nextOccurrenceStart(base, "BIWEEKLY").toISOString()).toBe(
      "2026-01-15T15:00:00.000Z"
    );
  });

  it("adds a calendar month for MONTHLY", () => {
    expect(nextOccurrenceStart(base, "MONTHLY").toISOString()).toBe(
      "2026-02-01T15:00:00.000Z"
    );
  });
});

describe("createRecurringSeries", () => {
  const firstStartsAt = new Date("2026-01-06T15:00:00.000Z"); // a Tuesday

  beforeEach(() => {
    prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null); // free by default
    prismaMock.appointment.create.mockReset();
    let n = 0;
    prismaMock.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `appt_${++n}`,
      managementToken: `tok_${n}`,
      ...data,
    }));
  });

  it("fails outright when the first occurrence's slot is already taken", async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: "existing" });

    const result = await createRecurringSeries({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      clientId: CLIENT_ID,
      firstStartsAt,
      durationMinutes: 60,
      rule: "WEEKLY",
      occurrences: 4,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "That time overlaps an existing confirmed appointment.",
    });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("books every occurrence when nothing conflicts", async () => {
    const result = await createRecurringSeries({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      clientId: CLIENT_ID,
      firstStartsAt,
      durationMinutes: 60,
      rule: "WEEKLY",
      occurrences: 4,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.createdCount).toBe(4);
    expect(result.skippedDates).toEqual([]);
    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(4);
  });

  it("sets recurrenceRule only on the first appointment, parentAppointmentId on the rest", async () => {
    await createRecurringSeries({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      clientId: CLIENT_ID,
      firstStartsAt,
      durationMinutes: 60,
      rule: "WEEKLY",
      occurrences: 3,
    });

    const calls = prismaMock.appointment.create.mock.calls as { data: Record<string, unknown> }[][];
    expect(calls[0][0].data).toMatchObject({ recurrenceRule: "WEEKLY" });
    expect(calls[0][0].data.parentAppointmentId).toBeUndefined();
    expect(calls[1][0].data).toMatchObject({ parentAppointmentId: "appt_1" });
    expect(calls[2][0].data).toMatchObject({ parentAppointmentId: "appt_1" });
  });

  it("skips a conflicting later occurrence without shifting the rest of the cadence", async () => {
    // First occurrence free; second (Jan 13) conflicts; third (Jan 20) free again.
    prismaMock.appointment.findFirst
      .mockResolvedValueOnce(null) // occurrence 1 (the hard pre-check)
      .mockResolvedValueOnce({ id: "conflict" }) // occurrence 2
      .mockResolvedValueOnce(null); // occurrence 3

    const result = await createRecurringSeries({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      clientId: CLIENT_ID,
      firstStartsAt,
      durationMinutes: 60,
      rule: "WEEKLY",
      occurrences: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.createdCount).toBe(2); // first + third; second skipped
    expect(result.skippedDates).toEqual([new Date("2026-01-13T15:00:00.000Z")]);

    // Only 2 appointment.create calls (first + third), and the third still
    // lands on Jan 20 — the cadence wasn't shifted to compensate for the skip.
    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(2);
    const calls = prismaMock.appointment.create.mock.calls as { data: Record<string, unknown> }[][];
    expect(calls[1][0].data.startsAt).toEqual(new Date("2026-01-20T15:00:00.000Z"));
  });
});
