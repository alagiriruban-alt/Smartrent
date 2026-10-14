-- AlterTable
ALTER TABLE "User" ADD COLUMN "remindersConfigured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RentPayment" DROP COLUMN "periodStart",
DROP COLUMN "periodEnd",
ADD COLUMN "referenceNumber" TEXT;

-- CreateTable
CREATE TABLE "RentCharge" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentCharge_tenancyId_idx" ON "RentCharge"("tenancyId");

-- CreateIndex
CREATE UNIQUE INDEX "RentCharge_tenancyId_periodStart_key" ON "RentCharge"("tenancyId", "periodStart");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_chargeId_idx" ON "PaymentAllocation"("chargeId");

-- CreateIndex
CREATE INDEX "ReminderRule_ownerId_idx" ON "ReminderRule"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_ownerId_offsetDays_key" ON "ReminderRule"("ownerId", "offsetDays");

-- AddForeignKey
ALTER TABLE "RentCharge" ADD CONSTRAINT "RentCharge_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RentPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "RentCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
