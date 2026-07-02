import { prisma } from "../db/prisma";

export interface RedeemablePackage {
  id: string;
  sessionsUsed: number;
  sessionsTotal: number;
}

/**
 * The client's oldest prepaid package with a session left for this service
 * (docs/FEATURE_OPPORTUNITIES_SPEC.md #7 — "each booking deducts from their
 * balance"). Oldest-first so a client with multiple packages for the same
 * service burns down the one closest to expiring interest first.
 */
export async function findRedeemablePackage(
  salonId: string,
  clientId: string,
  serviceId: string
): Promise<RedeemablePackage | null> {
  const candidates = await prisma.clientPackage.findMany({
    where: {
      salonId,
      clientId,
      package: { serviceId },
    },
    select: { id: true, sessionsUsed: true, sessionsTotal: true },
    orderBy: { purchasedAt: "asc" },
  });
  return candidates.find((p) => p.sessionsUsed < p.sessionsTotal) ?? null;
}

/** Give a session back to a package after a refund-eligible cancellation. */
export async function refundPackageSession(clientPackageId: string): Promise<void> {
  await prisma.clientPackage.update({
    where: { id: clientPackageId },
    data: { sessionsUsed: { decrement: 1 } },
  });
}
