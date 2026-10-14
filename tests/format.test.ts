import { describe, expect, it } from "vitest";

import { bedroomLabel, ordinal, propertyTitle } from "@/lib/format";

describe("ordinal", () => {
  it("uses the English ending, including the teens", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(31)).toBe("31st");
  });
});

describe("labels", () => {
  it("falls back to the street when a property has no name", () => {
    expect(
      propertyTitle({ name: null, streetAddress: "18 King Street West" }),
    ).toBe("18 King Street West");
    expect(
      propertyTitle({ name: "King Street duplex", streetAddress: "18 King" }),
    ).toBe("King Street duplex");
  });

  it("describes bedrooms", () => {
    expect(bedroomLabel(null)).toBeNull();
    expect(bedroomLabel(0)).toBe("Studio");
    expect(bedroomLabel(1)).toBe("1 bedroom");
    expect(bedroomLabel(2)).toBe("2 bedrooms");
  });
});
