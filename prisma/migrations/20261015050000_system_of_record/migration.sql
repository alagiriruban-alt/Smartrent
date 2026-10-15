-- System of record: allocations, charges, credits, legal cases,
-- co-owners, jurisdiction, expenses, corrections, and import staging.
--
-- Production applies this file by hand:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261015050000_system_of_record/migration.sql
--
-- Money columns are integer cents. Rent periods are YYYY-MM text.

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('ON', 'QC');

-- CreateEnum
CREATE TYPE "PaymentReferenceType" AS ENUM ('INTERAC', 'CHEQUE', 'OTHER', 'NONE');

-- CreateEnum
CREATE TYPE "AllocationMode" AS ENUM ('AUTO', 'EXPLICIT');

-- CreateEnum
CREATE TYPE "LedgerChargeKind" AS ENUM ('WATER', 'UTILITIES', 'FEE', 'LTB_FILING', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('IN_KIND', 'OFFSET');

-- CreateEnum
CREATE TYPE "LegalCaseType" AS ENUM ('N4', 'L1', 'L2', 'N12', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalCaseStatus" AS ENUM ('OPEN', 'SERVED', 'FILED', 'HEARING_SET', 'DECIDED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('STAGED', 'COMMITTED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMMITTED');

-- CreateEnum
CREATE TYPE "ImportRowKind" AS ENUM ('HEADER', 'TENANCY', 'LEDGER', 'EXPENSE');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "jurisdiction" "Jurisdiction" NOT NULL DEFAULT 'ON';

UPDATE "Property" SET "jurisdiction" = 'QC' WHERE "province" = 'QC';

-- AlterTable
ALTER TABLE "Tenancy"
ADD COLUMN "depositHeldCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "depositAppliedOn" DATE,
ADD COLUMN "depositAppliedPeriod" TEXT;

-- AlterTable
ALTER TABLE "RentCharge" ADD COLUMN "period" TEXT;
ALTER TABLE "RentCharge" ADD COLUMN "portion" TEXT NOT NULL DEFAULT '';

UPDATE "RentCharge" SET "period" = to_char("periodStart", 'YYYY-MM');

ALTER TABLE "RentCharge" ALTER COLUMN "period" SET NOT NULL;

DROP INDEX "RentCharge_tenancyId_periodStart_key";

CREATE UNIQUE INDEX "RentCharge_tenancyId_period_portion_key" ON "RentCharge"("tenancyId", "period", "portion");

-- AlterTable
ALTER TABLE "RentPayment"
ADD COLUMN "referenceType" "PaymentReferenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "dedupeKey" TEXT,
ADD COLUMN "allocationMode" "AllocationMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "importKey" TEXT;

WITH base AS (
  SELECT
    p.id,
    p."ownerId",
    CASE
      WHEN p."referenceKey" IS NOT NULL THEN p."referenceKey"
      WHEN p."method" = 'CHEQUE'
        AND p."referenceNumber" IS NOT NULL
        AND btrim(p."referenceNumber") <> ''
        THEN 'cheque:' || upper(regexp_replace(btrim(p."referenceNumber"), '\s+', '', 'g'))
      WHEN p."referenceNumber" IS NOT NULL
        AND btrim(p."referenceNumber") <> ''
        THEN 'other:' || upper(regexp_replace(btrim(p."referenceNumber"), '\s+', '', 'g'))
      ELSE 'fallback:' || p."tenancyId" || ':' || to_char(p."paidOn", 'YYYY-MM-DD') || ':' || p."amountCents"::text
    END AS base_key,
    CASE
      WHEN p."referenceKey" IS NOT NULL THEN 'INTERAC'::"PaymentReferenceType"
      WHEN p."method" = 'CHEQUE'
        AND p."referenceNumber" IS NOT NULL
        AND btrim(p."referenceNumber") <> ''
        THEN 'CHEQUE'::"PaymentReferenceType"
      WHEN p."referenceNumber" IS NOT NULL
        AND btrim(p."referenceNumber") <> ''
        THEN 'OTHER'::"PaymentReferenceType"
      ELSE 'NONE'::"PaymentReferenceType"
    END AS ref_type
  FROM "RentPayment" p
),
ranked AS (
  SELECT
    id,
    base_key,
    ref_type,
    row_number() OVER (PARTITION BY "ownerId", base_key ORDER BY id) AS n
  FROM base
)
UPDATE "RentPayment" AS p
SET
  "dedupeKey" = CASE
    WHEN r.n = 1 THEN r.base_key
    ELSE r.base_key || ':' || p.id
  END,
  "referenceType" = r.ref_type
FROM ranked AS r
WHERE p.id = r.id;

ALTER TABLE "RentPayment" ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX "RentPayment_ownerId_dedupeKey_key" ON "RentPayment"("ownerId", "dedupeKey");

CREATE UNIQUE INDEX "RentPayment_ownerId_importKey_key" ON "RentPayment"("ownerId", "importKey");

-- AlterTable
ALTER TABLE "PaymentAllocation" ALTER COLUMN "chargeId" DROP NOT NULL;

ALTER TABLE "PaymentAllocation" ADD COLUMN "ledgerChargeId" TEXT;

-- AlterTable
ALTER TABLE "Expense"
ADD COLUMN "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hstCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "receiptDocumentId" TEXT,
ADD COLUMN "importKey" TEXT;

UPDATE "Expense"
SET "subtotalCents" = "amountCents", "hstCents" = 0
WHERE "subtotalCents" = 0 AND "hstCents" = 0;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_cents_check"
CHECK (
  "subtotalCents" >= 0
  AND "hstCents" >= 0
  AND "amountCents" >= 0
  AND "amountCents" = "subtotalCents" + "hstCents"
);

CREATE UNIQUE INDEX "Expense_ownerId_importKey_key" ON "Expense"("ownerId", "importKey");

-- CreateTable
CREATE TABLE "LedgerCharge" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "kind" "LedgerChargeKind" NOT NULL,
    "period" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueOn" DATE NOT NULL,
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentCredit" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "documentId" TEXT,
    "period" TEXT,
    "effectiveOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentChange" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "previousCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "noticeId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalCase" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "type" "LegalCaseType" NOT NULL,
    "typeDetail" TEXT,
    "servedOn" DATE,
    "filedOn" DATE,
    "ltbFileNumber" TEXT,
    "filingFeeCents" INTEGER,
    "hearingOn" DATE,
    "status" "LegalCaseStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyOwner" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "propertyId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'STAGED',
    "reconciliation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "kind" "ImportRowKind" NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "periodOverride" TEXT,
    "committedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerOverride" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fields" TEXT[],
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerCharge_ownerId_importKey_key" ON "LedgerCharge"("ownerId", "importKey");
CREATE INDEX "LedgerCharge_ownerId_idx" ON "LedgerCharge"("ownerId");
CREATE INDEX "LedgerCharge_tenancyId_idx" ON "LedgerCharge"("tenancyId");
CREATE INDEX "RentCredit_ownerId_idx" ON "RentCredit"("ownerId");
CREATE INDEX "RentCredit_tenancyId_idx" ON "RentCredit"("tenancyId");
CREATE UNIQUE INDEX "RentChange_noticeId_key" ON "RentChange"("noticeId");
CREATE INDEX "RentChange_ownerId_idx" ON "RentChange"("ownerId");
CREATE INDEX "RentChange_tenancyId_idx" ON "RentChange"("tenancyId");
CREATE UNIQUE INDEX "LegalCase_ownerId_ltbFileNumber_key" ON "LegalCase"("ownerId", "ltbFileNumber");
CREATE INDEX "LegalCase_ownerId_idx" ON "LegalCase"("ownerId");
CREATE INDEX "LegalCase_tenancyId_idx" ON "LegalCase"("tenancyId");
CREATE INDEX "LegalCase_tenantId_idx" ON "LegalCase"("tenantId");
CREATE INDEX "LegalCase_hearingOn_idx" ON "LegalCase"("hearingOn");
CREATE INDEX "PropertyOwner_ownerId_idx" ON "PropertyOwner"("ownerId");
CREATE INDEX "PropertyOwner_propertyId_idx" ON "PropertyOwner"("propertyId");
CREATE UNIQUE INDEX "ImportBatch_ownerId_sourceHash_key" ON "ImportBatch"("ownerId", "sourceHash");
CREATE INDEX "ImportBatch_ownerId_idx" ON "ImportBatch"("ownerId");
CREATE INDEX "ImportBatch_propertyId_idx" ON "ImportBatch"("propertyId");
CREATE UNIQUE INDEX "ImportRow_batchId_idempotencyKey_key" ON "ImportRow"("batchId", "idempotencyKey");
CREATE INDEX "ImportRow_ownerId_idx" ON "ImportRow"("ownerId");
CREATE INDEX "ImportRow_batchId_idx" ON "ImportRow"("batchId");
CREATE INDEX "LedgerOverride_ownerId_entityType_entityId_idx" ON "LedgerOverride"("ownerId", "entityType", "entityId");
CREATE INDEX "PaymentAllocation_ledgerChargeId_idx" ON "PaymentAllocation"("ledgerChargeId");

-- AddForeignKey
ALTER TABLE "LedgerCharge" ADD CONSTRAINT "LedgerCharge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerCharge" ADD CONSTRAINT "LedgerCharge_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentCredit" ADD CONSTRAINT "RentCredit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentCredit" ADD CONSTRAINT "RentCredit_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentChange" ADD CONSTRAINT "RentChange_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentChange" ADD CONSTRAINT "RentChange_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentChange" ADD CONSTRAINT "RentChange_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyOwner" ADD CONSTRAINT "PropertyOwner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyOwner" ADD CONSTRAINT "PropertyOwner_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerOverride" ADD CONSTRAINT "LedgerOverride_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ledgerChargeId_fkey" FOREIGN KEY ("ledgerChargeId") REFERENCES "LedgerCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation"
ADD CONSTRAINT "PaymentAllocation_one_target_check"
CHECK (
  ("chargeId" IS NOT NULL AND "ledgerChargeId" IS NULL)
  OR ("chargeId" IS NULL AND "ledgerChargeId" IS NOT NULL)
);

ALTER TABLE "PropertyOwner"
ADD CONSTRAINT "PropertyOwner_share_check"
CHECK ("shareBps" > 0 AND "shareBps" <= 10000);

ALTER TABLE "LedgerCharge"
ADD CONSTRAINT "LedgerCharge_amount_check"
CHECK ("amountCents" > 0);

ALTER TABLE "RentCredit"
ADD CONSTRAINT "RentCredit_amount_check"
CHECK ("amountCents" > 0);

-- Backfill a rent charge for any payment that has nowhere to land.
INSERT INTO "RentCharge" (
  "id",
  "tenancyId",
  "periodStart",
  "dueOn",
  "amountCents",
  "createdAt",
  "period",
  "portion"
)
SELECT
  'charge_' || p.id,
  p."tenancyId",
  date_trunc('month', p."paidOn")::date,
  p."paidOn",
  p."amountCents",
  CURRENT_TIMESTAMP,
  to_char(p."paidOn", 'YYYY-MM'),
  ''
FROM "RentPayment" AS p
WHERE NOT EXISTS (
  SELECT 1 FROM "PaymentAllocation" AS a WHERE a."paymentId" = p.id
)
AND NOT EXISTS (
  SELECT 1
  FROM "RentCharge" AS c
  WHERE c."tenancyId" = p."tenancyId"
    AND c."period" = to_char(p."paidOn", 'YYYY-MM')
    AND c."portion" = ''
);

-- Each existing payment with no split becomes one allocation for its full amount.
INSERT INTO "PaymentAllocation" ("id", "paymentId", "chargeId", "amountCents")
SELECT
  'backfill_' || p.id,
  p.id,
  c.id,
  p."amountCents"
FROM "RentPayment" AS p
JOIN "RentCharge" AS c
  ON c."tenancyId" = p."tenancyId"
 AND c."period" = to_char(p."paidOn", 'YYYY-MM')
 AND c."portion" = ''
WHERE NOT EXISTS (
  SELECT 1 FROM "PaymentAllocation" AS a WHERE a."paymentId" = p.id
);

-- Rent-change history from saved increase notices, then from the lease fields.
INSERT INTO "RentChange" (
  "id",
  "ownerId",
  "tenancyId",
  "effectiveOn",
  "previousCents",
  "amountCents",
  "noticeId",
  "reason",
  "createdAt"
)
SELECT
  'rcn_' || n.id,
  n."ownerId",
  n."tenancyId",
  n."effectiveOn",
  COALESCE(n."currentRentCents", 0),
  n."newRentCents",
  n.id,
  'Linked from rent increase notice',
  CURRENT_TIMESTAMP
FROM "Notice" AS n
WHERE n."type" IN ('N1', 'N2')
  AND n."effectiveOn" IS NOT NULL
  AND n."newRentCents" IS NOT NULL
  AND n."status" <> 'VOID';

INSERT INTO "RentChange" (
  "id",
  "ownerId",
  "tenancyId",
  "effectiveOn",
  "previousCents",
  "amountCents",
  "noticeId",
  "reason",
  "createdAt"
)
SELECT
  'rct_' || t.id,
  p."ownerId",
  t.id,
  t."lastIncreaseOn",
  GREATEST(t."monthlyRentCents" - COALESCE(t."lastIncreaseCents", 0), 0),
  t."monthlyRentCents",
  NULL,
  'Recorded from the lease rent history',
  CURRENT_TIMESTAMP
FROM "Tenancy" AS t
JOIN "Unit" AS u ON u.id = t."unitId"
JOIN "Property" AS p ON p.id = u."propertyId"
WHERE t."lastIncreaseOn" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "RentChange" AS r WHERE r."tenancyId" = t.id
  );

-- Row level security on the new tables. The table owner (the app role)
-- bypasses these policies. Any other role sees a row only when the session
-- sets app.owner_id to that landlord, matching the ownerId filter the app
-- already uses.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'LedgerCharge',
    'RentCredit',
    'RentChange',
    'LegalCase',
    'PropertyOwner',
    'ImportBatch',
    'ImportRow',
    'LedgerOverride'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_owner_isolation', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("ownerId" = current_setting(''app.owner_id'', true)) WITH CHECK ("ownerId" = current_setting(''app.owner_id'', true))',
      tbl || '_owner_isolation',
      tbl
    );
  END LOOP;
END $$;
