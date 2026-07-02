/**
 * Covers the waitlist domain logic (docs/FEATURE_OPPORTUNITIES_SPEC.md #5):
 * simple FCFS join/notify/claim, plus the daily sweep that expires stale
 * entries and passes still-open slots to the next person in line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  waitlist: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  appointment: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));
const getSettingsMock = vi.hoisted(() => vi.fn());
const sendNotificationsMock = vi.hoisted(() => vi.fn(async () => undefined));
const sendWaitlistOfferMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/settings", () => ({ getSettings: getSettingsMock }));
vi.mock("@/lib/integrations/notifications", () => ({
  sendNotifications: sendNotificationsMock,
  sendWaitlistOffer: sendWaitlistOfferMock,
}));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import {
  claimWaitlistEntry,
  joinWaitlist,
  notifyWaitlistOfOpening,
  sweepWaitlist,
} from "@/lib/domain/waitlist";

const SALON_ID = "salon_1";
const SERVICE_ID = "svc_1";
const CLIENT_ID = "client_1";

const ENABLED_SETTINGS = { waitlistEnabled: true, waitlistClaimWindowMinutes: 30 };
const DISABLED_SETTINGS = { waitlistEnabled: false, waitlistClaimWindowMinutes: 30 };

beforeEach(() => {
  prismaMock.waitlist.findFirst.mockReset();
  prismaMock.waitlist.findUnique.mockReset();
  prismaMock.waitlist.create.mockReset();
  prismaMock.waitlist.update.mockReset().mockResolvedValue({});
  prismaMock.waitlist.updateMany.mockReset().mockResolvedValue({ count: 0 });
  prismaMock.waitlist.findMany.mockReset().mockResolvedValue([]);
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.appointment.create.mockReset();
  getSettingsMock.mockReset().mockResolvedValue(ENABLED_SETTINGS);
  sendNotificationsMock.mockClear();
  sendWaitlistOfferMock.mockClear();
  reportErrorMock.mockClear();
});

describe("joinWaitlist", () => {
  it("creates a new WAITING entry for a first-time request", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValueOnce(null);
    prismaMock.waitlist.create.mockResolvedValueOnce({ id: "wl_1" });

    const result = await joinWaitlist(SALON_ID, SERVICE_ID, CLIENT_ID);

    expect(result).toEqual({ id: "wl_1", alreadyOnList: false });
    expect(prismaMock.waitlist.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        clientId: CLIENT_ID,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("does not create a second entry for a client already WAITING/NOTIFIED", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValueOnce({ id: "wl_existing" });

    const result = await joinWaitlist(SALON_ID, SERVICE_ID, CLIENT_ID);

    expect(result).toEqual({ id: "wl_existing", alreadyOnList: true });
    expect(prismaMock.waitlist.create).not.toHaveBeenCalled();
  });
});

describe("notifyWaitlistOfOpening", () => {
  const startsAt = new Date("2099-01-01T15:00:00.000Z");
  const endsAt = new Date("2099-01-01T16:00:00.000Z");

  it("does nothing when the salon has the waitlist turned off", async () => {
    getSettingsMock.mockResolvedValueOnce(DISABLED_SETTINGS);

    const notified = await notifyWaitlistOfOpening(SALON_ID, SERVICE_ID, startsAt, endsAt);

    expect(notified).toBe(false);
    expect(prismaMock.waitlist.findFirst).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is waiting", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValueOnce(null);

    const notified = await notifyWaitlistOfOpening(SALON_ID, SERVICE_ID, startsAt, endsAt);

    expect(notified).toBe(false);
    expect(prismaMock.waitlist.update).not.toHaveBeenCalled();
  });

  it("notifies the oldest WAITING entry with the offered slot", async () => {
    prismaMock.waitlist.findFirst.mockResolvedValueOnce({ id: "wl_1" });

    const notified = await notifyWaitlistOfOpening(SALON_ID, SERVICE_ID, startsAt, endsAt);

    expect(notified).toBe(true);
    expect(prismaMock.waitlist.findFirst).toHaveBeenCalledWith({
      where: { salonId: SALON_ID, serviceId: SERVICE_ID, status: "WAITING" },
      orderBy: { requestedAt: "asc" },
    });
    expect(prismaMock.waitlist.update).toHaveBeenCalledWith({
      where: { id: "wl_1" },
      data: expect.objectContaining({
        status: "NOTIFIED",
        offeredStartsAt: startsAt,
        offeredEndsAt: endsAt,
      }),
    });
    expect(sendWaitlistOfferMock).toHaveBeenCalledWith("wl_1");
  });
});

describe("claimWaitlistEntry", () => {
  const startsAt = new Date("2099-01-01T15:00:00.000Z");
  const endsAt = new Date("2099-01-01T16:00:00.000Z");

  function notifiedEntry(overrides: Record<string, unknown> = {}) {
    return {
      id: "wl_1",
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      clientId: CLIENT_ID,
      status: "NOTIFIED",
      offeredStartsAt: startsAt,
      offeredEndsAt: endsAt,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      service: { name: "Gel Manicure" },
      salon: { timezone: "America/Los_Angeles" },
      ...overrides,
    };
  }

  it("404s when the token doesn't match any entry", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValueOnce(null);
    const result = await claimWaitlistEntry("bad-token");
    expect(result).toEqual({ ok: false, status: 404, error: "Not found." });
  });

  it("rejects a claim on an entry that isn't an active NOTIFIED offer", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValueOnce(notifiedEntry({ status: "WAITING", offeredStartsAt: null, offeredEndsAt: null }));
    const result = await claimWaitlistEntry("token");
    expect(result.ok).toBe(false);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("rejects a claim past its expiry window", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValueOnce(
      notifiedEntry({ expiresAt: new Date(Date.now() - 1000) })
    );
    const result = await claimWaitlistEntry("token");
    expect(result).toEqual({ ok: false, status: 409, error: "This offer has expired." });
  });

  it("books the offered slot and marks the entry CLAIMED", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValueOnce(notifiedEntry());
    prismaMock.appointment.findFirst.mockResolvedValueOnce(null); // slot still free
    prismaMock.appointment.create.mockResolvedValueOnce({
      id: "appt_1",
      managementToken: "tok_abc",
    });

    const result = await claimWaitlistEntry("token");

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      managementToken: "tok_abc",
      serviceName: "Gel Manicure",
      whenLabel: expect.any(String),
    });
    expect(prismaMock.appointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        clientId: CLIENT_ID,
        startsAt,
        endsAt,
      }),
    });
    expect(prismaMock.waitlist.update).toHaveBeenCalledWith({
      where: { id: "wl_1" },
      data: expect.objectContaining({ status: "CLAIMED" }),
    });
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_1", "CONFIRMATION");
  });

  it("re-queues (not expires) the entry when the slot was already taken", async () => {
    prismaMock.waitlist.findUnique.mockResolvedValueOnce(notifiedEntry());
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: "someone_else" }); // conflict

    const result = await claimWaitlistEntry("token");

    expect(result.ok).toBe(false);
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
    expect(prismaMock.waitlist.update).toHaveBeenCalledWith({
      where: { id: "wl_1" },
      data: expect.objectContaining({
        status: "WAITING",
        offeredStartsAt: null,
        offeredEndsAt: null,
      }),
    });
  });
});

describe("sweepWaitlist", () => {
  it("expires stale WAITING entries that were never notified", async () => {
    prismaMock.waitlist.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await sweepWaitlist();

    expect(prismaMock.waitlist.updateMany).toHaveBeenCalledWith({
      where: { status: "WAITING", expiresAt: { lt: expect.any(Date) } },
      data: { status: "EXPIRED" },
    });
    expect(result.expiredWaiting).toBe(3);
  });

  it("expires a lapsed NOTIFIED offer and passes the still-open slot to the next entry", async () => {
    const offeredStartsAt = new Date("2099-02-01T15:00:00.000Z");
    const offeredEndsAt = new Date("2099-02-01T16:00:00.000Z");
    prismaMock.waitlist.findMany.mockResolvedValueOnce([
      {
        id: "wl_expired",
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        offeredStartsAt,
        offeredEndsAt,
      },
    ]);
    // First appointment.findFirst call: slotIsTaken check inside the sweep (free).
    // Second: slotIsTaken check inside notifyWaitlistOfOpening's caller chain — same query, still free.
    prismaMock.appointment.findFirst.mockResolvedValue(null);
    prismaMock.waitlist.findFirst.mockResolvedValueOnce({ id: "wl_next" });

    const result = await sweepWaitlist();

    expect(prismaMock.waitlist.update).toHaveBeenCalledWith({
      where: { id: "wl_expired" },
      data: { status: "EXPIRED" },
    });
    expect(prismaMock.waitlist.update).toHaveBeenCalledWith({
      where: { id: "wl_next" },
      data: expect.objectContaining({ status: "NOTIFIED" }),
    });
    expect(result.expiredNotified).toBe(1);
    expect(result.reNotified).toBe(1);
  });

  it("does not re-notify when the offered slot was booked through the normal flow", async () => {
    prismaMock.waitlist.findMany.mockResolvedValueOnce([
      {
        id: "wl_expired",
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        offeredStartsAt: new Date("2099-02-01T15:00:00.000Z"),
        offeredEndsAt: new Date("2099-02-01T16:00:00.000Z"),
      },
    ]);
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: "taken_by_someone_else" });

    const result = await sweepWaitlist();

    expect(prismaMock.waitlist.findFirst).not.toHaveBeenCalled();
    expect(result.reNotified).toBe(0);
  });
});
