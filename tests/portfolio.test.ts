import { describe, expect, it } from "vitest";

import {
  isTenancyCurrent,
  summarizeUnits,
  tenancyPhase,
} from "@/lib/portfolio";

const today = "2026-10-14";

describe("isTenancyCurrent", () => {
  it("counts a lease that covers today", () => {
    expect(
      isTenancyCurrent(
        {
          leaseStart: "2026-01-01",
          leaseEnd: "2026-12-31",
          monthlyRentCents: 185000,
          status: "ACTIVE",
        },
        today,
      ),
    ).toBe(true);
  });

  it("ignores a future lease, a finished lease, and an ended status", () => {
    expect(
      isTenancyCurrent(
        {
          leaseStart: "2026-11-01",
          leaseEnd: null,
          monthlyRentCents: 100,
          status: "ACTIVE",
        },
        today,
      ),
    ).toBe(false);
    expect(
      isTenancyCurrent(
        {
          leaseStart: "2025-01-01",
          leaseEnd: "2026-10-13",
          monthlyRentCents: 100,
          status: "ACTIVE",
        },
        today,
      ),
    ).toBe(false);
    expect(
      isTenancyCurrent(
        {
          leaseStart: "2026-01-01",
          leaseEnd: null,
          monthlyRentCents: 100,
          status: "ENDED",
        },
        today,
      ),
    ).toBe(false);
  });

  it("labels a lease that has not started as upcoming", () => {
    expect(
      tenancyPhase(
        {
          leaseStart: "2026-11-01",
          leaseEnd: null,
          monthlyRentCents: 100,
          status: "ACTIVE",
        },
        today,
      ),
    ).toBe("upcoming");
  });
});

describe("summarizeUnits", () => {
  it("sums occupied units and their current rent only", () => {
    const summary = summarizeUnits(
      [
        {
          tenancies: [
            {
              leaseStart: "2026-01-01",
              leaseEnd: "2026-12-31",
              monthlyRentCents: 185000,
              status: "ACTIVE",
            },
          ],
        },
        {
          tenancies: [
            {
              leaseStart: "2026-12-01",
              leaseEnd: null,
              monthlyRentCents: 140000,
              status: "ACTIVE",
            },
          ],
        },
      ],
      today,
    );

    expect(summary).toEqual({
      unitCount: 2,
      occupiedCount: 1,
      monthlyRentCents: 185000,
    });
  });
});
