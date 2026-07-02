/**
 * Covers stamp-card loyalty (docs/FEATURE_OPPORTUNITIES_SPEC.md #8 —
 * stamp-card-only, per the locked "Loyalty program scope" decision):
 * idempotent stamping, and crossing a stamp-count multiple earns a reward.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  loyaltyStamp: { create: vi.fn(), count: vi.fn() },
  loyaltyReward: { create: vi.fn(), count: vi.fn() },
}));
const getSettingsMock = vi.hoisted(() => vi.fn());
const sendLoyaltyRewardEarnedMock = vi.hoisted(() => vi.fn(async () => undefined));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/domain/settings", () => ({ getSettings: getSettingsMock }));
vi.mock("@/lib/integrations/notifications", () => ({
  sendLoyaltyRewardEarned: sendLoyaltyRewardEarnedMock,
}));
vi.mock("@/lib/observability/reportError", () => ({ reportError: reportErrorMock }));

import { awardLoyaltyStamp } from "@/lib/domain/loyalty";

const SALON_ID = "salon_1";
const CLIENT_ID = "client_1";
const APPT_ID = "appt_1";

const ENABLED_SETTINGS = {
  loyaltyEnabled: true,
  loyaltyStampsRequired: 10,
  loyaltyRewardDescription: "Free service",
};

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  prismaMock.loyaltyStamp.create.mockReset().mockResolvedValue({ id: "stamp_1" });
  prismaMock.loyaltyStamp.count.mockReset().mockResolvedValue(0);
  prismaMock.loyaltyReward.create.mockReset().mockResolvedValue({ id: "reward_1" });
  prismaMock.loyaltyReward.count.mockReset().mockResolvedValue(0);
  getSettingsMock.mockReset().mockResolvedValue(ENABLED_SETTINGS);
  sendLoyaltyRewardEarnedMock.mockClear();
  reportErrorMock.mockClear();
});

describe("awardLoyaltyStamp", () => {
  it("does nothing when the salon has loyalty turned off", async () => {
    getSettingsMock.mockResolvedValueOnce({ ...ENABLED_SETTINGS, loyaltyEnabled: false });

    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyStamp.create).not.toHaveBeenCalled();
  });

  it("creates a stamp for the appointment", async () => {
    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyStamp.create).toHaveBeenCalledWith({
      data: { salonId: SALON_ID, clientId: CLIENT_ID, appointmentId: APPT_ID },
    });
  });

  it("is idempotent — a duplicate appointmentId is a silent no-op", async () => {
    prismaMock.loyaltyStamp.create.mockRejectedValueOnce(uniqueConstraintError());

    await expect(awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID)).resolves.toBeUndefined();
    expect(prismaMock.loyaltyStamp.count).not.toHaveBeenCalled();
  });

  it("rethrows a non-duplicate database error", async () => {
    prismaMock.loyaltyStamp.create.mockRejectedValueOnce(new Error("db down"));

    await expect(awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID)).rejects.toThrow("db down");
  });

  it("does not create a reward before the stamp count crosses the threshold", async () => {
    prismaMock.loyaltyStamp.count.mockResolvedValueOnce(9); // just stamped #9 of 10
    prismaMock.loyaltyReward.count.mockResolvedValueOnce(0);

    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyReward.create).not.toHaveBeenCalled();
  });

  it("creates a reward and notifies the client on the 10th stamp", async () => {
    prismaMock.loyaltyStamp.count.mockResolvedValueOnce(10);
    prismaMock.loyaltyReward.count.mockResolvedValueOnce(0);

    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyReward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salonId: SALON_ID,
        clientId: CLIENT_ID,
        description: "Free service",
        expiresAt: expect.any(Date),
      }),
    });
    expect(sendLoyaltyRewardEarnedMock).toHaveBeenCalledWith("reward_1");
  });

  it("requires the NEXT multiple of stamps once a reward has already been earned", async () => {
    // Client already has 1 reward (10 stamps spent) and is at 15 total stamps
    // — needs 20, not another 10, to earn the second reward.
    prismaMock.loyaltyStamp.count.mockResolvedValueOnce(15);
    prismaMock.loyaltyReward.count.mockResolvedValueOnce(1);

    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyReward.create).not.toHaveBeenCalled();
  });

  it("earns a second reward once stamps reach double the threshold", async () => {
    prismaMock.loyaltyStamp.count.mockResolvedValueOnce(20);
    prismaMock.loyaltyReward.count.mockResolvedValueOnce(1);

    await awardLoyaltyStamp(SALON_ID, CLIENT_ID, APPT_ID);

    expect(prismaMock.loyaltyReward.create).toHaveBeenCalled();
  });
});
