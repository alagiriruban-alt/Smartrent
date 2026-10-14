import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";
import { buildPlainPdf } from "@/lib/plain-pdf";
import {
  buildRentIncreaseDraft,
  formatBasisPoints,
  noticeDocumentLines,
  percentToBasisPoints,
  rentAfterGuideline,
  type GuidelineRow,
} from "@/lib/rent-increase/calculate";
import {
  ONTARIO_GUIDELINE_SOURCE_URL,
  ONTARIO_OFFICIAL_GUIDELINES,
} from "@/lib/rent-increase/official";
import { parseGuidelineForm } from "@/lib/rent-increase/parse";
import {
  defaultEffectiveDate,
  increaseAlerts,
  increaseSchedule,
  ontarioRentRules,
} from "@/lib/rent-increase/rules";

const verified2027: GuidelineRow = {
  year: 2027,
  basisPoints: 190,
  sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
  verified: true,
};

const covered = {
  province: "ON",
  guidelineExempt: false,
  moveInOn: "2024-02-29",
  lastIncreaseOn: null as string | null,
  currentRentCents: 100_000,
  preparedOn: "2026-01-01",
  guideline: verified2027,
};

describe("Ontario rent increase dates", () => {
  it("uses a 12-month anniversary and clamps leap day", () => {
    const fromMoveIn = increaseSchedule(ontarioRentRules, "2024-02-29", null);
    expect(fromMoveIn.anchor).toBe("move_in");
    expect(fromMoveIn.eligibleOn).toBe("2025-02-28");
    expect(fromMoveIn.serveBy).toBe("2024-11-30");

    const fromIncrease = increaseSchedule(
      ontarioRentRules,
      "2024-02-29",
      "2025-02-28",
    );
    expect(fromIncrease.anchor).toBe("last_increase");
    expect(fromIncrease.eligibleOn).toBe("2026-02-28");
    expect(fromIncrease.serveBy).toBe(addDays("2026-02-28", -90));
  });

  it("opens an alert 120 days out and a serve-by reminder 14 days out", () => {
    const schedule = increaseSchedule(ontarioRentRules, "2026-02-01", null);
    expect(schedule.eligibleOn).toBe("2027-02-01");
    expect(schedule.serveBy).toBe("2026-11-03");

    expect(
      increaseAlerts(ontarioRentRules, schedule, addDays(schedule.eligibleOn, -121)),
    ).toEqual([]);
    expect(
      increaseAlerts(ontarioRentRules, schedule, addDays(schedule.eligibleOn, -120)),
    ).toEqual(["eligible_soon"]);
    expect(
      increaseAlerts(ontarioRentRules, schedule, addDays(schedule.serveBy, -15)),
    ).toEqual(["eligible_soon"]);
    expect(
      increaseAlerts(ontarioRentRules, schedule, addDays(schedule.serveBy, -14)),
    ).toEqual(["eligible_soon", "serve_by_reminder"]);
    expect(increaseAlerts(ontarioRentRules, schedule, schedule.serveBy)).toEqual([
      "eligible_soon",
      "serve_by_reminder",
    ]);
  });

  it("picks an effective date that satisfies both waits", () => {
    expect(defaultEffectiveDate(ontarioRentRules, "2027-02-01", "2026-10-14")).toBe(
      "2027-02-01",
    );
    expect(defaultEffectiveDate(ontarioRentRules, "2026-10-20", "2026-10-14")).toBe(
      "2027-01-12",
    );
  });
});

describe("guideline math and official values", () => {
  it("matches the Ontario sample calculations", () => {
    expect(rentAfterGuideline(100_000, 190)).toBe(101_900);
    expect(rentAfterGuideline(100_000, 210)).toBe(102_100);
    expect(rentAfterGuideline(185_000, 210)).toBe(188_885);
    expect(formatBasisPoints(190)).toBe("1.9%");
    expect(formatBasisPoints(210)).toBe("2.1%");
    expect(formatBasisPoints(0)).toBe("0%");
    expect(percentToBasisPoints("2.1")).toBe(210);
  });

  it("keeps the verified ontario.ca table for 2018 through 2027", () => {
    const byYear = new Map(
      ONTARIO_OFFICIAL_GUIDELINES.map((row) => [row.year, row.basisPoints]),
    );
    expect(byYear.get(2025)).toBe(250);
    expect(byYear.get(2026)).toBe(210);
    expect(byYear.get(2027)).toBe(190);
    expect(byYear.get(2021)).toBe(0);
    expect(ONTARIO_OFFICIAL_GUIDELINES.map((row) => row.year)).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027,
    ]);
    expect(ONTARIO_GUIDELINE_SOURCE_URL).toBe(
      "https://www.ontario.ca/page/residential-rent-increases",
    );
  });
});

describe("N1 and N2 drafts", () => {
  it("builds N1 data at the guideline and blocks an unverified year", () => {
    const ready = buildRentIncreaseDraft({
      ...covered,
      effectiveOn: "2027-02-28",
      newRentCents: rentAfterGuideline(100_000, 190),
      moveInOn: "2026-02-28",
      preparedOn: "2026-11-01",
    });
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") {
      return;
    }
    expect(ready.form.code).toBe("N1");
    expect(ready.warnings).toEqual([]);
    expect(ready.newRentCents).toBe(101_900);

    const unverified = buildRentIncreaseDraft({
      ...covered,
      effectiveOn: "2027-06-01",
      newRentCents: 101_900,
      moveInOn: "2026-01-01",
      preparedOn: "2027-01-01",
      guideline: { ...verified2027, verified: false },
    });
    expect(unverified.status).toBe("blocked");
    if (unverified.status === "blocked") {
      expect(unverified.message).toMatch(/not verified/);
    }

    const missing = buildRentIncreaseDraft({
      ...covered,
      effectiveOn: "2030-06-01",
      newRentCents: 110_000,
      moveInOn: "2029-01-01",
      preparedOn: "2030-01-01",
      guideline: null,
    });
    expect(missing.status).toBe("blocked");
  });

  it("uses N2 data for an exempt unit and does not apply the guideline cap", () => {
    const draft = buildRentIncreaseDraft({
      ...covered,
      guidelineExempt: true,
      guideline: null,
      moveInOn: "2026-01-01",
      effectiveOn: "2027-06-01",
      newRentCents: 250_000,
      preparedOn: "2027-01-01",
    });
    expect(draft.status).toBe("ready");
    if (draft.status !== "ready") {
      return;
    }
    expect(draft.form.code).toBe("N2");
    expect(draft.guidelineYear).toBeNull();
    expect(draft.warnings.map((warning) => warning.code)).not.toContain("above_guideline");
  });

  it("warns when the increase is too high, too soon, or short on notice", () => {
    const over = buildRentIncreaseDraft({
      ...covered,
      moveInOn: "2026-01-01",
      effectiveOn: "2027-06-01",
      preparedOn: "2027-01-01",
      currentRentCents: 185_000,
      newRentCents: 188_886,
      guideline: { ...verified2027, basisPoints: 210, year: 2027 },
    });
    expect(over.status).toBe("ready");
    if (over.status === "ready") {
      expect(over.warnings.map((warning) => warning.code)).toEqual(["above_guideline"]);
    }

    const atCap = buildRentIncreaseDraft({
      ...covered,
      moveInOn: "2026-01-01",
      effectiveOn: "2027-06-01",
      preparedOn: "2027-01-01",
      currentRentCents: 185_000,
      newRentCents: 188_885,
      guideline: { ...verified2027, basisPoints: 210, year: 2027 },
    });
    expect(atCap.status).toBe("ready");
    if (atCap.status === "ready") {
      expect(atCap.warnings).toEqual([]);
    }

    const early = buildRentIncreaseDraft({
      ...covered,
      moveInOn: "2026-06-01",
      effectiveOn: "2027-05-01",
      preparedOn: "2027-01-01",
      newRentCents: 101_900,
    });
    expect(early.status).toBe("ready");
    if (early.status === "ready") {
      expect(early.warnings.map((warning) => warning.code)).toContain(
        "under_twelve_months",
      );
    }

    const shortNotice = buildRentIncreaseDraft({
      ...covered,
      moveInOn: "2025-01-01",
      preparedOn: "2026-01-01",
      effectiveOn: addDays("2026-01-01", 89),
      newRentCents: 101_900,
      guideline: { ...verified2027, year: 2026, basisPoints: 210 },
    });
    expect(shortNotice.status).toBe("ready");
    if (shortNotice.status === "ready") {
      expect(shortNotice.warnings.map((warning) => warning.code)).toContain(
        "under_ninety_days",
      );
    }

    const exactNotice = buildRentIncreaseDraft({
      ...covered,
      moveInOn: "2025-01-01",
      preparedOn: "2026-01-01",
      effectiveOn: "2026-04-01",
      newRentCents: rentAfterGuideline(100_000, 210),
      guideline: { ...verified2027, year: 2026, basisPoints: 210 },
    });
    expect(exactNotice.status).toBe("ready");
    if (exactNotice.status === "ready") {
      expect(exactNotice.warnings).toEqual([]);
    }
  });

  it("refuses a province that has no rules", () => {
    const draft = buildRentIncreaseDraft({
      ...covered,
      province: "BC",
      effectiveOn: "2027-06-01",
      newRentCents: 110_000,
      moveInOn: "2026-01-01",
    });
    expect(draft.status).toBe("blocked");
  });

  it("prints the draft as field data, marked DRAFT, with the disclaimer", () => {
    const lines = noticeDocumentLines({
      formCode: "N1",
      formName: "Notice of Rent Increase",
      officialUrl: "https://tribunalsontario.ca/ltb/forms/",
      landlordName: "Avery Chen",
      tenantName: "Jordan Patel",
      unitLabel: "Upper",
      address: "18 King Street West, Hamilton ON L8P 1A1",
      moveInOn: "2026-01-01",
      lastIncreaseOn: "2026-01-22",
      lastIncreaseCents: 4500,
      exemptionEvidence: null,
      currentRentCents: 185_000,
      newRentCents: 188_885,
      increaseCents: 3885,
      increaseBasisPoints: 210,
      effectiveOn: "2027-01-22",
      eligibleOn: "2027-01-22",
      serveBy: "2026-10-24",
      guidelineYear: 2027,
      guidelineBasisPoints: 190,
      guidelineSourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
      preparedOn: "2026-10-14",
      warnings: [],
    });
    expect(lines[0]).toBe("DRAFT");
    expect(lines.join("\n")).toContain("Jordan Patel");
    expect(lines.join("\n")).toContain("Upper");
    expect(lines.join("\n")).toContain("not legal advice");
    expect(lines.join("\n")).toContain("https://tribunalsontario.ca/ltb/forms/");
    const pdf = new TextDecoder().decode(buildPlainPdf(lines));
    expect(pdf).toContain("DRAFT");
    expect(pdf).toContain("Jordan Patel");
    expect(pdf).toContain("not legal advice");
  });
});

describe("guideline form", () => {
  it("requires a source link before a year can be verified", () => {
    const parsed = parseGuidelineForm({
      year: "2027",
      percent: "1.9",
      sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
      verified: "on",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.basisPoints).toBe(190);
      expect(parsed.data.verified).toBe(true);
    }
    const missing = parseGuidelineForm({
      year: "2028",
      percent: "2",
      sourceUrl: "not a url",
      verified: "on",
    });
    expect(missing.ok).toBe(false);
  });
});
