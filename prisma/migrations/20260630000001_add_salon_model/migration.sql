-- Phase 1a: Add Salon model + nullable salonId to all tenant-owned tables.
-- All column additions are nullable and non-breaking. Unique constraints and
-- non-null enforcement are applied in the follow-up migration (Phase 1c)
-- after the backfill script populates salonId on existing rows.

-- CreateEnum
CREATE TYPE "SalonStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');

-- CreateTable
CREATE TABLE "Salon" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "instagram" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT '#fdf2f8',
    "status" "SalonStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Salon_slug_key" ON "Salon"("slug");

-- CreateIndex
CREATE INDEX "Salon_status_idx" ON "Salon"("status");

-- AlterTable: add nullable salonId to all tenant-owned tables
ALTER TABLE "AdminPhone" ADD COLUMN "salonId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "salonId" TEXT;
ALTER TABLE "Blackout" ADD COLUMN "salonId" TEXT;
ALTER TABLE "BusinessHours" ADD COLUMN "salonId" TEXT;
ALTER TABLE "BusinessHoursSchedule" ADD COLUMN "salonId" TEXT;
ALTER TABLE "Client" ADD COLUMN "salonId" TEXT;
ALTER TABLE "Service" ADD COLUMN "salonId" TEXT;
ALTER TABLE "Setting" ADD COLUMN "salonId" TEXT;
ALTER TABLE "User" ADD COLUMN "salonId" TEXT;

-- CreateIndex: salonId indexes for query performance
CREATE INDEX "AdminPhone_salonId_idx" ON "AdminPhone"("salonId");
CREATE INDEX "Appointment_salonId_startsAt_idx" ON "Appointment"("salonId", "startsAt");
CREATE INDEX "Appointment_salonId_status_reminderSentAt_startsAt_idx" ON "Appointment"("salonId", "status", "reminderSentAt", "startsAt");
CREATE INDEX "Blackout_salonId_idx" ON "Blackout"("salonId");
CREATE INDEX "BusinessHours_salonId_idx" ON "BusinessHours"("salonId");
CREATE INDEX "BusinessHoursSchedule_salonId_idx" ON "BusinessHoursSchedule"("salonId");
CREATE INDEX "Client_salonId_idx" ON "Client"("salonId");
CREATE INDEX "Service_salonId_idx" ON "Service"("salonId");
CREATE UNIQUE INDEX "Setting_salonId_key" ON "Setting"("salonId");
CREATE INDEX "User_salonId_idx" ON "User"("salonId");

-- AddForeignKey: Salon relations (SET NULL on delete so orphaned rows don't error
-- before the non-null migration runs; cascade is added in Phase 1c)
ALTER TABLE "User" ADD CONSTRAINT "User_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessHoursSchedule" ADD CONSTRAINT "BusinessHoursSchedule_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPhone" ADD CONSTRAINT "AdminPhone_salonId_fkey"
    FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
