import { randomUUID } from "node:crypto";

import type { DocumentKind, DocumentSubject, Prisma } from "@prisma/client";

import {
  DOCUMENT_KIND_LABELS,
  EXPIRY_WINDOW_DAYS,
  SIGNED_URL_SECONDS,
  STORAGE_NOT_CONFIGURED,
  SUBJECT_LABELS,
  type DocumentSubjectName,
  type UploadKind,
  formatDocumentBytes,
  isUploadKind,
} from "@/lib/documents/catalog";
import { inspectDocumentFile, type AcceptedFile } from "@/lib/documents/files";
import { noticeFileName } from "@/lib/documents/notice-lines";
import { getDocumentStorage, storageKeyFor } from "@/lib/documents/storage";
import { addDays, dateOnlyToUtc, isIsoDate, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { propertyTitle, tenantName } from "@/lib/format";
import { buildTextPdf } from "@/lib/n4/pdf";
import { buildPlainPdf } from "@/lib/plain-pdf";
import { ServiceError } from "@/lib/services/errors";
import { getN4Notice, saveN4Draft } from "@/lib/services/n4";
import { getRentIncreaseNotice } from "@/lib/services/rent-increase";

const PRISMA_SUBJECT: Record<DocumentSubjectName, DocumentSubject> = {
  property: "PROPERTY",
  unit: "UNIT",
  tenant: "TENANT",
  lease: "LEASE",
};

const KIND_VALUES: readonly DocumentKind[] = [
  "LEASE",
  "ID",
  "INSURANCE",
  "INSPECTION",
  "NOTICE",
  "RECEIPT",
  "INVOICE",
  "OTHER",
];

export type DocumentScope =
  | { type: "portfolio" }
  | { type: "property"; propertyId: string }
  | { type: "unit"; unitId: string }
  | { type: "tenant"; tenantId: string };

export type DocumentListFilter = {
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  tenancyId?: string;
  noticeId?: string;
  kind?: string;
  expiringOnly?: boolean;
};

export type UploadTarget = {
  subject: DocumentSubjectName;
  id: string;
  label: string;
  group: "Property" | "Unit" | "Tenant" | "Lease";
};

export type ExpiryState = "none" | "ok" | "soon" | "expired";

export type DocumentView = {
  id: string;
  fileName: string;
  kind: DocumentKind;
  kindLabel: string;
  subject: DocumentSubjectName;
  subjectLabel: string;
  attachedTo: string;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  tenancyId: string | null;
  noticeId: string | null;
  noticeType: "N1" | "N2" | "N4" | null;
  mimeType: string | null;
  byteSize: number | null;
  byteLabel: string;
  expiresOn: string | null;
  expiry: ExpiryState;
  createdOn: string;
};

export type DocumentAuditView = {
  id: string;
  action: "UPLOAD" | "DELETE";
  fileName: string;
  summary: string;
  createdAt: string;
};

export type DocumentLink = {
  documentId: string;
  fileName: string;
  url: string;
  expiresInSeconds: number;
  expiresAt: string;
};

type Attachment = {
  subject: DocumentSubjectName;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  tenancyId: string | null;
  label: string;
};

const documentInclude = {
  property: { select: { name: true, streetAddress: true } },
  unit: {
    select: {
      label: true,
      property: { select: { name: true, streetAddress: true } },
    },
  },
  tenant: { select: { firstName: true, lastName: true } },
  tenancy: {
    select: {
      tenant: { select: { firstName: true, lastName: true } },
      unit: { select: { label: true } },
    },
  },
  notice: { select: { type: true } },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

export function expiryState(expiresOn: string | null, today: string): ExpiryState {
  if (!expiresOn) {
    return "none";
  }
  if (expiresOn < today) {
    return "expired";
  }
  if (expiresOn <= addDays(today, EXPIRY_WINDOW_DAYS)) {
    return "soon";
  }
  return "ok";
}

function subjectName(subject: DocumentSubject): DocumentSubjectName {
  switch (subject) {
    case "UNIT":
      return "unit";
    case "TENANT":
      return "tenant";
    case "LEASE":
      return "lease";
    default:
      return "property";
  }
}

function attachedLabel(row: DocumentRow): string {
  if (row.subject === "LEASE" && row.tenancy) {
    return `${tenantName(row.tenancy.tenant)} · ${row.tenancy.unit.label}`;
  }
  if (row.subject === "TENANT" && row.tenant) {
    return tenantName(row.tenant);
  }
  if (row.subject === "UNIT" && row.unit) {
    return `${row.unit.label} · ${propertyTitle(row.unit.property)}`;
  }
  if (row.property) {
    return propertyTitle(row.property);
  }
  return SUBJECT_LABELS[subjectName(row.subject)];
}

function toView(row: DocumentRow, today: string): DocumentView {
  const expiresOn = row.expiresOn ? utcToDateOnly(row.expiresOn) : null;
  const subject = subjectName(row.subject);
  const kindLabel =
    row.kind === "NOTICE" && row.notice
      ? `Notice · ${row.notice.type}`
      : DOCUMENT_KIND_LABELS[row.kind];
  return {
    id: row.id,
    fileName: row.fileName,
    kind: row.kind,
    kindLabel,
    subject,
    subjectLabel: SUBJECT_LABELS[subject],
    attachedTo: attachedLabel(row),
    propertyId: row.propertyId,
    unitId: row.unitId,
    tenantId: row.tenantId,
    tenancyId: row.tenancyId,
    noticeId: row.noticeId,
    noticeType: row.notice?.type ?? null,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    byteLabel: formatDocumentBytes(row.byteSize),
    expiresOn,
    expiry: expiryState(expiresOn, today),
    createdOn: todayDateOnly(row.createdAt),
  };
}

function whereFor(ownerId: string, filter: DocumentListFilter, today: string): Prisma.DocumentWhereInput {
  const clauses: Prisma.DocumentWhereInput[] = [{ ownerId }];
  if (filter.propertyId) {
    clauses.push({
      OR: [
        { propertyId: filter.propertyId },
        { unit: { propertyId: filter.propertyId } },
        { tenancy: { unit: { propertyId: filter.propertyId } } },
        { tenant: { tenancies: { some: { unit: { propertyId: filter.propertyId } } } } },
      ],
    });
  }
  if (filter.unitId) {
    clauses.push({
      OR: [
        { unitId: filter.unitId },
        { tenancy: { unitId: filter.unitId } },
        { tenant: { tenancies: { some: { unitId: filter.unitId } } } },
      ],
    });
  }
  if (filter.tenantId) {
    clauses.push({
      OR: [{ tenantId: filter.tenantId }, { tenancy: { tenantId: filter.tenantId } }],
    });
  }
  if (filter.tenancyId) {
    clauses.push({ tenancyId: filter.tenancyId });
  }
  if (filter.noticeId) {
    clauses.push({ noticeId: filter.noticeId });
  }
  if (filter.kind) {
    if (!(KIND_VALUES as readonly string[]).includes(filter.kind)) {
      throw new ServiceError("invalid", "That category is not recognized.");
    }
    clauses.push({ kind: filter.kind as DocumentKind });
  }
  if (filter.expiringOnly) {
    clauses.push({
      expiresOn: { lte: dateOnlyToUtc(addDays(today, EXPIRY_WINDOW_DAYS)) },
    });
  }
  return { AND: clauses };
}

export async function listDocuments(
  ownerId: string,
  filter: DocumentListFilter = {},
  today = todayDateOnly(),
): Promise<DocumentView[]> {
  const rows = await prisma.document.findMany({
    where: whereFor(ownerId, filter, today),
    include: documentInclude,
    orderBy: filter.expiringOnly ? { expiresOn: "asc" } : { createdAt: "desc" },
  });
  return rows.map((row) => toView(row, today));
}

export async function getDocument(
  ownerId: string,
  documentId: string,
  today = todayDateOnly(),
): Promise<DocumentView | null> {
  const row = await prisma.document.findFirst({
    where: { id: documentId, ownerId },
    include: documentInclude,
  });
  return row ? toView(row, today) : null;
}

export async function listDocumentAudit(ownerId: string, limit = 8): Promise<DocumentAuditView[]> {
  const rows = await prisma.documentAuditLog.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    fileName: row.fileName,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function resolveAttachment(
  ownerId: string,
  subject: DocumentSubjectName,
  subjectId: string,
): Promise<Attachment> {
  if (subject === "property") {
    const property = await prisma.property.findFirst({
      where: { id: subjectId, ownerId },
      select: { id: true, name: true, streetAddress: true },
    });
    if (!property) {
      throw new ServiceError("not_found", "That property was not found.");
    }
    return {
      subject,
      propertyId: property.id,
      unitId: null,
      tenantId: null,
      tenancyId: null,
      label: propertyTitle(property),
    };
  }
  if (subject === "unit") {
    const unit = await prisma.unit.findFirst({
      where: { id: subjectId, property: { ownerId } },
      select: {
        id: true,
        label: true,
        propertyId: true,
        property: { select: { name: true, streetAddress: true } },
      },
    });
    if (!unit) {
      throw new ServiceError("not_found", "That unit was not found.");
    }
    return {
      subject,
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantId: null,
      tenancyId: null,
      label: `${unit.label} · ${propertyTitle(unit.property)}`,
    };
  }
  if (subject === "tenant") {
    const tenant = await prisma.tenant.findFirst({
      where: { id: subjectId, ownerId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!tenant) {
      throw new ServiceError("not_found", "That tenant was not found.");
    }
    return {
      subject,
      propertyId: null,
      unitId: null,
      tenantId: tenant.id,
      tenancyId: null,
      label: tenantName(tenant),
    };
  }
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: subjectId, unit: { property: { ownerId } } },
    select: {
      id: true,
      tenantId: true,
      unitId: true,
      tenant: { select: { firstName: true, lastName: true } },
      unit: {
        select: {
          label: true,
          propertyId: true,
        },
      },
    },
  });
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  return {
    subject,
    propertyId: tenancy.unit.propertyId,
    unitId: tenancy.unitId,
    tenantId: tenancy.tenantId,
    tenancyId: tenancy.id,
    label: `${tenantName(tenancy.tenant)} · ${tenancy.unit.label}`,
  };
}

function requireStorage() {
  const storage = getDocumentStorage();
  if (storage.mode === "unconfigured") {
    throw new ServiceError("invalid", STORAGE_NOT_CONFIGURED);
  }
  return storage;
}

async function storeOwnedFile(input: {
  ownerId: string;
  attachment: Attachment;
  kind: UploadKind;
  file: AcceptedFile;
  expiresOn: string | null;
  noticeId?: string;
  summary: string;
}): Promise<string> {
  const storage = requireStorage();
  const id = randomUUID();
  const storageKey = storageKeyFor(input.ownerId, id);
  await storage.put(storageKey, input.file.bytes, input.file.mimeType);
  try {
    await prisma.$transaction([
      prisma.document.create({
        data: {
          id,
          ownerId: input.ownerId,
          subject: PRISMA_SUBJECT[input.attachment.subject],
          propertyId: input.attachment.propertyId,
          unitId: input.attachment.unitId,
          tenantId: input.attachment.tenantId,
          tenancyId: input.attachment.tenancyId,
          noticeId: input.noticeId ?? null,
          kind: input.kind,
          fileName: input.file.fileName,
          storageKey,
          mimeType: input.file.mimeType,
          byteSize: input.file.bytes.byteLength,
          expiresOn: input.expiresOn ? dateOnlyToUtc(input.expiresOn) : null,
        },
      }),
      prisma.documentAuditLog.create({
        data: {
          ownerId: input.ownerId,
          documentId: id,
          action: "UPLOAD",
          fileName: input.file.fileName,
          summary: input.summary,
        },
      }),
    ]);
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return id;
}

export async function uploadDocument(
  ownerId: string,
  input: {
    subject: DocumentSubjectName;
    subjectId: string;
    kind: string;
    fileName: string;
    bytes: Uint8Array;
    expiresOn: string | null;
  },
): Promise<DocumentView> {
  if (!isUploadKind(input.kind)) {
    throw new ServiceError("invalid", "Choose a category.");
  }
  if (input.expiresOn && !isIsoDate(input.expiresOn)) {
    throw new ServiceError("invalid", "Enter the expiry date as YYYY-MM-DD.");
  }
  const inspected = inspectDocumentFile({ fileName: input.fileName, bytes: input.bytes });
  if (!inspected.ok) {
    throw new ServiceError("invalid", inspected.message);
  }
  const attachment = await resolveAttachment(ownerId, input.subject, input.subjectId);
  const id = await storeOwnedFile({
    ownerId,
    attachment,
    kind: input.kind,
    file: inspected.file,
    expiresOn: input.expiresOn,
    summary: `Uploaded ${inspected.file.fileName} to ${attachment.label}.`,
  });
  const saved = await getDocument(ownerId, id);
  if (!saved) {
    throw new ServiceError("not_found", "That document was not found.");
  }
  return saved;
}

export async function deleteDocument(ownerId: string, documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, ownerId },
    select: { id: true, storageKey: true, fileName: true },
  });
  if (!doc || doc.storageKey !== storageKeyFor(ownerId, doc.id)) {
    throw new ServiceError("not_found", "That document was not found.");
  }
  const storage = requireStorage();
  await storage.remove(doc.storageKey);
  await prisma.$transaction(async (tx) => {
    const removed = await tx.document.deleteMany({
      where: { id: doc.id, ownerId },
    });
    if (removed.count !== 1) {
      throw new ServiceError("not_found", "That document was not found.");
    }
    await tx.documentAuditLog.create({
      data: {
        ownerId,
        documentId: doc.id,
        action: "DELETE",
        fileName: doc.fileName,
        summary: `Deleted ${doc.fileName}.`,
      },
    });
  });
}

export async function createDocumentLink(ownerId: string, documentId: string): Promise<DocumentLink> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, ownerId },
    select: { id: true, storageKey: true, fileName: true },
  });
  if (!doc || doc.storageKey !== storageKeyFor(ownerId, doc.id)) {
    throw new ServiceError("not_found", "That document was not found.");
  }
  const storage = requireStorage();
  const url = await storage.signedUrl(doc.storageKey, SIGNED_URL_SECONDS);
  return {
    documentId: doc.id,
    fileName: doc.fileName,
    url,
    expiresInSeconds: SIGNED_URL_SECONDS,
    expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
  };
}

export async function purgeOwnedDocuments(
  ownerId: string,
  where: Prisma.DocumentWhereInput,
): Promise<void> {
  const docs = await prisma.document.findMany({
    where: { AND: [{ ownerId }, where] },
    select: { id: true, storageKey: true, fileName: true },
  });
  if (docs.length === 0) {
    return;
  }
  const storage = getDocumentStorage();
  if (storage.mode !== "unconfigured") {
    for (const doc of docs) {
      if (doc.storageKey === storageKeyFor(ownerId, doc.id)) {
        await storage.remove(doc.storageKey);
      }
    }
  }
  await prisma.documentAuditLog.createMany({
    data: docs.map((doc) => ({
      ownerId,
      documentId: doc.id,
      action: "DELETE" as const,
      fileName: doc.fileName,
      summary: `Deleted ${doc.fileName} because the record it was attached to was removed.`,
    })),
  });
}

export async function listUploadTargets(
  ownerId: string,
  scope: DocumentScope,
): Promise<UploadTarget[]> {
  if (scope.type === "property") {
    const property = await prisma.property.findFirst({
      where: { id: scope.propertyId, ownerId },
      select: { id: true, name: true, streetAddress: true },
    });
    if (!property) {
      return [];
    }
    return [
      {
        subject: "property",
        id: property.id,
        label: propertyTitle(property),
        group: "Property",
      },
    ];
  }
  if (scope.type === "unit") {
    const unit = await prisma.unit.findFirst({
      where: { id: scope.unitId, property: { ownerId } },
      select: {
        id: true,
        label: true,
        tenancies: {
          orderBy: { leaseStart: "desc" },
          select: {
            id: true,
            tenant: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!unit) {
      return [];
    }
    const targets: UploadTarget[] = [
      { subject: "unit", id: unit.id, label: unit.label, group: "Unit" },
    ];
    const seen = new Set<string>();
    for (const tenancy of unit.tenancies) {
      if (!seen.has(tenancy.tenant.id)) {
        seen.add(tenancy.tenant.id);
        targets.push({
          subject: "tenant",
          id: tenancy.tenant.id,
          label: tenantName(tenancy.tenant),
          group: "Tenant",
        });
      }
      targets.push({
        subject: "lease",
        id: tenancy.id,
        label: `${tenantName(tenancy.tenant)} · ${unit.label}`,
        group: "Lease",
      });
    }
    return targets;
  }
  if (scope.type === "tenant") {
    const tenant = await prisma.tenant.findFirst({
      where: { id: scope.tenantId, ownerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        tenancies: {
          orderBy: { leaseStart: "desc" },
          select: { id: true, unit: { select: { label: true } } },
        },
      },
    });
    if (!tenant) {
      return [];
    }
    return [
      { subject: "tenant", id: tenant.id, label: tenantName(tenant), group: "Tenant" },
      ...tenant.tenancies.map((tenancy) => ({
        subject: "lease" as const,
        id: tenancy.id,
        label: `${tenantName(tenant)} · ${tenancy.unit.label}`,
        group: "Lease" as const,
      })),
    ];
  }

  const properties = await prisma.property.findMany({
    where: { ownerId },
    orderBy: { streetAddress: "asc" },
    select: {
      id: true,
      name: true,
      streetAddress: true,
      units: {
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          tenancies: {
            orderBy: { leaseStart: "desc" },
            select: {
              id: true,
              tenant: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  const targets: UploadTarget[] = [];
  const seen = new Set<string>();
  for (const property of properties) {
    const title = propertyTitle(property);
    targets.push({ subject: "property", id: property.id, label: title, group: "Property" });
    for (const unit of property.units) {
      targets.push({
        subject: "unit",
        id: unit.id,
        label: `${unit.label} · ${title}`,
        group: "Unit",
      });
      for (const tenancy of unit.tenancies) {
        if (!seen.has(tenancy.tenant.id)) {
          seen.add(tenancy.tenant.id);
          targets.push({
            subject: "tenant",
            id: tenancy.tenant.id,
            label: tenantName(tenancy.tenant),
            group: "Tenant",
          });
        }
        targets.push({
          subject: "lease",
          id: tenancy.id,
          label: `${tenantName(tenancy.tenant)} · ${unit.label}`,
          group: "Lease",
        });
      }
    }
  }
  return targets;
}

export async function loadDocumentPanel(ownerId: string, scope: DocumentScope) {
  const today = todayDateOnly();
  const filter: DocumentListFilter =
    scope.type === "property"
      ? { propertyId: scope.propertyId }
      : scope.type === "unit"
        ? { unitId: scope.unitId }
        : scope.type === "tenant"
          ? { tenantId: scope.tenantId }
          : {};
  const [documents, targets, audit, expiring] = await Promise.all([
    listDocuments(ownerId, filter, today),
    listUploadTargets(ownerId, scope),
    scope.type === "portfolio" ? listDocumentAudit(ownerId, 8) : Promise.resolve([]),
    scope.type === "portfolio"
      ? listDocuments(ownerId, { expiringOnly: true }, today)
      : Promise.resolve([]),
  ]);
  return {
    documents,
    targets,
    audit,
    expiring,
    storageMode: getDocumentStorage().mode,
    today,
  };
}

export async function saveNoticePdf(ownerId: string, noticeId: string): Promise<DocumentView> {
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId, ownerId },
    select: { id: true, type: true, tenancyId: true },
  });
  if (!notice) {
    throw new ServiceError("not_found", "That notice was not found.");
  }
  let lines: string[];
  let code: string;
  let tenantLabel: string;
  if (notice.type === "N4") {
    const n4 = await getN4Notice(ownerId, notice.id);
    if (!n4) {
      throw new ServiceError("not_found", "That notice was not found.");
    }
    lines = n4.lines;
    code = "N4";
    tenantLabel = n4.tenantName;
  } else {
    const increase = await getRentIncreaseNotice(ownerId, notice.id);
    if (!increase) {
      throw new ServiceError("not_found", "That notice was not found.");
    }
    lines = increase.lines;
    code = increase.document.formCode;
    tenantLabel = increase.document.tenantName;
  }
  const inspected = inspectDocumentFile({
    fileName: noticeFileName(code, tenantLabel),
    bytes: notice.type === "N4" ? buildTextPdf(lines) : buildPlainPdf(lines),
  });
  if (!inspected.ok) {
    throw new ServiceError("invalid", inspected.message);
  }
  const attachment = await resolveAttachment(ownerId, "lease", notice.tenancyId);
  const id = await storeOwnedFile({
    ownerId,
    attachment,
    kind: "NOTICE",
    file: inspected.file,
    expiresOn: null,
    noticeId: notice.id,
    summary: `Saved a ${code} draft PDF for ${tenantLabel}.`,
  });
  const saved = await getDocument(ownerId, id);
  if (!saved) {
    throw new ServiceError("not_found", "That document was not found.");
  }
  return saved;
}

export async function saveN4DraftDocument(
  ownerId: string,
  tenancyId: string,
): Promise<DocumentView> {
  requireStorage();
  const saved = await saveN4Draft(ownerId, tenancyId);
  if (!saved.persisted || !saved.noticeId) {
    throw new ServiceError("invalid", saved.reason ?? "No N4 draft was saved.");
  }
  return saveNoticePdf(ownerId, saved.noticeId);
}
