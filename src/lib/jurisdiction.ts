export type JurisdictionCode = "ON" | "QC";

export function isJurisdiction(value: string): value is JurisdictionCode {
  return value === "ON" || value === "QC";
}

export function jurisdictionForProvince(province: string): JurisdictionCode {
  return province === "QC" ? "QC" : "ON";
}

/** Ontario N1, N2, and N4 notices, and the guideline, apply only in Ontario. */
export function ontarioNoticesEnabled(input: {
  jurisdiction: string;
  province: string;
}): boolean {
  return input.jurisdiction === "ON" && input.province === "ON";
}

export const QUEBEC_RECORD_ONLY =
  "This property is in Quebec. The ledger is kept here, and Ontario N1, N2, and N4 notices are turned off.";
