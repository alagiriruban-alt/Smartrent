import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  addDays,
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

  it("adds calendar days", () => {
    expect(addDays("2026-10-14", 14)).toBe("2026-10-28");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("clamps month math on leap day and counts 90 days across February", () => {
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addCalendarMonths("2027-01-22", -12)).toBe("2026-01-22");
    expect(addDays("2024-05-01", -90)).toBe("2024-02-01");
    expect(addDays("2025-05-01", -90)).toBe("2025-01-31");
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
