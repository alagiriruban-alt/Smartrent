import { Prisma, type LegalCaseStatus, type LegalCaseType } from "@prisma/client";

import { isLedgerChargeKind, type LedgerChargeKind } from "@/lib/allocations";
import { writeAudit } from "@/lib/agent/audit";
import { dateOnlyToUtc, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { dueOnForPeriod } from "@/lib/ledger";
import { parseMoneyToCents } from "@/lib/money";
import { isRentalPeriod } from "@/lib/periods";
import { paymentDedupeKey, type PaymentReferenceType } from "@/lib/payments/identity";
import { isPaymentMethod, type RentPaymentMethod } from "@/lib/payment-methods";
import { splitCentsByShare } from "@/lib/shares";
import { T776_LINES } from "@/lib/t776";
import { ServiceError } from "@/lib/services/errors";

const LEGAL_TYPES = ["N4", "L1", "L2", "N12", "OTHER"] as const;
const LEGAL_STATUSES = [
  "OPEN",
  "SERVED",
  "FILED",
  "HEARING_SET",
  "DECIDED",
  "WITHDRAWN",
  "CLOSED",
] as const;

export type LegalCaseInput = {
  id?: string | null;
  tenancyId: string;
  type: string;
  typeDetail?: string | null;
  servedOn?: string | null;
  filedOn?: string | null;
  ltbFileNumber?: string | null;
  filingFee?: string | number | null;
  hearingOn?: string | null;
  status: string;
  outcome?: string | null;
  notes?: string | null;
  reason?: string | null;
};

export type ExplicitAllocationInput = {
  tenancyId: string;
  paidOn: string;
  amountCents: number;
  method: RentPaymentMethod;
  referenceType?: PaymentReferenceType;
  referenceNumber?: string | null;
  note?: string | null;
  lines: {
    kind: "RENT" | LedgerChargeKind;
    period: string | null;
    portion?: string | null;
    amountCents: number;
    description?: string | null;
  }[];
};

function dateOrNull(value: string | null | undefined, label: string) {
  if (!value) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ServiceError("invalid", `Enter ${label} as YYYY-MM-DD.`);
  }
  return dateOnlyToUtc(value);
}

async function ownedTenancy(ownerId: string, tenancyId: string) {
  return prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId } } },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  });
}

async function lockedFields(ownerId: string, entityType: string, entityId: string) {
  const rows = await prisma.ledgerOverride.findMany({
    where: { ownerId, entityType, entityId },
    select: { fields: true },
  });
  return [...new Set(rows.flatMap((row) => row.fields))];
}

export async function recordOverride(input: {
  ownerId: string;
  entityType: string;
  entityId: string;
  fields: string[];
  reason: string;
  before: unknown;
  after: unknown;
  viaAgent: boolean;
  summary: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new ServiceError("invalid", "Enter a short reason for this correction.");
  }
  await prisma.ledgerOverride.create({
    data: {
      ownerId: input.ownerId,
      entityType: input.entityType,
      entityId: input.entityId,
      fields: input.fields,
      reason,
      before: input.before as Prisma.InputJsonValue,
      after: input.after as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    ownerId: input.ownerId,
    tokenId: null,
    tool: "landlord_correction",
    status: "ok",
    summary: input.summary,
    viaAgent: input.viaAgent,
  });
}

export async function listLedgerCharges(ownerId: string, tenancyId?: string) {
  const rows = await prisma.ledgerCharge.findMany({
    where: {
      ownerId,
      ...(tenancyId ? { tenancyId } : {}),
    },
    include: { allocations: true },
    orderBy: [{ dueOn: "desc" }],
  });
  return rows.map((row) => {
    const paidCents = row.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    return {
      id: row.id,
      tenancyId: row.tenancyId,
      kind: row.kind,
      period: row.period,
      description: row.description,
      amountCents: row.amountCents,
      paidCents,
      owingCents: Math.max(0, row.amountCents - paidCents),
      dueOn: utcToDateOnly(row.dueOn),
    };
  });
}

export async function saveLedgerCharge(input: {
  ownerId: string;
  tenancyId: string;
  kind: string;
  period?: string | null;
  description: string;
  amountCents: number;
  dueOn: string;
  viaAgent: boolean;
}) {
  if (!isLedgerChargeKind(input.kind)) {
    throw new ServiceError("invalid", "Choose water, utilities, a fee, an LTB filing fee, or other.");
  }
  if (input.period && !isRentalPeriod(input.period)) {
    throw new ServiceError("invalid", "Enter the period as YYYY-MM, or leave it blank.");
  }
  const description = input.description.trim();
  if (description.length < 2) {
    throw new ServiceError("invalid", "Describe the charge.");
  }
  if (input.amountCents <= 0) {
    throw new ServiceError("invalid", "Enter an amount greater than zero.");
  }
  const tenancy = await ownedTenancy(input.ownerId, input.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const created = await prisma.ledgerCharge.create({
    data: {
      ownerId: input.ownerId,
      tenancyId: tenancy.id,
      kind: input.kind,
      period: input.period || null,
      description,
      amountCents: input.amountCents,
      dueOn: dateOnlyToUtc(input.dueOn),
    },
  });
  return {
    id: created.id,
    tenancyId: created.tenancyId,
    kind: created.kind,
    description: created.description,
    amountCents: created.amountCents,
    dueOn: utcToDateOnly(created.dueOn),
  };
}

export async function listRentChanges(ownerId: string, tenancyId: string) {
  const rows = await prisma.rentChange.findMany({
    where: { ownerId, tenancyId },
    include: { notice: { select: { id: true, type: true, status: true } } },
    orderBy: { effectiveOn: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    effectiveOn: utcToDateOnly(row.effectiveOn),
    previousCents: row.previousCents,
    amountCents: row.amountCents,
    reason: row.reason,
    noticeId: row.noticeId,
    noticeType: row.notice?.type ?? null,
    noticeStatus: row.notice?.status ?? null,
  }));
}

export async function listRentCredits(ownerId: string, tenancyId?: string) {
  const rows = await prisma.rentCredit.findMany({
    where: { ownerId, ...(tenancyId ? { tenancyId } : {}) },
    orderBy: { effectiveOn: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    tenancyId: row.tenancyId,
    amountCents: row.amountCents,
    kind: row.kind,
    reason: row.reason,
    documentId: row.documentId,
    period: row.period,
    effectiveOn: utcToDateOnly(row.effectiveOn),
  }));
}

export async function saveRentCredit(input: {
  ownerId: string;
  tenancyId: string;
  amountCents: number;
  kind: "IN_KIND" | "OFFSET";
  reason: string;
  documentId?: string | null;
  period?: string | null;
  effectiveOn: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new ServiceError("invalid", "Enter the reason for this credit.");
  }
  if (input.period && !isRentalPeriod(input.period)) {
    throw new ServiceError("invalid", "Enter the period as YYYY-MM, or leave it blank.");
  }
  if (input.amountCents <= 0) {
    throw new ServiceError("invalid", "Enter an amount greater than zero.");
  }
  const tenancy = await ownedTenancy(input.ownerId, input.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const created = await prisma.rentCredit.create({
    data: {
      ownerId: input.ownerId,
      tenancyId: tenancy.id,
      amountCents: input.amountCents,
      kind: input.kind,
      reason,
      documentId: input.documentId?.trim() || null,
      period: input.period || null,
      effectiveOn: dateOnlyToUtc(input.effectiveOn),
    },
  });
  return {
    id: created.id,
    amountCents: created.amountCents,
    kind: created.kind,
    reason: created.reason,
    period: created.period,
    effectiveOn: utcToDateOnly(created.effectiveOn),
  };
}

export async function listExpenses(ownerId: string, propertyId?: string) {
  const rows = await prisma.expense.findMany({
    where: { ownerId, ...(propertyId ? { propertyId } : {}) },
    orderBy: { incurredOn: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    incurredOn: utcToDateOnly(row.incurredOn),
    vendor: row.vendor,
    invoiceNumber: row.invoiceNumber,
    description: row.description,
    category: row.category,
    subtotalCents: row.subtotalCents,
    hstCents: row.hstCents,
    totalCents: row.amountCents,
    receiptDocumentId: row.receiptDocumentId,
  }));
}

export async function saveExpense(input: {
  ownerId: string;
  propertyId: string;
  incurredOn: string;
  vendor?: string | null;
  invoiceNumber?: string | null;
  description: string;
  category: string;
  subtotalCents: number;
  hstCents: number;
  receiptDocumentId?: string | null;
}) {
  if (!T776_LINES.some((line) => line.category === input.category)) {
    throw new ServiceError("invalid", "Choose a T776 category.");
  }
  if (input.subtotalCents < 0 || input.hstCents < 0) {
    throw new ServiceError("invalid", "Subtotal and HST have to be zero or more.");
  }
  const description = input.description.trim();
  if (description.length < 2) {
    throw new ServiceError("invalid", "Describe the expense.");
  }
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, ownerId: input.ownerId },
    select: { id: true },
  });
  if (!property) {
    throw new ServiceError("not_found", "That property was not found.");
  }
  const total = input.subtotalCents + input.hstCents;
  const created = await prisma.expense.create({
    data: {
      ownerId: input.ownerId,
      propertyId: property.id,
      incurredOn: dateOnlyToUtc(input.incurredOn),
      vendor: input.vendor?.trim() || null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      description,
      category: input.category as never,
      subtotalCents: input.subtotalCents,
      hstCents: input.hstCents,
      amountCents: total,
      receiptDocumentId: input.receiptDocumentId?.trim() || null,
    },
  });
  return {
    id: created.id,
    totalCents: created.amountCents,
    description: created.description,
  };
}

export async function propertyShares(ownerId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, ownerId },
    include: { owners: { orderBy: { name: "asc" } }, expenses: true },
  });
  if (!property) {
    return null;
  }
  const byCategory = new Map<string, number>();
  for (const expense of property.expenses) {
    byCategory.set(
      expense.category,
      (byCategory.get(expense.category) ?? 0) + expense.amountCents,
    );
  }
  const owners = property.owners.map((owner) => ({
    id: owner.id,
    name: owner.name,
    shareBps: owner.shareBps,
  }));
  const categories = T776_LINES.map((line) => {
    const totalCents = byCategory.get(line.category) ?? 0;
    const split = splitCentsByShare(
      totalCents,
      owners.map((owner) => ({ key: owner.id, shareBps: owner.shareBps })),
    );
    return {
      category: line.category,
      line: line.line,
      label: line.label,
      totalCents,
      shares: split.lines.map((share) => ({
        ownerId: share.key,
        name: owners.find((owner) => owner.id === share.key)?.name ?? "",
        shareBps: share.shareBps,
        amountCents: share.amountCents,
      })),
    };
  }).filter((line) => line.totalCents > 0);
  const totalCents = categories.reduce((sum, line) => sum + line.totalCents, 0);
  return {
    propertyId: property.id,
    jurisdiction: property.jurisdiction,
    province: property.province,
    owners,
    balanced: splitCentsByShare(
      totalCents,
      owners.map((owner) => ({ key: owner.id, shareBps: owner.shareBps })),
    ).balanced,
    totalCents,
    ownerTotals: splitCentsByShare(
      totalCents,
      owners.map((owner) => ({ key: owner.id, shareBps: owner.shareBps })),
    ).lines.map((line) => ({
      id: line.key,
      name: owners.find((owner) => owner.id === line.key)?.name ?? "",
      shareBps: line.shareBps,
      amountCents: line.amountCents,
    })),
    categories,
  };
}

export async function replacePropertyOwners(input: {
  ownerId: string;
  propertyId: string;
  owners: { name: string; shareBps: number }[];
  reason: string;
}) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, ownerId: input.ownerId },
    include: { owners: true },
  });
  if (!property) {
    throw new ServiceError("not_found", "That property was not found.");
  }
  const total = input.owners.reduce((sum, owner) => sum + owner.shareBps, 0);
  if (total !== 10000) {
    throw new ServiceError("invalid", "Ownership percents have to add up to 100.");
  }
  const before = property.owners.map((owner) => ({
    name: owner.name,
    shareBps: owner.shareBps,
  }));
  await prisma.$transaction(async (tx) => {
    await tx.propertyOwner.deleteMany({ where: { propertyId: property.id } });
    await tx.propertyOwner.createMany({
      data: input.owners.map((owner) => ({
        ownerId: input.ownerId,
        propertyId: property.id,
        name: owner.name,
        shareBps: owner.shareBps,
      })),
    });
  });
  await recordOverride({
    ownerId: input.ownerId,
    entityType: "PROPERTY_OWNERS",
    entityId: property.id,
    fields: ["owners"],
    reason: input.reason,
    before,
    after: input.owners,
    viaAgent: false,
    summary: `Updated owners for ${property.name ?? property.streetAddress}`,
  });
}

function legalView(row: {
  id: string;
  tenancyId: string;
  tenantId: string;
  type: LegalCaseType;
  typeDetail: string | null;
  servedOn: Date | null;
  filedOn: Date | null;
  ltbFileNumber: string | null;
  filingFeeCents: number | null;
  hearingOn: Date | null;
  status: LegalCaseStatus;
  outcome: string | null;
  notes: string | null;
}) {
  return {
    id: row.id,
    tenancyId: row.tenancyId,
    tenantId: row.tenantId,
    type: row.type,
    typeDetail: row.typeDetail,
    servedOn: row.servedOn ? utcToDateOnly(row.servedOn) : null,
    filedOn: row.filedOn ? utcToDateOnly(row.filedOn) : null,
    ltbFileNumber: row.ltbFileNumber,
    filingFeeCents: row.filingFeeCents,
    hearingOn: row.hearingOn ? utcToDateOnly(row.hearingOn) : null,
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
  };
}

export async function listLegalCases(ownerId: string, tenancyId?: string) {
  const rows = await prisma.legalCase.findMany({
    where: { ownerId, ...(tenancyId ? { tenancyId } : {}) },
    orderBy: [{ hearingOn: "asc" }, { createdAt: "desc" }],
  });
  const today = todayDateOnly();
  const cases = rows.map(legalView);
  return {
    cases,
    upcomingHearings: cases.filter(
      (item) => item.hearingOn !== null && item.hearingOn >= today && item.status !== "CLOSED",
    ),
  };
}

export function readLegalCase(input: LegalCaseInput) {
  if (!(LEGAL_TYPES as readonly string[]).includes(input.type)) {
    throw new ServiceError("invalid", "Choose N4, L1, L2, N12, or other.");
  }
  if (!(LEGAL_STATUSES as readonly string[]).includes(input.status)) {
    throw new ServiceError("invalid", "Choose a case status.");
  }
  const filingFeeCents =
    input.filingFee === null || input.filingFee === undefined || input.filingFee === ""
      ? null
      : parseMoneyToCents(input.filingFee);
  if (input.filingFee && filingFeeCents === null) {
    throw new ServiceError("invalid", "Enter the filing fee in dollars.");
  }
  return {
    tenancyId: input.tenancyId,
    type: input.type as LegalCaseType,
    typeDetail: input.typeDetail?.trim() || null,
    servedOn: input.servedOn || null,
    filedOn: input.filedOn || null,
    ltbFileNumber: input.ltbFileNumber?.trim() || null,
    filingFeeCents,
    hearingOn: input.hearingOn || null,
    status: input.status as LegalCaseStatus,
    outcome: input.outcome?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function saveLegalCase(input: {
  ownerId: string;
  legal: ReturnType<typeof readLegalCase>;
  id?: string | null;
  viaAgent: boolean;
  reason?: string | null;
}) {
  const tenancy = await ownedTenancy(input.ownerId, input.legal.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const data = {
    type: input.legal.type,
    typeDetail: input.legal.typeDetail,
    servedOn: dateOrNull(input.legal.servedOn, "the served date"),
    filedOn: dateOrNull(input.legal.filedOn, "the filed date"),
    ltbFileNumber: input.legal.ltbFileNumber,
    filingFeeCents: input.legal.filingFeeCents,
    hearingOn: dateOrNull(input.legal.hearingOn, "the hearing date"),
    status: input.legal.status,
    outcome: input.legal.outcome,
    notes: input.legal.notes,
  };
  const existing = input.id
    ? await prisma.legalCase.findFirst({
        where: { id: input.id, ownerId: input.ownerId },
      })
    : input.legal.ltbFileNumber
      ? await prisma.legalCase.findFirst({
          where: { ownerId: input.ownerId, ltbFileNumber: input.legal.ltbFileNumber },
        })
      : null;
  if (!existing) {
    const created = await prisma.legalCase.create({
      data: {
        ownerId: input.ownerId,
        tenantId: tenancy.tenantId,
        tenancyId: tenancy.id,
        ...data,
      },
    });
    return { outcome: "created" as const, legalCase: legalView(created), lockedFields: [] };
  }
  const locked = await lockedFields(input.ownerId, "LEGAL_CASE", existing.id);
  if (!input.viaAgent) {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 3) {
      throw new ServiceError("invalid", "Enter a short reason for this correction.");
    }
    const before = legalView(existing);
    const updated = await prisma.legalCase.update({
      where: { id: existing.id },
      data,
    });
    await recordOverride({
      ownerId: input.ownerId,
      entityType: "LEGAL_CASE",
      entityId: existing.id,
      fields: Object.keys(data),
      reason,
      before,
      after: legalView(updated),
      viaAgent: false,
      summary: `Corrected ${existing.type} case ${existing.ltbFileNumber ?? existing.id}`,
    });
    return {
      outcome: "updated" as const,
      legalCase: legalView(updated),
      lockedFields: Object.keys(data),
    };
  }
  const keep = new Set(locked);
  const updated = await prisma.legalCase.update({
    where: { id: existing.id },
    data: {
      type: keep.has("type") ? existing.type : data.type,
      typeDetail: keep.has("typeDetail") ? existing.typeDetail : data.typeDetail,
      servedOn: keep.has("servedOn") ? existing.servedOn : data.servedOn,
      filedOn: keep.has("filedOn") ? existing.filedOn : data.filedOn,
      ltbFileNumber: keep.has("ltbFileNumber") ? existing.ltbFileNumber : data.ltbFileNumber,
      filingFeeCents: keep.has("filingFeeCents") ? existing.filingFeeCents : data.filingFeeCents,
      hearingOn: keep.has("hearingOn") ? existing.hearingOn : data.hearingOn,
      status: keep.has("status") ? existing.status : data.status,
      outcome: keep.has("outcome") ? existing.outcome : data.outcome,
      notes: keep.has("notes") ? existing.notes : data.notes,
    },
  });
  return {
    outcome: locked.length > 0 ? ("landlord_wins" as const) : ("updated" as const),
    legalCase: legalView(updated),
    lockedFields: locked,
  };
}

export async function correctChargeAmount(input: {
  ownerId: string;
  chargeId: string;
  amountCents: number;
  reason: string;
}) {
  if (input.amountCents <= 0) {
    throw new ServiceError("invalid", "Enter an amount greater than zero.");
  }
  const rent = await prisma.rentCharge.findFirst({
    where: { id: input.chargeId, tenancy: { unit: { property: { ownerId: input.ownerId } } } },
  });
  if (rent) {
    const before = { amountCents: rent.amountCents };
    const updated = await prisma.rentCharge.update({
      where: { id: rent.id },
      data: { amountCents: input.amountCents },
    });
    await recordOverride({
      ownerId: input.ownerId,
      entityType: "RENT_CHARGE",
      entityId: rent.id,
      fields: ["amountCents"],
      reason: input.reason,
      before,
      after: { amountCents: updated.amountCents },
      viaAgent: false,
      summary: `Corrected rent for ${rent.period} to ${(updated.amountCents / 100).toFixed(2)}`,
    });
    return { id: updated.id, amountCents: updated.amountCents };
  }
  const other = await prisma.ledgerCharge.findFirst({
    where: { id: input.chargeId, ownerId: input.ownerId },
  });
  if (!other) {
    throw new ServiceError("not_found", "That charge was not found.");
  }
  const updated = await prisma.ledgerCharge.update({
    where: { id: other.id },
    data: { amountCents: input.amountCents },
  });
  await recordOverride({
    ownerId: input.ownerId,
    entityType: "LEDGER_CHARGE",
    entityId: other.id,
    fields: ["amountCents"],
    reason: input.reason,
    before: { amountCents: other.amountCents },
    after: { amountCents: updated.amountCents },
    viaAgent: false,
    summary: `Corrected ${other.kind.toLowerCase()} charge to ${(updated.amountCents / 100).toFixed(2)}`,
  });
  return { id: updated.id, amountCents: updated.amountCents };
}

export async function saveExplicitPayment(input: {
  ownerId: string;
  payment: ExplicitAllocationInput;
}) {
  const tenancy = await ownedTenancy(input.ownerId, input.payment.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const total = input.payment.lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (total !== input.payment.amountCents || input.payment.lines.length === 0) {
    throw new ServiceError("invalid", "The allocations have to add up to the payment.");
  }
  for (const line of input.payment.lines) {
    if (line.kind === "RENT" && (!line.period || !isRentalPeriod(line.period))) {
      throw new ServiceError("invalid", "Each rent allocation needs a YYYY-MM period.");
    }
    if (line.amountCents <= 0) {
      throw new ServiceError("invalid", "Each allocation has to be greater than zero.");
    }
  }
  const identity = paymentDedupeKey({
    method: input.payment.method,
    referenceNumber: input.payment.referenceNumber,
    referenceType: input.payment.referenceType,
    tenancyId: tenancy.id,
    paidOn: input.payment.paidOn,
    amountCents: input.payment.amountCents,
  });
  const existing = await prisma.rentPayment.findFirst({
    where: { ownerId: input.ownerId, dedupeKey: identity.dedupeKey },
    select: { id: true },
  });
  if (existing) {
    return { outcome: "already_recorded" as const, paymentId: existing.id };
  }
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.rentPayment.create({
      data: {
        ownerId: input.ownerId,
        tenancyId: tenancy.id,
        amountCents: input.payment.amountCents,
        paidOn: dateOnlyToUtc(input.payment.paidOn),
        method: input.payment.method,
        referenceNumber: input.payment.referenceNumber ?? null,
        referenceType: identity.referenceType,
        referenceKey: identity.referenceKey,
        dedupeKey: identity.dedupeKey,
        allocationMode: "EXPLICIT",
        note: input.payment.note ?? null,
      },
    });
    for (const line of input.payment.lines) {
      if (line.kind === "RENT" && line.period) {
        const portion = line.portion ?? "";
        const charge =
          (await tx.rentCharge.findUnique({
            where: {
              tenancyId_period_portion: {
                tenancyId: tenancy.id,
                period: line.period,
                portion,
              },
            },
          })) ??
          (await tx.rentCharge.create({
            data: {
              tenancyId: tenancy.id,
              period: line.period,
              portion,
              periodStart: dateOnlyToUtc(`${line.period}-01`),
              dueOn: dateOnlyToUtc(dueOnForPeriod(`${line.period}-01`, tenancy.rentDueDay)),
              amountCents: portion ? line.amountCents : tenancy.monthlyRentCents,
            },
          }));
        await tx.paymentAllocation.create({
          data: { paymentId: created.id, chargeId: charge.id, amountCents: line.amountCents },
        });
      } else if (isLedgerChargeKind(line.kind)) {
        const charge = await tx.ledgerCharge.create({
          data: {
            ownerId: input.ownerId,
            tenancyId: tenancy.id,
            kind: line.kind,
            period: line.period,
            description: line.description?.trim() || line.kind,
            amountCents: line.amountCents,
            dueOn: dateOnlyToUtc(input.payment.paidOn),
          },
        });
        await tx.paymentAllocation.create({
          data: {
            paymentId: created.id,
            ledgerChargeId: charge.id,
            amountCents: line.amountCents,
          },
        });
      }
    }
    return created;
  });
  return { outcome: "recorded" as const, paymentId: payment.id };
}

export async function listPaymentAllocations(ownerId: string, paymentId: string) {
  const payment = await prisma.rentPayment.findFirst({
    where: { id: paymentId, ownerId },
    include: {
      allocations: { include: { charge: true, ledgerCharge: true } },
    },
  });
  if (!payment) {
    return null;
  }
  return {
    paymentId: payment.id,
    tenancyId: payment.tenancyId,
    amountCents: payment.amountCents,
    paidOn: utcToDateOnly(payment.paidOn),
    method: payment.method,
    referenceType: payment.referenceType,
    referenceNumber: payment.referenceNumber,
    allocationMode: payment.allocationMode,
    lines: payment.allocations.map((row) => ({
      amountCents: row.amountCents,
      kind: row.charge ? "RENT" : (row.ledgerCharge?.kind ?? "OTHER"),
      period: row.charge?.period ?? row.ledgerCharge?.period ?? null,
      portion: row.charge?.portion || null,
      description: row.ledgerCharge?.description ?? null,
    })),
  };
}

export function isKnownPaymentMethod(value: string): value is RentPaymentMethod {
  return isPaymentMethod(value);
}
