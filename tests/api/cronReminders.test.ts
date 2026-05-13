/**
 * Integration tests for the hourly cron at GET /api/cron/reminders.
 * Covers:
 *   - 401 when CRON_SECRET is unset
 *   - 401 when the Authorization header is missing or wrong
 *   - 200 with `{ checked: 0, sent: 0 }` when nothing is due
 *   - happy path: every due appointment gets a notification dispatched
 *     (in parallel) and a single `updateMany` marks them all reminded
 *   - notification failures are reported via reportError but do NOT mark
 *     the appointment as reminded (next cron tick retries)
 *   - the lookup window query filters by status, reminderSentAt, and
 *     a 26-hour startsAt window
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));
const sendNotificationsMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/notifications", () => ({
  sendNotifications: sendNotificationsMock,
}));
vi.mock("@/lib/observability/reportError", () => ({
  reportError: reportErrorMock,
}));

import { GET } from "@/app/api/cron/reminders/route";

function call(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return GET(
    new Request("http://localhost/api/cron/reminders", { headers })
  );
}

beforeEach(() => {
  prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);
  prismaMock.appointment.updateMany.mockReset().mockResolvedValue({ count: 0 });
  sendNotificationsMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset();
  process.env.CRON_SECRET = "secret-x";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/reminders — auth", () => {
  it("401s when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await call("Bearer anything");
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
  });

  it("401s when the Authorization header is missing", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
  });

  it("401s when the bearer token does not match", async () => {
    const res = await call("Bearer wrong");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/reminders — happy path", () => {
  it("returns checked=0 sent=0 when no appointments are due", async () => {
    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 0, sent: 0 });
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("queries CONFIRMED appointments with reminderSentAt:null in a ~26h window", async () => {
    await call("Bearer secret-x");
    expect(prismaMock.appointment.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.appointment.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("CONFIRMED");
    expect(arg.where.reminderSentAt).toBeNull();
    expect(arg.where.startsAt).toEqual(
      expect.objectContaining({
        gte: expect.any(Date),
        lte: expect.any(Date),
      })
    );
    const span =
      arg.where.startsAt.lte.getTime() - arg.where.startsAt.gte.getTime();
    // 26 hours wide.
    expect(span).toBe(26 * 60 * 60 * 1000);
    // We only need ids to dispatch notifications.
    expect(arg.select).toEqual({ id: true });
  });

  it("dispatches a reminder + marks each due appointment as reminded", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 3 });

    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, sent: 3 });

    expect(sendNotificationsMock).toHaveBeenCalledTimes(3);
    expect(sendNotificationsMock).toHaveBeenCalledWith("a", "REMINDER_24H");
    expect(sendNotificationsMock).toHaveBeenCalledWith("b", "REMINDER_24H");
    expect(sendNotificationsMock).toHaveBeenCalledWith("c", "REMINDER_24H");
    // One bulk DB write instead of N round-trips.
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b", "c"] } },
      data: { reminderSentAt: expect.any(Date) },
    });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("fans the sends out in parallel rather than serially", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    // Capture the in-flight count to prove they overlap.
    let inFlight = 0;
    let maxInFlight = 0;
    sendNotificationsMock.mockImplementation(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    await call("Bearer secret-x");
    expect(maxInFlight).toBe(3);
  });
});

describe("GET /api/cron/reminders — failure handling", () => {
  it("reports failed sends and only marks the successful ones", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: "ok-1" },
      { id: "fails" },
      { id: "ok-2" },
    ]);
    const boom = new Error("twilio down");
    sendNotificationsMock.mockImplementation(async (id: string) => {
      if (id === "fails") throw boom;
    });
    prismaMock.appointment.updateMany.mockResolvedValueOnce({ count: 2 });

    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, sent: 2 });

    // Single bulk update covering only the healthy ids — the failing
    // one is excluded so the next cron tick will retry it.
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["ok-1", "ok-2"] } },
      data: { reminderSentAt: expect.any(Date) },
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        where: "cron.reminders.send",
        appointmentId: "fails",
      })
    );
  });

  it("skips updateMany entirely when every send fails", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([{ id: "x" }]);
    sendNotificationsMock.mockRejectedValueOnce(new Error("down"));

    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, sent: 0 });
    expect(prismaMock.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("reports a Prisma updateMany failure and reports sent=0 (next tick retries)", async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([{ id: "x" }]);
    const dbErr = new Error("connection lost");
    prismaMock.appointment.updateMany.mockRejectedValueOnce(dbErr);

    const res = await call("Bearer secret-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, sent: 0 });
    expect(reportErrorMock).toHaveBeenCalledWith(
      dbErr,
      expect.objectContaining({
        where: "cron.reminders.mark",
        appointmentIds: ["x"],
      })
    );
  });
});
