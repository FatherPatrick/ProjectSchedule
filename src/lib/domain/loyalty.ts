import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getSettings } from "./settings";
import { sendLoyaltyRewardEarned } from "../integrations/notifications";
import { reportError } from "../observability/reportError";

/** How long a client has to redeem an earned reward before it lapses. */
const REWARD_EXPIRY_DAYS = 90;

/**
 * Award a stamp for a COMPLETED appointment (docs/FEATURE_OPPORTUNITIES_SPEC.md
 * #8 — stamp-card-only, per the locked "Loyalty program scope" decision).
 * Idempotent: `appointmentId` is unique on `LoyaltyStamp`, so re-completing
 * (or a retried request) can never double-stamp. When the client's total
 * stamp count crosses another multiple of `loyaltyStampsRequired`, they earn
 * a new `LoyaltyReward` and are notified.
 *
 * No stamp-to-reward link is tracked — eligibility is just "total stamps vs.
 * total rewards ever earned", matching the spec's flatter schema.
 */
export async function awardLoyaltyStamp(
  salonId: string,
  clientId: string,
  appointmentId: string
): Promise<void> {
  const settings = await getSettings(salonId);
  if (!settings.loyaltyEnabled) return;

  try {
    await prisma.loyaltyStamp.create({ data: { salonId, clientId, appointmentId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return; // already stamped
    }
    throw err;
  }

  const [stampCount, rewardCount] = await Promise.all([
    prisma.loyaltyStamp.count({ where: { salonId, clientId } }),
    prisma.loyaltyReward.count({ where: { salonId, clientId } }),
  ]);
  if (stampCount < (rewardCount + 1) * settings.loyaltyStampsRequired) return;

  const reward = await prisma.loyaltyReward.create({
    data: {
      salonId,
      clientId,
      description: settings.loyaltyRewardDescription,
      expiresAt: new Date(Date.now() + REWARD_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  sendLoyaltyRewardEarned(reward.id).catch((err) =>
    reportError(err, { where: "loyalty.rewardEarned.notify", rewardId: reward.id })
  );
}
