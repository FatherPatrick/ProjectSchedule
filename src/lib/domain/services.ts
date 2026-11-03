import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { ServiceJsonCreate } from "@/lib/validation/adminJson";

async function getSingleActiveSalonId(): Promise<string> {
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

export async function createServiceForSingleSalon(
  input: ServiceJsonCreate
): Promise<string> {
  const salonId = await getSingleActiveSalonId();
  const id = `c${randomBytes(11).toString("hex")}`;

  const created = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Service" (
      id,
      "salonId",
      name,
      description,
      "durationMinutes",
      "priceCents",
      active,
      "sortOrder",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${salonId},
      ${input.name},
      ${input.description ?? null},
      ${input.durationMinutes},
      ${input.priceCents},
      ${input.active ?? true},
      ${input.sortOrder ?? 0},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `;

  if (!created[0]) throw new Error("Service creation returned no row.");
  return created[0].id;
}
