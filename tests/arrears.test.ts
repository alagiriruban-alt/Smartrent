import { describe, expect, it } from "vitest";

import { buildN4Arrears } from "@/lib/arrears";

describe("buildN4Arrears", () => {
  it("lists only unpaid rent after the due date", () => {
    const statement = buildN4Arrears({
      tenancyId: "tenancy-1",
      asOf: "2026-10-14",
      charges: [
        {
          periodStart: "2026-09-01",
          dueOn: "2026-09-01",
          amountCents: 145_000,
          paidCents: 50_000,
        },
        {
          periodStart: "2026-10-01",
          dueOn: "2026-10-01",
          amountCents: 145_000,
          paidCents: 0,
        },
        {
          periodStart: "2026-11-01",
          dueOn: "2026-11-01",
          amountCents: 145_000,
          paidCents: 0,
        },
      ],
    });

    expect(statement.totalOwingCents).toBe(240_000);
    expect(statement.periods.map((period) => period.periodStart)).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(statement.periods[0]).toMatchObject({
      owingCents: 95_000,
      paidCents: 50_000,
      daysLate: 43,
    });
    expect(statement.periods[1].daysLate).toBe(13);
  });

  it("is empty when the only open charge is not yet due", () => {
    const statement = buildN4Arrears({
      tenancyId: "tenancy-1",
      asOf: "2026-10-01",
      charges: [
        {
          periodStart: "2026-10-01",
          dueOn: "2026-10-01",
          amountCents: 185_000,
          paidCents: 0,
        },
      ],
    });
    expect(statement.totalOwingCents).toBe(0);
    expect(statement.periods).toEqual([]);
  });
});
