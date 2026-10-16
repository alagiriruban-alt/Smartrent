import { describe, expect, it } from "vitest";

import {
  allocationBalance,
  linesFromPeriods,
  splitCentsEvenly,
} from "@/lib/allocations";
import { parseMoneyToCents } from "@/lib/money";
import { paymentDedupeKey } from "@/lib/payments/identity";

describe("allocation math", () => {
  it("splits $2,779.31 into rent and water", () => {
    const payment = parseMoneyToCents("$2,779.31");
    const rent = parseMoneyToCents("2100.00");
    const water = parseMoneyToCents("679.31");
    expect(payment).toBe(277_931);
    expect(rent).toBe(210_000);
    expect(water).toBe(67_931);
    expect(
      allocationBalance(payment ?? 0, [
        { amountCents: rent ?? 0 },
        { amountCents: water ?? 0 },
      ]),
    ).toMatchObject({ balanced: true, differenceCents: 0 });
  });

  it("splits $6,300 across three months without losing a cent", () => {
    const payment = parseMoneyToCents("6300");
    const lines = linesFromPeriods(payment ?? 0, ["2025-07", "2025-08", "2025-09"], null);
    expect(lines.map((line) => line.amountCents)).toEqual([210_000, 210_000, 210_000]);
    expect(allocationBalance(payment ?? 0, lines).balanced).toBe(true);
  });

  it("gives leftover cents to the earliest parts", () => {
    expect(splitCentsEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitCentsEvenly(100, 3).reduce((sum, part) => sum + part, 0)).toBe(100);
  });

  it("rejects a split that does not add up to the payment", () => {
    expect(allocationBalance(277_931, [{ amountCents: 210_000 }]).balanced).toBe(false);
  });

  it("keeps an Interac reference unique per landlord and falls back to date, amount, and payer", () => {
    const interac = paymentDedupeKey({
      method: "E_TRANSFER",
      referenceNumber: "ca harbour 01",
      tenancyId: "tenancy-a",
      paidOn: "2025-07-03",
      amountCents: 277_931,
    });
    expect(interac.dedupeKey).toBe("etransfer:CAHARBOUR01");
    expect(interac.referenceType).toBe("INTERAC");
    const cheque = paymentDedupeKey({
      method: "CHEQUE",
      referenceNumber: "4410",
      referenceType: "CHEQUE",
      tenancyId: "tenancy-a",
      paidOn: "2025-10-02",
      amountCents: 630_000,
    });
    expect(cheque.dedupeKey).toBe("cheque:4410");
    const cash = paymentDedupeKey({
      method: "CASH",
      tenancyId: "tenancy-a",
      paidOn: "2025-11-01",
      amountCents: 10_000,
    });
    expect(cash.dedupeKey).toBe("fallback:tenancy-a:2025-11-01:10000");
  });
});
