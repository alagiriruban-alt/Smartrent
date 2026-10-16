import { etransferReferenceKey } from "@/lib/agent/reference";

export const REFERENCE_TYPES = ["INTERAC", "CHEQUE", "OTHER", "NONE"] as const;

export type PaymentReferenceType = (typeof REFERENCE_TYPES)[number];

export function isReferenceType(value: string): value is PaymentReferenceType {
  return (REFERENCE_TYPES as readonly string[]).includes(value);
}

function compactReference(referenceNumber: string): string {
  return referenceNumber.trim().toUpperCase().replace(/\s+/g, "");
}

export function referenceTypeFor(
  method: string,
  referenceNumber: string | null | undefined,
): PaymentReferenceType {
  const reference = referenceNumber?.trim() ?? "";
  if (!reference) {
    return "NONE";
  }
  if (method === "E_TRANSFER") {
    return "INTERAC";
  }
  if (method === "CHEQUE") {
    return "CHEQUE";
  }
  return "OTHER";
}

/**
 * Identity for one payment.
 * Interac references and cheque numbers are unique for the landlord.
 * Anything else falls back to payer, date, and amount.
 */
export function paymentDedupeKey(input: {
  method: string;
  referenceNumber?: string | null;
  referenceType?: PaymentReferenceType;
  tenancyId: string;
  paidOn: string;
  amountCents: number;
}): { referenceType: PaymentReferenceType; referenceKey: string | null; dedupeKey: string } {
  const referenceType =
    input.referenceType ?? referenceTypeFor(input.method, input.referenceNumber);
  const reference = input.referenceNumber ? compactReference(input.referenceNumber) : "";
  if (referenceType === "INTERAC" && reference) {
    const referenceKey = etransferReferenceKey("E_TRANSFER", reference);
    return {
      referenceType,
      referenceKey,
      dedupeKey: referenceKey ?? `etransfer:${reference}`,
    };
  }
  if (referenceType === "CHEQUE" && reference) {
    return { referenceType, referenceKey: null, dedupeKey: `cheque:${reference}` };
  }
  if (referenceType === "OTHER" && reference) {
    return { referenceType, referenceKey: null, dedupeKey: `other:${reference}` };
  }
  return {
    referenceType: "NONE",
    referenceKey: null,
    dedupeKey: `fallback:${input.tenancyId}:${input.paidOn}:${input.amountCents}`,
  };
}
