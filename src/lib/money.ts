const MAX_CENTS = 10_000_000;

/**
 * Persisted money is integer cents. Callers pass a decimal string or a
 * number of dollars. Floats that are not an exact cent are rejected.
 */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      return null;
    }
    const cents = Math.round(input * 100);
    if (Math.abs(input * 100 - cents) > 1e-6) {
      return null;
    }
    return parseCadToCents((cents / 100).toFixed(2));
  }
  return parseCadToCents(input);
}

export function parseCadToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    return null;
  }
  return cents;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

/** Currency text for email and PDF, without non-breaking spaces. */
export function formatCadPlain(cents: number): string {
  return formatCad(cents).replace(/[\u00a0\u202f]/g, " ");
}
