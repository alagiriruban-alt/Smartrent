import type { ParsedInterac, TenantMatch } from "@/lib/interac";
import { isIsoDate } from "@/lib/dates";

export const HIGH_CONFIDENCE_SCORE = 90;

export type IngestConfidence = "high" | "low";

/**
 * High confidence means the email has an amount, a date that is not in
 * the future, a reference, and one tenant whose full name matches.
 * Anything less stays pending until the agent confirms.
 */
export function classifyIngest(input: {
  parsed: ParsedInterac;
  ranked: TenantMatch[];
  today: string;
}): {
  confidence: IngestConfidence;
  reason: string | null;
  proposedTenancyId: string | null;
} {
  const proposed =
    input.ranked.length > 0 &&
    (input.ranked.length === 1 || input.ranked[0].score > input.ranked[1].score)
      ? input.ranked[0]
      : null;

  if (input.parsed.amountCents === null || input.parsed.amountCents <= 0) {
    return {
      confidence: "low",
      reason: "The email did not include an amount.",
      proposedTenancyId: proposed?.tenancyId ?? null,
    };
  }
  if (!input.parsed.paidOn || !isIsoDate(input.parsed.paidOn)) {
    return {
      confidence: "low",
      reason: "The email did not include a payment date.",
      proposedTenancyId: proposed?.tenancyId ?? null,
    };
  }
  if (input.parsed.paidOn > input.today) {
    return {
      confidence: "low",
      reason: "The payment date is in the future.",
      proposedTenancyId: proposed?.tenancyId ?? null,
    };
  }
  if (!input.parsed.referenceNumber) {
    return {
      confidence: "low",
      reason: "The email did not include a reference number.",
      proposedTenancyId: proposed?.tenancyId ?? null,
    };
  }
  if (!proposed || proposed.score < HIGH_CONFIDENCE_SCORE) {
    return {
      confidence: "low",
      reason: proposed
        ? "The sender name is not a strong match. Confirm the tenant before recording."
        : "No single tenant matched the sender. Choose the lease before recording.",
      proposedTenancyId: proposed?.tenancyId ?? null,
    };
  }
  return {
    confidence: "high",
    reason: null,
    proposedTenancyId: proposed.tenancyId,
  };
}
