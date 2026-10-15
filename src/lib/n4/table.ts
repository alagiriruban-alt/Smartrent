import { buildN4Arrears, type N4Arrears } from "@/lib/arrears";
import { addDays, addMonths } from "@/lib/dates";

export type N4RentRow = {
  periodFrom: string;
  periodTo: string;
  rentChargedCents: number;
  rentPaidCents: number;
  rentOwingCents: number;
};

export type N4RentTable = {
  rows: N4RentRow[];
  totalOwingCents: number;
};

/**
 * Ledger charges are calendar months. The N4 "to" date is the last day
 * of that month, which is the day before the next period starts.
 */
export function rentalPeriodEnd(periodStart: string): string {
  return addDays(addMonths(periodStart, 1), -1);
}

/**
 * The rent-owing table on an N4, built from `buildN4Arrears`.
 * Each row is one rental period that is unpaid and past its due date.
 */
export function n4RentTable(arrears: N4Arrears): N4RentTable {
  const rows = arrears.periods.map((period) => ({
    periodFrom: period.periodStart,
    periodTo: rentalPeriodEnd(period.periodStart),
    rentChargedCents: period.chargedCents,
    rentPaidCents: period.paidCents,
    rentOwingCents: period.owingCents,
  }));
  return {
    rows,
    totalOwingCents: rows.reduce((sum, row) => sum + row.rentOwingCents, 0),
  };
}

export function n4RentTableFromCharges(input: {
  tenancyId: string;
  asOf: string;
  charges: Array<{
    periodStart: string;
    dueOn: string;
    amountCents: number;
    paidCents: number;
  }>;
}): N4RentTable {
  return n4RentTable(buildN4Arrears(input));
}

export function isN4RentRow(value: unknown): value is N4RentRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.periodFrom === "string" &&
    typeof row.periodTo === "string" &&
    typeof row.rentChargedCents === "number" &&
    typeof row.rentPaidCents === "number" &&
    typeof row.rentOwingCents === "number"
  );
}

export function readN4RentRows(value: unknown): N4RentRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isN4RentRow);
}
