import { describe, expect, it } from "vitest";

import { buildN4Arrears, splitArrears } from "@/lib/arrears";
import { applyRentReductions } from "@/lib/ledger";

describe("arrears split", () => {
  const rent = [
    {
      id: "rent-2026-09",
      periodStart: "2026-09-01",
      dueOn: "2026-09-01",
      amountCents: 145_000,
      paidCents: 0,
    },
  ];
  const other = [
    {
      periodStart: "2026-09-01",
      dueOn: "2026-09-01",
      amountCents: 6_793,
      paidCents: 0,
    },
    {
      periodStart: "2026-09-15",
      dueOn: "2026-09-15",
      amountCents: 18_600,
      paidCents: 0,
    },
  ];

  it("keeps water and filing fees off the N4", () => {
    const split = splitArrears({
      tenancyId: "tenancy-1",
      asOf: "2026-10-14",
      rent,
      other,
    });
    expect(split.rentOwingCents).toBe(145_000);
    expect(split.otherOwingCents).toBe(25_393);
    expect(split.totalOwingCents).toBe(170_393);
    expect(buildN4Arrears({
      tenancyId: "tenancy-1",
      asOf: "2026-10-14",
      charges: rent,
    }).totalOwingCents).toBe(split.rent.totalOwingCents);
    expect(split.rent.periods).toHaveLength(1);
    expect(split.other.periods).toHaveLength(2);
  });

  it("applies a rent credit to rent only", () => {
    const reduced = applyRentReductions(rent, [
      { period: "2026-09", amountCents: 10_000 },
    ]);
    const split = splitArrears({
      tenancyId: "tenancy-1",
      asOf: "2026-10-14",
      rent: reduced,
      other,
    });
    expect(split.rentOwingCents).toBe(135_000);
    expect(split.otherOwingCents).toBe(25_393);
  });
});
