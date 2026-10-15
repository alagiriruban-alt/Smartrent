import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/agent/audit";
import { dateOnlyToUtc, isIsoDate, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatAddress, tenantName } from "@/lib/format";
import { ontarioNoticesEnabled } from "@/lib/jurisdiction";
import { n4DocumentLines, type N4Sheet } from "@/lib/n4/document";
import {
  earliestTerminationDate,
  isN4ServiceMethod,
  N4_SERVICE_METHOD_LABELS,
  type N4ServiceMethod,
  type RentFrequency,
  terminationTooEarly,
} from "@/lib/n4/rules";
import {
  n4RentTableFromCharges,
  readN4RentRows,
  type N4RentTable,
} from "@/lib/n4/table";
import { ServiceError } from "@/lib/services/errors";
import { getTenancyLedgerFor } from "@/lib/services/rent";

const EMPTY_REASON = "Nothing is past due, so no N4 draft was saved.";

export type N4DraftInput = {
  tenancyId: string;
  noticeId?: string | null;
  givenOn: string;
  serviceMethod: N4ServiceMethod;
  rentFrequency: RentFrequency;
  terminationDate: string | null;
  landlordName: string | null;
  landlordContact: string | null;
  tenantNames: string | null;
  unitAddress: string | null;
};

export type N4Preview = N4Sheet & {
  tenancyId: string;
  tenantName: string;
  fileGenerated: false;
  served: boolean;
};

export type SavedN4 = {
  noticeId: string;
  tenantName: string;
  preview: N4Preview;
};

type LoadedNotice = {
  id: string;
  tenancyId: string;
  status: "DRAFT" | "SERVED" | "VOID";
  totalOwingCents: number | null;
  terminationDate: Date | null;
  servedOn: Date | null;
  serviceMethod: string | null;
  givenOn: Date | null;
  confirmedAt: Date | null;
  rentFrequency: RentFrequency | null;
  n4ServiceMethod: N4ServiceMethod | null;
  landlordName: string | null;
  landlordContact: string | null;
  tenantNames: string | null;
  unitAddress: string | null;
  arrearsRows: Prisma.JsonValue;
  tenancy: {
    tenant: { firstName: string; lastName: string };
  };
};

function cleanText(value: string | null, fallback: string, max: number): string {
  const trimmed = value?.trim() ?? "";
  const chosen = trimmed.length > 0 ? trimmed : fallback;
  return chosen.slice(0, max);
}

function sheetFromPreview(input: {
  confirmed: boolean;
  status: N4Sheet["status"];
  landlordName: string;
  landlordContact: string;
  tenantNames: string;
  unitAddress: string;
  givenOn: string;
  serviceMethod: N4ServiceMethod;
  rentFrequency: RentFrequency;
  terminationDate: string;
  servedOn: string | null;
  servedMethod: N4ServiceMethod | null;
  table: N4RentTable;
}): N4Sheet {
  const plan = earliestTerminationDate({
    givenOn: input.givenOn,
    serviceMethod: input.serviceMethod,
    rentFrequency: input.rentFrequency,
  });
  return {
    confirmed: input.confirmed,
    status: input.status,
    landlordName: input.landlordName,
    landlordContact: input.landlordContact,
    tenantNames: input.tenantNames,
    unitAddress: input.unitAddress,
    givenOn: input.givenOn,
    serviceMethod: input.serviceMethod,
    rentFrequency: input.rentFrequency,
    terminationDate: input.terminationDate,
    earliestTerminationDate: plan.terminationDate,
    deemedGivenOn: plan.deemedGivenOn,
    servedOn: input.servedOn,
    servedMethod: input.servedMethod,
    rows: input.table.rows,
    totalOwingCents: input.table.totalOwingCents,
  };
}

export async function previewN4Notice(
  ownerId: string,
  input: N4DraftInput,
): Promise<N4Preview> {
  if (!isIsoDate(input.givenOn)) {
    throw new ServiceError("invalid", "Enter the date you will give the notice as YYYY-MM-DD.");
  }
  const ledger = await getTenancyLedgerFor(ownerId, input.tenancyId);
  if (!ledger) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: input.tenancyId, unit: { property: { ownerId } } },
    include: {
      tenant: true,
      unit: { include: { property: { include: { owner: true } } } },
    },
  });
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  if (tenancy.status !== "ACTIVE") {
    throw new ServiceError("invalid", "An N4 is for a tenant who is still in the unit.");
  }
  if (!ontarioNoticesEnabled(tenancy.unit.property)) {
    throw new ServiceError(
      "invalid",
      "N4 is an Ontario notice. Quebec properties stay on the ledger only.",
    );
  }
  const table = n4RentTableFromCharges({
    tenancyId: tenancy.id,
    asOf: input.givenOn,
    charges: ledger.summary.charges.map((charge) => ({
      periodStart: charge.periodStart,
      dueOn: charge.dueOn,
      amountCents: charge.amountCents,
      paidCents: charge.paidCents,
    })),
  });
  const plan = earliestTerminationDate({
    givenOn: input.givenOn,
    serviceMethod: input.serviceMethod,
    rentFrequency: input.rentFrequency,
  });
  const terminationDate = input.terminationDate ?? plan.terminationDate;
  if (!isIsoDate(terminationDate)) {
    throw new ServiceError("invalid", "Enter the termination date as YYYY-MM-DD.");
  }
  if (terminationTooEarly(terminationDate, plan.terminationDate)) {
    throw new ServiceError(
      "invalid",
      `The termination date cannot be earlier than ${plan.terminationDate}, the first day this notice could legally end.`,
    );
  }
  const landlordName = cleanText(input.landlordName, tenancy.unit.property.owner.name, 80);
  const landlordContact = cleanText(
    input.landlordContact,
    tenancy.unit.property.owner.email,
    120,
  );
  const names = cleanText(input.tenantNames, tenantName(tenancy.tenant), 200);
  const unitAddress = cleanText(
    input.unitAddress,
    `${tenancy.unit.label}, ${formatAddress(tenancy.unit.property)}`,
    240,
  );
  const sheet = sheetFromPreview({
    confirmed: false,
    status: "DRAFT",
    landlordName,
    landlordContact,
    tenantNames: names,
    unitAddress,
    givenOn: input.givenOn,
    serviceMethod: input.serviceMethod,
    rentFrequency: input.rentFrequency,
    terminationDate,
    servedOn: null,
    servedMethod: null,
    table,
  });
  return {
    ...sheet,
    tenancyId: tenancy.id,
    tenantName: tenantName(tenancy.tenant),
    fileGenerated: false,
    served: false,
  };
}

async function persistNotice(
  ownerId: string,
  input: N4DraftInput,
  preview: N4Preview,
  notes: string,
) {
  const data = {
    totalOwingCents: preview.totalOwingCents,
    terminationDate: dateOnlyToUtc(preview.terminationDate),
    givenOn: dateOnlyToUtc(preview.givenOn),
    rentFrequency: preview.rentFrequency,
    n4ServiceMethod: preview.serviceMethod,
    landlordName: preview.landlordName,
    landlordContact: preview.landlordContact,
    tenantNames: preview.tenantNames,
    unitAddress: preview.unitAddress,
    arrearsRows: preview.rows as Prisma.InputJsonValue,
    notes,
    confirmedAt: null,
  };
  if (input.noticeId) {
    const existing = await prisma.notice.findFirst({
      where: { id: input.noticeId, ownerId, tenancyId: input.tenancyId, type: "N4" },
    });
    if (!existing) {
      throw new ServiceError("not_found", "That notice was not found.");
    }
    if (existing.status !== "DRAFT") {
      throw new ServiceError("invalid", "A served notice cannot be edited.");
    }
    return prisma.notice.update({
      where: { id: existing.id },
      data,
    });
  }
  return prisma.notice.create({
    data: {
      ...data,
      ownerId,
      tenancyId: input.tenancyId,
      type: "N4",
      status: "DRAFT",
    },
  });
}

export async function saveN4NoticeDraft(
  ownerId: string,
  input: N4DraftInput,
  notes = "N4 data sheet. Not the official LTB form. Not served.",
): Promise<SavedN4> {
  const preview = await previewN4Notice(ownerId, input);
  if (preview.totalOwingCents <= 0) {
    throw new ServiceError("invalid", EMPTY_REASON);
  }
  const notice = await persistNotice(ownerId, input, preview, notes);
  return { noticeId: notice.id, tenantName: preview.tenantName, preview };
}

async function loadNotice(ownerId: string, noticeId: string): Promise<LoadedNotice | null> {
  return prisma.notice.findFirst({
    where: { id: noticeId, ownerId, type: "N4" },
    include: { tenancy: { include: { tenant: true } } },
  });
}

export async function confirmN4Notice(ownerId: string, noticeId: string) {
  const notice = await loadNotice(ownerId, noticeId);
  if (!notice) {
    throw new ServiceError("not_found", "That notice was not found.");
  }
  if (notice.status === "SERVED") {
    throw new ServiceError("invalid", "This notice is already recorded as served.");
  }
  if (notice.status !== "DRAFT") {
    throw new ServiceError("invalid", "Only a draft can be confirmed.");
  }
  const alreadyConfirmed = Boolean(notice.confirmedAt);
  if (!alreadyConfirmed) {
    await prisma.notice.update({
      where: { id: notice.id },
      data: { confirmedAt: new Date() },
    });
  }
  const view = await getN4Notice(ownerId, noticeId);
  return { notice: view, alreadyConfirmed };
}

export async function recordN4Service(
  ownerId: string,
  input: { noticeId: string; servedOn: string; serviceMethod: N4ServiceMethod },
) {
  if (!isIsoDate(input.servedOn)) {
    throw new ServiceError("invalid", "Enter the date you gave the notice as YYYY-MM-DD.");
  }
  const notice = await loadNotice(ownerId, input.noticeId);
  if (!notice) {
    throw new ServiceError("not_found", "That notice was not found.");
  }
  if (notice.status === "SERVED") {
    throw new ServiceError("invalid", "Service is already recorded for this notice.");
  }
  if (!notice.confirmedAt) {
    throw new ServiceError("invalid", "Confirm the notice before you record service.");
  }
  if (!notice.terminationDate || !notice.givenOn || !notice.rentFrequency) {
    throw new ServiceError("invalid", "This draft is missing the dates it needs.");
  }
  const terminationDate = utcToDateOnly(notice.terminationDate);
  const plan = earliestTerminationDate({
    givenOn: input.servedOn,
    serviceMethod: input.serviceMethod,
    rentFrequency: notice.rentFrequency,
  });
  if (terminationTooEarly(terminationDate, plan.terminationDate)) {
    throw new ServiceError(
      "invalid",
      `Giving this notice by ${N4_SERVICE_METHOD_LABELS[input.serviceMethod]} on ${input.servedOn} means the termination date cannot be earlier than ${plan.terminationDate}. Edit the notice first.`,
    );
  }
  await prisma.notice.update({
    where: { id: notice.id },
    data: {
      status: "SERVED",
      servedOn: dateOnlyToUtc(input.servedOn),
      serviceMethod: input.serviceMethod,
      notes: "N4 data sheet. Service recorded by the landlord. Not the official LTB form.",
    },
  });
  return getN4Notice(ownerId, input.noticeId);
}

export type N4NoticeView = N4Preview & {
  noticeId: string;
  confirmedAt: string | null;
  lines: string[];
};

function toView(notice: LoadedNotice): N4NoticeView {
  const frequency = notice.rentFrequency ?? "MONTHLY";
  const method = notice.n4ServiceMethod ?? "IN_PERSON";
  const givenOn = notice.givenOn ? utcToDateOnly(notice.givenOn) : utcToDateOnly(notice.terminationDate ?? new Date());
  const terminationDate = notice.terminationDate
    ? utcToDateOnly(notice.terminationDate)
    : givenOn;
  const rows = readN4RentRows(notice.arrearsRows);
  const servedMethod =
    notice.serviceMethod && isN4ServiceMethod(notice.serviceMethod) ? notice.serviceMethod : null;
  const sheet = sheetFromPreview({
    confirmed: Boolean(notice.confirmedAt),
    status: notice.status,
    landlordName: notice.landlordName ?? "Landlord",
    landlordContact: notice.landlordContact ?? "",
    tenantNames: notice.tenantNames ?? tenantName(notice.tenancy.tenant),
    unitAddress: notice.unitAddress ?? "",
    givenOn,
    serviceMethod: method,
    rentFrequency: frequency,
    terminationDate,
    servedOn: notice.servedOn ? utcToDateOnly(notice.servedOn) : null,
    servedMethod,
    table: {
      rows,
      totalOwingCents: notice.totalOwingCents ?? rows.reduce((sum, row) => sum + row.rentOwingCents, 0),
    },
  });
  return {
    ...sheet,
    noticeId: notice.id,
    tenancyId: notice.tenancyId,
    tenantName: tenantName(notice.tenancy.tenant),
    confirmedAt: notice.confirmedAt ? notice.confirmedAt.toISOString() : null,
    fileGenerated: false,
    served: notice.status === "SERVED",
    lines: n4DocumentLines(sheet),
  };
}

export async function getN4Notice(
  ownerId: string,
  noticeId: string,
): Promise<N4NoticeView | null> {
  const notice = await loadNotice(ownerId, noticeId);
  if (!notice) {
    return null;
  }
  return toView(notice);
}

export type N4ListItem = {
  noticeId: string;
  tenancyId: string;
  status: "DRAFT" | "SERVED" | "VOID";
  confirmed: boolean;
  terminationDate: string | null;
  totalOwingCents: number | null;
  servedOn: string | null;
};

export async function listTenancyN4Notices(
  ownerId: string,
  tenancyId: string,
): Promise<N4ListItem[]> {
  const notices = await prisma.notice.findMany({
    where: { ownerId, tenancyId, type: "N4" },
    orderBy: { createdAt: "desc" },
  });
  return notices.map(toListItem);
}

export async function latestN4ByTenancy(ownerId: string, tenancyIds: string[]) {
  const map = new Map<string, N4ListItem>();
  if (tenancyIds.length === 0) {
    return map;
  }
  const notices = await prisma.notice.findMany({
    where: {
      ownerId,
      type: "N4",
      tenancyId: { in: tenancyIds },
      status: { in: ["DRAFT", "SERVED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const notice of notices) {
    if (!map.has(notice.tenancyId)) {
      map.set(notice.tenancyId, toListItem(notice));
    }
  }
  return map;
}

function toListItem(notice: {
  id: string;
  tenancyId: string;
  status: "DRAFT" | "SERVED" | "VOID";
  confirmedAt: Date | null;
  terminationDate: Date | null;
  totalOwingCents: number | null;
  servedOn: Date | null;
}): N4ListItem {
  return {
    noticeId: notice.id,
    tenancyId: notice.tenancyId,
    status: notice.status,
    confirmed: Boolean(notice.confirmedAt),
    terminationDate: notice.terminationDate ? utcToDateOnly(notice.terminationDate) : null,
    totalOwingCents: notice.totalOwingCents,
    servedOn: notice.servedOn ? utcToDateOnly(notice.servedOn) : null,
  };
}

export async function saveN4ForLandlord(ownerId: string, input: N4DraftInput) {
  const saved = await saveN4NoticeDraft(ownerId, input);
  await writeAudit({
    ownerId,
    tokenId: null,
    tool: "save_n4_notice",
    status: "ok",
    summary: `Saved an N4 draft for ${saved.tenantName}`,
    viaAgent: false,
  });
  return saved;
}

export async function confirmN4ForLandlord(ownerId: string, noticeId: string) {
  const result = await confirmN4Notice(ownerId, noticeId);
  if (!result.notice) {
    throw new ServiceError("not_found", "That notice was not found.");
  }
  if (!result.alreadyConfirmed) {
    await writeAudit({
      ownerId,
      tokenId: null,
      tool: "confirm_n4_notice",
      status: "ok",
      summary: `Confirmed an N4 notice for ${result.notice.tenantNames}`,
      viaAgent: false,
    });
  }
  return result.notice;
}

export async function recordN4ServiceForLandlord(
  ownerId: string,
  input: { noticeId: string; servedOn: string; serviceMethod: N4ServiceMethod },
) {
  const notice = await recordN4Service(ownerId, input);
  if (!notice) {
    throw new ServiceError("not_found", "That notice was not found.");
  }
  await writeAudit({
    ownerId,
    tokenId: null,
    tool: "record_n4_service",
    status: "ok",
    summary: `Recorded N4 service for ${notice.tenantNames}`,
    viaAgent: false,
  });
  return notice;
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
  periods: {
    periodStart: string;
    dueOn: string;
    chargedCents: number;
    paidCents: number;
    owingCents: number;
    daysLate: number;
  }[];
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
  if (!ledger.ontarioNotices) {
    throw new ServiceError(
      "invalid",
      "N4 is an Ontario notice. Quebec properties stay on the ledger only.",
    );
  }
  const landlord = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { name: true },
  });
  const plan = earliestTerminationDate({
    givenOn: today,
    serviceMethod: "IN_PERSON",
    rentFrequency: "MONTHLY",
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
    suggestedTerminationDate: plan.terminationDate,
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
      reason: EMPTY_REASON,
    };
  }
  const saved = await saveN4NoticeDraft(
    ownerId,
    {
      tenancyId,
      givenOn: today,
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
      terminationDate: draft.suggestedTerminationDate,
      landlordName: draft.landlordName,
      landlordContact: null,
      tenantNames: draft.tenantName,
      unitAddress: `${draft.unitLabel}, ${draft.address}`,
    },
    "Draft prepared via agent. Not served. No form file was created.",
  );
  const documentCount = await prisma.document.count({
    where: { noticeId: saved.noticeId },
  });
  return {
    ...draft,
    persisted: true as const,
    noticeId: saved.noticeId,
    noticeStatus: "DRAFT" as const,
    documentCount,
    reason: null,
  };
}

