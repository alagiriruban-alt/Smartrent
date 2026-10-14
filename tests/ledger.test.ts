import { describe, expect, it } from "vitest";

import {
  arrearsSamplePlan,
  chargePeriods,
  chargeStatus,
  dueOnForPeriod,
  planCreditAllocations,
  standCharge,
  summarizeLedger,
  summarizeMonth,
} from "@/lib/ledger";

describe("charge periods", () => {
  it("clamps a 31st due date to the end of a short month", () => {
    expect(dueOnForPeriod("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueOnForPeriod("2024-02-01", 31)).toBe("2024-02-29");
    expect(dueOnForPeriod("2026-04-01", 31)).toBe("2026-04-30");
  });

  it("skips a month whose due date is outside the lease", () => {
    expect(
      chargePeriods({
        leaseStart: "2026-01-15",
        leaseEnd: "2026-03-10",
        rentDueDay: 1,
        today: "2026-06-01",
      }),
    ).toEqual(["2026-02-01", "2026-03-01"]);
    expect(
      chargePeriods({
        leaseStart: "2026-01-01",
        leaseEnd: "2026-03-10",
        rentDueDay: 15,
        today: "2026-06-01",
      }),
    ).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("stops at the current month while the lease is still running", () => {
    expect(
      chargePeriods({
        leaseStart: "2026-01-01",
        leaseEnd: "2026-12-31",
        rentDueDay: 1,
        today: "2026-03-20",
      }),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("charge status", () => {
  const dueOn = "2026-10-01";

  it("is due on the due date, then late the next day", () => {
    expect(chargeStatus(1000, 0, dueOn, "2026-10-01")).toBe("DUE");
    expect(chargeStatus(1000, 0, dueOn, "2026-10-02")).toBe("LATE");
  });

  it("keeps a partial payment partial, including after the due date", () => {
    expect(chargeStatus(1000, 400, dueOn, "2026-09-01")).toBe("PARTIAL");
    expect(chargeStatus(1000, 400, dueOn, "2026-10-14")).toBe("PARTIAL");
    expect(chargeStatus(1000, 1000, dueOn, "2026-10-14")).toBe("PAID");
  });

  it("counts days late only while money is still owing", () => {
    expect(standCharge(
      { id: "c", periodStart: "2026-10-01", dueOn, amountCents: 1000, paidCents: 0 },
      "2026-10-14",
    ).daysLate).toBe(13);
    expect(standCharge(
      { id: "c", periodStart: "2026-10-01", dueOn, amountCents: 1000, paidCents: 1000 },
      "2026-10-14",
    ).daysLate).toBe(0);
  });
});

describe("allocations and balances", () => {
  it("fills the oldest open month first", () => {
    const planned = planCreditAllocations(
      [
        {
          id: "p1",
          amountCents: 200_000,
          allocatedCents: 0,
          paidOn: "2026-10-14",
        },
      ],
      [
        { id: "sep", amountCents: 145_000, paidCents: 50_000, dueOn: "2026-09-01" },
        { id: "oct", amountCents: 145_000, paidCents: 0, dueOn: "2026-10-01" },
      ],
    );
    expect(planned).toEqual([
      { paymentId: "p1", chargeId: "sep", amountCents: 95_000 },
      { paymentId: "p1", chargeId: "oct", amountCents: 105_000 },
    ]);
  });

  it("does not allocate money that is already applied", () => {
    expect(
      planCreditAllocations(
        [
          {
            id: "p1",
            amountCents: 50_000,
            allocatedCents: 50_000,
            paidOn: "2026-09-01",
          },
        ],
        [{ id: "sep", amountCents: 145_000, paidCents: 50_000, dueOn: "2026-09-01" }],
      ),
    ).toEqual([]);
  });

  it("tracks the running balance separately from this month", () => {
    const summary = summarizeLedger(
      [
        {
          id: "sep",
          periodStart: "2026-09-01",
          dueOn: "2026-09-01",
          amountCents: 145_000,
          paidCents: 50_000,
        },
        {
          id: "oct",
          periodStart: "2026-10-01",
          dueOn: "2026-10-01",
          amountCents: 145_000,
          paidCents: 0,
        },
      ],
      [
        { amountCents: 50_000, allocatedCents: 50_000 },
      ],
      "2026-10-14",
    );
    expect(summary.balanceCents).toBe(240_000);
    expect(summary.creditCents).toBe(0);
    expect(summarizeMonth(summary.charges, "2026-10-01")).toEqual({
      expectedCents: 145_000,
      collectedCents: 0,
      outstandingCents: 145_000,
    });
  });
});

describe("arrears sample plan", () => {
  it("leaves the latest past-due month unpaid and the one before partial", () => {
    const charges = ["06", "07", "08", "09", "10"].map((month) => ({
      periodStart: `2026-${month}-01`,
      dueOn: `2026-${month}-01`,
      amountCents: 145_000,
    }));
    expect(arrearsSamplePlan(charges, "2026-10-14")).toEqual([
      { periodStart: "2026-06-01", payCents: 145_000 },
      { periodStart: "2026-07-01", payCents: 145_000 },
      { periodStart: "2026-08-01", payCents: 145_000 },
      { periodStart: "2026-09-01", payCents: 50_000 },
      { periodStart: "2026-10-01", payCents: 0 },
    ]);
  });
});
