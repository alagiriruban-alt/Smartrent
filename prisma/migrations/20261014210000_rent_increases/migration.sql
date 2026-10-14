-- AlterEnum
ALTER TYPE "NoticeType" ADD VALUE 'N1';
ALTER TYPE "NoticeType" ADD VALUE 'N2';

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "guidelineExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Unit" ADD COLUMN "exemptionEvidence" TEXT;

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN "moveInOn" DATE;
UPDATE "Tenancy" SET "moveInOn" = "leaseStart" WHERE "moveInOn" IS NULL;
ALTER TABLE "Tenancy" ALTER COLUMN "moveInOn" SET NOT NULL;
ALTER TABLE "Tenancy" ADD COLUMN "lastIncreaseOn" DATE;
ALTER TABLE "Tenancy" ADD COLUMN "lastIncreaseCents" INTEGER;

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN "effectiveOn" DATE;
ALTER TABLE "Notice" ADD COLUMN "currentRentCents" INTEGER;
ALTER TABLE "Notice" ADD COLUMN "newRentCents" INTEGER;
ALTER TABLE "Notice" ADD COLUMN "guidelineYear" INTEGER;
ALTER TABLE "Notice" ADD COLUMN "guidelineBasisPoints" INTEGER;
ALTER TABLE "Notice" ADD COLUMN "guidelineSourceUrl" TEXT;
ALTER TABLE "Notice" ADD COLUMN "warningCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "RentGuideline" (
    "id" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentGuideline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentGuideline_province_year_key" ON "RentGuideline"("province", "year");
