/**
 * Covers `POST /api/admin/appointments/[id]/complete`'s wiring to the
 * review-request and loyalty-stamp side effects. Both `sendReviewRequest`
 * and `awardLoyaltyStamp` are mocked — their own behavior is unit-tested
 * elsewhere (notifications don't have dedicated route tests; loyalty's is
 * in loyalty.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminEitherMock = vi.hoisted(() => vi.fn(async () => true));
const requireAdminSalonMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  appointment: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
const getSettingsMock = vi.hoisted(() => vi.fn());
const sendReviewRequestMock = vi.hoisted(() => vi.fn(async () => undefined));
const awardLoyaltyStampMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({
  requireAdminEither: requireAdminEitherMock,
  requireAdminSalon: requireAdminSalonMock,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/settings", () => ({ getSettings: getSettingsMock }));
vi.mock("@/lib/domain/loyalty", () => ({ awardLoyaltyStamp: awardLoyaltyStampMock }));
vi.mock("@/lib/integrations/notifications", () => ({ sendReviewRequest: sendReviewRequestMock }));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import { POST } from "@/app/api/admin/appointments/[id]/complete/route";

const SALON_ID = "salon_1";
const APPT_ID = "appt_1";
const CLIENT_ID = "client_1";

function call() {
  return POST(new Request(`http://localhost/api/admin/appointments/${APPT_ID}/complete`, { method: "POST" }), {
    params: Promise.resolve({ id: APPT_ID }),
  });
}

beforeEach(() => {
  requireAdminSalonMock.mockReset().mockResolvedValue({ salonId: SALON_ID });
  prismaMock.appointment.findFirst.mockReset().mockResolvedValue({
    id: APPT_ID,
    salonId: SALON_ID,
    clientId: CLIENT_ID,
    status: "CONFIRMED",
  });
  prismaMock.appointment.updateMany.mockReset().mockResolvedValue({ count: 1 });
  getSettingsMock.mockReset().mockResolvedValue({
    reviewRequestEnabled: false,
    reviewRequestUrl: null,
  });
  sendReviewRequestMock.mockClear();
  awardLoyaltyStampMock.mockClear();
  reportErrorMock.mockClear();
});

describe("POST /api/admin/appointments/[id]/complete", () => {
  it("422s when the appointment isn't CONFIRMED", async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({
      id: APPT_ID,
      salonId: SALON_ID,
      clientId: CLIENT_ID,
      status: "CANCELLED",
    });
    const res = await call();
    expect(res.status).toBe(422);
    expect(awardLoyaltyStampMock).not.toHaveBeenCalled();
  });

  it("awards a loyalty stamp for the client on success", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(awardLoyaltyStampMock).toHaveBeenCalledWith(SALON_ID, CLIENT_ID, APPT_ID);
  });

  it("reports (but doesn't fail the request) when awarding the stamp throws", async () => {
    awardLoyaltyStampMock.mockRejectedValueOnce(new Error("db hiccup"));
    const res = await call();
    expect(res.status).toBe(200);
    // Fire-and-forget: give the rejected promise's .catch a tick to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ where: "admin.appointments.complete.loyalty", appointmentId: APPT_ID })
    );
  });

  it("still sends the review request when enabled, alongside the stamp", async () => {
    getSettingsMock.mockResolvedValueOnce({
      reviewRequestEnabled: true,
      reviewRequestUrl: "https://g.page/r/review",
    });
    await call();
    expect(sendReviewRequestMock).toHaveBeenCalledWith(APPT_ID, "https://g.page/r/review");
    expect(awardLoyaltyStampMock).toHaveBeenCalledWith(SALON_ID, CLIENT_ID, APPT_ID);
  });
});
