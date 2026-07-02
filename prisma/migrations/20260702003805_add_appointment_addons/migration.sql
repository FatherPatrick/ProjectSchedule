-- CreateTable
CREATE TABLE "AppointmentAddOn" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppointmentAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentAddOn_appointmentId_idx" ON "AppointmentAddOn"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentAddOn_appointmentId_serviceId_key" ON "AppointmentAddOn"("appointmentId", "serviceId");

-- AddForeignKey
ALTER TABLE "AppointmentAddOn" ADD CONSTRAINT "AppointmentAddOn_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAddOn" ADD CONSTRAINT "AppointmentAddOn_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
