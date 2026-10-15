const MONTH_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const DEPOSIT_PATTERN =
  /last month'?s rent deposit|\blmr deposit\b|^lmr$|last month deposit/i;

export function isRentalPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function periodFromDate(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const period = isoDate.slice(0, 7);
  return isRentalPeriod(period) ? period : null;
}

export type PeriodParse = {
  kind: "RENT" | "DEPOSIT" | "UNKNOWN";
  periods: string[];
  portion: string | null;
  confidence: number;
  flags: string[];
  label: string;
};

function unknown(label: string, flags: string[], confidence = 30): PeriodParse {
  return {
    kind: "UNKNOWN",
    periods: [],
    portion: null,
    confidence,
    flags,
    label,
  };
}

function monthNumber(token: string): number | null {
  const cleaned = token
    .replace(/[().]/g, "")
    .trim()
    .toLowerCase();
  return MONTH_INDEX[cleaned] ?? null;
}

/**
 * Turn a ledger phrase into explicit YYYY-MM periods.
 * Free text is only accepted here, at import, and every result carries
 * a confidence score. Ambiguous phrases do not become periods.
 */
export function parsePeriodText(input: string): PeriodParse {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) {
    return unknown("", ["missing_period"], 0);
  }
  if (DEPOSIT_PATTERN.test(text)) {
    return {
      kind: "DEPOSIT",
      periods: [],
      portion: null,
      confidence: 96,
      flags: [],
      label: "Last month's rent deposit",
    };
  }
  if (isRentalPeriod(text)) {
    return {
      kind: "RENT",
      periods: [text],
      portion: null,
      confidence: 100,
      flags: [],
      label: text,
    };
  }

  const partial = text.match(/^([A-Za-z]+)\s+(\d{4})\s*\(Part\s+(\d+)\)\s*$/i);
  if (partial) {
    const month = monthNumber(partial[1]);
    const year = Number(partial[2]);
    if (!month || year < 1990 || year > 2200) {
      return unknown(text, ["ambiguous_period"]);
    }
    const period = `${partial[2]}-${String(month).padStart(2, "0")}`;
    return {
      kind: "RENT",
      periods: [period],
      portion: partial[3],
      confidence: 86,
      flags: ["partial_period"],
      label: `${period} part ${partial[3]}`,
    };
  }

  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;
  const withoutYear = text.replace(/\b(?:19|20)\d{2}\b/g, " ");
  const parts = withoutYear
    .split(/\s*(?:\+|,|&|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const months: number[] = [];
  let leftover = false;
  for (const part of parts) {
    const month = monthNumber(part);
    if (!month) {
      leftover = true;
    } else {
      months.push(month);
    }
  }

  if (!year || months.length === 0 || leftover) {
    return unknown(text, ["ambiguous_period"]);
  }

  const periods = months.map(
    (month) => `${year}-${String(month).padStart(2, "0")}`,
  );
  const unique = [...new Set(periods)];
  if (unique.length !== periods.length) {
    return unknown(text, ["ambiguous_period"], 40);
  }
  if (unique.length === 1) {
    return {
      kind: "RENT",
      periods: unique,
      portion: null,
      confidence: 95,
      flags: [],
      label: unique[0],
    };
  }
  return {
    kind: "RENT",
    periods: unique,
    portion: null,
    confidence: 90,
    flags: ["multi_period"],
    label: unique.join(", "),
  };
}

const REVIEW_FLAGS = new Set([
  "ambiguous_period",
  "missing_period",
  "partial_period",
  "unparsed_amount",
  "amount_mismatch",
  "unknown_tenant",
  "allocation_unbalanced",
]);

export function needsReview(confidence: number, flags: string[]): boolean {
  return confidence < 80 || flags.some((flag) => REVIEW_FLAGS.has(flag));
}
