import { describe, expect, it } from "vitest";

import { centsToInput, formatCad, parseCadToCents } from "@/lib/money";

describe("parseCadToCents", () => {
  it("reads plain dollars and cents", () => {
    expect(parseCadToCents("1850")).toBe(185000);
    expect(parseCadToCents("1850.5")).toBe(185050);
    expect(parseCadToCents("1850.50")).toBe(185050);
    expect(parseCadToCents("$1,850.00")).toBe(185000);
    expect(parseCadToCents("0")).toBe(0);
  });

  it("rejects blanks, extra decimals, and amounts over $100,000", () => {
    expect(parseCadToCents("")).toBeNull();
    expect(parseCadToCents("12.345")).toBeNull();
    expect(parseCadToCents("-5")).toBeNull();
    expect(parseCadToCents("100000.01")).toBeNull();
    expect(parseCadToCents("rent")).toBeNull();
  });
});

describe("formatCad", () => {
  it("formats Canadian dollars", () => {
    expect(formatCad(185000).replace(/\u00a0/g, " ")).toBe("$1,850.00");
    expect(centsToInput(185050)).toBe("1850.50");
  });
});
