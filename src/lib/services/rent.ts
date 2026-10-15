import { Prisma } from "@prisma/client";

import { etransferReferenceKey } from "@/lib/agent/reference";
import { buildN4Arrears, type N4Arrears } from "@/lib/arrears";
import { addDays, dateOnlyToUtc, formatLongDate, monthStart, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  daysLateLabel,
  formatAddress,
  formatMonth,
  propertyTitle,
  tenantName,
} from "@/lib/format";
import {
  planCreditAllocations,
  summarizeLedger,
  summarizeMonth,
  type ChargeStatus,
  type LedgerSummary,
} from "@/lib/ledger";
import {
  PAYMENT_METHOD_LABELS,
  type RentPaymentMethod,
} from "@/lib/payment-methods";
import { receiptLines, receiptNumber, type ReceiptView } from "@/lib/receipt";
import {
  buildReminderEmail,
  defaultReminderRules,
  dueReminders,
  type ReminderRuleInput,
} from "@/lib/reminders";
import { syncOwnerLedgers, syncTenancyLedger } from "@/lib/rent-sync";
import { ServiceError } from "@/lib/services/errors";
import { listTenants } from "@/lib/services/portfolio";
import type { PaymentInput } from "@/lib/validators";

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

async function ownedLedger(ownerId: string, tenancyId: string) {
  return prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId } } },
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

export async function getRentOverviewFor(ownerId: string) {
  const today = todayDateOnly();
  await syncOwnerLedgers(ownerId, today);
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId } } },
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
    .sort(
      (a, b) => b.daysLate - a.daysLate || a.tenantName.localeCompare(b.tenantName),
    );
  return {
    today,
    monthLabel: formatMonth(month),
    expectedCents,
    collectedCents,
    outstandingCents: expectedCents - collectedCents,
    late,
    rows,
  };
}

export async function listLateTenants(ownerId: string) {
  const overview = await getRentOverviewFor(ownerId);
  return overview.late;
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

export async function getTenancyLedgerFor(
  ownerId: string,
  tenancyId: string,
): Promise<TenancyLedger | null> {
  const today = todayDateOnly();
  const existing = await prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId } } },
    select: {
      id: true,
      leaseStart: true,
      leaseEnd: true,
      monthlyRentCents: true,
      rentDueDay: true,
    },
  });
  if (!existing) {
    return null;
  }
  await prisma.$transaction((tx) => syncTenancyLedger(tx, existing, today));
  const tenancy = await ownedLedger(ownerId, tenancyId);
  if (!tenancy) {
    return null;
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

export async function getRentStatus(ownerId: string, tenancyId?: string) {
  if (!tenancyId) {
    const overview = await getRentOverviewFor(ownerId);
    return {
      scope: "portfolio" as const,
      today: overview.today,
      monthLabel: overview.monthLabel,
      expectedCents: overview.expectedCents,
      collectedCents: overview.collectedCents,
      outstandingCents: overview.outstandingCents,
      lateCount: overview.late.length,
      tenancies: overview.rows,
    };
  }
  const ledger = await getTenancyLedgerFor(ownerId, tenancyId);
  if (!ledger) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  return {
    scope: "tenancy" as const,
    tenancyId: ledger.tenancyId,
    tenantName: ledger.tenantName,
    unitLabel: ledger.unitLabel,
    propertyLabel: ledger.propertyLabel,
    address: ledger.address,
    balanceCents: ledger.summary.balanceCents,
    creditCents: ledger.summary.creditCents,
    totalChargedCents: ledger.summary.totalChargedCents,
    totalPaidCents: ledger.summary.totalPaidCents,
    arrearsCents: ledger.arrears.totalOwingCents,
    charges: ledger.summary.charges.map((charge) => ({
      id: charge.id,
      periodStart: charge.periodStart,
      dueOn: charge.dueOn,
      amountCents: charge.amountCents,
      paidCents: charge.paidCents,
      owingCents: charge.owingCents,
      status: charge.status,
      daysLate: charge.daysLate,
    })),
    payments: ledger.payments,
  };
}

export async function listPayableTenanciesFor(ownerId: string) {
  const today = todayDateOnly();
  await syncOwnerLedgers(ownerId, today);
  const tenants = await listTenants(ownerId);
  return {
    today,
    tenancies: tenants.map((tenancy) => ({
      tenancyId: tenancy.tenancyId,
      firstName: tenancy.firstName,
      lastName: tenancy.lastName,
      tenantName: tenancy.tenantName,
      unitLabel: tenancy.unitLabel,
      propertyLabel: tenancy.propertyLabel,
    })),
  };
}

async function loadPayment(ownerId: string, paymentId: string) {
  return prisma.rentPayment.findFirst({
    where: { id: paymentId, ownerId },
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

export async function getPaymentRecordFor(ownerId: string, paymentId: string) {
  const payment = await loadPayment(ownerId, paymentId);
  if (!payment) {
    return null;
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

export async function getReceiptFor(
  ownerId: string,
  paymentId: string,
): Promise<(ReceiptView & { text: string; fileGenerated: false }) | null> {
  const payment = await getPaymentRecordFor(ownerId, paymentId);
  if (!payment) {
    return null;
  }
  const receipt: ReceiptView = {
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
  return {
    ...receipt,
    text: receiptLines(receipt).join("\n"),
    fileGenerated: false,
  };
}

export type ReminderCard = {
  chargeId: string;
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  unitId: string;
  propertyId: string;
  propertyLabel: string;
  owingCents: number;
  daysLate: number;
  scheduleLabel: string;
  emailSubject: string;
  emailText: string;
  emailTo: string | null;
};

export async function getReminderBoardFor(ownerId: string) {
  const today = todayDateOnly();
  await syncOwnerLedgers(ownerId, today);
  const account = await prisma.user.findUnique({
    where: { id: ownerId },
    include: { reminderRules: { orderBy: { offsetDays: "asc" } } },
  });
  const rules: ReminderRuleInput[] = account?.remindersConfigured
    ? account.reminderRules.map((rule) => ({
        offsetDays: rule.offsetDays,
        enabled: rule.enabled,
      }))
    : defaultReminderRules();
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { ownerId } } },
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
    unitId: string;
    propertyId: string;
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
        unitId: tenancy.unitId,
        propertyId: tenancy.unit.propertyId,
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
      landlordName: account?.name ?? "Landlord",
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
        unitId: charge.unitId,
        propertyId: charge.propertyId,
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

export async function previewReminderMessage(
  ownerId: string,
  tenancyId: string,
  chargeId?: string,
) {
  const ledger = await getTenancyLedgerFor(ownerId, tenancyId);
  if (!ledger) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const board = await getReminderBoardFor(ownerId);
  const messages = board.cards.filter((card) => {
    if (card.tenancyId !== tenancyId) {
      return false;
    }
    if (chargeId && card.chargeId !== chargeId) {
      return false;
    }
    return true;
  });
  return {
    tenancyId,
    tenantName: ledger.tenantName,
    delivered: false,
    messages,
    note:
      messages.length === 0
        ? "Nothing on this lease matches the reminder schedule. No email was sent."
        : "Preview only. No email was sent.",
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

async function ownedTenancy(ownerId: string, tenancyId: string) {
  return prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId } } },
    select: {
      id: true,
      leaseStart: true,
      leaseEnd: true,
      monthlyRentCents: true,
      rentDueDay: true,
      tenant: { select: { firstName: true, lastName: true } },
      unit: {
        select: {
          label: true,
          propertyId: true,
          property: { select: { name: true, streetAddress: true } },
        },
      },
    },
  });
}

export type PaymentPreview = {
  alreadyRecorded: boolean;
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
  amountCents: number;
  paidOn: string;
  method: RentPaymentMethod;
  referenceNumber: string | null;
  note: string | null;
  applied: { periodStart: string; amountCents: number }[];
  creditCents: number;
  existingPaymentId: string | null;
};

export async function previewRentPayment(
  ownerId: string,
  input: PaymentInput,
  today = todayDateOnly(),
): Promise<PaymentPreview> {
  const tenancy = await ownedTenancy(ownerId, input.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const referenceKey = etransferReferenceKey(input.method, input.referenceNumber);
  if (referenceKey) {
    const existing = await prisma.rentPayment.findFirst({
      where: { ownerId, referenceKey },
      select: { id: true },
    });
    if (existing) {
      const payment = await getPaymentRecordFor(ownerId, existing.id);
      return {
        alreadyRecorded: true,
        tenancyId: input.tenancyId,
        tenantName: tenantName(tenancy.tenant),
        unitLabel: tenancy.unit.label,
        propertyLabel: propertyTitle(tenancy.unit.property),
        amountCents: input.amountCents,
        paidOn: input.paidOn,
        method: input.method,
        referenceNumber: input.referenceNumber,
        note: input.note,
        applied: payment?.applied ?? [],
        creditCents: payment?.creditCents ?? 0,
        existingPaymentId: existing.id,
      };
    }
  }

  await prisma.$transaction((tx) => syncTenancyLedger(tx, tenancy, today));
  const charges = await prisma.rentCharge.findMany({
    where: { tenancyId: tenancy.id },
    include: { allocations: true },
  });
  const payments = await prisma.rentPayment.findMany({
    where: { tenancyId: tenancy.id },
    include: { allocations: true },
  });
  const planned = planCreditAllocations(
    [
      ...payments.map((payment) => ({
        id: payment.id,
        paidOn: utcToDateOnly(payment.paidOn),
        amountCents: payment.amountCents,
        allocatedCents: chargePaidCents(payment.allocations),
      })),
      {
        id: "preview",
        paidOn: input.paidOn,
        amountCents: input.amountCents,
        allocatedCents: 0,
      },
    ],
    charges.map((charge) => ({
      id: charge.id,
      dueOn: utcToDateOnly(charge.dueOn),
      amountCents: charge.amountCents,
      paidCents: chargePaidCents(charge.allocations),
    })),
  );
  const byCharge = new Map(charges.map((charge) => [charge.id, charge]));
  const applied = planned
    .filter((row) => row.paymentId === "preview")
    .map((row) => ({
      periodStart: utcToDateOnly(byCharge.get(row.chargeId)!.periodStart),
      amountCents: row.amountCents,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const allocatedCents = applied.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    alreadyRecorded: false,
    tenancyId: tenancy.id,
    tenantName: tenantName(tenancy.tenant),
    unitLabel: tenancy.unit.label,
    propertyLabel: propertyTitle(tenancy.unit.property),
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    method: input.method,
    referenceNumber: input.referenceNumber,
    note: input.note,
    applied,
    creditCents: Math.max(0, input.amountCents - allocatedCents),
    existingPaymentId: null,
  };
}

export async function recordRentPayment(
  ownerId: string,
  input: PaymentInput,
  today = todayDateOnly(),
) {
  const tenancy = await ownedTenancy(ownerId, input.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const referenceKey = etransferReferenceKey(input.method, input.referenceNumber);

  let outcome: "recorded" | "already_recorded";
  let paymentId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (referenceKey) {
        const existing = await tx.rentPayment.findFirst({
          where: { ownerId, referenceKey },
          select: { id: true },
        });
        if (existing) {
          return { outcome: "already_recorded" as const, id: existing.id };
        }
      }
      await syncTenancyLedger(tx, tenancy, today);
      const payment = await tx.rentPayment.create({
        data: {
          ownerId,
          tenancyId: tenancy.id,
          amountCents: input.amountCents,
          paidOn: dateOnlyToUtc(input.paidOn),
          method: input.method,
          referenceNumber: input.referenceNumber,
          referenceKey,
          note: input.note,
        },
      });
      await syncTenancyLedger(tx, tenancy, today);
      return { outcome: "recorded" as const, id: payment.id };
    });
    outcome = created.outcome;
    paymentId = created.id;
  } catch (error) {
    if (!isUniqueViolation(error) || !referenceKey) {
      throw error;
    }
    const existing = await prisma.rentPayment.findFirst({
      where: { ownerId, referenceKey },
      select: { id: true },
    });
    if (!existing) {
      throw error;
    }
    outcome = "already_recorded";
    paymentId = existing.id;
  }

  const payment = await getPaymentRecordFor(ownerId, paymentId);
  if (!payment) {
    throw new ServiceError("not_found", "That payment was not found.");
  }
  return { outcome, payment };
}

export type N4Draft = {
  fileGenerated: false;
  served: false;
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
  address: string;
  landlordName: string;
  asOf: string;
  totalOwingCents: number;
  periods: N4Arrears["periods"];
  suggestedTerminationDate: string;
  notice: string;
};

const N4_NOTICE =
  "Draft data only. No PDF or Landlord and Tenant Board form was created, and the notice was not served.";

export async function buildN4Draft(
  ownerId: string,
  tenancyId: string,
  today = todayDateOnly(),
): Promise<N4Draft> {
  const ledger = await getTenancyLedgerFor(ownerId, tenancyId);
  if (!ledger) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const landlord = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { name: true },
  });
  return {
    fileGenerated: false,
    served: false,
    tenancyId: ledger.tenancyId,
    tenantName: ledger.tenantName,
    unitLabel: ledger.unitLabel,
    propertyLabel: ledger.propertyLabel,
    address: ledger.address,
    landlordName: landlord?.name ?? "Landlord",
    asOf: ledger.arrears.asOf,
    totalOwingCents: ledger.arrears.totalOwingCents,
    periods: ledger.arrears.periods,
    suggestedTerminationDate: addDays(today, 14),
    notice: N4_NOTICE,
  };
}

export async function saveN4Draft(
  ownerId: string,
  tenancyId: string,
  today = todayDateOnly(),
) {
  const draft = await buildN4Draft(ownerId, tenancyId, today);
  if (draft.totalOwingCents <= 0) {
    return {
      ...draft,
      persisted: false as const,
      noticeId: null,
      noticeStatus: null,
      documentCount: 0,
      reason: "Nothing is past due, so no N4 draft was saved.",
    };
  }
  const notice = await prisma.notice.create({
    data: {
      ownerId,
      tenancyId,
      type: "N4",
      status: "DRAFT",
      totalOwingCents: draft.totalOwingCents,
      terminationDate: dateOnlyToUtc(draft.suggestedTerminationDate),
      notes: "Draft prepared via agent. Not served. No form file was created.",
    },
  });
  const documentCount = await prisma.document.count({
    where: { noticeId: notice.id },
  });
  return {
    ...draft,
    persisted: true as const,
    noticeId: notice.id,
    noticeStatus: notice.status,
    documentCount,
    reason: null,
  };
}
