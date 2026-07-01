-- Stripe Connect payments (docs/STRIPE_SPEC.md), Phase 1: schema only.
-- Fully additive/inert — new columns default to "no payments" behavior
-- (paymentsEnabled=false, paymentMode=NONE), so existing rows and every
-- current booking flow are unaffected until a later phase turns this on.

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('NONE', 'DEPOSIT', 'FULL');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'FULL');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "depositType" "DepositType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeAccountUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "applicationFeeCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "kind" "PaymentKind" NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_salonId_status_createdAt_idx" ON "Payment"("salonId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_stripeAccountId_key" ON "Salon"("stripeAccountId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
