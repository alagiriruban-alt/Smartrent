import { Prisma, type PrismaClient } from "@prisma/client";

import { dateOnlyToUtc, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  chargePeriods,
  dueOnForPeriod,
  planCreditAllocations,
} from "@/lib/ledger";

export type LedgerDb = PrismaClient | Prisma.TransactionClient;

export type TenancyChargeSource = {
  id: string;
  leaseStart: Date;
  leaseEnd: Date | null;
  monthlyRentCents: number;
  rentDueDay: number;
};

export async function ensureTenancyCharges(
  db: LedgerDb,
  tenancy: TenancyChargeSource,
  today: string,
) {
  const periods = chargePeriods({
    leaseStart: utcToDateOnly(tenancy.leaseStart),
    leaseEnd: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : null,
    rentDueDay: tenancy.rentDueDay,
    today,
  });
  if (periods.length === 0) {
    return;
  }
  await db.rentCharge.createMany({
    data: periods.map((periodStart) => ({
      tenancyId: tenancy.id,
      periodStart: dateOnlyToUtc(periodStart),
      dueOn: dateOnlyToUtc(dueOnForPeriod(periodStart, tenancy.rentDueDay)),
      amountCents: tenancy.monthlyRentCents,
    })),
    skipDuplicates: true,
  });
}

export async function applyTenancyCredits(db: LedgerDb, tenancyId: string) {
  const payments = await db.rentPayment.findMany({
    where: { tenancyId },
    include: { allocations: true },
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
  });
  const charges = await db.rentCharge.findMany({
    where: { tenancyId },
    include: { allocations: true },
    orderBy: [{ dueOn: "asc" }, { periodStart: "asc" }],
  });
  const planned = planCreditAllocations(
    payments.map((payment) => ({
      id: payment.id,
      paidOn: utcToDateOnly(payment.paidOn),
      amountCents: payment.amountCents,
      allocatedCents: payment.allocations.reduce(
        (sum, row) => sum + row.amountCents,
        0,
      ),
    })),
    charges.map((charge) => ({
      id: charge.id,
      dueOn: utcToDateOnly(charge.dueOn),
      amountCents: charge.amountCents,
      paidCents: charge.allocations.reduce(
        (sum, row) => sum + row.amountCents,
        0,
      ),
    })),
  );
  if (planned.length === 0) {
    return;
  }
  await db.paymentAllocation.createMany({
    data: planned.map((row) => ({
      paymentId: row.paymentId,
      chargeId: row.chargeId,
      amountCents: row.amountCents,
    })),
  });
}

export async function syncTenancyLedger(
  db: LedgerDb,
  tenancy: TenancyChargeSource,
  today: string,
) {
  await db.$queryRaw(
    Prisma.sql`SELECT id FROM "Tenancy" WHERE id = ${tenancy.id} FOR UPDATE`,
  );
  await ensureTenancyCharges(db, tenancy, today);
  await applyTenancyCredits(db, tenancy.id);
}

export async function syncOwnerLedgers(
  userId: string,
  today = todayDateOnly(),
) {
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId: userId } } },
    select: {
      id: true,
      leaseStart: true,
      leaseEnd: true,
      monthlyRentCents: true,
      rentDueDay: true,
    },
  });
  if (tenancies.length === 0) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const tenancy of tenancies) {
      await syncTenancyLedger(tx, tenancy, today);
    }
  });
}
