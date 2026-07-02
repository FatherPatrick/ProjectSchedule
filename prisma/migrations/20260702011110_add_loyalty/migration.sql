-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyRewardDescription" TEXT NOT NULL DEFAULT 'Free service',
ADD COLUMN     "loyaltyStampsRequired" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "LoyaltyStamp" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyStamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyStamp_appointmentId_key" ON "LoyaltyStamp"("appointmentId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_salonId_clientId_idx" ON "LoyaltyStamp"("salonId", "clientId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_salonId_clientId_idx" ON "LoyaltyReward"("salonId", "clientId");

-- AddForeignKey
ALTER TABLE "LoyaltyStamp" ADD CONSTRAINT "LoyaltyStamp_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyStamp" ADD CONSTRAINT "LoyaltyStamp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
