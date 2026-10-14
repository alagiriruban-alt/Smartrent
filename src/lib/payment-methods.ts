export const PAYMENT_METHODS = [
  "E_TRANSFER",
  "CASH",
  "CHEQUE",
  "PRE_AUTHORIZED",
  "OTHER",
] as const;

export type RentPaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<RentPaymentMethod, string> = {
  E_TRANSFER: "Interac e-Transfer",
  CASH: "Cash",
  CHEQUE: "Cheque",
  PRE_AUTHORIZED: "Pre-authorized debit",
  OTHER: "Other",
};

export function isPaymentMethod(value: string): value is RentPaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}
