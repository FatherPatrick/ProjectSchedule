/**
 * One-time backfill: creates the initial Salon row from env config and
 * populates salonId on every existing tenant-owned row.
 *
 * Run once between the Phase 1a and Phase 1c migrations:
 *   npx tsx scripts/backfill-salon.ts
 *
 * Safe to re-run — it upserts the Salon by slug and uses UPDATE … WHERE
 * salonId IS NULL, so it won't overwrite rows already assigned to a salon.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// ── Salon seed values ────────────────────────────────────────────────────────
// Derived from the env vars that previously drove the single-tenant config.
// Override these before running if your local env differs.

const SALON_SLUG = (process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Virgo Nailz")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const SALON_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Virgo Nailz";
const SALON_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE ?? "America/Los_Angeles";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cuid(): string {
  // Simple random id that matches the Prisma cuid() shape well enough for seeding.
  return "c" + randomBytes(11).toString("hex");
}

async function run() {
  console.log(`Backfill: slug="${SALON_SLUG}", name="${SALON_NAME}"`);

  // 1. Upsert the initial Salon row using raw SQL (Prisma client may not have
  //    the new Salon type yet if the client hasn't been regenerated).
  const now = new Date().toISOString();
  const salonId = cuid();

  // Check if a salon with this slug already exists.
  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Salon" WHERE slug = $1 LIMIT 1`,
    SALON_SLUG
  );

  let resolvedSalonId: string;

  if (existing.length > 0) {
    resolvedSalonId = existing[0].id;
    console.log(`  Salon already exists (id=${resolvedSalonId}), skipping create.`);
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Salon" (id, slug, name, timezone, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5::timestamptz, $5::timestamptz)`,
      salonId,
      SALON_SLUG,
      SALON_NAME,
      SALON_TIMEZONE,
      now
    );
    resolvedSalonId = salonId;
    console.log(`  Created Salon id=${resolvedSalonId}`);
  }

  // 2. Backfill salonId on every tenant-owned table where it is still NULL.
  const tables = [
    "Service",
    "Client",
    "Appointment",
    "Blackout",
    "BusinessHours",
    "BusinessHoursSchedule",
    "Setting",
    "AdminPhone",
  ];

  for (const table of tables) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "salonId" = $1 WHERE "salonId" IS NULL`,
      resolvedSalonId
    );
    console.log(`  ${table}: updated ${result} rows`);
  }

  // Admin Users: only update rows with role = 'ADMIN' (CLIENT rows stay null).
  const adminResult = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "salonId" = $1 WHERE role = 'ADMIN' AND "salonId" IS NULL`,
    resolvedSalonId
  );
  console.log(`  User (ADMIN): updated ${adminResult} rows`);

  console.log("Backfill complete.");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
