// Canada Post does not use the letters D, F, I, O, Q, or U.
const POSTAL_CODE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

export function normalizePostalCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!POSTAL_CODE.test(compact)) {
    return null;
  }
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}
