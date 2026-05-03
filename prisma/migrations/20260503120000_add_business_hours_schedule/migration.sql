-- CreateTable
CREATE TABLE "BusinessHoursSchedule" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openMin" INTEGER NOT NULL,
    "closeMin" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessHoursSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessHoursSchedule_effectiveFrom_idx" ON "BusinessHoursSchedule"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHoursSchedule_effectiveFrom_dayOfWeek_key" ON "BusinessHoursSchedule"("effectiveFrom", "dayOfWeek");
