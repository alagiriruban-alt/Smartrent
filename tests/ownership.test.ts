import { describe, expect, it } from "vitest";

import { ownedWhere } from "@/lib/ownership";

describe("ownedWhere", () => {
  it("always limits a list to the signed-in landlord", () => {
    expect(ownedWhere("user_a")).toEqual({ ownerId: "user_a" });
  });

  it("limits a single record to that same landlord", () => {
    expect(ownedWhere("user_a", "prop_1")).toEqual({
      id: "prop_1",
      ownerId: "user_a",
    });
  });
});
