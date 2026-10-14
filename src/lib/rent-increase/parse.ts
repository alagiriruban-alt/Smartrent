import { isIsoDate } from "@/lib/dates";
import { parseCadToCents } from "@/lib/money";
import { percentToBasisPoints } from "@/lib/rent-increase/calculate";
import type { FieldErrors } from "@/lib/validators";

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export type IncreaseFormState = {
  message?: string;
  errors?: FieldErrors;
  warnings?: { code: string; message: string }[];
};

export function parseRentIncreaseForm(input: {
  effectiveOn: unknown;
  newRent: unknown;
}): Parsed<{ effectiveOn: string; newRentCents: number }> {
  const effectiveOn = typeof input.effectiveOn === "string" ? input.effectiveOn.trim() : "";
  const newRent = typeof input.newRent === "string" ? input.newRent.trim() : "";
  const errors: FieldErrors = {};
  if (!isIsoDate(effectiveOn)) {
    errors.effectiveOn = ["Enter the date the new rent would start."];
  }
  const newRentCents = parseCadToCents(newRent);
  if (newRentCents === null || newRentCents <= 0) {
    errors.newRent = ["Enter the new monthly rent, such as 1888.85."];
  }
  if (Object.keys(errors).length > 0 || newRentCents === null) {
    return { ok: false, errors };
  }
  return { ok: true, data: { effectiveOn, newRentCents } };
}

export function parseGuidelineForm(input: {
  year: unknown;
  percent: unknown;
  sourceUrl: unknown;
  verified: unknown;
}): Parsed<{
  year: number;
  basisPoints: number;
  sourceUrl: string;
  verified: boolean;
}> {
  const yearText = typeof input.year === "string" ? input.year.trim() : "";
  const percent = typeof input.percent === "string" ? input.percent : "";
  const sourceUrl = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
  const verified = input.verified === "on" || input.verified === "true" || input.verified === "yes";
  const errors: FieldErrors = {};

  if (!/^\d{4}$/.test(yearText)) {
    errors.year = ["Enter a four-digit year."];
  } else {
    const year = Number(yearText);
    if (year < 1990 || year > 2100) {
      errors.year = ["Enter a year from 1990 to 2100."];
    }
  }
  const basisPoints = percentToBasisPoints(percent);
  if (basisPoints === null) {
    errors.percent = ["Enter a percent from 0 to 20, such as 2.1."];
  }
  if (!/^https?:\/\/\S+$/.test(sourceUrl)) {
    errors.sourceUrl = ["Enter the source link, starting with https://."];
  }
  if (verified && !/^https?:\/\/\S+$/.test(sourceUrl)) {
    errors.verified = ["Add the source link before marking this year verified."];
  }
  if (Object.keys(errors).length > 0 || basisPoints === null || !/^\d{4}$/.test(yearText)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      year: Number(yearText),
      basisPoints,
      sourceUrl,
      verified,
    },
  };
}
