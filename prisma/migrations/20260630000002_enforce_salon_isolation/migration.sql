-- Phase 1c: Enforce salon isolation on the pure-data models.
-- Run AFTER the backfill script has populated salonId on all existing rows.
-- User, Setting, and AdminPhone stay nullable until Phases 2/4 update their code.

-- DropForeignKey (will be re-added as CASCADE below)
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_salonId_fkey";
ALTER TABLE "Blackout" DROP CONSTRAINT "Blackout_salonId_fkey";
ALTER TABLE "BusinessHours" DROP CONSTRAINT "BusinessHours_salonId_fkey";
ALTER TABLE "BusinessHoursSchedule" DROP CONSTRAINT "BusinessHoursSchedule_salonId_fkey";
ALTER TABLE "Client" DROP CONSTRAINT "Client_salonId_fkey";
ALTER TABLE "Service" DROP CONSTRAINT "Service_salonId_fkey";

-- DropIndex (old global / non-salon-scoped indexes)
DROP INDEX "Appointment_startsAt_idx";
DROP INDEX "Appointment_status_reminderSentAt_startsAt_idx";
DROP INDEX "Appointment_status_startsAt_idx";
DROP INDEX "Blackout_salonId_idx";
DROP INDEX "Blackout_startsAt_endsAt_idx";
DROP INDEX "BusinessHours_dayOfWeek_key";
DROP INDEX "BusinessHours_salonId_idx";
DROP INDEX "BusinessHoursSchedule_effectiveFrom_dayOfWeek_key";
DROP INDEX "BusinessHoursSchedule_effectiveFrom_idx";
DROP INDEX "BusinessHoursSchedule_salonId_idx";
DROP INDEX "Client_email_idx";
DROP INDEX "Client_phone_idx";
DROP INDEX "Client_salonId_idx";

-- AlterTable: make salonId non-nullable
ALTER TABLE "Appointment" ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "Blackout" ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "BusinessHours" ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "BusinessHoursSchedule" ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "salonId" SET NOT NULL;

-- CreateIndex: salon-scoped indexes replacing the global ones
CREATE INDEX "Appointment_salonId_status_startsAt_idx" ON "Appointment"("salonId", "status", "startsAt");
CREATE INDEX "Blackout_salonId_startsAt_endsAt_idx" ON "Blackout"("salonId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "BusinessHours_salonId_dayOfWeek_key" ON "BusinessHours"("salonId", "dayOfWeek");
CREATE INDEX "BusinessHoursSchedule_salonId_effectiveFrom_idx" ON "BusinessHoursSchedule"("salonId", "effectiveFrom");
CREATE UNIQUE INDEX "BusinessHoursSchedule_salonId_effectiveFrom_dayOfWeek_key" ON "BusinessHoursSchedule"("salonId", "effectiveFrom", "dayOfWeek");
CREATE INDEX "Client_salonId_email_idx" ON "Client"("salonId", "email");
CREATE INDEX "Client_salonId_phone_idx" ON "Client"("salonId", "phone");

-- AddForeignKey: cascade delete so salon removal cleans up all owned rows
ALTER TABLE "Service" ADD CONSTRAINT "Service_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessHoursSchedule" ADD CONSTRAINT "BusinessHoursSchedule_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
