export const LEDGER_CHARGE_KINDS = [
  "WATER",
  "UTILITIES",
  "FEE",
  "LTB_FILING",
  "OTHER",
] as const;

export type LedgerChargeKind = (typeof LEDGER_CHARGE_KINDS)[number];

export type AllocationLine = {
  kind: "RENT" | LedgerChargeKind;
  period: string | null;
  portion: string | null;
  amountCents: number;
  description: string | null;
};

export function isLedgerChargeKind(value: string): value is LedgerChargeKind {
  return (LEDGER_CHARGE_KINDS as readonly string[]).includes(value);
}

export function allocationTotal(lines: { amountCents: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/** A payment is allocated only when the lines add up to the payment. */
export function allocationBalance(
  paymentCents: number,
  lines: { amountCents: number }[],
) {
  const allocatedCents = allocationTotal(lines);
  return {
    allocatedCents,
    differenceCents: paymentCents - allocatedCents,
    balanced: paymentCents === allocatedCents && lines.every((line) => line.amountCents > 0),
  };
}

/**
 * Split cents across parts. The first parts receive any leftover cent
 * so the parts add back to the original total.
 */
export function splitCentsEvenly(totalCents: number, parts: number): number[] {
  if (parts <= 0 || totalCents < 0) {
    return [];
  }
  const base = Math.floor(totalCents / parts);
  let remainder = totalCents - base * parts;
  return Array.from({ length: parts }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

export function linesFromPeriods(
  totalCents: number,
  periods: string[],
  portion: string | null,
): AllocationLine[] {
  const amounts = splitCentsEvenly(totalCents, periods.length);
  return periods.map((period, index) => ({
    kind: "RENT" as const,
    period,
    portion,
    amountCents: amounts[index] ?? 0,
    description: null,
  }));
}
