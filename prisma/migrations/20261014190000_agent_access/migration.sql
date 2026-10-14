-- AlterTable
ALTER TABLE "RentPayment" ADD COLUMN "referenceKey" TEXT;

-- Backfill e-Transfer references so an existing transfer cannot be posted again.
UPDATE "RentPayment"
SET "referenceKey" = 'etransfer:' || upper(regexp_replace(btrim("referenceNumber"), '\s+', '', 'g'))
WHERE method = 'E_TRANSFER'
  AND "referenceNumber" IS NOT NULL
  AND btrim("referenceNumber") <> '';

-- CreateIndex
CREATE UNIQUE INDEX "RentPayment_ownerId_referenceKey_key" ON "RentPayment"("ownerId", "referenceKey");

-- CreateEnum
CREATE TYPE "AgentTokenScope" AS ENUM ('READ', 'WRITE');

-- CreateTable
CREATE TABLE "AgentAccessToken" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scopes" "AgentTokenScope"[] NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfirmation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAuditLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenId" TEXT,
    "tool" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "viaAgent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccessToken_tokenHash_key" ON "AgentAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentAccessToken_ownerId_idx" ON "AgentAccessToken"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfirmation_tokenHash_key" ON "AgentConfirmation"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentConfirmation_ownerId_idx" ON "AgentConfirmation"("ownerId");

-- CreateIndex
CREATE INDEX "AgentAuditLog_ownerId_createdAt_idx" ON "AgentAuditLog"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentAccessToken" ADD CONSTRAINT "AgentAccessToken_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfirmation" ADD CONSTRAINT "AgentConfirmation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAuditLog" ADD CONSTRAINT "AgentAuditLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAuditLog" ADD CONSTRAINT "AgentAuditLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "AgentAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
