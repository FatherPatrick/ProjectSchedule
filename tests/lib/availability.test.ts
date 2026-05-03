import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted; use vi.hoisted so the mock object exists at hoist time.
const prismaMock = vi.hoisted(() => ({
  service: { findUnique: vi.fn() },
  businessHoursSchedule: { findFirst: vi.fn() },
  businessHours: { findUnique: vi.fn() },
  appointment: { findMany: vi.fn() },
  blackout: { findMany: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/domain/settings", () => ({
  getSettings: vi.fn(async () => ({ slotGranularityMin: 30 })),
}));

import { getAvailableSlots } from "@/lib/domain/availability";

const SERVICE_ID = "svc_1";

function setupOpenDay(durationMinutes = 60) {
  prismaMock.service.findUnique.mockResolvedValue({
    id: SERVICE_ID,
    active: true,
    durationMinutes,
  });
  prismaMock.businessHoursSchedule.findFirst.mockResolvedValue(null);
  prismaMock.businessHours.findUnique.mockResolvedValue({
    dayOfWeek: 3,
    openMin: 9 * 60,
    closeMin: 17 * 60,
    active: true,
  });
  prismaMock.appointment.findMany.mockResolvedValue([]);
  prismaMock.blackout.findMany.mockResolvedValue([]);
}

describe("getAvailableSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Freeze "now" well before any test date so no slots get filtered as past.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("returns no slots when service is missing", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    expect(slots).toEqual([]);
  });

  it("returns no slots when service is inactive", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      active: false,
      durationMinutes: 60,
    });
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    expect(slots).toEqual([]);
  });

  it("returns no slots on a closed day", async () => {
    setupOpenDay();
    prismaMock.businessHours.findUnique.mockResolvedValue({
      dayOfWeek: 3,
      openMin: 0,
      closeMin: 0,
      active: false,
    });
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    expect(slots).toEqual([]);
  });

  it("generates slots at the configured granularity, ending at lastStart", async () => {
    setupOpenDay(60); // 60-min service, hours 9-17, 30-min granularity
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    // lastStart = 17*60 - 60 = 16*60 -> 9:00, 9:30, ... 16:00 -> 15 slots
    expect(slots).toHaveLength(15);
    expect(slots[0].label).toBe("9:00 AM");
    expect(slots[slots.length - 1].label).toBe("4:00 PM");
  });

  it("excludes slots that overlap a confirmed appointment", async () => {
    setupOpenDay(60);
    // Existing appointment 10:00-11:00 PDT (UTC 17:00-18:00)
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        startsAt: new Date("2026-07-15T17:00:00.000Z"),
        endsAt: new Date("2026-07-15T18:00:00.000Z"),
      },
    ]);
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    const labels = slots.map((s) => s.label);
    // 9:30 (overlaps), 10:00 (overlaps), 10:30 (overlaps) excluded; 9:00 and 11:00 OK.
    expect(labels).toContain("9:00 AM");
    expect(labels).not.toContain("9:30 AM");
    expect(labels).not.toContain("10:00 AM");
    expect(labels).not.toContain("10:30 AM");
    expect(labels).toContain("11:00 AM");
  });

  it("excludes slots that overlap a blackout", async () => {
    setupOpenDay(60);
    prismaMock.blackout.findMany.mockResolvedValue([
      {
        startsAt: new Date("2026-07-15T19:00:00.000Z"), // 12:00 PDT
        endsAt: new Date("2026-07-15T20:00:00.000Z"), // 13:00 PDT
      },
    ]);
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("12:00 PM");
    expect(labels).not.toContain("11:30 AM");
    expect(labels).toContain("1:00 PM");
  });

  it("filters out past slots relative to now", async () => {
    setupOpenDay(60);
    // Set "now" to 2026-07-15 11:00 PDT (18:00 UTC)
    vi.setSystemTime(new Date("2026-07-15T18:00:00.000Z"));
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("9:00 AM");
    expect(labels).not.toContain("11:00 AM");
    expect(labels).toContain("11:30 AM");
  });

  it("prefers schedule overrides over base business hours", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      active: true,
      durationMinutes: 60,
    });
    prismaMock.businessHoursSchedule.findFirst.mockResolvedValue({
      dayOfWeek: 3,
      openMin: 12 * 60,
      closeMin: 14 * 60,
      active: true,
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    });
    prismaMock.businessHours.findUnique.mockResolvedValue({
      dayOfWeek: 3,
      openMin: 9 * 60,
      closeMin: 17 * 60,
      active: true,
    });
    prismaMock.appointment.findMany.mockResolvedValue([]);
    prismaMock.blackout.findMany.mockResolvedValue([]);
    const slots = await getAvailableSlots({
      serviceId: SERVICE_ID,
      dateKey: "2026-07-15",
    });
    // Override 12-14 with 60-min service & 30-min granularity -> 12:00, 12:30, 13:00
    expect(slots.map((s) => s.label)).toEqual([
      "12:00 PM",
      "12:30 PM",
      "1:00 PM",
    ]);
  });
});
