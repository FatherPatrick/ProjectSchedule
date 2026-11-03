import { prisma } from "@/lib/db/prisma";

export async function getSingleActiveSalonId(): Promise<string> {
  const salons = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Salon" WHERE status = 'ACTIVE' LIMIT 2
  `;

  if (salons.length !== 1) {
    throw new Error(
      salons.length === 0
        ? "No active salon is configured."
        : "Expected exactly one active salon."
    );
  }

  return salons[0].id;
}