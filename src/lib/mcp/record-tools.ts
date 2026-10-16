import type { AgentTokenScope } from "@prisma/client";

import { issueConfirmation, consumeConfirmation } from "@/lib/agent/confirm";
import { allocationBalance } from "@/lib/allocations";
import {
  isKnownPaymentMethod,
  listExpenses,
  listLedgerCharges,
  listLegalCases,
  listPaymentAllocations,
  listRentCredits,
  propertyShares,
  readLegalCase,
  saveExpense,
  saveExplicitPayment,
  saveLedgerCharge,
  saveLegalCase,
  saveRentCredit,
  type ExplicitAllocationInput,
  type LegalCaseInput,
} from "@/lib/books-records";
import {
  commitImportBatch,
  dryRunBundle,
  listImportBatches,
  reviewImportRow,
  stageImportBundle,
} from "@/lib/services/import-batch";
import { isIsoDate, todayDateOnly } from "@/lib/dates";
import { formatCad, parseMoneyToCents } from "@/lib/money";
import { isReferenceType } from "@/lib/payments/identity";
import { ServiceError } from "@/lib/services/errors";

type AgentContext = {
  ownerId: string;
  tokenId: string;
  scopes: AgentTokenScope[];
};

type ToolOutcome = {
  result: unknown;
  summary: string;
  auditStatus: "ok" | "pending" | "error";
};

type ToolDefinition = {
  name: string;
  description: string;
  scope: "READ" | "WRITE";
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

const readHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const writeHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const recordToolDefinitions: ToolDefinition[] = [
  {
    name: "list_allocations",
    description: "Allocations for one payment, including rent periods and non-rent charges.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { paymentId: { type: "string" } },
      required: ["paymentId"],
    },
  },
  {
    name: "list_charges",
    description: "Non-rent charges and the balance on each. Rent is not included.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { tenancyId: { type: "string" } },
    },
  },
  {
    name: "list_credits",
    description: "Rent credits and offsets, with the reason and any linked document id.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { tenancyId: { type: "string" } },
    },
  },
  {
    name: "list_expenses",
    description:
      "Property expenses with subtotal, HST, total, and T776 category. Pass propertyId to include the ownership split.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { propertyId: { type: "string" } },
    },
  },
  {
    name: "list_legal_cases",
    description: "Legal cases for this landlord, including upcoming hearings.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { tenancyId: { type: "string" } },
    },
  },
  {
    name: "list_import_batches",
    description: "Staged import batches. Nothing is committed by this tool.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: { propertyId: { type: "string" } },
    },
  },
  {
    name: "dry_run_import",
    description:
      "Parse a JSON or CSV bundle and reconcile per-period and annual totals. Does not stage or commit.",
    scope: "READ",
    annotations: readHints,
    inputSchema: {
      type: "object",
      properties: {
        sourceName: { type: "string" },
        raw: { type: "string", description: "JSON or CSV bundle text." },
      },
      required: ["raw"],
    },
  },
  {
    name: "allocate_payment",
    description:
      "Record a payment split across rent periods and non-rent charges. The first call previews and returns confirmationToken. The second call saves. An Interac reference or cheque number already on the ledger is not posted again.",
    scope: "WRITE",
    annotations: { ...writeHints, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        paidOn: { type: "string" },
        amount: { anyOf: [{ type: "string" }, { type: "number" }] },
        method: { type: "string" },
        referenceType: { type: "string", enum: ["INTERAC", "CHEQUE", "OTHER", "NONE"] },
        referenceNumber: { type: "string" },
        note: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string" },
              period: { type: "string" },
              portion: { type: "string" },
              amount: { anyOf: [{ type: "string" }, { type: "number" }] },
              description: { type: "string" },
            },
            required: ["kind", "amount"],
          },
        },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "paidOn", "amount", "lines"],
    },
  },
  {
    name: "upsert_charge",
    description:
      "Add a non-rent charge such as water, utilities, a fee, or an LTB filing fee. Preview, then confirm.",
    scope: "WRITE",
    annotations: writeHints,
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        kind: { type: "string" },
        period: { type: "string" },
        description: { type: "string" },
        amount: { anyOf: [{ type: "string" }, { type: "number" }] },
        dueOn: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "kind", "description", "amount", "dueOn"],
    },
  },
  {
    name: "record_credit",
    description:
      "Record an in-kind rent credit or an offset. A reason is required. Preview, then confirm.",
    scope: "WRITE",
    annotations: writeHints,
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        amount: { anyOf: [{ type: "string" }, { type: "number" }] },
        kind: { type: "string", enum: ["IN_KIND", "OFFSET"] },
        reason: { type: "string" },
        documentId: { type: "string" },
        period: { type: "string" },
        effectiveOn: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "amount", "kind", "reason", "effectiveOn"],
    },
  },
  {
    name: "record_expense",
    description:
      "Record a property expense with subtotal, HST, and total. Preview, then confirm.",
    scope: "WRITE",
    annotations: writeHints,
    inputSchema: {
      type: "object",
      properties: {
        propertyId: { type: "string" },
        incurredOn: { type: "string" },
        vendor: { type: "string" },
        invoiceNumber: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        subtotal: { anyOf: [{ type: "string" }, { type: "number" }] },
        hst: { anyOf: [{ type: "string" }, { type: "number" }] },
        receiptDocumentId: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["propertyId", "incurredOn", "description", "category", "subtotal", "hst"],
    },
  },
  {
    name: "upsert_legal_case",
    description:
      "Create or update a legal case linked to a lease. Preview, then confirm. A later landlord correction is kept.",
    scope: "WRITE",
    annotations: { ...writeHints, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        tenancyId: { type: "string" },
        type: { type: "string" },
        typeDetail: { type: "string" },
        servedOn: { type: "string" },
        filedOn: { type: "string" },
        ltbFileNumber: { type: "string" },
        filingFee: { anyOf: [{ type: "string" }, { type: "number" }] },
        hearingOn: { type: "string" },
        status: { type: "string" },
        outcome: { type: "string" },
        notes: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "type", "status"],
    },
  },
  {
    name: "stage_import",
    description:
      "Stage a JSON or CSV bundle for review. The same file stages once. Preview, then confirm. Does not commit.",
    scope: "WRITE",
    annotations: { ...writeHints, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        propertyId: { type: "string" },
        sourceName: { type: "string" },
        raw: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["raw"],
    },
  },
  {
    name: "review_import_row",
    description: "Approve or reject one staged row, with an optional YYYY-MM period. Preview, then confirm.",
    scope: "WRITE",
    annotations: writeHints,
    inputSchema: {
      type: "object",
      properties: {
        rowId: { type: "string" },
        status: { type: "string", enum: ["APPROVED", "REJECTED", "PENDING"] },
        periodOverride: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["rowId", "status"],
    },
  },
  {
    name: "commit_import",
    description:
      "Commit approved staged rows. Confident rows commit too. Ambiguous rows wait. Re-running does not duplicate. Preview, then confirm.",
    scope: "WRITE",
    annotations: { ...writeHints, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        batchId: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["batchId"],
    },
  },
];

function via(summary: string): string {
  return summary.endsWith("via agent") ? summary : `${summary} via agent`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError("invalid", "Tool arguments must be an object.");
  }
  return value as Record<string, unknown>;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(args: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(args, key);
  if (!value) {
    throw new ServiceError("invalid", `Enter ${label}.`);
  }
  return value;
}

function creditKind(value: string): "IN_KIND" | "OFFSET" {
  if (value === "IN_KIND" || value === "OFFSET") {
    return value;
  }
  throw new ServiceError("invalid", "Choose in-kind or an offset.");
}

function reviewStatus(value: string): "PENDING" | "APPROVED" | "REJECTED" {
  if (value === "PENDING" || value === "APPROVED" || value === "REJECTED") {
    return value;
  }
  throw new ServiceError("invalid", "Choose approved, rejected, or pending.");
}

function moneyField(args: Record<string, unknown>, key: string, label: string): number {
  const value = args[key];
  const parsed =
    typeof value === "number" || typeof value === "string" ? parseMoneyToCents(value) : null;
  if (parsed === null) {
    throw new ServiceError("invalid", `Enter ${label} in dollars, such as 2100.00.`);
  }
  return parsed;
}

async function confirmable(
  ctx: AgentContext,
  tool: string,
  args: Record<string, unknown>,
  payload: unknown,
  preview: unknown,
  summary: string,
  commit: () => Promise<ToolOutcome>,
): Promise<ToolOutcome> {
  const confirmationToken = optionalString(args, "confirmationToken");
  if (!confirmationToken) {
    const issued = await issueConfirmation({
      ownerId: ctx.ownerId,
      tool,
      payload,
    });
    return {
      result: {
        status: "confirmation_required",
        confirmationToken: issued.secret,
        expiresAt: issued.expiresAt,
        preview,
      },
      summary: via(summary),
      auditStatus: "pending",
    };
  }
  await consumeConfirmation({
    ownerId: ctx.ownerId,
    secret: confirmationToken,
    tool,
    payload,
  });
  return commit();
}

function readLines(args: Record<string, unknown>): ExplicitAllocationInput["lines"] {
  if (!Array.isArray(args.lines) || args.lines.length === 0) {
    throw new ServiceError("invalid", "Add at least one allocation.");
  }
  return args.lines.map((item) => {
    const line = asRecord(item);
    const kind = requiredString(line, "kind", "the allocation kind").toUpperCase();
    const amountCents = moneyField(line, "amount", "the allocation");
    return {
      kind: kind as ExplicitAllocationInput["lines"][number]["kind"],
      period: optionalString(line, "period") ?? null,
      portion: optionalString(line, "portion") ?? null,
      amountCents,
      description: optionalString(line, "description") ?? null,
    };
  });
}

export async function runRecordTool(
  ctx: AgentContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome | null> {
  switch (name) {
    case "list_allocations": {
      const payment = await listPaymentAllocations(
        ctx.ownerId,
        requiredString(args, "paymentId", "the payment id"),
      );
      if (!payment) {
        throw new ServiceError("not_found", "That payment was not found.");
      }
      return {
        result: payment,
        summary: via(`Listed allocations for a ${formatCad(payment.amountCents)} payment`),
        auditStatus: "ok",
      };
    }
    case "list_charges": {
      const charges = await listLedgerCharges(ctx.ownerId, optionalString(args, "tenancyId"));
      return {
        result: { charges },
        summary: via(`Listed ${charges.length} non-rent charges`),
        auditStatus: "ok",
      };
    }
    case "list_credits": {
      const credits = await listRentCredits(ctx.ownerId, optionalString(args, "tenancyId"));
      return {
        result: { credits },
        summary: via(`Listed ${credits.length} rent credits`),
        auditStatus: "ok",
      };
    }
    case "list_expenses": {
      const propertyId = optionalString(args, "propertyId");
      const expenses = await listExpenses(ctx.ownerId, propertyId);
      const shares = propertyId ? await propertyShares(ctx.ownerId, propertyId) : null;
      return {
        result: { expenses, ownership: shares },
        summary: via(`Listed ${expenses.length} expenses`),
        auditStatus: "ok",
      };
    }
    case "list_legal_cases": {
      const listed = await listLegalCases(ctx.ownerId, optionalString(args, "tenancyId"));
      return {
        result: listed,
        summary: via(`Listed ${listed.cases.length} legal cases`),
        auditStatus: "ok",
      };
    }
    case "list_import_batches": {
      const batches = await listImportBatches(ctx.ownerId, optionalString(args, "propertyId"));
      return {
        result: {
          batches: batches.map((batch) => ({
            id: batch.id,
            propertyId: batch.propertyId,
            sourceName: batch.sourceName,
            status: batch.status,
            createdAt: batch.createdAt.toISOString(),
            rowCount: batch.rows.length,
            needsReview: batch.rows.filter((row) => row.needsReview && row.status === "PENDING")
              .length,
          })),
        },
        summary: via(`Listed ${batches.length} import batches`),
        auditStatus: "ok",
      };
    }
    case "dry_run_import": {
      const raw = requiredString(args, "raw", "the bundle");
      const report = dryRunBundle(optionalString(args, "sourceName") ?? "bundle", raw);
      return {
        result: {
          matched: report.reconciliation.matched,
          ambiguousCount: report.reconciliation.ambiguousCount,
          reconciliation: report.reconciliation,
          ledger: report.parsed.ledger.map((row) => ({
            externalKey: row.externalKey,
            label: row.label,
            confidence: row.confidence,
            flags: row.flags,
            needsReview: row.needsReview,
            amountCents: row.amountCents,
            lines: row.lines,
          })),
        },
        summary: via(
          report.reconciliation.matched
            ? "Dry run matched the source totals"
            : "Dry run did not match the source totals",
        ),
        auditStatus: "ok",
      };
    }
    case "allocate_payment": {
      const method = optionalString(args, "method") ?? "E_TRANSFER";
      if (!isKnownPaymentMethod(method)) {
        throw new ServiceError("invalid", "Choose how the tenant paid.");
      }
      const paidOn = requiredString(args, "paidOn", "the date");
      if (!isIsoDate(paidOn) || paidOn > todayDateOnly()) {
        throw new ServiceError("invalid", "Enter a payment date that is today or earlier.");
      }
      const referenceRaw = optionalString(args, "referenceType");
      if (referenceRaw && !isReferenceType(referenceRaw)) {
        throw new ServiceError("invalid", "Choose a reference type.");
      }
      const referenceType = referenceRaw && isReferenceType(referenceRaw) ? referenceRaw : undefined;
      const payment: ExplicitAllocationInput = {
        tenancyId: requiredString(args, "tenancyId", "the lease id"),
        paidOn,
        amountCents: moneyField(args, "amount", "the payment"),
        method,
        referenceType,
        referenceNumber: optionalString(args, "referenceNumber") ?? null,
        note: optionalString(args, "note") ?? null,
        lines: readLines(args),
      };
      const balance = allocationBalance(payment.amountCents, payment.lines);
      if (!balance.balanced) {
        throw new ServiceError("invalid", "The allocations have to add up to the payment.");
      }
      return confirmable(
        ctx,
        "allocate_payment",
        args,
        payment,
        payment,
        `Asked to confirm ${formatCad(payment.amountCents)} split ${payment.lines.length} ways`,
        async () => {
          const saved = await saveExplicitPayment({ ownerId: ctx.ownerId, payment });
          return {
            result: saved,
            summary: via(
              saved.outcome === "already_recorded"
                ? "That payment was already recorded"
                : `Recorded ${formatCad(payment.amountCents)} with ${payment.lines.length} allocations`,
            ),
            auditStatus: "ok",
          };
        },
      );
    }
    case "upsert_charge": {
      const dueOn = requiredString(args, "dueOn", "the due date");
      if (!isIsoDate(dueOn)) {
        throw new ServiceError("invalid", "Enter the due date as YYYY-MM-DD.");
      }
      const payload = {
        tenancyId: requiredString(args, "tenancyId", "the lease id"),
        kind: requiredString(args, "kind", "the charge kind").toUpperCase(),
        period: optionalString(args, "period") ?? null,
        description: requiredString(args, "description", "a description"),
        amountCents: moneyField(args, "amount", "the charge"),
        dueOn,
      };
      return confirmable(
        ctx,
        "upsert_charge",
        args,
        payload,
        payload,
        `Asked to confirm a ${formatCad(payload.amountCents)} ${payload.kind.toLowerCase()} charge`,
        async () => {
          const charge = await saveLedgerCharge({ ...payload, ownerId: ctx.ownerId, viaAgent: true });
          return {
            result: { status: "recorded", charge },
            summary: via(`Recorded a ${payload.kind.toLowerCase()} charge`),
            auditStatus: "ok",
          };
        },
      );
    }
    case "record_credit": {
      const effectiveOn = requiredString(args, "effectiveOn", "the date");
      if (!isIsoDate(effectiveOn)) {
        throw new ServiceError("invalid", "Enter the credit date as YYYY-MM-DD.");
      }
      const kind = creditKind(requiredString(args, "kind", "the credit kind"));
      const payload = {
        tenancyId: requiredString(args, "tenancyId", "the lease id"),
        amountCents: moneyField(args, "amount", "the credit"),
        kind,
        reason: requiredString(args, "reason", "the reason"),
        documentId: optionalString(args, "documentId") ?? null,
        period: optionalString(args, "period") ?? null,
        effectiveOn,
      };
      return confirmable(
        ctx,
        "record_credit",
        args,
        payload,
        payload,
        `Asked to confirm a ${formatCad(payload.amountCents)} rent credit`,
        async () => {
          const credit = await saveRentCredit({ ...payload, ownerId: ctx.ownerId });
          return {
            result: { status: "recorded", credit },
            summary: via(`Recorded a ${formatCad(payload.amountCents)} rent credit`),
            auditStatus: "ok",
          };
        },
      );
    }
    case "record_expense": {
      const incurredOn = requiredString(args, "incurredOn", "the date");
      if (!isIsoDate(incurredOn)) {
        throw new ServiceError("invalid", "Enter the expense date as YYYY-MM-DD.");
      }
      const subtotalCents = moneyField(args, "subtotal", "the subtotal");
      const hstCents = moneyField(args, "hst", "the HST");
      const payload = {
        propertyId: requiredString(args, "propertyId", "the property id"),
        incurredOn,
        vendor: optionalString(args, "vendor") ?? null,
        invoiceNumber: optionalString(args, "invoiceNumber") ?? null,
        description: requiredString(args, "description", "a description"),
        category: requiredString(args, "category", "the T776 category"),
        subtotalCents,
        hstCents,
        receiptDocumentId: optionalString(args, "receiptDocumentId") ?? null,
      };
      return confirmable(
        ctx,
        "record_expense",
        args,
        payload,
        { ...payload, totalCents: subtotalCents + hstCents },
        `Asked to confirm a ${formatCad(subtotalCents + hstCents)} expense`,
        async () => {
          const expense = await saveExpense({ ...payload, ownerId: ctx.ownerId });
          return {
            result: { status: "recorded", expense },
            summary: via(`Recorded a ${formatCad(expense.totalCents)} expense`),
            auditStatus: "ok",
          };
        },
      );
    }
    case "upsert_legal_case": {
      const legalInput: LegalCaseInput = {
        id: optionalString(args, "id") ?? null,
        tenancyId: requiredString(args, "tenancyId", "the lease id"),
        type: requiredString(args, "type", "the case type").toUpperCase(),
        typeDetail: optionalString(args, "typeDetail") ?? null,
        servedOn: optionalString(args, "servedOn") ?? null,
        filedOn: optionalString(args, "filedOn") ?? null,
        ltbFileNumber: optionalString(args, "ltbFileNumber") ?? null,
        filingFee: (args.filingFee as string | number | null | undefined) ?? null,
        hearingOn: optionalString(args, "hearingOn") ?? null,
        status: (optionalString(args, "status") ?? "OPEN").toUpperCase(),
        outcome: optionalString(args, "outcome") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      const legal = readLegalCase(legalInput);
      return confirmable(
        ctx,
        "upsert_legal_case",
        args,
        { ...legal, id: legalInput.id ?? null },
        legal,
        `Asked to confirm a ${legal.type} case`,
        async () => {
          const saved = await saveLegalCase({
            ownerId: ctx.ownerId,
            legal,
            id: legalInput.id,
            viaAgent: true,
          });
          return {
            result: saved,
            summary: via(
              saved.outcome === "landlord_wins"
                ? `Kept the landlord's corrections on a ${legal.type} case`
                : `Saved a ${legal.type} case`,
            ),
            auditStatus: "ok",
          };
        },
      );
    }
    case "stage_import": {
      const payload = {
        propertyId: optionalString(args, "propertyId") ?? null,
        sourceName: optionalString(args, "sourceName") ?? "bundle",
        raw: requiredString(args, "raw", "the bundle"),
      };
      const preview = dryRunBundle(payload.sourceName, payload.raw);
      return confirmable(
        ctx,
        "stage_import",
        args,
        payload,
        {
          matched: preview.reconciliation.matched,
          ambiguousCount: preview.reconciliation.ambiguousCount,
          reconciliation: preview.reconciliation,
        },
        preview.reconciliation.matched
          ? "Asked to stage an import that matches the source totals"
          : "Asked to stage an import that does not match the source totals",
        async () => {
          const staged = await stageImportBundle({ ownerId: ctx.ownerId, ...payload });
          return {
            result: {
              status: staged.alreadyStaged ? "already_staged" : "staged",
              batchId: staged.batchId,
              reconciliation: staged.reconciliation,
            },
            summary: via(
              staged.alreadyStaged ? "Import was already staged" : "Staged an import for review",
            ),
            auditStatus: "ok",
          };
        },
      );
    }
    case "review_import_row": {
      const status = reviewStatus(requiredString(args, "status", "a status"));
      const payload = {
        rowId: requiredString(args, "rowId", "the row id"),
        status,
        periodOverride: optionalString(args, "periodOverride") ?? null,
      };
      return confirmable(
        ctx,
        "review_import_row",
        args,
        payload,
        payload,
        `Asked to mark an import row ${status.toLowerCase()}`,
        async () => {
          const row = await reviewImportRow({ ownerId: ctx.ownerId, ...payload });
          return {
            result: { status: row.status, rowId: row.id, periodOverride: row.periodOverride },
            summary: via(`Marked an import row ${row.status.toLowerCase()}`),
            auditStatus: "ok",
          };
        },
      );
    }
    case "commit_import": {
      const payload = { batchId: requiredString(args, "batchId", "the batch id") };
      return confirmable(
        ctx,
        "commit_import",
        args,
        payload,
        payload,
        "Asked to commit a staged import",
        async () => {
          const committed = await commitImportBatch(ctx.ownerId, payload.batchId);
          return {
            result: committed,
            summary: via(
              `Committed ${committed.committed} import rows and skipped ${committed.skipped}`,
            ),
            auditStatus: "ok",
          };
        },
      );
    }
    default:
      return null;
  }
}
