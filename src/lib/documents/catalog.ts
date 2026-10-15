export const UPLOAD_KINDS = [
  "LEASE",
  "ID",
  "INSURANCE",
  "INSPECTION",
  "NOTICE",
  "RECEIPT",
  "OTHER",
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<UploadKind | "INVOICE", string> = {
  LEASE: "Lease",
  ID: "ID",
  INSURANCE: "Insurance",
  INSPECTION: "Inspection",
  NOTICE: "Notice (N1/N2/N4)",
  RECEIPT: "Receipt",
  OTHER: "Other",
  INVOICE: "Invoice",
};

export const DOCUMENT_SUBJECTS = ["property", "unit", "tenant", "lease"] as const;

export type DocumentSubjectName = (typeof DOCUMENT_SUBJECTS)[number];

export const SUBJECT_LABELS: Record<DocumentSubjectName, string> = {
  property: "Property",
  unit: "Unit",
  tenant: "Tenant",
  lease: "Lease",
};

/** Insurance and similar dates show up this many days ahead. */
export const EXPIRY_WINDOW_DAYS = 60;

/** 10 MB. Multipart overhead is allowed above this in the server limit. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Signed download links stop working after this many seconds. */
export const SIGNED_URL_SECONDS = 120;

export const DOCUMENT_BUCKET = "landlord-documents";

export const STORAGE_NOT_CONFIGURED = "Document storage is not configured.";

export function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as readonly string[]).includes(value);
}

export function formatDocumentBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) {
    return "Size unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
