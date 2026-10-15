import type { AgentTokenScope } from "@prisma/client";

import { consumeConfirmation, issueConfirmation } from "@/lib/agent/confirm";
import { writeAgentAudit } from "@/lib/agent/audit";
import { parseInteracEmail, rankTenants } from "@/lib/interac";
import { isIsoDate, todayDateOnly } from "@/lib/dates";
import { formatCad } from "@/lib/money";
import { isPaymentMethod } from "@/lib/payment-methods";
import { ServiceError } from "@/lib/services/errors";
import { classifyIngest } from "@/lib/services/ingest-decision";
import { listProperties, listTenants } from "@/lib/services/portfolio";
import {
  buildN4Draft,
  getReceiptFor,
  getReminderBoardFor,
  getRentStatus,
  listLateTenants,
  previewReminderMessage,
  previewRentPayment,
  recordRentPayment,
  saveN4Draft,
} from "@/lib/services/rent";
import { parseRentIncreaseForm } from "@/lib/rent-increase/parse";
import {
  assessRentIncrease,
  listUpcomingRentIncreases,
  saveRentIncreaseDraft,
} from "@/lib/services/rent-increase";
import { parsePayment, type PaymentInput } from "@/lib/validators";
import { SIGNED_URL_SECONDS } from "@/lib/documents/catalog";
import { createDocumentLink, listDocuments } from "@/lib/services/documents";

export type AgentContext = {
  ownerId: string;
  tokenId: string;
  scopes: AgentTokenScope[];
};

type ToolScope = "READ" | "WRITE";

type ToolOutcome = {
  result: unknown;
  summary: string;
  auditStatus: "ok" | "pending" | "error";
};

type ToolDefinition = {
  name: string;
  description: string;
  scope: ToolScope;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

const INSTRUCTIONS = [
  "SmartRentBoss shows one landlord's properties, tenants, and rent ledger.",
  "Read tools answer immediately.",
  "record_payment, prepare_n4_draft, and prepare_rent_increase_notice do not write on the first call. They return confirmationToken. Call the same tool again with that token and the same arguments to commit. The token expires in 15 minutes and works once.",
  "ingest_etransfer_email records the payment when the sender, amount, date, and reference match one tenant at high confidence. Otherwise it returns pending_confirmation.",
  "The same e-Transfer reference is never posted twice.",
  "prepare_n4_draft returns draft data only. It never creates a PDF and it never serves a notice.",
  "prepare_rent_increase_notice saves a draft only. It never serves a notice and it never creates a PDF. An N1 draft is refused when that year's Ontario guideline is not verified.",
  "list_upcoming_rent_increases lists leases inside the 120-day Ontario increase window.",
  "list_documents lists file names and categories. It does not return file contents.",
  "get_document_link returns a signed download URL that expires in 120 seconds. The file must belong to this landlord.",
].join(" ");

export function mcpInstructions(): string {
  return INSTRUCTIONS;
}

const tools: ToolDefinition[] = [
  {
    name: "list_properties",
    description: "List this landlord's properties, units, and who currently lives in each unit.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tenants",
    description: "List leases for this landlord. Pass propertyId to limit the list to one property.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional property id." },
      },
    },
  },
  {
    name: "get_rent_status",
    description:
      "Rent collected this month for the whole portfolio, or the ledger for one lease when tenancyId is set.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string", description: "Optional lease id." },
      },
    },
  },
  {
    name: "list_late_tenants",
    description: "Tenants with unpaid rent whose due date has passed.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "record_payment",
    description:
      "Record rent against a lease. The first call returns a preview and confirmationToken and does not save. Call again with the same arguments plus confirmationToken to save. An e-Transfer reference that is already on the ledger is not posted again. amount is Canadian dollars, such as 1450 or \"1450.00\".",
    scope: "WRITE",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        paidOn: { type: "string", description: "Date received, YYYY-MM-DD." },
        amount: { description: "Canadian dollars.", anyOf: [{ type: "string" }, { type: "number" }] },
        method: {
          type: "string",
          enum: ["E_TRANSFER", "CASH", "CHEQUE", "PRE_AUTHORIZED", "OTHER"],
        },
        referenceNumber: { type: "string" },
        note: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "paidOn", "amount"],
    },
  },
  {
    name: "parse_etransfer_email",
    description:
      "Read an Interac e-Transfer notification and return the amount, sender, date, reference, and message. Does not record a payment.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: { emailText: { type: "string" } },
      required: ["emailText"],
    },
  },
  {
    name: "ingest_etransfer_email",
    description:
      "Parse an Interac e-Transfer email, match the sender to a tenant, and record the payment when confidence is high. Otherwise return pending_confirmation and a confirmationToken. Call again with that token to record. The same reference is never posted twice.",
    scope: "WRITE",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        emailText: { type: "string" },
        tenancyId: { type: "string", description: "Lease to use when confirming a weak match." },
        confirmationToken: { type: "string" },
      },
      required: ["emailText"],
    },
  },
  {
    name: "generate_rent_receipt",
    description:
      "Receipt text for one payment. No file is written. Use paymentId from a recorded payment.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: { paymentId: { type: "string" } },
      required: ["paymentId"],
    },
  },
  {
    name: "list_reminders",
    description:
      "Tenants who match the reminder schedule, with the email text to copy. Nothing is sent.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "preview_reminder_message",
    description:
      "The reminder email for one lease. Nothing is sent. Pass chargeId to pick one month.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        chargeId: { type: "string" },
      },
      required: ["tenancyId"],
    },
  },
  {
    name: "prepare_n4_draft",
    description:
      "Draft the figures for an Ontario N4 non-payment notice. The first call previews and returns confirmationToken. The second call saves a draft record only. No PDF is created and the notice is not served.",
    scope: "WRITE",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId"],
    },
  },
  {
    name: "list_upcoming_rent_increases",
    description:
      "Active leases whose next Ontario rent increase is inside the 120-day alert window, including the serve-by date and whether the unit uses N1 or N2 data.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "prepare_rent_increase_notice",
    description:
      "Draft an Ontario rent increase notice. N1 data when the unit is covered by the guideline, N2 data when the unit was first occupied residentially after November 15, 2018. The first call returns a preview and confirmationToken and does not save. Call again with the same arguments plus confirmationToken to save a draft. No PDF is created and the notice is not served. newRent is Canadian dollars.",
    scope: "WRITE",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        tenancyId: { type: "string" },
        effectiveOn: { type: "string", description: "Date the new rent starts, YYYY-MM-DD." },
        newRent: {
          description: "New monthly rent in Canadian dollars.",
          anyOf: [{ type: "string" }, { type: "number" }],
        },
        confirmationToken: { type: "string" },
      },
      required: ["tenancyId", "effectiveOn", "newRent"],
    },
  },
  {
    name: "list_documents",
    description:
      "List this landlord's documents. Filter with propertyId, unitId, tenantId, tenancyId, kind, or expiringOnly. Does not return file contents or a download link.",
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        propertyId: { type: "string" },
        unitId: { type: "string" },
        tenantId: { type: "string" },
        tenancyId: { type: "string" },
        kind: {
          type: "string",
          enum: ["LEASE", "ID", "INSURANCE", "INSPECTION", "NOTICE", "RECEIPT", "INVOICE", "OTHER"],
        },
        expiringOnly: {
          type: "boolean",
          description: "Only documents that expire within 60 days, including dates that have passed.",
        },
      },
    },
  },
  {
    name: "get_document_link",
    description: `A signed download URL for one document owned by this landlord. The URL expires in ${SIGNED_URL_SECONDS} seconds.`,
    scope: "READ",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
      },
      required: ["documentId"],
    },
  },
];

export function toolsFor(scopes: AgentTokenScope[]) {
  return tools
    .filter((tool) => scopes.includes(tool.scope))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }));
}

function via(summary: string): string {
  return summary.endsWith("via agent") ? summary : `${summary} via agent`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError("invalid", "Tool arguments must be an object.");
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ServiceError("invalid", `${key} must be true or false.`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ServiceError("invalid", `${key} must be text.`);
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

function amountString(args: Record<string, unknown>): string {
  const value = args.amount;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new ServiceError("invalid", "Enter the amount in dollars, such as 1450.00.");
}

function paymentPayload(input: PaymentInput) {
  return {
    tenancyId: input.tenancyId,
    paidOn: input.paidOn,
    amountCents: input.amountCents,
    method: input.method,
    referenceNumber: input.referenceNumber,
    note: input.note,
  };
}

function readPayment(args: Record<string, unknown>, today: string): PaymentInput {
  const method = optionalString(args, "method") ?? "E_TRANSFER";
  if (!isPaymentMethod(method)) {
    throw new ServiceError("invalid", "Choose how the tenant paid.");
  }
  const parsed = parsePayment(
    {
      tenancyId: optionalString(args, "tenancyId") ?? "",
      paidOn: optionalString(args, "paidOn") ?? "",
      amount: amountString(args),
      method,
      referenceNumber: optionalString(args, "referenceNumber") ?? "",
      note: optionalString(args, "note") ?? "",
    },
    today,
  );
  if (!parsed.ok) {
    const message = Object.values(parsed.errors)
      .flat()
      .filter((item): item is string => Boolean(item))
      .join(" ");
    throw new ServiceError("invalid", message || "That payment could not be read.");
  }
  return parsed.data;
}

async function recordPaymentTool(
  ctx: AgentContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const today = todayDateOnly();
  const input = readPayment(args, today);
  const confirmationToken = optionalString(args, "confirmationToken");
  if (!confirmationToken) {
    const preview = await previewRentPayment(ctx.ownerId, input, today);
    if (preview.alreadyRecorded) {
      return {
        result: {
          status: "already_recorded",
          paymentId: preview.existingPaymentId,
          preview,
        },
        summary: via(
          `e-Transfer ${input.referenceNumber} for ${preview.tenantName} was already recorded`,
        ),
        auditStatus: "ok",
      };
    }
    const issued = await issueConfirmation({
      ownerId: ctx.ownerId,
      tool: "record_payment",
      payload: paymentPayload(input),
    });
    return {
      result: {
        status: "confirmation_required",
        confirmationToken: issued.secret,
        expiresAt: issued.expiresAt,
        preview,
      },
      summary: via(
        `Asked to confirm ${formatCad(input.amountCents)} for ${preview.tenantName}`,
      ),
      auditStatus: "pending",
    };
  }
  await consumeConfirmation({
    ownerId: ctx.ownerId,
    secret: confirmationToken,
    tool: "record_payment",
    payload: paymentPayload(input),
  });
  const recorded = await recordRentPayment(ctx.ownerId, input, today);
  const verb = recorded.outcome === "already_recorded" ? "was already recorded" : "Recorded";
  return {
    result: {
      status: recorded.outcome,
      payment: recorded.payment,
    },
    summary: via(
      `${verb} ${formatCad(recorded.payment.amountCents)} for ${recorded.payment.tenantName}`,
    ),
    auditStatus: "ok",
  };
}

async function ingestTool(ctx: AgentContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const emailText = requiredString(args, "emailText", "the e-Transfer email");
  if (emailText.length > 100_000) {
    throw new ServiceError("invalid", "That email is too long.");
  }
  const today = todayDateOnly();
  const tenants = await listTenants(ctx.ownerId);
  const parsed = parseInteracEmail(emailText);
  const ranked = rankTenants(
    parsed.senderName,
    tenants.map((tenant) => ({
      tenancyId: tenant.tenancyId,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
    })),
  );
  const decision = classifyIngest({ parsed, ranked, today });
  const candidates = tenants.map((tenant) => ({
    tenancyId: tenant.tenancyId,
    tenantName: tenant.tenantName,
    unitLabel: tenant.unitLabel,
    propertyLabel: tenant.propertyLabel,
    score: ranked.find((match) => match.tenancyId === tenant.tenancyId)?.score ?? 0,
  }));
  const payload = {
    emailText,
    amountCents: parsed.amountCents,
    paidOn: parsed.paidOn,
    referenceNumber: parsed.referenceNumber,
    note: parsed.message,
    proposedTenancyId: decision.proposedTenancyId,
  };
  const confirmationToken = optionalString(args, "confirmationToken");
  const suppliedTenancyId = optionalString(args, "tenancyId");

  if (confirmationToken) {
    if (
      decision.proposedTenancyId &&
      suppliedTenancyId &&
      suppliedTenancyId !== decision.proposedTenancyId
    ) {
      throw new ServiceError(
        "mismatch",
        "That confirmation was for a different lease. Preview the email again.",
      );
    }
    const tenancyId = suppliedTenancyId ?? decision.proposedTenancyId;
    if (!tenancyId) {
      throw new ServiceError("invalid", "Choose the lease before confirming this email.");
    }
    if (!parsed.amountCents || !parsed.paidOn) {
      throw new ServiceError(
        "invalid",
        "The email is missing an amount or a date. Use record_payment instead.",
      );
    }
    await consumeConfirmation({
      ownerId: ctx.ownerId,
      secret: confirmationToken,
      tool: "ingest_etransfer_email",
      payload,
    });
    const input = readPayment(
      {
        tenancyId,
        paidOn: parsed.paidOn,
        amount: (parsed.amountCents / 100).toFixed(2),
        method: "E_TRANSFER",
        referenceNumber: parsed.referenceNumber ?? "",
        note: parsed.message ?? "",
      },
      today,
    );
    const recorded = await recordRentPayment(ctx.ownerId, input, today);
    return {
      result: {
        status: recorded.outcome === "already_recorded" ? "already_recorded" : "recorded",
        confidence: decision.confidence,
        parsed,
        payment: recorded.payment,
      },
      summary: via(
        `${recorded.outcome === "already_recorded" ? "e-Transfer was already recorded" : "Recorded an e-Transfer"} for ${recorded.payment.tenantName}`,
      ),
      auditStatus: "ok",
    };
  }

  if (decision.confidence === "high" && decision.proposedTenancyId && parsed.paidOn) {
    const input = readPayment(
      {
        tenancyId: decision.proposedTenancyId,
        paidOn: parsed.paidOn,
        amount: ((parsed.amountCents ?? 0) / 100).toFixed(2),
        method: "E_TRANSFER",
        referenceNumber: parsed.referenceNumber ?? "",
        note: parsed.message ?? "",
      },
      today,
    );
    const recorded = await recordRentPayment(ctx.ownerId, input, today);
    return {
      result: {
        status: recorded.outcome === "already_recorded" ? "already_recorded" : "recorded",
        confidence: "high",
        parsed,
        payment: recorded.payment,
      },
      summary: via(
        `${recorded.outcome === "already_recorded" ? "e-Transfer was already recorded" : "Recorded a matched e-Transfer"} for ${recorded.payment.tenantName}`,
      ),
      auditStatus: "ok",
    };
  }

  const paidOn = parsed.paidOn;
  const payable =
    parsed.amountCents !== null &&
    parsed.amountCents > 0 &&
    paidOn !== null &&
    paidOn <= today;
  const issued = payable
    ? await issueConfirmation({
        ownerId: ctx.ownerId,
        tool: "ingest_etransfer_email",
        payload,
      })
    : null;
  return {
    result: {
      status: "pending_confirmation",
      confidence: "low",
      reason: decision.reason,
      parsed,
      proposedTenancyId: decision.proposedTenancyId,
      candidates,
      confirmationToken: issued?.secret ?? null,
      expiresAt: issued?.expiresAt ?? null,
    },
    summary: via(
      decision.reason ?? "e-Transfer needs confirmation before it is recorded",
    ),
    auditStatus: "pending",
  };
}

function newRentString(args: Record<string, unknown>): string {
  const value = args.newRent;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new ServiceError(
    "invalid",
    "Enter the new monthly rent in dollars, such as 1888.85.",
  );
}

function draftPayload(draft: {
  form: { code: string; name: string; officialUrl: string };
  exempt: boolean;
  currentRentCents: number;
  newRentCents: number;
  increaseCents: number;
  increaseBasisPoints: number;
  effectiveOn: string;
  eligibleOn: string;
  serveBy: string;
  guidelineYear: number | null;
  guidelineBasisPoints: number | null;
  warnings: { code: string; message: string }[];
}) {
  return {
    form: draft.form.code,
    formName: draft.form.name,
    officialFormUrl: draft.form.officialUrl,
    exempt: draft.exempt,
    currentRentCents: draft.currentRentCents,
    newRentCents: draft.newRentCents,
    increaseCents: draft.increaseCents,
    increaseBasisPoints: draft.increaseBasisPoints,
    effectiveOn: draft.effectiveOn,
    eligibleOn: draft.eligibleOn,
    serveBy: draft.serveBy,
    guidelineYear: draft.guidelineYear,
    guidelineBasisPoints: draft.guidelineBasisPoints,
    warnings: draft.warnings,
    fileGenerated: false,
    served: false,
  };
}

async function prepareRentIncreaseTool(
  ctx: AgentContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const tenancyId = requiredString(args, "tenancyId", "the lease id");
  const effectiveOn = requiredString(args, "effectiveOn", "the effective date");
  if (!isIsoDate(effectiveOn)) {
    throw new ServiceError("invalid", "Enter the effective date as YYYY-MM-DD.");
  }
  const parsed = parseRentIncreaseForm({
    effectiveOn,
    newRent: newRentString(args),
  });
  if (!parsed.ok) {
    const message = Object.values(parsed.errors)
      .flat()
      .filter((item): item is string => Boolean(item))
      .join(" ");
    throw new ServiceError("invalid", message || "That notice could not be read.");
  }
  const payload = {
    tenancyId,
    effectiveOn: parsed.data.effectiveOn,
    newRentCents: parsed.data.newRentCents,
  };
  const confirmationToken = optionalString(args, "confirmationToken");
  if (!confirmationToken) {
    const assessed = await assessRentIncrease(ctx.ownerId, payload);
    if (assessed.status === "not_found") {
      throw new ServiceError("not_found", "That lease was not found.");
    }
    if (assessed.status !== "ready") {
      throw new ServiceError("invalid", assessed.message);
    }
    const issued = await issueConfirmation({
      ownerId: ctx.ownerId,
      tool: "prepare_rent_increase_notice",
      payload,
    });
    return {
      result: {
        status: "confirmation_required",
        confirmationToken: issued.secret,
        expiresAt: issued.expiresAt,
        draft: draftPayload(assessed),
      },
      summary: via(`Previewed an ${assessed.form.code} draft for ${assessed.tenantName}`),
      auditStatus: "pending",
    };
  }
  await consumeConfirmation({
    ownerId: ctx.ownerId,
    secret: confirmationToken,
    tool: "prepare_rent_increase_notice",
    payload,
  });
  const saved = await saveRentIncreaseDraft(ctx.ownerId, payload);
  return {
    result: {
      status: "draft",
      noticeId: saved.noticeId,
      persisted: true,
      fileGenerated: false,
      noticeStatus: "DRAFT",
      tenantName: saved.tenantName,
      draft: draftPayload(saved.draft),
    },
    summary: via(`Saved an ${saved.draft.form.code} draft for ${saved.tenantName}`),
    auditStatus: "ok",
  };
}

async function prepareN4Tool(
  ctx: AgentContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const tenancyId = requiredString(args, "tenancyId", "the lease id");
  const confirmationToken = optionalString(args, "confirmationToken");
  const payload = { tenancyId };
  if (!confirmationToken) {
    const draft = await buildN4Draft(ctx.ownerId, tenancyId);
    const issued = await issueConfirmation({
      ownerId: ctx.ownerId,
      tool: "prepare_n4_draft",
      payload,
    });
    return {
      result: {
        status: "confirmation_required",
        confirmationToken: issued.secret,
        expiresAt: issued.expiresAt,
        draft,
      },
      summary: via(`Previewed an N4 draft for ${draft.tenantName}`),
      auditStatus: "pending",
    };
  }
  await consumeConfirmation({
    ownerId: ctx.ownerId,
    secret: confirmationToken,
    tool: "prepare_n4_draft",
    payload,
  });
  const saved = await saveN4Draft(ctx.ownerId, tenancyId);
  return {
    result: { status: "draft", ...saved },
    summary: via(
      saved.persisted
        ? `Saved an N4 draft for ${saved.tenantName}`
        : `Did not save an N4 draft for ${saved.tenantName}`,
    ),
    auditStatus: "ok",
  };
}

async function runTool(ctx: AgentContext, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case "list_properties": {
      const properties = await listProperties(ctx.ownerId);
      const count = properties.length;
      return {
        result: { properties },
        summary: via(`Listed ${count} ${count === 1 ? "property" : "properties"}`),
        auditStatus: "ok",
      };
    }
    case "list_tenants": {
      const tenants = await listTenants(ctx.ownerId, optionalString(args, "propertyId"));
      return {
        result: { tenants },
        summary: via(`Listed ${tenants.length} ${tenants.length === 1 ? "lease" : "leases"}`),
        auditStatus: "ok",
      };
    }
    case "get_rent_status": {
      const status = await getRentStatus(ctx.ownerId, optionalString(args, "tenancyId"));
      const who = status.scope === "tenancy" ? status.tenantName : "the portfolio";
      return {
        result: status,
        summary: via(`Read rent status for ${who}`),
        auditStatus: "ok",
      };
    }
    case "list_late_tenants": {
      const late = await listLateTenants(ctx.ownerId);
      return {
        result: { late },
        summary: via(`Listed ${late.length} late ${late.length === 1 ? "tenant" : "tenants"}`),
        auditStatus: "ok",
      };
    }
    case "record_payment":
      return recordPaymentTool(ctx, args);
    case "parse_etransfer_email": {
      const emailText = requiredString(args, "emailText", "the e-Transfer email");
      return {
        result: { parsed: parseInteracEmail(emailText) },
        summary: via("Parsed an e-Transfer email"),
        auditStatus: "ok",
      };
    }
    case "ingest_etransfer_email":
      return ingestTool(ctx, args);
    case "generate_rent_receipt": {
      const paymentId = requiredString(args, "paymentId", "the payment id");
      const receipt = await getReceiptFor(ctx.ownerId, paymentId);
      if (!receipt) {
        throw new ServiceError("not_found", "That payment was not found.");
      }
      return {
        result: receipt,
        summary: via(`Prepared receipt ${receipt.receiptNumber} for ${receipt.tenantName}`),
        auditStatus: "ok",
      };
    }
    case "list_reminders": {
      const board = await getReminderBoardFor(ctx.ownerId);
      return {
        result: { rules: board.rules, reminders: board.cards },
        summary: via(`Listed ${board.cards.length} reminders`),
        auditStatus: "ok",
      };
    }
    case "preview_reminder_message": {
      const preview = await previewReminderMessage(
        ctx.ownerId,
        requiredString(args, "tenancyId", "the lease id"),
        optionalString(args, "chargeId"),
      );
      return {
        result: preview,
        summary: via(`Previewed a reminder for ${preview.tenantName}`),
        auditStatus: "ok",
      };
    }
    case "prepare_n4_draft":
      return prepareN4Tool(ctx, args);
    case "list_upcoming_rent_increases": {
      const increases = await listUpcomingRentIncreases(ctx.ownerId);
      return {
        result: { increases },
        summary: via(
          `Listed ${increases.length} upcoming rent ${increases.length === 1 ? "increase" : "increases"}`,
        ),
        auditStatus: "ok",
      };
    }
    case "prepare_rent_increase_notice":
      return prepareRentIncreaseTool(ctx, args);
    case "list_documents": {
      const documents = await listDocuments(ctx.ownerId, {
        propertyId: optionalString(args, "propertyId"),
        unitId: optionalString(args, "unitId"),
        tenantId: optionalString(args, "tenantId"),
        tenancyId: optionalString(args, "tenancyId"),
        kind: optionalString(args, "kind"),
        expiringOnly: optionalBoolean(args, "expiringOnly"),
      });
      return {
        result: { documents },
        summary: via(`Listed ${documents.length} ${documents.length === 1 ? "document" : "documents"}`),
        auditStatus: "ok",
      };
    }
    case "get_document_link": {
      const link = await createDocumentLink(
        ctx.ownerId,
        requiredString(args, "documentId", "the document id"),
      );
      return {
        result: link,
        summary: via(`Opened a short download link for ${link.fileName}`),
        auditStatus: "ok",
      };
    }
    default:
      throw new ServiceError("invalid", `Unknown tool ${name}.`);
  }
}

export async function callTool(
  ctx: AgentContext,
  name: string,
  rawArguments: unknown,
): Promise<ToolOutcome> {
  const tool = tools.find((item) => item.name === name);
  if (!tool) {
    throw new ServiceError("invalid", `Unknown tool ${name}.`);
  }
  if (!ctx.scopes.includes(tool.scope)) {
    throw new ServiceError(
      "invalid",
      tool.scope === "WRITE"
        ? "This token can read records but cannot change them."
        : "This token cannot use that tool.",
    );
  }
  const args = asRecord(rawArguments ?? {});
  const outcome = await runTool(ctx, name, args);
  await writeAgentAudit({
    ownerId: ctx.ownerId,
    tokenId: ctx.tokenId,
    tool: name,
    status: outcome.auditStatus,
    summary: outcome.summary,
  });
  return outcome;
}
