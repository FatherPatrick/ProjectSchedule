import { prisma } from "../db/prisma";

/**
 * Look up an existing client id by email (case-insensitive) within a salon.
 * Returns `null` if no client in that salon has booked with that address before.
 *
 * Used as the lightweight "do we already know this person?" check that
 * powers the upsert-by-email pattern in the booking endpoints.
 */
export async function findClientIdByEmail(
  salonId: string,
  email: string
): Promise<string | null> {
  const c = await prisma.client.findFirst({
    where: { salonId, email: email.toLowerCase() },
    select: { id: true },
  });
  return c?.id ?? null;
}
