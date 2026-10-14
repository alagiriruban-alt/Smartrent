import { PrismaClient, type PaymentMethod } from "@prisma/client";

import { dateOnlyToUtc, todayDateOnly, utcToDateOnly } from "../src/lib/dates";
import { arrearsSamplePlan } from "../src/lib/ledger";
import { hashPassword } from "../src/lib/passwords";
import { syncTenancyLedger } from "../src/lib/rent-sync";

const prisma = new PrismaClient();

const demoEmail = "landlord@example.com";
const demoPassword = "DemoRent1";

async function main() {
  const passwordHash = await hashPassword(demoPassword);
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      name: "Avery Chen",
      email: demoEmail,
      passwordHash,
    },
  });

  await ensureProperty(user.id);
  await ensureReminderRules(user.id);
  await ensurePayments(user.id);

  console.log("Sample landlord is ready.");
  console.log(`Email:    ${demoEmail}`);
  console.log(`Password: ${demoPassword}`);
}

async function ensureProperty(ownerId: string) {
  const existing = await prisma.property.findFirst({
    where: { ownerId, name: "King Street duplex" },
    include: {
      units: { include: { tenancies: true } },
    },
  });

  if (!existing) {
    const jordan = await prisma.tenant.create({
      data: {
        ownerId,
        firstName: "Jordan",
        lastName: "Patel",
        email: "jordan@example.com",
        phone: "905-555-0148",
      },
    });
    const sam = await prisma.tenant.create({
      data: {
        ownerId,
        firstName: "Sam",
        lastName: "Okonkwo",
        email: "sam@example.com",
        phone: "905-555-0172",
      },
    });
    await prisma.property.create({
      data: {
        ownerId,
        name: "King Street duplex",
        streetAddress: "18 King Street West",
        city: "Hamilton",
        province: "ON",
        postalCode: "L8P 1A1",
        units: {
          create: [
            {
              label: "Upper",
              bedrooms: 2,
              tenancies: {
                create: {
                  tenantId: jordan.id,
                  leaseStart: dateOnlyToUtc("2026-01-01"),
                  leaseEnd: dateOnlyToUtc("2026-12-31"),
                  monthlyRentCents: 185000,
                  rentDueDay: 1,
                },
              },
            },
            {
              label: "Lower",
              bedrooms: 1,
              tenancies: {
                create: {
                  tenantId: sam.id,
                  leaseStart: dateOnlyToUtc("2026-06-01"),
                  monthlyRentCents: 145000,
                  rentDueDay: 1,
                },
              },
            },
          ],
        },
      },
    });
    return;
  }

  const lower = existing.units.find((unit) => unit.label === "Lower");
  if (lower && lower.tenancies.length === 0) {
    const sam = await prisma.tenant.create({
      data: {
        ownerId,
        firstName: "Sam",
        lastName: "Okonkwo",
        email: "sam@example.com",
        phone: "905-555-0172",
      },
    });
    await prisma.tenancy.create({
      data: {
        unitId: lower.id,
        tenantId: sam.id,
        leaseStart: dateOnlyToUtc("2026-06-01"),
        monthlyRentCents: 145000,
        rentDueDay: 1,
      },
    });
  }
}

async function ensureReminderRules(ownerId: string) {
  const count = await prisma.reminderRule.count({ where: { ownerId } });
  if (count === 0) {
    await prisma.reminderRule.createMany({
      data: [-3, 0, 3].map((offsetDays) => ({
        ownerId,
        offsetDays,
        enabled: true,
      })),
    });
  }
  await prisma.user.update({
    where: { id: ownerId },
    data: { remindersConfigured: true },
  });
}

async function ensurePayments(ownerId: string) {
  const today = todayDateOnly();
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId } } },
    include: { tenant: true },
  });

  for (const tenancy of tenancies) {
    const alreadyPaid = await prisma.rentPayment.count({
      where: { tenancyId: tenancy.id },
    });
    await prisma.$transaction((tx) => syncTenancyLedger(tx, tenancy, today));
    if (alreadyPaid > 0) {
      continue;
    }
    const charges = await prisma.rentCharge.findMany({
      where: { tenancyId: tenancy.id },
      orderBy: { dueOn: "asc" },
    });
    if (tenancy.tenant.lastName === "Okonkwo") {
      await seedBehind(ownerId, tenancy.id, charges, today);
    } else {
      await seedPaidUp(ownerId, tenancy.id, charges, today);
    }
  }
}

async function seedPaidUp(
  ownerId: string,
  tenancyId: string,
  charges: { id: string; periodStart: Date; dueOn: Date; amountCents: number }[],
  today: string,
) {
  for (const charge of charges) {
    const dueOn = utcToDateOnly(charge.dueOn);
    if (dueOn > today) {
      continue;
    }
    const period = utcToDateOnly(charge.periodStart).replace("-", "").slice(0, 6);
    const cheque = period.endsWith("01");
    await prisma.rentPayment.create({
      data: {
        ownerId,
        tenancyId,
        amountCents: charge.amountCents,
        paidOn: charge.dueOn,
        method: cheque ? "CHEQUE" : "E_TRANSFER",
        referenceNumber: cheque ? "1001" : `CAJP${period}`,
        note: "Rent",
        allocations: {
          create: {
            chargeId: charge.id,
            amountCents: charge.amountCents,
          },
        },
      },
    });
  }
}

async function seedBehind(
  ownerId: string,
  tenancyId: string,
  charges: { id: string; periodStart: Date; dueOn: Date; amountCents: number }[],
  today: string,
) {
  const plan = arrearsSamplePlan(
    charges.map((charge) => ({
      periodStart: utcToDateOnly(charge.periodStart),
      dueOn: utcToDateOnly(charge.dueOn),
      amountCents: charge.amountCents,
    })),
    today,
  );
  let fullCount = 0;
  for (const line of plan) {
    if (line.payCents <= 0) {
      continue;
    }
    const charge = charges.find(
      (item) => utcToDateOnly(item.periodStart) === line.periodStart,
    );
    if (!charge) {
      continue;
    }
    const full = line.payCents >= charge.amountCents;
    if (full) {
      fullCount += 1;
    }
    const period = line.periodStart.replace("-", "").slice(0, 6);
    let method: PaymentMethod = "E_TRANSFER";
    let referenceNumber: string | null = `CASO${period}`;
    let note = "Rent";
    if (!full) {
      method = "CASH";
      referenceNumber = null;
      note = "Partial payment";
    } else if (fullCount === 3) {
      method = "CHEQUE";
      referenceNumber = "1042";
    }
    await prisma.rentPayment.create({
      data: {
        ownerId,
        tenancyId,
        amountCents: line.payCents,
        paidOn: charge.dueOn,
        method,
        referenceNumber,
        note,
        allocations: {
          create: { chargeId: charge.id, amountCents: line.payCents },
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
