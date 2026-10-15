import { addMonths, daysBetween, lastDayOfMonth, monthStart } from "@/lib/dates";

export type ChargeStatus = "DUE" | "PAID" | "PARTIAL" | "LATE";

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  DUE: "Due",
  PAID: "Paid",
  PARTIAL: "Partial",
  LATE: "Late",
};

export function dueOnForPeriod(periodStart: string, rentDueDay: number): string {
  const year = Number(periodStart.slice(0, 4));
  const month = Number(periodStart.slice(5, 7));
  const day = Math.min(rentDueDay, lastDayOfMonth(year, month));
  return `${periodStart.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/**
 * Months whose due date falls inside the lease, from the lease start
 * through the earlier of today and the lease end.
 */
export function chargePeriods(input: {
  leaseStart: string;
  leaseEnd: string | null;
  rentDueDay: number;
  today: string;
}): string[] {
  const capSource =
    input.leaseEnd && input.leaseEnd < input.today ? input.leaseEnd : input.today;
  const cap = monthStart(capSource);
  const periods: string[] = [];
  for (
    let cursor = monthStart(input.leaseStart);
    cursor <= cap && periods.length < 240;
    cursor = addMonths(cursor, 1)
  ) {
    const dueOn = dueOnForPeriod(cursor, input.rentDueDay);
    if (dueOn < input.leaseStart) {
      continue;
    }
    if (input.leaseEnd && dueOn > input.leaseEnd) {
      continue;
    }
    periods.push(cursor);
  }
  return periods;
}

export function chargeStatus(
  amountCents: number,
  paidCents: number,
  dueOn: string,
  today: string,
): ChargeStatus {
  if (paidCents >= amountCents) {
    return "PAID";
  }
  if (paidCents > 0) {
    return "PARTIAL";
  }
  if (today > dueOn) {
    return "LATE";
  }
  return "DUE";
}

export type ChargeRow = {
  id: string;
  periodStart: string;
  dueOn: string;
  amountCents: number;
  paidCents: number;
};

export type StandingCharge = ChargeRow & {
  owingCents: number;
  status: ChargeStatus;
  daysLate: number;
};

export function standCharge(charge: ChargeRow, today: string): StandingCharge {
  const paidCents = Math.max(0, charge.paidCents);
  const owingCents = Math.max(0, charge.amountCents - paidCents);
  const daysLate =
    owingCents > 0 && today > charge.dueOn
      ? daysBetween(charge.dueOn, today)
      : 0;
  return {
    ...charge,
    paidCents,
    owingCents,
    status: chargeStatus(charge.amountCents, paidCents, charge.dueOn, today),
    daysLate,
  };
}

export type LedgerPayment = {
  id: string;
  amountCents: number;
  paidOn: string;
  method: string;
  referenceNumber: string | null;
  note: string | null;
  allocatedCents: number;
};

export type LedgerSummary = {
  charges: StandingCharge[];
  totalChargedCents: number;
  totalPaidCents: number;
  balanceCents: number;
  creditCents: number;
};

export function summarizeLedger(
  charges: ChargeRow[],
  payments: { amountCents: number; allocatedCents: number }[],
  today: string,
): LedgerSummary {
  const standing = charges
    .map((charge) => standCharge(charge, today))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const totalChargedCents = standing.reduce(
    (sum, charge) => sum + charge.amountCents,
    0,
  );
  const totalPaidCents = payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );
  const allocatedCents = payments.reduce(
    (sum, payment) => sum + payment.allocatedCents,
    0,
  );
  return {
    charges: standing,
    totalChargedCents,
    totalPaidCents,
    balanceCents: totalChargedCents - totalPaidCents,
    creditCents: Math.max(0, totalPaidCents - allocatedCents),
  };
}

/**
 * Apply rent credits and an applied deposit to rent charges.
 * A reduction with a period hits that YYYY-MM. A reduction without a
 * period fills the oldest open rent charge. Nothing here reads free text.
 */
export function applyRentReductions<
  T extends {
    id: string;
    periodStart: string;
    dueOn: string;
    amountCents: number;
    paidCents: number;
  },
>(
  charges: T[],
  reductions: { period: string | null; amountCents: number }[],
): T[] {
  const next = charges.map((charge) => ({ ...charge }));
  const byPeriod = new Map<string, T[]>();
  for (const charge of next) {
    const period = charge.periodStart.slice(0, 7);
    const list = byPeriod.get(period) ?? [];
    list.push(charge);
    byPeriod.set(period, list);
  }
  const ordered = [...next].sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
  );
  for (const reduction of reductions) {
    let left = reduction.amountCents;
    const targets = reduction.period ? (byPeriod.get(reduction.period) ?? []) : ordered;
    for (const charge of targets) {
      if (left <= 0) {
        break;
      }
      const room = charge.amountCents - charge.paidCents;
      if (room <= 0) {
        continue;
      }
      const applied = Math.min(room, left);
      charge.paidCents += applied;
      left -= applied;
    }
  }
  return next;
}

export function summarizeMonth(charges: StandingCharge[], month: string) {
  const rows = charges.filter((charge) => charge.periodStart === month);
  const expectedCents = rows.reduce((sum, charge) => sum + charge.amountCents, 0);
  const collectedCents = rows.reduce(
    (sum, charge) => sum + Math.min(charge.paidCents, charge.amountCents),
    0,
  );
  return {
    expectedCents,
    collectedCents,
    outstandingCents: expectedCents - collectedCents,
  };
}

export type CreditPayment = {
  id: string;
  amountCents: number;
  allocatedCents: number;
  paidOn: string;
};

export type CreditCharge = {
  id: string;
  amountCents: number;
  paidCents: number;
  dueOn: string;
};

export type PlannedAllocation = {
  paymentId: string;
  chargeId: string;
  amountCents: number;
};

/** Apply unallocated payment money to the oldest open charges. */
export function planCreditAllocations(
  payments: CreditPayment[],
  charges: CreditCharge[],
): PlannedAllocation[] {
  const orderedPayments = [...payments].sort(
    (a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id),
  );
  const orderedCharges = [...charges].sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
  );
  const chargeLeft = new Map(
    orderedCharges.map((charge) => [
      charge.id,
      charge.amountCents - charge.paidCents,
    ]),
  );
  const planned: PlannedAllocation[] = [];
  for (const payment of orderedPayments) {
    let paymentLeft = payment.amountCents - payment.allocatedCents;
    if (paymentLeft <= 0) {
      continue;
    }
    for (const charge of orderedCharges) {
      if (paymentLeft <= 0) {
        break;
      }
      const open = chargeLeft.get(charge.id) ?? 0;
      if (open <= 0) {
        continue;
      }
      const amountCents = Math.min(paymentLeft, open);
      planned.push({
        paymentId: payment.id,
        chargeId: charge.id,
        amountCents,
      });
      paymentLeft -= amountCents;
      chargeLeft.set(charge.id, open - amountCents);
    }
  }
  return planned;
}

export type ArrearsSampleLine = {
  periodStart: string;
  payCents: number;
};

/**
 * Sample history for a tenant who fell behind: older months paid in full,
 * the second-most-recent past-due month partial, and the latest past-due
 * month unpaid.
 */
export function arrearsSamplePlan(
  charges: { periodStart: string; dueOn: string; amountCents: number }[],
  today: string,
): ArrearsSampleLine[] {
  const past = charges
    .filter((charge) => charge.dueOn < today)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const partialCount = past.length >= 2 ? 1 : 0;
  const fullCount = Math.max(0, past.length - 1 - partialCount);
  return past.map((charge, index) => {
    if (index < fullCount) {
      return { periodStart: charge.periodStart, payCents: charge.amountCents };
    }
    if (index < fullCount + partialCount) {
      const partial = Math.min(50_000, Math.max(1, charge.amountCents - 1));
      return {
        periodStart: charge.periodStart,
        payCents: Math.min(partial, charge.amountCents),
      };
    }
    return { periodStart: charge.periodStart, payCents: 0 };
  });
}
