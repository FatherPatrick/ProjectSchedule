-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "clientPackageId" TEXT;

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPackage" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "sessionsTotal" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL,

    CONSTRAINT "ClientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Package_salonId_idx" ON "Package"("salonId");

-- CreateIndex
CREATE INDEX "ClientPackage_salonId_clientId_idx" ON "ClientPackage"("salonId", "clientId");

-- CreateIndex
CREATE INDEX "Appointment_clientPackageId_idx" ON "Appointment"("clientPackageId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPackage" ADD CONSTRAINT "ClientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
