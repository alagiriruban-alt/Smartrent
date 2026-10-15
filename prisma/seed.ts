import { PrismaClient, type PaymentMethod } from "@prisma/client";

import { paymentDedupeKey } from "../src/lib/payments/identity";
import { addCalendarMonths, addDays, dateOnlyToUtc, todayDateOnly, utcToDateOnly } from "../src/lib/dates";
import {
  ONTARIO_GUIDELINE_SOURCE_URL,
  ONTARIO_OFFICIAL_GUIDELINES,
} from "../src/lib/rent-increase/official";
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
  await ensureOntarioGuidelines();
  await ensureRentIncreaseDemo(user.id);
  await ensureBooks(user.id);

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
                  moveInOn: dateOnlyToUtc("2026-01-01"),
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
                  moveInOn: dateOnlyToUtc("2026-06-01"),
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
        moveInOn: dateOnlyToUtc("2026-06-01"),
        monthlyRentCents: 145000,
        rentDueDay: 1,
      },
    });
  }
}

async function ensureOntarioGuidelines() {
  for (const row of ONTARIO_OFFICIAL_GUIDELINES) {
    await prisma.rentGuideline.upsert({
      where: { province_year: { province: "ON", year: row.year } },
      create: {
        province: "ON",
        year: row.year,
        basisPoints: row.basisPoints,
        sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
        verified: true,
      },
      update: {
        basisPoints: row.basisPoints,
        sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
        verified: true,
      },
    });
  }
}

async function ensureRentIncreaseDemo(ownerId: string) {
  const today = todayDateOnly();
  const eligibleOn = addDays(today, 100);
  const lastIncreaseOn = addCalendarMonths(eligibleOn, -12);
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId, name: "King Street duplex" } } },
    include: { tenant: true },
  });

  for (const tenancy of tenancies) {
    const leaseStart = utcToDateOnly(tenancy.leaseStart);
    if (tenancy.tenant.lastName === "Patel") {
      const moveInOn = leaseStart <= lastIncreaseOn ? leaseStart : lastIncreaseOn;
      await prisma.tenancy.update({
        where: { id: tenancy.id },
        data: {
          moveInOn: dateOnlyToUtc(moveInOn),
          lastIncreaseOn: dateOnlyToUtc(lastIncreaseOn),
          lastIncreaseCents: 4500,
          leaseEnd: dateOnlyToUtc(addCalendarMonths(eligibleOn, 12)),
        },
      });
      await prisma.unit.update({
        where: { id: tenancy.unitId },
        data: { guidelineExempt: false, exemptionEvidence: null },
      });
    }
    if (tenancy.tenant.lastName === "Okonkwo") {
      await prisma.tenancy.update({
        where: { id: tenancy.id },
        data: {
          moveInOn: dateOnlyToUtc(leaseStart),
          lastIncreaseOn: null,
          lastIncreaseCents: null,
        },
      });
      await prisma.unit.update({
        where: { id: tenancy.unitId },
        data: {
          guidelineExempt: true,
          exemptionEvidence:
            "Occupancy permit dated June 1, 2019. First residential occupancy was after November 15, 2018.",
        },
      });
    }
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
        ...paymentDedupeKey({
          method: cheque ? "CHEQUE" : "E_TRANSFER",
          referenceNumber: cheque ? "1001" : `CAJP${period}`,
          tenancyId,
          paidOn: utcToDateOnly(charge.dueOn),
          amountCents: charge.amountCents,
        }),
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
        ...paymentDedupeKey({
          method,
          referenceNumber,
          tenancyId,
          paidOn: utcToDateOnly(charge.dueOn),
          amountCents: line.payCents,
        }),
        note,
        allocations: {
          create: { chargeId: charge.id, amountCents: line.payCents },
        },
      },
    });
  }
}

async function ensureBooks(ownerId: string) {
  const today = todayDateOnly();
  const property = await prisma.property.findFirst({
    where: { ownerId, name: "King Street duplex" },
    include: {
      owners: true,
      expenses: true,
      units: { include: { tenancies: { include: { tenant: true } } } },
    },
  });
  if (!property) {
    return;
  }
  if (property.owners.length === 0) {
    await prisma.propertyOwner.createMany({
      data: [
        { ownerId, propertyId: property.id, name: "Avery Chen", shareBps: 5000 },
        { ownerId, propertyId: property.id, name: "Riley Chen", shareBps: 5000 },
      ],
    });
  }
  if (!property.expenses.some((expense) => expense.invoiceNumber === "HP-2044")) {
    await prisma.expense.create({
      data: {
        ownerId,
        propertyId: property.id,
        incurredOn: dateOnlyToUtc("2026-08-12"),
        vendor: "Harbour Plumbing",
        invoiceNumber: "HP-2044",
        description: "Kitchen faucet cartridge",
        category: "REPAIRS_MAINTENANCE",
        subtotalCents: 10000,
        hstCents: 1300,
        amountCents: 11300,
        receiptDocumentId: "doc_demo_faucet",
      },
    });
  }
  const jordan = property.units
    .flatMap((unit) => unit.tenancies)
    .find((tenancy) => tenancy.tenant.lastName === "Patel");
  const sam = property.units
    .flatMap((unit) => unit.tenancies)
    .find((tenancy) => tenancy.tenant.lastName === "Okonkwo");
  if (jordan && jordan.depositHeldCents === 0) {
    await prisma.tenancy.update({
      where: { id: jordan.id },
      data: { depositHeldCents: jordan.monthlyRentCents },
    });
  }
  if (jordan) {
    const history = await prisma.rentChange.findFirst({ where: { tenancyId: jordan.id } });
    if (!history && jordan.lastIncreaseOn) {
      await prisma.rentChange.create({
        data: {
          ownerId,
          tenancyId: jordan.id,
          effectiveOn: jordan.lastIncreaseOn,
          previousCents: Math.max(jordan.monthlyRentCents - (jordan.lastIncreaseCents ?? 0), 0),
          amountCents: jordan.monthlyRentCents,
          reason: "Recorded from the lease rent history",
        },
      });
    }
    const credit = await prisma.rentCredit.findFirst({
      where: {
        tenancyId: jordan.id,
        reason: "Repair offset for a faucet cartridge the tenant bought",
      },
    });
    if (!credit) {
      await prisma.rentCredit.create({
        data: {
          ownerId,
          tenancyId: jordan.id,
          amountCents: 10000,
          kind: "OFFSET",
          reason: "Repair offset for a faucet cartridge the tenant bought",
          effectiveOn: dateOnlyToUtc(today),
          documentId: "doc_demo_offset",
        },
      });
    }
  }
  if (sam) {
    const water = await prisma.ledgerCharge.findFirst({
      where: { tenancyId: sam.id, kind: "WATER" },
    });
    if (!water) {
      const due = addCalendarMonths(`${today.slice(0, 7)}-01`, -1);
      await prisma.ledgerCharge.create({
        data: {
          ownerId,
          tenancyId: sam.id,
          kind: "WATER",
          period: due.slice(0, 7),
          description: "Water",
          amountCents: 6793,
          dueOn: dateOnlyToUtc(due),
        },
      });
    }
    const filing = await prisma.ledgerCharge.findFirst({
      where: { tenancyId: sam.id, kind: "LTB_FILING" },
    });
    if (!filing) {
      await prisma.ledgerCharge.create({
        data: {
          ownerId,
          tenancyId: sam.id,
          kind: "LTB_FILING",
          description: "LTB filing fee",
          amountCents: 18600,
          dueOn: dateOnlyToUtc(addDays(today, -10)),
        },
      });
    }
    const hearingOn = addDays(today, 21);
    const existingCase = await prisma.legalCase.findFirst({
      where: { ownerId, ltbFileNumber: "LTB-26-00991" },
    });
    if (!existingCase) {
      await prisma.legalCase.create({
        data: {
          ownerId,
          tenantId: sam.tenantId,
          tenancyId: sam.id,
          type: "N4",
          servedOn: dateOnlyToUtc(addDays(today, -5)),
          filedOn: dateOnlyToUtc(addDays(today, -2)),
          ltbFileNumber: "LTB-26-00991",
          filingFeeCents: 18600,
          hearingOn: dateOnlyToUtc(hearingOn),
          status: "HEARING_SET",
          notes: "Fictional sample. Not a real Landlord and Tenant Board file.",
        },
      });
    } else {
      await prisma.legalCase.update({
        where: { id: existingCase.id },
        data: { hearingOn: dateOnlyToUtc(hearingOn), status: "HEARING_SET" },
      });
    }
  }
  const quebec = await prisma.property.findFirst({
    where: { ownerId, name: "Plateau walk-up" },
  });
  if (!quebec) {
    const camille = await prisma.tenant.create({
      data: {
        ownerId,
        firstName: "Camille",
        lastName: "Bergeron",
        email: "camille@example.com",
      },
    });
    await prisma.property.create({
      data: {
        ownerId,
        name: "Plateau walk-up",
        streetAddress: "18 Rue Exemple",
        city: "Montreal",
        province: "QC",
        jurisdiction: "QC",
        postalCode: "H2X 1Y4",
        units: {
          create: {
            label: "2",
            bedrooms: 1,
            tenancies: {
              create: {
                tenantId: camille.id,
                leaseStart: dateOnlyToUtc("2026-03-01"),
                moveInOn: dateOnlyToUtc("2026-03-01"),
                monthlyRentCents: 120000,
                rentDueDay: 1,
              },
            },
          },
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
