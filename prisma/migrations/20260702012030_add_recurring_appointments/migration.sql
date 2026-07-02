-- CreateEnum
CREATE TYPE "RecurrenceRule" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "parentAppointmentId" TEXT,
ADD COLUMN     "recurrenceRule" "RecurrenceRule";

-- CreateIndex
CREATE INDEX "Appointment_parentAppointmentId_idx" ON "Appointment"("parentAppointmentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_parentAppointmentId_fkey" FOREIGN KEY ("parentAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
