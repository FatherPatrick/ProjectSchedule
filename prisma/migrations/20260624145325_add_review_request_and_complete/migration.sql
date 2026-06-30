-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'REVIEW_REQUEST';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "reviewRequestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewRequestUrl" TEXT;
