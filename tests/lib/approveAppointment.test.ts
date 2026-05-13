/**
 * Covers the Serializable-transaction wrapper around appointment approval:
 *   - happy path: the read + overlap check + update all run inside a single
 *     `prisma.$transaction(..., { isolationLevel: Serializable })` call,
 *     and a CONFIRMATION notification is fired exactly once.
 *   - the "appointment not found" / "not pending" / "overlap detected"
 *     short-circuits all return inside the transaction (no partial writes,
 *     no notification dispatch).
 *   - serialization conflicts (`P2034`) are retried; if a peer transaction
 *     wins the race the second attempt sees the new CONFIRMED row and
 *     returns 409 instead of corrupting state.
 *   - if every retry attempt aborts with `P2034` we surface a friendly 409
 *     and route the underlying error through `reportError`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const txnMock = vi.hoisted(() => vi.fn());
const sendNotificationsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: txnMock },
}));
vi.mock("@/lib/integrations/notifications", () => ({
  sendNotifications: sendNotificationsMock,
}));
vi.mock("@/lib/observability/reportError", () => ({
  reportError: reportErrorMock,
}));

import { approveAppointment } from "@/lib/domain/appointments";

interface ApptStub {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
}

/**
 * Build a fake `tx` client whose method returns are driven by the per-test
 * scenario. We model the three calls we expect inside the transaction:
 *   1. `appointment.findUnique` → the row being approved
 *   2. `appointment.findFirst`  → an overlapping CONFIRMED row, if any
 *   3. `appointment.update`     → resolves on success
 */
function makeTx(opts: {
  appt: ApptStub | null;
  conflict?: ApptStub | null;
}) {
  const findUnique = vi.fn().mockResolvedValue(opts.appt);
  const findFirst = vi.fn().mockResolvedValue(opts.conflict ?? null);
  const update = vi.fn().mockResolvedValue({ id: opts.appt?.id });
  return {
    tx: { appointment: { findUnique, findFirst, update } },
    findUnique,
    findFirst,
    update,
  };
}

beforeEach(() => {
  txnMock.mockReset();
  sendNotificationsMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("approveAppointment — Serializable transaction", () => {
  const pending: ApptStub = {
    id: "appt_1",
    status: "PENDING",
    startsAt: new Date("2026-06-01T15:00:00Z"),
    endsAt: new Date("2026-06-01T16:00:00Z"),
  };

  it("uses Serializable isolation and confirms when there is no overlap", async () => {
    const { tx, findUnique, findFirst, update } = makeTx({ appt: pending });
    txnMock.mockImplementationOnce(async (cb, options) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return cb(tx);
    });

    const out = await approveAppointment("appt_1");
    expect(out).toEqual({ ok: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "appt_1" } });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CONFIRMED" },
    });
    expect(sendNotificationsMock).toHaveBeenCalledWith("appt_1", "CONFIRMATION");
  });

  it("returns 404 without writing or notifying when the appointment is missing", async () => {
    const { tx, update } = makeTx({ appt: null });
    txnMock.mockImplementationOnce(async (cb) => cb(tx));

    const out = await approveAppointment("missing");
    expect(out).toEqual({ ok: false, status: 404, error: "Not found" });
    expect(update).not.toHaveBeenCalled();
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the appointment is no longer PENDING", async () => {
    const { tx, update } = makeTx({
      appt: { ...pending, status: "CONFIRMED" },
    });
    txnMock.mockImplementationOnce(async (cb) => cb(tx));

    const out = await approveAppointment("appt_1");
    expect(out.ok).toBe(false);
    expect((out as { status: number }).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns 409 when an overlapping CONFIRMED appointment exists", async () => {
    const conflict: ApptStub = {
      id: "appt_other",
      status: "CONFIRMED",
      startsAt: pending.startsAt,
      endsAt: pending.endsAt,
    };
    const { tx, update } = makeTx({ appt: pending, conflict });
    txnMock.mockImplementationOnce(async (cb) => cb(tx));

    const out = await approveAppointment("appt_1");
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toMatch(/overlaps/);
    expect(update).not.toHaveBeenCalled();
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("retries on P2034 serialization failures and succeeds on the second attempt", async () => {
    const p2034 = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict",
      { code: "P2034", clientVersion: "test" }
    );
    txnMock
      .mockRejectedValueOnce(p2034)
      .mockImplementationOnce(async (cb) => {
        const { tx } = makeTx({ appt: pending });
        return cb(tx);
      });

    const out = await approveAppointment("appt_1");
    expect(out).toEqual({ ok: true });
    expect(txnMock).toHaveBeenCalledTimes(2);
    expect(sendNotificationsMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("retries P2034 then sees the peer's CONFIRMED write and returns 409", async () => {
    const p2034 = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict",
      { code: "P2034", clientVersion: "test" }
    );
    txnMock
      .mockRejectedValueOnce(p2034)
      .mockImplementationOnce(async (cb) => {
        // Peer admin already promoted the row to CONFIRMED.
        const { tx } = makeTx({ appt: { ...pending, status: "CONFIRMED" } });
        return cb(tx);
      });

    const out = await approveAppointment("appt_1");
    expect(out.ok).toBe(false);
    expect((out as { status: number }).status).toBe(409);
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("gives up after the retry budget and reports the serialization error", async () => {
    const p2034 = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict",
      { code: "P2034", clientVersion: "test" }
    );
    txnMock.mockRejectedValue(p2034);

    const out = await approveAppointment("appt_1");
    expect(out.ok).toBe(false);
    expect((out as { status: number }).status).toBe(409);
    // 3 attempts total per APPROVE_MAX_ATTEMPTS.
    expect(txnMock).toHaveBeenCalledTimes(3);
    expect(reportErrorMock).toHaveBeenCalledWith(
      p2034,
      expect.objectContaining({
        where: "appointments.approve.txn",
        appointmentId: "appt_1",
      })
    );
    expect(sendNotificationsMock).not.toHaveBeenCalled();
  });

  it("does NOT retry on non-serialization errors", async () => {
    const otherErr = new Prisma.PrismaClientKnownRequestError("boom", {
      code: "P2002",
      clientVersion: "test",
    });
    txnMock.mockRejectedValueOnce(otherErr);

    const out = await approveAppointment("appt_1");
    expect(out.ok).toBe(false);
    expect(txnMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      otherErr,
      expect.objectContaining({ where: "appointments.approve.txn" })
    );
  });
});
