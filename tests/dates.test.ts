import { describe, expect, it } from "vitest";

import {
  formatLongDate,
  isIsoDate,
  rangesOverlap,
  todayDateOnly,
  utcToDateOnly,
} from "@/lib/dates";

describe("calendar dates", () => {
  it("keeps a date-only value on that calendar day", () => {
    expect(utcToDateOnly(new Date("2026-10-14T00:00:00.000Z"))).toBe(
      "2026-10-14",
    );
  });

  it("uses the Ontario calendar day, not UTC", () => {
    expect(todayDateOnly(new Date("2026-10-15T02:30:00.000Z"))).toBe(
      "2026-10-14",
    );
  });

  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-01-01")).toBe(true);
    expect(isIsoDate("01-01-2026")).toBe(false);
  });

  it("formats a date for the rent roll", () => {
    expect(formatLongDate("2026-01-01")).toMatch(/2026/);
    expect(formatLongDate("2026-01-01")).toMatch(/Jan/);
  });
});

describe("rangesOverlap", () => {
  it("treats a shared day as an overlap", () => {
    expect(
      rangesOverlap(
        { start: "2026-01-01", end: "2026-12-31" },
        { start: "2026-12-31", end: "2027-01-01" },
      ),
    ).toBe(true);
  });

  it("allows a lease that starts the day after another ends", () => {
    expect(
      rangesOverlap(
        { start: "2026-01-01", end: "2026-06-30" },
        { start: "2026-07-01", end: "2026-12-31" },
      ),
    ).toBe(false);
  });

  it("treats a missing end date as ongoing", () => {
    expect(
      rangesOverlap(
        { start: "2026-01-01", end: null },
        { start: "2027-05-01", end: "2027-06-01" },
      ),
    ).toBe(true);
  });
});
