import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { allocationBalance } from "@/lib/allocations";
import { parseBundleText, reconcileBundle, sourceHashFor } from "@/lib/import/parse-bundle";
import { parseMoneyToCents } from "@/lib/money";
import { parsePeriodText } from "@/lib/periods";

const fixturePath = path.join(process.cwd(), "fixtures/import/harbour-court.bundle.json");
const csvPath = path.join(process.cwd(), "fixtures/import/harbour-court.bundle.csv");

describe("period and money parsing", () => {
  it("reads currency text and plain numbers as cents", () => {
    expect(parseMoneyToCents("$2,150.00")).toBe(215_000);
    expect(parseMoneyToCents("2150")).toBe(215_000);
    expect(parseMoneyToCents(2150)).toBe(215_000);
    expect(parseMoneyToCents("2779.31")).toBe(277_931);
  });

  it("turns multi-month text, a partial period, and a deposit into explicit results", () => {
    const quarter = parsePeriodText("July + August + September 2025");
    expect(quarter.periods).toEqual(["2025-07", "2025-08", "2025-09"]);
    expect(quarter.confidence).toBeGreaterThanOrEqual(80);
    expect(quarter.flags).toContain("multi_period");

    const partial = parsePeriodText("January 2026 (Part 1)");
    expect(partial.periods).toEqual(["2026-01"]);
    expect(partial.portion).toBe("1");
    expect(partial.flags).toContain("partial_period");

    const deposit = parsePeriodText("Last Month's Rent Deposit");
    expect(deposit.kind).toBe("DEPOSIT");
    expect(deposit.periods).toEqual([]);
    expect(deposit.flags).not.toContain("ambiguous_period");

    const ambiguous = parsePeriodText("Summer rent");
    expect(ambiguous.kind).toBe("UNKNOWN");
    expect(ambiguous.flags).toContain("ambiguous_period");
    expect(ambiguous.confidence).toBeLessThan(80);
  });
});

describe("import reconciliation", () => {
  const raw = readFileSync(fixturePath, "utf8");

  it("reconciles per-period and annual totals with the fictional bundle", () => {
    const bundle = parseBundleText("harbour-court.bundle.json", raw);
    const report = reconcileBundle(bundle);
    expect(bundle.errors).toEqual([]);
    const water = bundle.ledger.find((row) => row.externalKey === "pay-water");
    expect(water?.lines.map((line) => line.amountCents)).toEqual([210_000, 67_931]);
    expect(allocationBalance(water?.amountCents ?? 0, water?.lines ?? []).balanced).toBe(true);
    const quarter = bundle.ledger.find((row) => row.externalKey === "pay-quarter");
    expect(quarter?.lines.map((line) => line.period)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
    ]);
    expect(quarter?.lines.every((line) => line.amountCents === 210_000)).toBe(true);
    expect(bundle.ledger.find((row) => row.externalKey === "pay-ambiguous")?.needsReview).toBe(
      true,
    );
    expect(bundle.ledger.find((row) => row.externalKey === "pay-part")?.needsReview).toBe(true);
    expect(bundle.ledger.find((row) => row.externalKey === "pay-deposit")?.kind).toBe("DEPOSIT");
    expect(report.matched).toBe(true);
    expect(report.periods.every((line) => line.differenceCents === 0)).toBe(true);
    expect(report.years.every((line) => line.differenceCents === 0)).toBe(true);
    expect(report.expenses.every((line) => line.differenceCents === 0)).toBe(true);
    expect(report.ambiguousCount).toBeGreaterThan(0);
    expect(report.rentCollectedCents).toBe(945_000);
  });

  it("is idempotent for the same bundle and a CSV twin of the quarter", () => {
    const first = parseBundleText("harbour-court.bundle.json", raw);
    const second = parseBundleText("copy.json", `${raw}\n`);
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.sourceHash).toBe(sourceHashFor(JSON.parse(raw)));
    const csv = parseBundleText("harbour-court.bundle.csv", readFileSync(csvPath, "utf8"));
    const csvReport = reconcileBundle(csv);
    expect(csv.ledger[0]?.lines.map((line) => line.amountCents)).toEqual([
      210_000, 210_000, 210_000,
    ]);
    expect(csvReport.matched).toBe(true);
    expect(csvReport.years.find((line) => line.key === "2025")?.parsedCents).toBe(630_000);
  });
});
