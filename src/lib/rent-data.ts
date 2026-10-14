import "server-only";

import { notFound } from "next/navigation";

import { buildN4Arrears, type N4Arrears } from "@/lib/arrears";
import { requireUser } from "@/lib/dal";
import {
  formatLongDate,
  monthStart,
  todayDateOnly,
  utcToDateOnly,
} from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  daysLateLabel,
  formatAddress,
  formatMonth,
  propertyTitle,
  tenantName,
} from "@/lib/format";
import {
  summarizeLedger,
  summarizeMonth,
  type ChargeStatus,
  type LedgerSummary,
} from "@/lib/ledger";
import {
  PAYMENT_METHOD_LABELS,
  type RentPaymentMethod,
} from "@/lib/payment-methods";
import { receiptNumber, type ReceiptView } from "@/lib/receipt";
import {
  buildReminderEmail,
  defaultReminderRules,
  dueReminders,
  type ReminderRuleInput,
} from "@/lib/reminders";
import { syncOwnerLedgers, syncTenancyLedger } from "@/lib/rent-sync";

const ledgerInclude = {
  tenant: true,
  unit: { include: { property: true } },
  charges: {
    include: { allocations: true },
    orderBy: { periodStart: "asc" as const },
  },
  payments: {
    include: { allocations: { include: { charge: true } } },
    orderBy: { paidOn: "desc" as const },
  },
};

type LedgerTenancy = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.tenancy.findFirst<{ include: typeof ledgerInclude }>
    >
  >
>;

function chargePaidCents(allocations: { amountCents: number }[]) {
  return allocations.reduce((sum, row) => sum + row.amountCents, 0);
}

function toSummary(tenancy: LedgerTenancy, today: string) {
  const charges = tenancy.charges.map((charge) => ({
    id: charge.id,
    periodStart: utcToDateOnly(charge.periodStart),
    dueOn: utcToDateOnly(charge.dueOn),
    amountCents: charge.amountCents,
    paidCents: chargePaidCents(charge.allocations),
  }));
  const payments = tenancy.payments.map((payment) => ({
    id: payment.id,
    amountCents: payment.amountCents,
    paidOn: utcToDateOnly(payment.paidOn),
    method: payment.method,
    referenceNumber: payment.referenceNumber,
    note: payment.note,
    allocatedCents: chargePaidCents(payment.allocations),
    allocations: payment.allocations.map((row) => ({
      amountCents: row.amountCents,
      periodStart: utcToDateOnly(row.charge.periodStart),
    })),
  }));
  return {
    summary: summarizeLedger(charges, payments, today),
    payments,
    arrears: buildN4Arrears({
      tenancyId: tenancy.id,
      asOf: today,
      charges,
    }),
  };
}

async function ownedLedger(userId: string, tenancyId: string) {
  return prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId: userId } } },
    include: ledgerInclude,
  });
}

export type LateTenant = {
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
  arrearsCents: number;
  daysLate: number;
};

export type RentTenancyRow = LateTenant & {
  propertyId: string;
  unitId: string;
  monthStatus: ChargeStatus | null;
  monthOwingCents: number;
  balanceCents: number;
};

export async function getRentOverview() {
  const user = await requireUser();
  const today = todayDateOnly();
  await syncOwnerLedgers(user.id, today);
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId: user.id } } },
    include: ledgerInclude,
    orderBy: { leaseStart: "asc" },
  });
  const month = monthStart(today);
  let expectedCents = 0;
  let collectedCents = 0;
  const rows: RentTenancyRow[] = [];
  for (const tenancy of tenancies) {
    const { summary, arrears } = toSummary(tenancy, today);
    const monthSummary = summarizeMonth(summary.charges, month);
    expectedCents += monthSummary.expectedCents;
    collectedCents += monthSummary.collectedCents;
    const monthCharge = summary.charges.find(
      (charge) => charge.periodStart === month,
    );
    const daysLate = arrears.periods.reduce(
      (max, period) => Math.max(max, period.daysLate),
      0,
    );
    rows.push({
      tenancyId: tenancy.id,
      tenantName: tenantName(tenancy.tenant),
      unitLabel: tenancy.unit.label,
      propertyLabel: propertyTitle(tenancy.unit.property),
      propertyId: tenancy.unit.propertyId,
      unitId: tenancy.unitId,
      arrearsCents: arrears.totalOwingCents,
      daysLate,
      monthStatus: monthCharge?.status ?? null,
      monthOwingCents: monthCharge?.owingCents ?? 0,
      balanceCents: summary.balanceCents,
    });
  }
  const late = rows
    .filter((row) => row.arrearsCents > 0)
    .sort((a, b) => b.daysLate - a.daysLate || a.tenantName.localeCompare(b.tenantName));
  return {
    user,
    today,
    monthLabel: formatMonth(month),
    expectedCents,
    collectedCents,
    outstandingCents: expectedCents - collectedCents,
    late,
    rows,
  };
}

export type TenancyLedger = {
  tenancyId: string;
  tenantName: string;
  tenantEmail: string | null;
  unitLabel: string;
  propertyLabel: string;
  propertyId: string;
  unitId: string;
  address: string;
  summary: LedgerSummary;
  arrears: N4Arrears;
  payments: {
    id: string;
    amountCents: number;
    paidOn: string;
    method: RentPaymentMethod;
    referenceNumber: string | null;
    note: string | null;
    allocatedCents: number;
  }[];
};

export async function getTenancyLedger(tenancyId: string): Promise<TenancyLedger> {
  const user = await requireUser();
  const today = todayDateOnly();
  const existing = await prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId: user.id } } },
    select: {
      id: true,
      leaseStart: true,
      leaseEnd: true,
      monthlyRentCents: true,
      rentDueDay: true,
    },
  });
  if (!existing) {
    notFound();
  }
  await prisma.$transaction((tx) => syncTenancyLedger(tx, existing, today));
  const tenancy = await ownedLedger(user.id, tenancyId);
  if (!tenancy) {
    notFound();
  }
  const { summary, payments, arrears } = toSummary(tenancy, today);
  return {
    tenancyId: tenancy.id,
    tenantName: tenantName(tenancy.tenant),
    tenantEmail: tenancy.tenant.email,
    unitLabel: tenancy.unit.label,
    propertyLabel: propertyTitle(tenancy.unit.property),
    propertyId: tenancy.unit.propertyId,
    unitId: tenancy.unitId,
    address: formatAddress(tenancy.unit.property),
    summary,
    arrears,
    payments: payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      method: payment.method as RentPaymentMethod,
      referenceNumber: payment.referenceNumber,
      note: payment.note,
      allocatedCents: payment.allocatedCents,
    })),
  };
}

export async function listPayableTenancies() {
  const user = await requireUser();
  const today = todayDateOnly();
  await syncOwnerLedgers(user.id, today);
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId: user.id } } },
    include: { tenant: true, unit: { include: { property: true } } },
    orderBy: { leaseStart: "asc" },
  });
  return {
    today,
    tenancies: tenancies.map((tenancy) => ({
      tenancyId: tenancy.id,
      firstName: tenancy.tenant.firstName,
      lastName: tenancy.tenant.lastName,
      tenantName: tenantName(tenancy.tenant),
      unitLabel: tenancy.unit.label,
      propertyLabel: propertyTitle(tenancy.unit.property),
    })),
  };
}

async function loadPayment(userId: string, paymentId: string) {
  return prisma.rentPayment.findFirst({
    where: { id: paymentId, ownerId: userId },
    include: {
      allocations: { include: { charge: true } },
      tenancy: {
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      },
      owner: { select: { name: true } },
    },
  });
}

export async function getPaymentRecord(paymentId: string) {
  const user = await requireUser();
  const payment = await loadPayment(user.id, paymentId);
  if (!payment) {
    notFound();
  }
  const applied = payment.allocations
    .map((row) => ({
      periodStart: utcToDateOnly(row.charge.periodStart),
      amountCents: row.amountCents,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const allocatedCents = applied.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    id: payment.id,
    tenancyId: payment.tenancyId,
    tenantName: tenantName(payment.tenancy.tenant),
    unitLabel: payment.tenancy.unit.label,
    propertyLabel: propertyTitle(payment.tenancy.unit.property),
    address: formatAddress(payment.tenancy.unit.property),
    amountCents: payment.amountCents,
    paidOn: utcToDateOnly(payment.paidOn),
    method: payment.method as RentPaymentMethod,
    methodLabel: PAYMENT_METHOD_LABELS[payment.method],
    referenceNumber: payment.referenceNumber,
    note: payment.note,
    applied,
    creditCents: Math.max(0, payment.amountCents - allocatedCents),
    landlordName: payment.owner.name,
  };
}

export async function getReceipt(paymentId: string): Promise<ReceiptView> {
  const payment = await getPaymentRecord(paymentId);
  return {
    receiptNumber: receiptNumber(payment.id),
    landlordName: payment.landlordName,
    paidOnLabel: formatLongDate(payment.paidOn),
    tenantName: payment.tenantName,
    unitLabel: payment.unitLabel,
    address: payment.address,
    amountCents: payment.amountCents,
    methodLabel: payment.methodLabel,
    referenceNumber: payment.referenceNumber,
    note: payment.note,
    applied: payment.applied,
    creditCents: payment.creditCents,
  };
}

export type ReminderCard = {
  chargeId: string;
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
  owingCents: number;
  daysLate: number;
  scheduleLabel: string;
  emailSubject: string;
  emailText: string;
  emailTo: string | null;
};

export async function getReminderBoard() {
  const user = await requireUser();
  const today = todayDateOnly();
  await syncOwnerLedgers(user.id, today);
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    include: { reminderRules: { orderBy: { offsetDays: "asc" } } },
  });
  const rules: ReminderRuleInput[] = account?.remindersConfigured
    ? account.reminderRules.map((rule) => ({
        offsetDays: rule.offsetDays,
        enabled: rule.enabled,
      }))
    : defaultReminderRules();
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId: user.id } } },
    include: ledgerInclude,
  });
  const open: {
    tenancyId: string;
    chargeId: string;
    dueOn: string;
    periodStart: string;
    owingCents: number;
    chargedCents: number;
    tenantName: string;
    tenantFirstName: string;
    tenantEmail: string | null;
    unitLabel: string;
    propertyLabel: string;
    place: string;
  }[] = [];
  for (const tenancy of tenancies) {
    const { summary } = toSummary(tenancy, today);
    const place = `${tenancy.unit.label}, ${formatAddress(tenancy.unit.property)}`;
    for (const charge of summary.charges) {
      if (charge.owingCents <= 0) {
        continue;
      }
      open.push({
        tenancyId: tenancy.id,
        chargeId: charge.id,
        dueOn: charge.dueOn,
        periodStart: charge.periodStart,
        owingCents: charge.owingCents,
        chargedCents: charge.amountCents,
        tenantName: tenantName(tenancy.tenant),
        tenantFirstName: tenancy.tenant.firstName,
        tenantEmail: tenancy.tenant.email,
        unitLabel: tenancy.unit.label,
        propertyLabel: propertyTitle(tenancy.unit.property),
        place,
      });
    }
  }
  const reminders = dueReminders(open, rules, today);
  const byCharge = new Map(open.map((charge) => [charge.chargeId, charge]));
  const cards: ReminderCard[] = reminders.flatMap((reminder) => {
    const charge = byCharge.get(reminder.chargeId);
    if (!charge) {
      return [];
    }
    const email = buildReminderEmail({
      landlordName: user.name,
      tenantFirstName: charge.tenantFirstName,
      tenantEmail: charge.tenantEmail,
      unitLabel: charge.unitLabel,
      place: charge.place,
      periodStart: charge.periodStart,
      dueOnLabel: formatLongDate(charge.dueOn),
      owingCents: charge.owingCents,
      chargedCents: charge.chargedCents,
      kind: reminder.kind,
      daysUntilDue: reminder.daysUntilDue,
      daysLate: reminder.daysLate,
    });
    return [
      {
        chargeId: charge.chargeId,
        tenancyId: charge.tenancyId,
        tenantName: charge.tenantName,
        unitLabel: charge.unitLabel,
        propertyLabel: charge.propertyLabel,
        owingCents: charge.owingCents,
        daysLate: reminder.daysLate,
        scheduleLabel:
          reminder.daysLate > 0
            ? daysLateLabel(reminder.daysLate)
            : reminder.daysUntilDue === 0
              ? "Due today"
              : `Due in ${reminder.daysUntilDue === 1 ? "1 day" : `${reminder.daysUntilDue} days`}`,
        emailSubject: email.subject,
        emailText: email.text,
        emailTo: email.to,
      },
    ];
  });
  cards.sort(
    (a, b) => b.daysLate - a.daysLate || a.tenantName.localeCompare(b.tenantName),
  );
  return { rules, cards };
}
