-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "maxAdvanceDays" INTEGER;

-- Backfill existing settings row(s) to the default 1-month (30 day) window.
-- New installs get this default via getSettings() at create time; this covers
-- rows that already existed before the column was added (which would otherwise
-- read as NULL = "no limit"). A NULL set later via the UI still means no limit.
UPDATE "Setting" SET "maxAdvanceDays" = 30 WHERE "maxAdvanceDays" IS NULL;
