import type { RentPaymentMethod } from "@/lib/payment-methods";

/** Stable key for an Interac reference. Empty for every other payment. */
export function etransferReferenceKey(
  method: RentPaymentMethod | string,
  referenceNumber: string | null | undefined,
): string | null {
  if (method !== "E_TRANSFER" || !referenceNumber) {
    return null;
  }
  const normalized = referenceNumber.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) {
    return null;
  }
  return `etransfer:${normalized}`;
}
