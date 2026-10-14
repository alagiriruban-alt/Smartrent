import { describe, expect, it } from "vitest";

import { canonicalJson, samePayload } from "@/lib/agent/canonical";
import { etransferReferenceKey } from "@/lib/agent/reference";
import {
  consumeAgentRate,
  resetAgentRateLimits,
  setAgentRateLimitForTests,
} from "@/lib/agent/rate-limit";
import { classifyIngest } from "@/lib/services/ingest-decision";

describe("e-Transfer reference keys", () => {
  it("keys an e-Transfer reference and ignores other methods", () => {
    expect(etransferReferenceKey("E_TRANSFER", " ca9f ")).toBe("etransfer:CA9F");
    expect(etransferReferenceKey("CASH", "ca9f")).toBeNull();
    expect(etransferReferenceKey("E_TRANSFER", "   ")).toBeNull();
    expect(etransferReferenceKey("E_TRANSFER", null)).toBeNull();
  });
});

describe("confirmation payloads", () => {
  it("matches the same change when the key order differs", () => {
    expect(samePayload({ amountCents: 100, tenancyId: "a" }, { tenancyId: "a", amountCents: 100 })).toBe(
      true,
    );
    expect(canonicalJson({ b: 1, a: null })).toBe(canonicalJson({ a: null, b: 1 }));
    expect(samePayload({ amountCents: 100 }, { amountCents: 200 })).toBe(false);
  });
});

describe("agent rate limit", () => {
  it("blocks once the window is full", () => {
    setAgentRateLimitForTests(2);
    expect(consumeAgentRate("token:test", 1_000).allowed).toBe(true);
    expect(consumeAgentRate("token:test", 1_100).allowed).toBe(true);
    const blocked = consumeAgentRate("token:test", 1_200);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(consumeAgentRate("token:other", 1_200).allowed).toBe(true);
    resetAgentRateLimits();
  });
});

describe("e-Transfer ingest confidence", () => {
  const parsed = {
    amountCents: 2_000,
    senderName: "Sam Okonkwo",
    paidOn: "2026-10-01",
    referenceNumber: "CA1",
    message: "Rent",
  };

  it("records only a strong unique match", () => {
    const high = classifyIngest({
      parsed,
      ranked: [{ tenancyId: "sam", score: 100 }],
      today: "2026-10-14",
    });
    expect(high.confidence).toBe("high");
    expect(high.proposedTenancyId).toBe("sam");

    const weak = classifyIngest({
      parsed,
      ranked: [{ tenancyId: "sam", score: 70 }],
      today: "2026-10-14",
    });
    expect(weak.confidence).toBe("low");
    expect(weak.proposedTenancyId).toBe("sam");
  });

  it("does not guess when two tenants tie", () => {
    const tied = classifyIngest({
      parsed,
      ranked: [
        { tenancyId: "a", score: 100 },
        { tenancyId: "b", score: 100 },
      ],
      today: "2026-10-14",
    });
    expect(tied.confidence).toBe("low");
    expect(tied.proposedTenancyId).toBeNull();
  });

  it("stays pending without a reference", () => {
    const missing = classifyIngest({
      parsed: { ...parsed, referenceNumber: null },
      ranked: [{ tenancyId: "sam", score: 100 }],
      today: "2026-10-14",
    });
    expect(missing.confidence).toBe("low");
    expect(missing.reason).toMatch(/reference/i);
  });
});
