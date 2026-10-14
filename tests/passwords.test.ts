import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/passwords";

describe("passwords", () => {
  it("stores a hash that matches the original password only", async () => {
    const passwordHash = await hashPassword("DemoRent1");
    expect(passwordHash).not.toContain("DemoRent1");
    expect(await verifyPassword("DemoRent1", passwordHash)).toBe(true);
    expect(await verifyPassword("DemoRent2", passwordHash)).toBe(false);
  });
});
