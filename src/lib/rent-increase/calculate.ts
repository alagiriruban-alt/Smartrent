import { addDays, daysBetween, formatLongDate } from "@/lib/dates";
import { formatCadPlain } from "@/lib/money";

import {
  DRAFT_DISCLAIMER,
  increaseSchedule,
  noticeFormFor,
  rulesForProvince,
  type ProvinceRentRules,
  type RentNoticeForm,
} from "@/lib/rent-increase/rules";

export type GuidelineRow = {
  year: number;
  basisPoints: number;
  sourceUrl: string;
  verified: boolean;
};

export type DraftWarningCode =
  | "above_guideline"
  | "under_twelve_months"
  | "under_ninety_days";

export type DraftWarning = {
  code: DraftWarningCode;
  message: string;
};

export type ReadyDraft = {
  status: "ready";
  form: RentNoticeForm;
  exempt: boolean;
  currentRentCents: number;
  newRentCents: number;
  increaseCents: number;
  increaseBasisPoints: number;
  effectiveOn: string;
  eligibleOn: string;
  serveBy: string;
  noticeByForEffective: string;
  anchor: "move_in" | "last_increase";
  anchorOn: string;
  guidelineYear: number | null;
  guidelineBasisPoints: number | null;
  guidelineSourceUrl: string | null;
  warnings: DraftWarning[];
};

export type DraftResult =
  | ReadyDraft
  | { status: "blocked"; message: string }
  | { status: "invalid"; message: string };

export function formatBasisPoints(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : "";
  const abs = Math.abs(basisPoints);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) {
    return `${sign}${whole}%`;
  }
  if (frac % 10 === 0) {
    return `${sign}${whole}.${frac / 10}%`;
  }
  return `${sign}${whole}.${String(frac).padStart(2, "0")}%`;
}

export function percentToBasisPoints(percent: string): number | null {
  const cleaned = percent.trim().replace(/%$/, "").trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (basisPoints > 2000) {
    return null;
  }
  return basisPoints;
}

/** New rent after a guideline percent, rounded half up to the cent. */
export function rentAfterGuideline(currentCents: number, basisPoints: number): number {
  const numerator = currentCents * (10_000 + basisPoints);
  return Math.floor((numerator + 5_000) / 10_000);
}

export function increaseBasisPoints(currentCents: number, newCents: number): number {
  if (currentCents <= 0) {
    return 0;
  }
  return Math.round(((newCents - currentCents) * 10_000) / currentCents);
}

function guidelineIsUsable(row: GuidelineRow | null, year: number): row is GuidelineRow {
  return Boolean(
    row &&
      row.year === year &&
      row.verified &&
      row.sourceUrl.trim().length > 0 &&
      row.basisPoints >= 0,
  );
}

export function buildRentIncreaseDraft(input: {
  province: string;
  guidelineExempt: boolean;
  moveInOn: string;
  lastIncreaseOn: string | null;
  currentRentCents: number;
  effectiveOn: string;
  newRentCents: number;
  preparedOn: string;
  guideline: GuidelineRow | null;
}): DraftResult {
  const rules = rulesForProvince(input.province);
  if (!rules) {
    return {
      status: "blocked",
      message:
        "Rent increase rules for this province are not available yet. Ontario is the only province set up.",
    };
  }
  if (input.currentRentCents <= 0) {
    return {
      status: "invalid",
      message: "Enter a current monthly rent before drafting a notice.",
    };
  }
  if (input.newRentCents <= input.currentRentCents) {
    return {
      status: "invalid",
      message: "Enter a new rent that is higher than the current rent.",
    };
  }

  const schedule = increaseSchedule(rules, input.moveInOn, input.lastIncreaseOn);
  const form = noticeFormFor(rules, input.guidelineExempt);
  const year = Number(input.effectiveOn.slice(0, 4));
  let guidelineYear: number | null = null;
  let guidelineBasisPoints: number | null = null;
  let guidelineSourceUrl: string | null = null;

  if (!input.guidelineExempt) {
    if (!guidelineIsUsable(input.guideline, year)) {
      const named = input.guideline
        ? `The ${year} Ontario rent increase guideline is not verified.`
        : `There is no Ontario rent increase guideline on file for ${year}.`;
      return {
        status: "blocked",
        message: `${named} Notice drafts for units covered by the guideline stay blocked until that year is verified and has a source link.`,
      };
    }
    guidelineYear = input.guideline.year;
    guidelineBasisPoints = input.guideline.basisPoints;
    guidelineSourceUrl = input.guideline.sourceUrl.trim();
  }

  const warnings = collectWarnings({
    rules,
    schedule,
    preparedOn: input.preparedOn,
    effectiveOn: input.effectiveOn,
    currentRentCents: input.currentRentCents,
    newRentCents: input.newRentCents,
    exempt: input.guidelineExempt,
    guidelineBasisPoints,
    guidelineYear,
  });

  return {
    status: "ready",
    form,
    exempt: input.guidelineExempt,
    currentRentCents: input.currentRentCents,
    newRentCents: input.newRentCents,
    increaseCents: input.newRentCents - input.currentRentCents,
    increaseBasisPoints: increaseBasisPoints(input.currentRentCents, input.newRentCents),
    effectiveOn: input.effectiveOn,
    eligibleOn: schedule.eligibleOn,
    serveBy: schedule.serveBy,
    noticeByForEffective: addDays(input.effectiveOn, -rules.noticePeriodDays),
    anchor: schedule.anchor,
    anchorOn: schedule.anchorOn,
    guidelineYear,
    guidelineBasisPoints,
    guidelineSourceUrl,
    warnings,
  };
}

function collectWarnings(input: {
  rules: ProvinceRentRules;
  schedule: ReturnType<typeof increaseSchedule>;
  preparedOn: string;
  effectiveOn: string;
  currentRentCents: number;
  newRentCents: number;
  exempt: boolean;
  guidelineBasisPoints: number | null;
  guidelineYear: number | null;
}): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  if (
    !input.exempt &&
    input.guidelineBasisPoints !== null &&
    input.guidelineYear !== null &&
    input.newRentCents >
      rentAfterGuideline(input.currentRentCents, input.guidelineBasisPoints)
  ) {
    warnings.push({
      code: "above_guideline",
      message: `This increase is above the Ontario guideline for ${input.guidelineYear} (${formatBasisPoints(input.guidelineBasisPoints)}). A higher increase needs Landlord and Tenant Board approval.`,
    });
  }
  if (input.effectiveOn < input.schedule.eligibleOn) {
    const anchor =
      input.schedule.anchor === "last_increase" ? "the last rent increase" : "move-in";
    warnings.push({
      code: "under_twelve_months",
      message: `This effective date is less than 12 months after ${anchor} on ${formatLongDate(input.schedule.anchorOn)}.`,
    });
  }
  if (daysBetween(input.preparedOn, input.effectiveOn) < input.rules.noticePeriodDays) {
    warnings.push({
      code: "under_ninety_days",
      message:
        "Fewer than 90 days pass between the day this draft is prepared and the effective date. Ontario requires at least 90 days' written notice.",
    });
  }
  return warnings;
}

export function warningKey(warnings: { code: string }[]): string {
  return warnings
    .map((warning) => warning.code)
    .sort()
    .join(",");
}

export type NoticeDocument = {
  formCode: "N1" | "N2";
  formName: string;
  officialUrl: string;
  landlordName: string;
  tenantName: string;
  unitLabel: string;
  address: string;
  moveInOn: string;
  lastIncreaseOn: string | null;
  lastIncreaseCents: number | null;
  exemptionEvidence: string | null;
  currentRentCents: number;
  newRentCents: number;
  increaseCents: number;
  increaseBasisPoints: number;
  effectiveOn: string;
  eligibleOn: string;
  serveBy: string;
  guidelineYear: number | null;
  guidelineBasisPoints: number | null;
  guidelineSourceUrl: string | null;
  preparedOn: string;
  warnings: DraftWarning[];
};

export function noticeDocumentLines(document: NoticeDocument): string[] {
  const lines = [
    "DRAFT",
    "",
    "Rent increase notice draft",
    `${document.formCode} data - ${document.formName}`,
    "This draft is not an official form.",
    "",
    "Landlord",
    document.landlordName,
    "",
    "Tenant",
    document.tenantName,
    "",
    "Rental unit",
    document.unitLabel,
    document.address,
    "",
    "Move-in date",
    formatLongDate(document.moveInOn),
    "Last rent increase",
    document.lastIncreaseOn
      ? `${formatCadPlain(document.lastIncreaseCents ?? 0)} on ${formatLongDate(document.lastIncreaseOn)}`
      : "None on file",
    "",
    "Current rent",
    formatCadPlain(document.currentRentCents),
    "New rent",
    formatCadPlain(document.newRentCents),
    "Increase",
    `${formatCadPlain(document.increaseCents)} (${formatBasisPoints(document.increaseBasisPoints)})`,
    "Effective date",
    formatLongDate(document.effectiveOn),
    "",
    "Earliest eligible date",
    formatLongDate(document.eligibleOn),
    "Last day to serve 90 days' notice for that date",
    formatLongDate(document.serveBy),
    "",
  ];

  if (document.formCode === "N2") {
    lines.push(
      "Guideline",
      "Does not apply. The unit was first occupied residentially after November 15, 2018.",
    );
    if (document.exemptionEvidence) {
      lines.push("Evidence note", document.exemptionEvidence);
    }
  } else {
    lines.push(
      "Ontario guideline",
      document.guidelineYear !== null && document.guidelineBasisPoints !== null
        ? `${document.guidelineYear}: ${formatBasisPoints(document.guidelineBasisPoints)}`
        : "Not on file",
    );
    if (document.guidelineSourceUrl) {
      lines.push("Guideline source", document.guidelineSourceUrl);
    }
  }

  lines.push("", "Prepared", formatLongDate(document.preparedOn));
  if (document.warnings.length > 0) {
    lines.push("", "Warnings");
    for (const warning of document.warnings) {
      lines.push(warning.message);
    }
  }
  lines.push(
    "",
    DRAFT_DISCLAIMER,
    `Official form (${document.formCode}): ${document.officialUrl}`,
  );
  return lines;
}
