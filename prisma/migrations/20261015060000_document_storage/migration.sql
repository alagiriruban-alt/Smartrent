-- Hand-runnable on production: paste this file into the Supabase SQL editor.
-- It matches the other public tables: row level security is on, and there
-- are no policies, so the Data API cannot read these rows. The app connects
-- as the table owner through DATABASE_URL and bypasses row level security.

-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'ID';
ALTER TYPE "DocumentKind" ADD VALUE 'INSURANCE';
ALTER TYPE "DocumentKind" ADD VALUE 'INSPECTION';

-- CreateEnum
CREATE TYPE "DocumentSubject" AS ENUM ('PROPERTY', 'UNIT', 'TENANT', 'LEASE');

-- CreateEnum
CREATE TYPE "DocumentAuditAction" AS ENUM ('UPLOAD', 'DELETE');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "subject" "DocumentSubject" NOT NULL DEFAULT 'PROPERTY';
ALTER TABLE "Document" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Document" ADD COLUMN "expiresOn" DATE;

-- Existing rows, if any, keep the most specific link they already have.
UPDATE "Document" SET "subject" = 'LEASE' WHERE "tenancyId" IS NOT NULL;
UPDATE "Document" SET "subject" = 'UNIT' WHERE "tenancyId" IS NULL AND "unitId" IS NOT NULL;
UPDATE "Document" SET "subject" = 'PROPERTY' WHERE "tenancyId" IS NULL AND "unitId" IS NULL AND "propertyId" IS NOT NULL;

-- CreateTable
CREATE TABLE "DocumentAuditLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentId" TEXT,
    "action" "DocumentAuditAction" NOT NULL,
    "fileName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_ownerId_expiresOn_idx" ON "Document"("ownerId", "expiresOn");

-- CreateIndex
CREATE INDEX "Document_propertyId_idx" ON "Document"("propertyId");

-- CreateIndex
CREATE INDEX "Document_unitId_idx" ON "Document"("unitId");

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_tenancyId_idx" ON "Document"("tenancyId");

-- CreateIndex
CREATE INDEX "Document_noticeId_idx" ON "Document"("noticeId");

-- CreateIndex
CREATE INDEX "DocumentAuditLog_ownerId_createdAt_idx" ON "DocumentAuditLog"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditLog" ADD CONSTRAINT "DocumentAuditLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security, same as the other public tables. No policies.
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentAuditLog" ENABLE ROW LEVEL SECURITY;
