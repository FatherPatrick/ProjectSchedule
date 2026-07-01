-- Phase 4: AdminPhone — make salonId non-nullable and switch from a
-- single-column PK (phone) to a composite PK (salonId, phone).
--
-- Prerequisite: the Phase 1 backfill script has already populated salonId
-- on every AdminPhone row (the column was added as nullable TEXT in Phase 1a).
-- Running this migration against rows that still have NULL salonId will fail.

-- 1. Drop the old SET NULL FK so we can add CASCADE
ALTER TABLE "AdminPhone" DROP CONSTRAINT "AdminPhone_salonId_fkey";

-- 2. Enforce non-null now that every row has a salonId
ALTER TABLE "AdminPhone" ALTER COLUMN "salonId" SET NOT NULL;

-- 3. Drop the single-column phone PK
ALTER TABLE "AdminPhone" DROP CONSTRAINT "AdminPhone_pkey";

-- 4. Composite PK replaces it
ALTER TABLE "AdminPhone" ADD CONSTRAINT "AdminPhone_pkey" PRIMARY KEY ("salonId", "phone");

-- 5. The standalone salonId index is now redundant (leading column of the PK)
DROP INDEX IF EXISTS "AdminPhone_salonId_idx";

-- 6. Re-add the FK with CASCADE so a salon deletion cleans up its admin phones
ALTER TABLE "AdminPhone" ADD CONSTRAINT "AdminPhone_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
