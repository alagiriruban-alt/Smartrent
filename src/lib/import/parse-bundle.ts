import { createHash } from "node:crypto";

import {
  allocationBalance,
  isLedgerChargeKind,
  linesFromPeriods,
  type AllocationLine,
} from "@/lib/allocations";
import { parseMoneyToCents } from "@/lib/money";
import { isRentalPeriod, needsReview, parsePeriodText } from "@/lib/periods";
import { isJurisdiction, jurisdictionForProvince } from "@/lib/jurisdiction";
import { percentToBps } from "@/lib/shares";

export const BUNDLE_VERSION = 1;

const REVIEW_CONFIDENCE = 80;

export type ParsedAllocation = AllocationLine;

export type ParsedLedgerRow = {
  externalKey: string;
  tenant: string;
  paidOn: string | null;
  amountCents: number | null;
  method: string;
  referenceType: string | null;
  reference: string | null;
  memo: string | null;
  periodText: string | null;
  kind: "RENT" | "DEPOSIT" | "UNKNOWN";
  lines: ParsedAllocation[];
  confidence: number;
  flags: string[];
  needsReview: boolean;
  label: string;
};

export type ParsedExpenseRow = {
  externalKey: string;
  incurredOn: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  category: string | null;
  subtotalCents: number | null;
  hstCents: number | null;
  totalCents: number | null;
  receiptDocumentId: string | null;
  confidence: number;
  flags: string[];
  needsReview: boolean;
};

export type ParsedHeader = {
  externalKey: string | null;
  name: string | null;
  streetAddress: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  jurisdiction: "ON" | "QC" | null;
  owners: { name: string; shareBps: number }[];
  confidence: number;
  flags: string[];
  needsReview: boolean;
};

export type ParsedTenancy = {
  externalKey: string;
  tenant: string;
  unit: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  monthlyRentCents: number | null;
  rentDueDay: number | null;
  depositCents: number | null;
  confidence: number;
  flags: string[];
  needsReview: boolean;
};

export type SourceTotals = {
  periods: Record<string, number>;
  years: Record<string, number>;
  expenses: Record<string, number>;
};

export type ParsedBundle = {
  sourceHash: string;
  header: ParsedHeader;
  tenancies: ParsedTenancy[];
  ledger: ParsedLedgerRow[];
  expenses: ParsedExpenseRow[];
  sourceTotals: SourceTotals;
  errors: string[];
};

export type ReconciliationLine = {
  key: string;
  parsedCents: number;
  sourceCents: number | null;
  differenceCents: number | null;
};

export type Reconciliation = {
  periods: ReconciliationLine[];
  years: ReconciliationLine[];
  expenses: ReconciliationLine[];
  matched: boolean;
  ambiguousCount: number;
  rentCollectedCents: number;
};

const T776 = new Set([
  "ADVERTISING",
  "INSURANCE",
  "INTEREST_BANK_CHARGES",
  "OFFICE",
  "PROFESSIONAL_FEES",
  "MANAGEMENT_FEES",
  "REPAIRS_MAINTENANCE",
  "SALARIES_WAGES",
  "PROPERTY_TAXES",
  "TRAVEL",
  "UTILITIES",
  "MOTOR_VEHICLE",
  "OTHER",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sourceHashFor(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  return raw;
}

function money(value: unknown): number | null {
  if (typeof value === "number") {
    return parseMoneyToCents(value);
  }
  const raw = text(value);
  if (!raw) {
    return null;
  }
  return parseMoneyToCents(raw);
}

function finish(confidence: number, flags: string[]) {
  return {
    confidence,
    flags,
    needsReview: needsReview(confidence, flags),
  };
}

function parseOwners(value: unknown): { name: string; shareBps: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const owners: { name: string; shareBps: number }[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const name = text(row.name);
    const share = percentToBps(
      typeof row.percent === "number" || typeof row.percent === "string"
        ? row.percent
        : "",
    );
    if (name && share !== null) {
      owners.push({ name, shareBps: share });
    }
  }
  return owners;
}

function parseHeader(value: unknown): ParsedHeader {
  const row = asRecord(value) ?? {};
  const flags: string[] = [];
  const province = text(row.province)?.toUpperCase() ?? null;
  const stated = text(row.jurisdiction)?.toUpperCase() ?? null;
  let jurisdiction: "ON" | "QC" | null = null;
  if (stated && isJurisdiction(stated)) {
    jurisdiction = stated;
  } else if (province) {
    jurisdiction = jurisdictionForProvince(province);
  } else {
    flags.push("missing_jurisdiction");
  }
  if (!text(row.streetAddress)) {
    flags.push("missing_address");
  }
  const owners = parseOwners(row.owners);
  if (owners.length > 0) {
    const total = owners.reduce((sum, owner) => sum + owner.shareBps, 0);
    if (total !== 10000) {
      flags.push("ownership_not_100");
    }
  }
  const confidence = flags.length === 0 ? 100 : 60;
  return {
    externalKey: text(row.externalKey),
    name: text(row.name),
    streetAddress: text(row.streetAddress),
    city: text(row.city),
    province,
    postalCode: text(row.postalCode),
    jurisdiction,
    owners,
    ...finish(confidence, flags),
  };
}

function parseTenancy(value: unknown, index: number): ParsedTenancy {
  const row = asRecord(value) ?? {};
  const flags: string[] = [];
  const tenant = text(row.tenant);
  if (!tenant) {
    flags.push("unknown_tenant");
  }
  const leaseStart = isoDate(row.leaseStart);
  if (!leaseStart) {
    flags.push("missing_lease_start");
  }
  const monthlyRentCents = money(row.monthlyRent ?? row.rent);
  if (monthlyRentCents === null) {
    flags.push("unparsed_amount");
  }
  const due = text(row.rentDueDay);
  const rentDueDay = due && /^\d{1,2}$/.test(due) ? Number(due) : null;
  if (rentDueDay === null || rentDueDay < 1 || rentDueDay > 31) {
    flags.push("missing_due_day");
  }
  const confidence = flags.length === 0 ? 100 : 55;
  return {
    externalKey: text(row.externalKey) ?? `tenancy-${index + 1}`,
    tenant: tenant ?? "",
    unit: text(row.unit),
    leaseStart,
    leaseEnd: isoDate(row.leaseEnd),
    monthlyRentCents,
    rentDueDay,
    depositCents: money(row.deposit),
    ...finish(confidence, flags),
  };
}

function explicitLines(value: unknown): { lines: AllocationLine[]; flags: string[] } | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const lines: AllocationLine[] = [];
  const flags: string[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) {
      flags.push("ambiguous_period");
      continue;
    }
    const kindText = (text(row.kind) ?? "RENT").toUpperCase();
    const amountCents = money(row.amount);
    const period = text(row.period);
    if (amountCents === null) {
      flags.push("unparsed_amount");
      continue;
    }
    if (kindText === "RENT") {
      if (!period || !isRentalPeriod(period)) {
        flags.push("ambiguous_period");
        continue;
      }
      lines.push({
        kind: "RENT",
        period,
        portion: text(row.portion),
        amountCents,
        description: text(row.description),
      });
      continue;
    }
    if (!isLedgerChargeKind(kindText)) {
      flags.push("ambiguous_period");
      continue;
    }
    if (period && !isRentalPeriod(period)) {
      flags.push("ambiguous_period");
      continue;
    }
    lines.push({
      kind: kindText,
      period,
      portion: null,
      amountCents,
      description: text(row.description) ?? kindText.toLowerCase(),
    });
  }
  return { lines, flags };
}

function parseLedger(value: unknown, index: number): ParsedLedgerRow {
  const row = asRecord(value) ?? {};
  const flags: string[] = [];
  const tenant = text(row.tenant) ?? text(row.payer);
  if (!tenant) {
    flags.push("unknown_tenant");
  }
  const paidOn = isoDate(row.date ?? row.paidOn);
  if (!paidOn) {
    flags.push("missing_date");
  }
  const amountCents = money(row.amount);
  if (amountCents === null) {
    flags.push("unparsed_amount");
  }
  const periodText = text(row.periodText) ?? text(row.period) ?? text(row.memo);
  const explicit = explicitLines(row.allocations);
  let lines: AllocationLine[] = [];
  let kind: ParsedLedgerRow["kind"] = "UNKNOWN";
  let label = periodText ?? "";
  let confidence = 100;

  if (explicit) {
    lines = explicit.lines;
    flags.push(...explicit.flags);
    kind = lines.some((line) => line.kind === "RENT") ? "RENT" : "RENT";
    if (lines.length === 0) {
      kind = "UNKNOWN";
    }
    label = lines
      .map((line) => `${line.kind} ${line.period ?? ""}`.trim())
      .join(", ");
    confidence = flags.length === 0 ? 100 : 50;
  } else if (periodText && isRentalPeriod(periodText)) {
    kind = "RENT";
    label = periodText;
    lines =
      amountCents === null
        ? []
        : linesFromPeriods(amountCents, [periodText], null);
    confidence = 100;
  } else if (periodText) {
    const parsed = parsePeriodText(periodText);
    kind = parsed.kind;
    label = parsed.label;
    flags.push(...parsed.flags);
    confidence = Math.min(confidence, parsed.confidence);
    if (parsed.kind === "RENT" && amountCents !== null) {
      lines = linesFromPeriods(amountCents, parsed.periods, parsed.portion);
    }
  } else {
    flags.push("missing_period");
    confidence = 20;
  }

  if (amountCents !== null && lines.length > 0) {
    const balance = allocationBalance(amountCents, lines);
    if (!balance.balanced) {
      flags.push("allocation_unbalanced");
      confidence = Math.min(confidence, 40);
    }
  }
  if (flags.includes("unparsed_amount") || flags.includes("missing_date")) {
    confidence = Math.min(confidence, 20);
  }
  if (flags.includes("unknown_tenant")) {
    confidence = Math.min(confidence, 30);
  }

  return {
    externalKey: text(row.externalKey) ?? `ledger-${index + 1}`,
    tenant: tenant ?? "",
    paidOn,
    amountCents,
    method: (text(row.method) ?? "OTHER").toUpperCase(),
    referenceType: text(row.referenceType)?.toUpperCase() ?? null,
    reference: text(row.reference) ?? text(row.referenceNumber),
    memo: text(row.memo) ?? text(row.note),
    periodText,
    kind,
    lines,
    label,
    ...finish(confidence, [...new Set(flags)]),
  };
}

function parseExpense(value: unknown, index: number): ParsedExpenseRow {
  const row = asRecord(value) ?? {};
  const flags: string[] = [];
  const subtotalCents = money(row.subtotal);
  const hstCents = money(row.hst ?? 0);
  const totalCents = money(row.total ?? row.amount);
  const category = text(row.category)?.toUpperCase() ?? null;
  if (subtotalCents === null || hstCents === null || totalCents === null) {
    flags.push("unparsed_amount");
  } else if (subtotalCents + hstCents !== totalCents) {
    flags.push("amount_mismatch");
  }
  if (!category || !T776.has(category)) {
    flags.push("unknown_category");
  }
  if (!isoDate(row.date ?? row.incurredOn)) {
    flags.push("missing_date");
  }
  if (!text(row.description)) {
    flags.push("missing_description");
  }
  const confidence = flags.length === 0 ? 100 : 45;
  return {
    externalKey: text(row.externalKey) ?? `expense-${index + 1}`,
    incurredOn: isoDate(row.date ?? row.incurredOn),
    vendor: text(row.vendor),
    invoiceNumber: text(row.invoiceNumber),
    description: text(row.description),
    category,
    subtotalCents,
    hstCents,
    totalCents,
    receiptDocumentId: text(row.receiptDocumentId),
    ...finish(confidence, flags),
  };
}

function parseTotals(value: unknown): SourceTotals {
  const row = asRecord(value) ?? {};
  const readMap = (input: unknown) => {
    const map: Record<string, number> = {};
    const source = asRecord(input);
    if (!source) {
      return map;
    }
    for (const [key, amount] of Object.entries(source)) {
      const cents = money(amount);
      if (cents !== null) {
        map[key] = cents;
      }
    }
    return map;
  };
  return {
    periods: readMap(row.periods),
    years: readMap(row.years),
    expenses: readMap(row.expenses),
  };
}

function rentCollected(ledger: ParsedLedgerRow[]) {
  const periods: Record<string, number> = {};
  const years: Record<string, number> = {};
  for (const row of ledger) {
    if (row.needsReview && row.confidence < REVIEW_CONFIDENCE) {
      continue;
    }
    for (const line of row.lines) {
      if (line.kind !== "RENT" || !line.period) {
        continue;
      }
      periods[line.period] = (periods[line.period] ?? 0) + line.amountCents;
      const year = line.period.slice(0, 4);
      years[year] = (years[year] ?? 0) + line.amountCents;
    }
  }
  return { periods, years };
}

export function reconcileBundle(bundle: ParsedBundle): Reconciliation {
  const collected = rentCollected(bundle.ledger);
  const expenseYears: Record<string, number> = {};
  for (const row of bundle.expenses) {
    if (row.needsReview || row.totalCents === null || !row.incurredOn) {
      continue;
    }
    const year = row.incurredOn.slice(0, 4);
    expenseYears[year] = (expenseYears[year] ?? 0) + row.totalCents;
  }
  const line = (
    parsed: Record<string, number>,
    source: Record<string, number>,
  ): ReconciliationLine[] => {
    const keys = [...new Set([...Object.keys(parsed), ...Object.keys(source)])].sort();
    return keys.map((key) => {
      const parsedCents = parsed[key] ?? 0;
      const hasSource = Object.prototype.hasOwnProperty.call(source, key);
      const sourceCents = hasSource ? source[key] : null;
      return {
        key,
        parsedCents,
        sourceCents,
        differenceCents: sourceCents === null ? null : parsedCents - sourceCents,
      };
    });
  };
  const periods = line(collected.periods, bundle.sourceTotals.periods);
  const years = line(collected.years, bundle.sourceTotals.years);
  const expenses = line(expenseYears, bundle.sourceTotals.expenses);
  const comparable = [...periods, ...years, ...expenses].filter(
    (item) => item.differenceCents !== null,
  );
  const matched =
    comparable.length > 0 && comparable.every((item) => item.differenceCents === 0);
  const ambiguousCount = [
    bundle.header,
    ...bundle.tenancies,
    ...bundle.ledger,
    ...bundle.expenses,
  ].filter((row) => row.needsReview).length;
  return {
    periods,
    years,
    expenses,
    matched,
    ambiguousCount,
    rentCollectedCents: Object.values(collected.periods).reduce((sum, cents) => sum + cents, 0),
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((item) => item.some((value) => value.trim()));
  if (!header) {
    return [];
  }
  return body.map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim()] = (values[index] ?? "").trim();
    });
    return record;
  });
}

function bundleFromCsv(records: Record<string, string>[]): Record<string, unknown> {
  const property = records.find((row) => row.section === "property") ?? {};
  const owners = records
    .filter((row) => row.section === "owner")
    .map((row) => ({ name: row.name, percent: row.percent }));
  const tenancies = records
    .filter((row) => row.section === "tenancy")
    .map((row) => ({ ...row }));
  const ledger = records.filter((row) => row.section === "ledger").map((row) => ({ ...row }));
  const expenses = records
    .filter((row) => row.section === "expense")
    .map((row) => ({ ...row }));
  const periods: Record<string, string> = {};
  const years: Record<string, string> = {};
  const expenseTotals: Record<string, string> = {};
  for (const row of records) {
    if (row.section === "period_total" && row.key && row.amount) {
      periods[row.key] = row.amount;
    }
    if (row.section === "year_total" && row.key && row.amount) {
      years[row.key] = row.amount;
    }
    if (row.section === "expense_total" && row.key && row.amount) {
      expenseTotals[row.key] = row.amount;
    }
  }
  return {
    bundleVersion: 1,
    property: { ...property, owners },
    tenancies,
    ledger,
    expenses,
    sourceTotals: { periods, years, expenses: expenseTotals },
  };
}

export function parseBundleText(sourceName: string, raw: string): ParsedBundle {
  const trimmed = raw.trim();
  let payload: unknown;
  if (trimmed.startsWith("{")) {
    payload = JSON.parse(trimmed) as unknown;
  } else {
    payload = bundleFromCsv(parseCsv(trimmed));
  }
  const root = asRecord(payload);
  if (!root) {
    return {
      sourceHash: sourceHashFor({ sourceName, raw: trimmed }),
      header: parseHeader(null),
      tenancies: [],
      ledger: [],
      expenses: [],
      sourceTotals: { periods: {}, years: {}, expenses: {} },
      errors: ["The bundle must be a JSON object or a CSV file."],
    };
  }
  const ledgerInput = Array.isArray(root.ledger) ? root.ledger : [];
  const expenseInput = Array.isArray(root.expenses) ? root.expenses : [];
  const tenancyInput = Array.isArray(root.tenancies) ? root.tenancies : [];
  const bundle: ParsedBundle = {
    sourceHash: sourceHashFor(root),
    header: parseHeader(root.property ?? root.header),
    tenancies: tenancyInput.map((row, index) => parseTenancy(row, index)),
    ledger: ledgerInput.map((row, index) => parseLedger(row, index)),
    expenses: expenseInput.map((row, index) => parseExpense(row, index)),
    sourceTotals: parseTotals(root.sourceTotals),
    errors: [],
  };
  return bundle;
}

export function parseBundleObject(value: unknown): ParsedBundle {
  return parseBundleText("bundle.json", JSON.stringify(value));
}
