/**
 * Ontario rent increase guideline percentages from
 * https://www.ontario.ca/page/residential-rent-increases
 * (page updated June 23, 2026). That page states the 2027 guideline
 * is 1.9% and lists each earlier year in the table below.
 * basisPoints: 190 means 1.90%.
 */
export const ONTARIO_GUIDELINE_SOURCE_URL =
  "https://www.ontario.ca/page/residential-rent-increases";

export const ONTARIO_OFFICIAL_GUIDELINES = [
  { year: 2018, basisPoints: 180 },
  { year: 2019, basisPoints: 180 },
  { year: 2020, basisPoints: 220 },
  { year: 2021, basisPoints: 0 },
  { year: 2022, basisPoints: 120 },
  { year: 2023, basisPoints: 250 },
  { year: 2024, basisPoints: 250 },
  { year: 2025, basisPoints: 250 },
  { year: 2026, basisPoints: 210 },
  { year: 2027, basisPoints: 190 },
] as const;
