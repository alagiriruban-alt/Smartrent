import { daysBetween } from "@/lib/dates";

export type ArrearsPeriod = {
  periodStart: string;
  dueOn: string;
  chargedCents: number;
  paidCents: number;
  owingCents: number;
  daysLate: number;
};

/**
 * Past-due rent for one lease. An N4 notice copies `totalOwingCents`
 * and lists `periods` as the rent the notice claims. A period is
 * included only after its due date, and only for the unpaid portion.
 */
export type N4Arrears = {
  tenancyId: string;
  asOf: string;
  totalOwingCents: number;
  periods: ArrearsPeriod[];
};

export function buildN4Arrears(input: {
  tenancyId: string;
  asOf: string;
  charges: Array<{
    periodStart: string;
    dueOn: string;
    amountCents: number;
    paidCents: number;
  }>;
}): N4Arrears {
  const periods = input.charges
    .map((charge) => {
      const paidCents = Math.min(Math.max(0, charge.paidCents), charge.amountCents);
      const owingCents = charge.amountCents - paidCents;
      return {
        periodStart: charge.periodStart,
        dueOn: charge.dueOn,
        chargedCents: charge.amountCents,
        paidCents,
        owingCents,
        daysLate:
          owingCents > 0 && input.asOf > charge.dueOn
            ? daysBetween(charge.dueOn, input.asOf)
            : 0,
      };
    })
    .filter((period) => period.owingCents > 0 && input.asOf > period.dueOn)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  return {
    tenancyId: input.tenancyId,
    asOf: input.asOf,
    totalOwingCents: periods.reduce((sum, period) => sum + period.owingCents, 0),
    periods,
  };
}
