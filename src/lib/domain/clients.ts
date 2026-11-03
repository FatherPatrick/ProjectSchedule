import { randomBytes } from "crypto";
import { prisma } from "../db/prisma";

/**
 * Look up an existing client id by email (case-insensitive). Returns `null`
 * if no client has booked with that address before.
 *
 * Used as the lightweight "do we already know this person?" check that
 * powers the upsert-by-email pattern in the booking endpoints.
 */
export async function findClientIdByEmail(
  salonId: string,
  email: string
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "Client"
    WHERE "salonId" = ${salonId} AND LOWER(email) = ${email.toLowerCase()}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function findClientIdById(
  salonId: string,
  clientId: string
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "Client"
    WHERE "salonId" = ${salonId} AND id = ${clientId}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function upsertClientForSalon(input: {
  salonId: string;
  existingId: string | null;
  name: string;
  email: string;
  phone: string;
  smsOptIn: boolean;
  emailOptIn: boolean;
}): Promise<{ id: string }> {
  const id = input.existingId ?? `c${randomBytes(11).toString("hex")}`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Client" (
      id,
      "salonId",
      name,
      email,
      phone,
      "smsOptIn",
      "emailOptIn",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.salonId},
      ${input.name},
      ${input.email},
      ${input.phone},
      ${input.smsOptIn},
      ${input.emailOptIn},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      "smsOptIn" = EXCLUDED."smsOptIn",
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING id
  `;
  if (!rows[0]) throw new Error("Client upsert returned no row.");
  return rows[0];
}
