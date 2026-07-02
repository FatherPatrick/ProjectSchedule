/**
 * Covers the multi-service booking helpers (docs/FEATURE_OPPORTUNITIES_SPEC.md
 * #6): validating/resolving add-on services, the duration/price totals used
 * to size the booking window and the Stripe charge, and the transactional
 * appointment+add-ons create.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  service: { findMany: vi.fn() },
  appointment: { create: vi.fn() },
  appointmentAddOn: { createMany: vi.fn() },
  clientPackage: { update: vi.fn() },
  $transaction: vi.fn(),
}));
prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  createAppointmentWithAddOns,
  resolveAddOnServices,
  totalDurationMinutes,
  totalPriceCents,
} from "@/lib/domain/appointmentServices";

const SALON_ID = "salon_1";
const PRIMARY_ID = "svc_primary";

beforeEach(() => {
  prismaMock.service.findMany.mockReset();
  prismaMock.appointment.create.mockReset().mockResolvedValue({ id: "appt_1" });
  prismaMock.appointmentAddOn.createMany.mockReset();
  prismaMock.clientPackage.update.mockReset();
  prismaMock.$transaction.mockClear();
});

describe("resolveAddOnServices", () => {
  it("returns an empty array when no add-ons are requested", async () => {
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, undefined);
    expect(result).toEqual([]);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty array for an explicitly empty list", async () => {
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, []);
    expect(result).toEqual([]);
  });

  it("rejects more than the max allowed add-ons", async () => {
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(result).toBeNull();
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids", async () => {
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, ["svc_a", "svc_a"]);
    expect(result).toBeNull();
  });

  it("rejects the primary service id repeated as an add-on", async () => {
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, [PRIMARY_ID]);
    expect(result).toBeNull();
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("rejects when a requested id doesn't resolve (inactive, wrong salon, or missing)", async () => {
    prismaMock.service.findMany.mockResolvedValueOnce([
      { id: "svc_a", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
    ]);
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, ["svc_a", "svc_b"]);
    expect(result).toBeNull();
  });

  it("scopes the lookup to this salon's active services", async () => {
    prismaMock.service.findMany.mockResolvedValueOnce([
      { id: "svc_a", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
    ]);
    await resolveAddOnServices(SALON_ID, PRIMARY_ID, ["svc_a"]);
    expect(prismaMock.service.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["svc_a"] }, salonId: SALON_ID, active: true },
      select: { id: true, name: true, durationMinutes: true, priceCents: true },
    });
  });

  it("returns the resolved services on success", async () => {
    const services = [
      { id: "svc_a", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
      { id: "svc_b", name: "Nail Art", durationMinutes: 15, priceCents: 1000 },
    ];
    prismaMock.service.findMany.mockResolvedValueOnce(services);
    const result = await resolveAddOnServices(SALON_ID, PRIMARY_ID, ["svc_a", "svc_b"]);
    expect(result).toEqual(services);
  });
});

describe("totalDurationMinutes / totalPriceCents", () => {
  const primary = { durationMinutes: 60, priceCents: 5000 };
  const addOns = [
    { id: "a", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
    { id: "b", name: "Nail Art", durationMinutes: 15, priceCents: 1000 },
  ];

  it("sums the primary service plus every add-on", () => {
    expect(totalDurationMinutes(primary, addOns)).toBe(105);
    expect(totalPriceCents(primary, addOns)).toBe(9000);
  });

  it("returns just the primary's own numbers with no add-ons", () => {
    expect(totalDurationMinutes(primary, [])).toBe(60);
    expect(totalPriceCents(primary, [])).toBe(5000);
  });
});

describe("createAppointmentWithAddOns", () => {
  it("creates the appointment and skips appointmentAddOn.createMany with no add-ons", async () => {
    const appt = await createAppointmentWithAddOns({ salonId: SALON_ID } as never, []);
    expect(appt).toEqual({ id: "appt_1" });
    expect(prismaMock.appointment.create).toHaveBeenCalledWith({
      data: { salonId: SALON_ID },
    });
    expect(prismaMock.appointmentAddOn.createMany).not.toHaveBeenCalled();
  });

  it("creates AppointmentAddOn rows in sortOrder for each add-on", async () => {
    const addOns = [
      { id: "svc_a", name: "Pedicure", durationMinutes: 30, priceCents: 3000 },
      { id: "svc_b", name: "Nail Art", durationMinutes: 15, priceCents: 1000 },
    ];
    await createAppointmentWithAddOns({ salonId: SALON_ID } as never, addOns);

    expect(prismaMock.appointmentAddOn.createMany).toHaveBeenCalledWith({
      data: [
        { appointmentId: "appt_1", serviceId: "svc_a", sortOrder: 0 },
        { appointmentId: "appt_1", serviceId: "svc_b", sortOrder: 1 },
      ],
    });
  });

  it("runs the create + add-on insert inside a single transaction", async () => {
    await createAppointmentWithAddOns({ salonId: SALON_ID } as never, []);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not touch clientPackage when no package is being redeemed", async () => {
    await createAppointmentWithAddOns({ salonId: SALON_ID } as never, []);
    expect(prismaMock.clientPackage.update).not.toHaveBeenCalled();
  });

  it("draws down the redeemed package's session count in the same transaction", async () => {
    await createAppointmentWithAddOns({ salonId: SALON_ID } as never, [], "cp_1");
    expect(prismaMock.clientPackage.update).toHaveBeenCalledWith({
      where: { id: "cp_1" },
      data: { sessionsUsed: { increment: 1 } },
    });
  });
});
