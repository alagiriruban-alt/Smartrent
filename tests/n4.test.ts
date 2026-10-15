import { describe, expect, it } from "vitest";

import { buildN4Arrears } from "@/lib/arrears";
import { n4DocumentLines } from "@/lib/n4/document";
import { buildTextPdf } from "@/lib/n4/pdf";
import {
  deemedGivenOn,
  earliestTerminationDate,
  isLtbHoliday,
  terminationTooEarly,
} from "@/lib/n4/rules";
import { n4RentTable, rentalPeriodEnd } from "@/lib/n4/table";

describe("N4 termination dates", () => {
  it("uses 7 days for every frequency on or after September 21, 2026", () => {
    for (const rentFrequency of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const) {
      const plan = earliestTerminationDate({
        givenOn: "2026-10-15",
        serviceMethod: "IN_PERSON",
        rentFrequency,
      });
      expect(plan.deemedGivenOn).toBe("2026-10-15");
      expect(plan.noticeDays).toBe(7);
      expect(plan.terminationDate).toBe("2026-10-22");
    }
  });

  it("uses the pre-September 21, 2026 periods from the LTB brochure", () => {
    const monthly = earliestTerminationDate({
      givenOn: "2026-03-03",
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
    });
    expect(monthly.noticeDays).toBe(14);
    expect(monthly.terminationDate).toBe("2026-03-17");

    const yearly = earliestTerminationDate({
      givenOn: "2026-03-03",
      serviceMethod: "IN_PERSON",
      rentFrequency: "YEARLY",
    });
    expect(yearly.terminationDate).toBe("2026-03-17");

    const weekly = earliestTerminationDate({
      givenOn: "2026-03-03",
      serviceMethod: "IN_PERSON",
      rentFrequency: "WEEKLY",
    });
    expect(weekly.noticeDays).toBe(7);
    expect(weekly.terminationDate).toBe("2026-03-10");

    const daily = earliestTerminationDate({
      givenOn: "2026-03-03",
      serviceMethod: "FAX",
      rentFrequency: "DAILY",
    });
    expect(daily.terminationDate).toBe("2026-03-10");
  });

  it("matches the N4 instructions example under the current 7-day rule", () => {
    const handed = earliestTerminationDate({
      givenOn: "2027-03-03",
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
    });
    expect(handed.terminationDate).toBe("2027-03-10");

    const mailed = earliestTerminationDate({
      givenOn: "2027-03-03",
      serviceMethod: "MAIL",
      rentFrequency: "MONTHLY",
    });
    expect(mailed.deemedGivenOn).toBe("2027-03-08");
    expect(mailed.terminationDate).toBe("2027-03-15");

    const xpresspost = earliestTerminationDate({
      givenOn: "2027-03-03",
      serviceMethod: "XPRESSPOST",
      rentFrequency: "WEEKLY",
    });
    expect(xpresspost.terminationDate).toBe("2027-03-15");
  });

  it("adds five calendar days for mail given before the rule change", () => {
    const mailed = earliestTerminationDate({
      givenOn: "2026-03-03",
      serviceMethod: "MAIL",
      rentFrequency: "MONTHLY",
    });
    expect(mailed.deemedGivenOn).toBe("2026-03-08");
    expect(mailed.noticeDays).toBe(14);
    expect(mailed.terminationDate).toBe("2026-03-22");
  });

  it("treats mail that arrives on or after September 21, 2026 as the 7-day rule", () => {
    const mailed = earliestTerminationDate({
      givenOn: "2026-09-18",
      serviceMethod: "MAIL",
      rentFrequency: "MONTHLY",
    });
    expect(mailed.deemedGivenOn).toBe("2026-09-23");
    expect(mailed.noticeDays).toBe(7);
    expect(mailed.terminationDate).toBe("2026-09-30");
  });

  it("adds one business day for courier and skips weekends and holidays", () => {
    expect(isLtbHoliday("2026-10-17")).toBe(true);
    expect(isLtbHoliday("2026-10-18")).toBe(true);
    expect(isLtbHoliday("2026-10-16")).toBe(false);
    expect(isLtbHoliday("2026-10-12")).toBe(true);
    expect(isLtbHoliday("2026-04-03")).toBe(true);
    expect(isLtbHoliday("2026-02-16")).toBe(true);
    expect(isLtbHoliday("2026-05-18")).toBe(true);
    expect(isLtbHoliday("2026-12-25")).toBe(true);
    expect(isLtbHoliday("2026-12-28")).toBe(true);

    const thursday = earliestTerminationDate({
      givenOn: "2026-10-15",
      serviceMethod: "COURIER",
      rentFrequency: "MONTHLY",
    });
    expect(deemedGivenOn("2026-10-15", "COURIER")).toBe("2026-10-16");
    expect(thursday.terminationDate).toBe("2026-10-23");

    const friday = earliestTerminationDate({
      givenOn: "2026-10-16",
      serviceMethod: "COURIER",
      rentFrequency: "MONTHLY",
    });
    expect(friday.deemedGivenOn).toBe("2026-10-19");
    expect(friday.terminationDate).toBe("2026-10-26");

    const beforeThanksgiving = earliestTerminationDate({
      givenOn: "2026-10-09",
      serviceMethod: "COURIER",
      rentFrequency: "WEEKLY",
    });
    expect(beforeThanksgiving.deemedGivenOn).toBe("2026-10-13");
    expect(beforeThanksgiving.terminationDate).toBe("2026-10-20");
  });

  it("lets the termination date fall on a holiday and rejects an earlier date", () => {
    const plan = earliestTerminationDate({
      givenOn: "2026-10-17",
      serviceMethod: "UNDER_DOOR",
      rentFrequency: "MONTHLY",
    });
    expect(plan.terminationDate).toBe("2026-10-24");
    expect(isLtbHoliday(plan.terminationDate)).toBe(true);
    expect(terminationTooEarly("2026-10-23", plan.terminationDate)).toBe(true);
    expect(terminationTooEarly("2026-10-24", plan.terminationDate)).toBe(false);
    expect(terminationTooEarly("2026-11-01", plan.terminationDate)).toBe(false);
  });
});

describe("N4 arrears table", () => {
  it("lists each past-due period with from, to, charged, paid, and owing", () => {
    const statement = buildN4Arrears({
      tenancyId: "tenancy-1",
      asOf: "2025-10-14",
      charges: [
        {
          periodStart: "2025-08-01",
          dueOn: "2025-08-01",
          amountCents: 100_000,
          paidCents: 90_000,
        },
        {
          periodStart: "2025-09-01",
          dueOn: "2025-09-01",
          amountCents: 100_000,
          paidCents: 70_000,
        },
        {
          periodStart: "2025-10-01",
          dueOn: "2025-10-01",
          amountCents: 100_000,
          paidCents: 0,
        },
        {
          periodStart: "2025-11-01",
          dueOn: "2025-11-01",
          amountCents: 100_000,
          paidCents: 0,
        },
      ],
    });
    const table = n4RentTable(statement);
    expect(rentalPeriodEnd("2025-08-01")).toBe("2025-08-31");
    expect(table.rows).toEqual([
      {
        periodFrom: "2025-08-01",
        periodTo: "2025-08-31",
        rentChargedCents: 100_000,
        rentPaidCents: 90_000,
        rentOwingCents: 10_000,
      },
      {
        periodFrom: "2025-09-01",
        periodTo: "2025-09-30",
        rentChargedCents: 100_000,
        rentPaidCents: 70_000,
        rentOwingCents: 30_000,
      },
      {
        periodFrom: "2025-10-01",
        periodTo: "2025-10-31",
        rentChargedCents: 100_000,
        rentPaidCents: 0,
        rentOwingCents: 100_000,
      },
    ]);
    expect(table.totalOwingCents).toBe(140_000);
    expect(table.totalOwingCents).toBe(statement.totalOwingCents);
  });

  it("marks an unconfirmed data sheet as a draft and links the official form", () => {
    const lines = n4DocumentLines({
      confirmed: false,
      status: "DRAFT",
      landlordName: "Avery Chen",
      landlordContact: "landlord@example.com",
      tenantNames: "Sam Okonkwo",
      unitAddress: "Lower, 18 King Street West, Hamilton ON L8P 1A1",
      givenOn: "2026-10-15",
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
      terminationDate: "2026-10-22",
      earliestTerminationDate: "2026-10-22",
      deemedGivenOn: "2026-10-15",
      servedOn: null,
      servedMethod: null,
      rows: [
        {
          periodFrom: "2026-10-01",
          periodTo: "2026-10-31",
          rentChargedCents: 145_000,
          rentPaidCents: 0,
          rentOwingCents: 145_000,
        },
      ],
      totalOwingCents: 145_000,
    });
    expect(lines[0]).toBe("DRAFT");
    expect(lines.join("\n")).toContain("01/10/2026 | 31/10/2026");
    expect(lines.join("\n")).toContain("Sam Okonkwo");
    expect(lines.join("\n")).toContain("tribunalsontario.ca");
    expect(lines.join("\n")).not.toContain("This is the official");
    const pdf = buildTextPdf(lines);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("DRAFT");
  });
});
