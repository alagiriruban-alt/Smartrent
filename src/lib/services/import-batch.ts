import { Prisma } from "@prisma/client";

import { isLedgerChargeKind, linesFromPeriods, type AllocationLine } from "@/lib/allocations";
import { dateOnlyToUtc } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { dueOnForPeriod } from "@/lib/ledger";
import {
  parseBundleText,
  reconcileBundle,
  type ParsedBundle,
  type ParsedLedgerRow,
  type Reconciliation,
} from "@/lib/import/parse-bundle";
import { isJurisdiction } from "@/lib/jurisdiction";
import { isRentalPeriod } from "@/lib/periods";
import { isReferenceType, paymentDedupeKey } from "@/lib/payments/identity";
import { isPaymentMethod } from "@/lib/payment-methods";
import { ServiceError } from "@/lib/services/errors";

const PAYMENT_METHODS = ["E_TRANSFER", "CHEQUE", "CASH", "PRE_AUTHORIZED", "OTHER"] as const;

type Tx = Prisma.TransactionClient;

function rowKey(kind: string, externalKey: string) {
  return `${kind}:${externalKey}`;
}

export async function stageImportBundle(input: {
  ownerId: string;
  propertyId: string | null;
  sourceName: string;
  raw: string;
}) {
  if (input.raw.trim().length === 0 || input.raw.length > 1_000_000) {
    throw new ServiceError("invalid", "The import file is empty or too large.");
  }
  let parsed: ParsedBundle;
  try {
    parsed = parseBundleText(input.sourceName, input.raw);
  } catch {
    throw new ServiceError("invalid", "That file is not JSON or CSV.");
  }
  if (parsed.errors.length > 0) {
    throw new ServiceError("invalid", parsed.errors[0] ?? "That file could not be read.");
  }
  const reconciliation = reconcileBundle(parsed);
  if (input.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: input.propertyId, ownerId: input.ownerId },
      select: { id: true },
    });
    if (!property) {
      throw new ServiceError("not_found", "That property was not found.");
    }
  }
  const existing = await prisma.importBatch.findUnique({
    where: {
      ownerId_sourceHash: { ownerId: input.ownerId, sourceHash: parsed.sourceHash },
    },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
  if (existing) {
    return { batchId: existing.id, alreadyStaged: true, reconciliation, parsed };
  }
  const rows = bundleRows(input.ownerId, parsed);
  const batch = await prisma.importBatch.create({
    data: {
      ownerId: input.ownerId,
      propertyId: input.propertyId,
      sourceName: input.sourceName,
      sourceHash: parsed.sourceHash,
      reconciliation: {
        ...reconciliation,
        sourceTotals: parsed.sourceTotals,
      } as unknown as Prisma.InputJsonValue,
      rows: { create: rows },
    },
  });
  return { batchId: batch.id, alreadyStaged: false, reconciliation, parsed };
}

function bundleRows(ownerId: string, parsed: ParsedBundle) {
  const rows: Prisma.ImportRowCreateWithoutBatchInput[] = [];
  const push = (
    kind: "HEADER" | "TENANCY" | "LEDGER" | "EXPENSE",
    externalKey: string,
    rawText: string,
    value: {
      confidence: number;
      flags: string[];
      needsReview: boolean;
    },
  ) => {
    rows.push({
      ownerId,
      rowIndex: rows.length,
      kind,
      rawText,
      parsed: value as unknown as Prisma.InputJsonValue,
      confidence: value.confidence,
      flags: value.flags,
      needsReview: value.needsReview,
      idempotencyKey: rowKey(kind, externalKey),
    });
  };
  push("HEADER", parsed.header.externalKey ?? "property", parsed.header.name ?? "Property", parsed.header);
  for (const tenancy of parsed.tenancies) {
    push("TENANCY", tenancy.externalKey, tenancy.tenant, tenancy);
  }
  for (const row of parsed.ledger) {
    push("LEDGER", row.externalKey, row.label || row.tenant, row);
  }
  for (const row of parsed.expenses) {
    push("EXPENSE", row.externalKey, row.description ?? row.externalKey, row);
  }
  return rows;
}

export async function getImportBatch(ownerId: string, batchId: string) {
  return prisma.importBatch.findFirst({
    where: { id: batchId, ownerId },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
}

export async function listImportBatches(ownerId: string, propertyId?: string) {
  return prisma.importBatch.findMany({
    where: { ownerId, ...(propertyId ? { propertyId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { rows: { select: { status: true, needsReview: true } } },
  });
}

export async function reviewImportRow(input: {
  ownerId: string;
  rowId: string;
  status: "APPROVED" | "REJECTED" | "PENDING";
  periodOverride?: string | null;
}) {
  const row = await prisma.importRow.findFirst({
    where: { id: input.rowId, ownerId: input.ownerId },
  });
  if (!row) {
    throw new ServiceError("not_found", "That staged row was not found.");
  }
  if (row.status === "COMMITTED") {
    throw new ServiceError("invalid", "That row is already on the ledger.");
  }
  if (input.periodOverride && !isRentalPeriod(input.periodOverride)) {
    throw new ServiceError("invalid", "Enter the period as YYYY-MM.");
  }
  return prisma.importRow.update({
    where: { id: row.id },
    data: {
      status: input.status,
      periodOverride: input.periodOverride ?? null,
    },
  });
}

export function dryRunBundle(sourceName: string, raw: string): {
  parsed: ParsedBundle;
  reconciliation: Reconciliation;
} {
  let parsed: ParsedBundle;
  try {
    parsed = parseBundleText(sourceName, raw);
  } catch {
    throw new ServiceError("invalid", "That file is not JSON or CSV.");
  }
  return { parsed, reconciliation: reconcileBundle(parsed) };
}

export async function commitImportBatch(ownerId: string, batchId: string) {
  const batch = await getImportBatch(ownerId, batchId);
  if (!batch) {
    throw new ServiceError("not_found", "That import was not found.");
  }
  const reconciliation = reconcileBundle({
    sourceHash: batch.sourceHash,
    header: headerFrom(batch.rows.find((row) => row.kind === "HEADER")?.parsed),
    tenancies: batch.rows
      .filter((row) => row.kind === "TENANCY")
      .map((row) => row.parsed as ParsedBundle["tenancies"][number]),
    ledger: batch.rows
      .filter((row) => row.kind === "LEDGER")
      .map((row) => row.parsed as ParsedLedgerRow),
    expenses: batch.rows
      .filter((row) => row.kind === "EXPENSE")
      .map((row) => row.parsed as ParsedBundle["expenses"][number]),
    sourceTotals: sourceTotalsFrom(batch.reconciliation),
    errors: [],
  });
  if (!reconciliation.matched) {
    throw new ServiceError(
      "invalid",
      "The staged totals do not match the source. Fix the file, or approve a period that makes the totals match, and stage it again.",
    );
  }
  const property = await resolveProperty(ownerId, batch.propertyId, headerFrom(batch.rows.find((row) => row.kind === "HEADER")?.parsed));
  const summary = await prisma.$transaction(async (tx) => {
    let committed = 0;
    let skipped = 0;
    const held = new Set(
      (
        await tx.ledgerOverride.findMany({
          where: { ownerId },
          select: { entityId: true },
        })
      ).map((row) => row.entityId),
    );
    for (const row of batch.rows) {
      if (row.status === "COMMITTED" || row.status === "REJECTED") {
        skipped += 1;
        continue;
      }
      if (row.needsReview && row.status !== "APPROVED") {
        skipped += 1;
        continue;
      }
      const committedId = await commitRow(tx, ownerId, property.id, batch.sourceHash, row, held);
      if (!committedId) {
        skipped += 1;
        continue;
      }
      await tx.importRow.update({
        where: { id: row.id },
        data: { status: "COMMITTED", committedId },
      });
      committed += 1;
    }
    const open = await tx.importRow.count({
      where: {
        batchId: batch.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (open === 0) {
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "COMMITTED" },
      });
    }
    return { committed, skipped, propertyId: property.id };
  });
  return { ...summary, reconciliation };
}

function headerFrom(value: unknown): ParsedBundle["header"] {
  const row = (value ?? {}) as ParsedBundle["header"];
  return {
    externalKey: row.externalKey ?? null,
    name: row.name ?? null,
    streetAddress: row.streetAddress ?? null,
    city: row.city ?? null,
    province: row.province ?? null,
    postalCode: row.postalCode ?? null,
    jurisdiction: row.jurisdiction ?? null,
    owners: row.owners ?? [],
    confidence: row.confidence ?? 0,
    flags: row.flags ?? [],
    needsReview: row.needsReview ?? true,
  };
}

function sourceTotalsFrom(value: unknown): ParsedBundle["sourceTotals"] {
  const empty = { periods: {}, years: {}, expenses: {} };
  if (!value || typeof value !== "object") {
    return empty;
  }
  const stored = value as { sourceTotals?: ParsedBundle["sourceTotals"] };
  if (stored.sourceTotals?.periods && stored.sourceTotals.years && stored.sourceTotals.expenses) {
    return stored.sourceTotals;
  }
  return empty;
}

async function resolveProperty(
  ownerId: string,
  propertyId: string | null,
  header: ParsedBundle["header"],
) {
  if (propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, ownerId },
    });
    if (!property) {
      throw new ServiceError("not_found", "That property was not found.");
    }
    return property;
  }
  if (header.streetAddress) {
    const found = await prisma.property.findFirst({
      where: { ownerId, streetAddress: header.streetAddress },
    });
    if (found) {
      return found;
    }
  }
  if (!header.streetAddress || !header.city || !header.province || !header.postalCode) {
    throw new ServiceError(
      "invalid",
      "Choose a property, or include the street, city, province, and postal code.",
    );
  }
  const jurisdiction =
    header.jurisdiction && isJurisdiction(header.jurisdiction)
      ? header.jurisdiction
      : header.province === "QC"
        ? "QC"
        : "ON";
  return prisma.property.create({
    data: {
      ownerId,
      name: header.name,
      streetAddress: header.streetAddress,
      city: header.city,
      province: header.province,
      postalCode: header.postalCode,
      jurisdiction,
    },
  });
}

async function commitRow(
  tx: Tx,
  ownerId: string,
  propertyId: string,
  sourceHash: string,
  row: {
    kind: string;
    idempotencyKey: string;
    parsed: Prisma.JsonValue;
    periodOverride: string | null;
    committedId: string | null;
  },
  held: Set<string>,
): Promise<string | null> {
  if (row.kind === "HEADER") {
    return commitHeader(tx, ownerId, propertyId, row.parsed, held);
  }
  if (row.kind === "TENANCY") {
    return commitTenancy(tx, ownerId, propertyId, row.parsed as ParsedBundle["tenancies"][number]);
  }
  if (row.kind === "LEDGER") {
    return commitLedger(tx, ownerId, propertyId, sourceHash, row);
  }
  if (row.kind === "EXPENSE") {
    return commitExpense(
      tx,
      ownerId,
      propertyId,
      sourceHash,
      row.idempotencyKey,
      row.parsed as ParsedBundle["expenses"][number],
      held,
    );
  }
  return null;
}

async function commitHeader(
  tx: Tx,
  ownerId: string,
  propertyId: string,
  parsed: Prisma.JsonValue,
  held: Set<string>,
) {
  const header = headerFrom(parsed);
  if (header.jurisdiction && isJurisdiction(header.jurisdiction) && !held.has(propertyId)) {
    await tx.property.update({
      where: { id: propertyId },
      data: { jurisdiction: header.jurisdiction },
    });
  }
  const owners = header.owners ?? [];
  const total = owners.reduce((sum, owner) => sum + owner.shareBps, 0);
  const existing = await tx.propertyOwner.findMany({ where: { propertyId } });
  if (owners.length > 0 && total === 10000 && existing.every((owner) => !held.has(owner.id))) {
    if (existing.length === 0) {
      await tx.propertyOwner.createMany({
        data: owners.map((owner) => ({
          ownerId,
          propertyId,
          name: owner.name,
          shareBps: owner.shareBps,
        })),
      });
    }
  }
  return propertyId;
}

async function commitTenancy(
  tx: Tx,
  ownerId: string,
  propertyId: string,
  parsed: ParsedBundle["tenancies"][number],
) {
  if (!parsed.tenant || !parsed.leaseStart || parsed.monthlyRentCents === null || !parsed.rentDueDay) {
    return null;
  }
  const [firstName, ...rest] = parsed.tenant.split(/\s+/);
  const lastName = rest.join(" ") || "Tenant";
  const tenancy = await findTenancy(tx, ownerId, propertyId, parsed.tenant);
  if (tenancy) {
    if (parsed.depositCents && tenancy.depositHeldCents === 0) {
      await tx.tenancy.update({
        where: { id: tenancy.id },
        data: { depositHeldCents: parsed.depositCents },
      });
    }
    return tenancy.id;
  }
  const unitLabel = parsed.unit ?? "1";
  let unit = await tx.unit.findFirst({ where: { propertyId, label: unitLabel } });
  if (!unit) {
    unit = await tx.unit.create({ data: { propertyId, label: unitLabel } });
  }
  const tenant = await tx.tenant.create({
    data: { ownerId, firstName, lastName },
  });
  const created = await tx.tenancy.create({
    data: {
      unitId: unit.id,
      tenantId: tenant.id,
      leaseStart: dateOnlyToUtc(parsed.leaseStart),
      leaseEnd: parsed.leaseEnd ? dateOnlyToUtc(parsed.leaseEnd) : null,
      moveInOn: dateOnlyToUtc(parsed.leaseStart),
      monthlyRentCents: parsed.monthlyRentCents,
      rentDueDay: parsed.rentDueDay,
      depositHeldCents: parsed.depositCents ?? 0,
    },
  });
  return created.id;
}

async function findTenancy(tx: Tx, ownerId: string, propertyId: string, tenantName: string) {
  const tenancies = await tx.tenancy.findMany({
    where: { unit: { propertyId, property: { ownerId } } },
    include: { tenant: true },
  });
  const target = tenantName.trim().toLowerCase();
  return (
    tenancies.find(
      (tenancy) =>
        `${tenancy.tenant.firstName} ${tenancy.tenant.lastName}`.trim().toLowerCase() === target,
    ) ?? null
  );
}

async function commitLedger(
  tx: Tx,
  ownerId: string,
  propertyId: string,
  sourceHash: string,
  row: { idempotencyKey: string; parsed: Prisma.JsonValue; periodOverride: string | null },
) {
  const parsed = row.parsed as ParsedLedgerRow;
  if (!parsed.paidOn || parsed.amountCents === null || !parsed.tenant) {
    return null;
  }
  const tenancy = await findTenancy(tx, ownerId, propertyId, parsed.tenant);
  if (!tenancy) {
    return null;
  }
  const importKey = `${sourceHash}:${row.idempotencyKey}`;
  let lines = parsed.lines ?? [];
  if (row.periodOverride && isRentalPeriod(row.periodOverride)) {
    lines = linesFromPeriods(parsed.amountCents, [row.periodOverride], null);
  }
  const method = (PAYMENT_METHODS as readonly string[]).includes(parsed.method)
    ? parsed.method
    : "OTHER";
  const referenceType =
    parsed.referenceType && isReferenceType(parsed.referenceType)
      ? parsed.referenceType
      : undefined;
  const identity = paymentDedupeKey({
    method: isPaymentMethod(method) ? method : "OTHER",
    referenceNumber: parsed.reference,
    referenceType,
    tenancyId: tenancy.id,
    paidOn: parsed.paidOn,
    amountCents: parsed.amountCents,
  });
  const existing = await tx.rentPayment.findFirst({
    where: {
      ownerId,
      OR: [{ importKey }, { dedupeKey: identity.dedupeKey }],
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  if (parsed.kind === "DEPOSIT" && lines.length === 0) {
    const payment = await tx.rentPayment.create({
      data: {
        ownerId,
        tenancyId: tenancy.id,
        amountCents: parsed.amountCents,
        paidOn: dateOnlyToUtc(parsed.paidOn),
        method: isPaymentMethod(method) ? method : "OTHER",
        referenceNumber: parsed.reference,
        referenceType: identity.referenceType,
        referenceKey: identity.referenceKey,
        dedupeKey: identity.dedupeKey,
        allocationMode: "EXPLICIT",
        importKey,
        note: parsed.memo ?? "Last month's rent deposit",
      },
    });
    if (tenancy.depositHeldCents === 0) {
      await tx.tenancy.update({
        where: { id: tenancy.id },
        data: { depositHeldCents: parsed.amountCents },
      });
    }
    return payment.id;
  }
  if (lines.length === 0) {
    return null;
  }
  const payment = await tx.rentPayment.create({
    data: {
      ownerId,
      tenancyId: tenancy.id,
      amountCents: parsed.amountCents,
      paidOn: dateOnlyToUtc(parsed.paidOn),
      method: isPaymentMethod(method) ? method : "OTHER",
      referenceNumber: parsed.reference,
      referenceType: identity.referenceType,
      referenceKey: identity.referenceKey,
      dedupeKey: identity.dedupeKey,
      allocationMode: "EXPLICIT",
      importKey,
      note: parsed.memo,
    },
  });
  for (const line of lines) {
    await allocateLine(tx, ownerId, tenancy, payment.id, importKey, line, parsed.paidOn);
  }
  return payment.id;
}

async function allocateLine(
  tx: Tx,
  ownerId: string,
  tenancy: { id: string; monthlyRentCents: number; rentDueDay: number },
  paymentId: string,
  importKey: string,
  line: AllocationLine,
  paidOn: string,
) {
  if (line.kind === "RENT") {
    if (!line.period) {
      return;
    }
    const portion = line.portion ?? "";
    const existing = await tx.rentCharge.findUnique({
      where: {
        tenancyId_period_portion: { tenancyId: tenancy.id, period: line.period, portion },
      },
    });
    const charge =
      existing ??
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
      data: { paymentId, chargeId: charge.id, amountCents: line.amountCents },
    });
    return;
  }
  if (!isLedgerChargeKind(line.kind)) {
    return;
  }
  const chargeKey = `${importKey}:${line.kind}:${line.period ?? "none"}`;
  const existing = await tx.ledgerCharge.findFirst({
    where: { ownerId, importKey: chargeKey },
  });
  const charge =
    existing ??
    (await tx.ledgerCharge.create({
      data: {
        ownerId,
        tenancyId: tenancy.id,
        kind: line.kind,
        period: line.period,
        description: line.description ?? line.kind,
        amountCents: line.amountCents,
        dueOn: dateOnlyToUtc(paidOn),
        importKey: chargeKey,
      },
    }));
  await tx.paymentAllocation.create({
    data: { paymentId, ledgerChargeId: charge.id, amountCents: line.amountCents },
  });
}

async function commitExpense(
  tx: Tx,
  ownerId: string,
  propertyId: string,
  sourceHash: string,
  idempotencyKey: string,
  parsed: ParsedBundle["expenses"][number],
  held: Set<string>,
) {
  if (
    !parsed.incurredOn ||
    parsed.subtotalCents === null ||
    parsed.hstCents === null ||
    parsed.totalCents === null ||
    !parsed.description ||
    !parsed.category
  ) {
    return null;
  }
  const importKey = `${sourceHash}:${idempotencyKey}`;
  const existing = await tx.expense.findFirst({
    where: { ownerId, importKey },
  });
  if (existing) {
    return held.has(existing.id) ? existing.id : existing.id;
  }
  const created = await tx.expense.create({
    data: {
      ownerId,
      propertyId,
      incurredOn: dateOnlyToUtc(parsed.incurredOn),
      amountCents: parsed.totalCents,
      subtotalCents: parsed.subtotalCents,
      hstCents: parsed.hstCents,
      category: parsed.category as never,
      vendor: parsed.vendor,
      invoiceNumber: parsed.invoiceNumber,
      description: parsed.description,
      receiptDocumentId: parsed.receiptDocumentId,
      importKey,
    },
  });
  return created.id;
}
