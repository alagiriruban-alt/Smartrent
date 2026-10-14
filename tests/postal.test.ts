import { describe, expect, it } from "vitest";

import { normalizePostalCode } from "@/lib/postal";

describe("normalizePostalCode", () => {
  it("formats a Canadian postal code", () => {
    expect(normalizePostalCode("l8p1a1")).toBe("L8P 1A1");
    expect(normalizePostalCode("L8P 1A1")).toBe("L8P 1A1");
  });

  it("rejects codes Canada Post does not use", () => {
    expect(normalizePostalCode("D1D 1D1")).toBeNull();
    expect(normalizePostalCode("12345")).toBeNull();
    expect(normalizePostalCode("")).toBeNull();
  });
});
