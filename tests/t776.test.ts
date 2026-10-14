import { describe, expect, it } from "vitest";

import { T776_LINES } from "@/lib/t776";

describe("T776 expense lines", () => {
  it("lists each CRA expense category once, with a line number", () => {
    expect(T776_LINES).toHaveLength(13);
    expect(new Set(T776_LINES.map((line) => line.category)).size).toBe(13);
    expect(new Set(T776_LINES.map((line) => line.line)).size).toBe(13);
    for (const line of T776_LINES) {
      expect(line.line).toMatch(/^\d{4}$/);
      expect(line.label.length).toBeGreaterThan(0);
    }
    expect(T776_LINES.find((line) => line.category === "PROPERTY_TAXES")?.line).toBe(
      "9180",
    );
  });
});
