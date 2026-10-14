import { describe, expect, it } from "vitest";

import { PROVINCES } from "@/lib/provinces";
import { parseProperty, parseSignup, parseTenant, parseUnit } from "@/lib/validators";

describe("parseSignup", () => {
  it("lowercases the email and accepts a password with a letter and a number", () => {
    const parsed = parseSignup({
      name: "Avery Chen",
      email: "Avery@Example.com",
      password: "DemoRent1",
      confirmPassword: "DemoRent1",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.email).toBe("avery@example.com");
    }
  });

  it("rejects a short password and a mismatched confirmation", () => {
    const parsed = parseSignup({
      name: "Avery Chen",
      email: "avery@example.com",
      password: "short",
      confirmPassword: "different",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.password?.[0]).toBeTruthy();
      expect(parsed.errors.confirmPassword?.[0]).toBeTruthy();
    }
  });
});

describe("parseProperty", () => {
  it("defaults the stored province to the chosen code and formats the postal code", () => {
    const parsed = parseProperty({
      name: "",
      streetAddress: "18 King Street West",
      city: "Hamilton",
      province: "ON",
      postalCode: "l8p1a1",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.province).toBe("ON");
      expect(parsed.data.postalCode).toBe("L8P 1A1");
      expect(parsed.data.name).toBeNull();
    }
  });

  it("knows every province in the form", () => {
    for (const province of PROVINCES) {
      const parsed = parseProperty({
        name: "",
        streetAddress: "1 Main Street",
        city: "Town",
        province: province.code,
        postalCode: "K1A 0B1",
      });
      expect(parsed.ok).toBe(true);
    }
  });
});

describe("parseUnit", () => {
  it("allows a blank bedroom count and a studio", () => {
    expect(parseUnit({ label: "Upper", bedrooms: "" })).toEqual({
      ok: true,
      data: { label: "Upper", bedrooms: null },
    });
    expect(parseUnit({ label: "Basement", bedrooms: "0" })).toEqual({
      ok: true,
      data: { label: "Basement", bedrooms: 0 },
    });
  });
});

describe("parseTenant", () => {
  it("stores rent in cents and allows a month-to-month lease", () => {
    const parsed = parseTenant({
      firstName: "Jordan",
      lastName: "Patel",
      email: "",
      phone: "905-555-0148",
      leaseStart: "2026-01-01",
      leaseEnd: "",
      monthlyRent: "1,850.00",
      rentDueDay: "1",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.monthlyRentCents).toBe(185000);
      expect(parsed.data.leaseEnd).toBeNull();
      expect(parsed.data.email).toBeNull();
      expect(parsed.data.rentDueDay).toBe(1);
      expect(parsed.data.moveInOn).toBe("2026-01-01");
      expect(parsed.data.lastIncreaseOn).toBeNull();
      expect(parsed.data.guidelineExempt).toBe(false);
    }
  });

  it("rejects an end date before the start date", () => {
    const parsed = parseTenant({
      firstName: "Jordan",
      lastName: "Patel",
      email: "not-an-email",
      phone: "",
      leaseStart: "2026-06-01",
      leaseEnd: "2026-05-01",
      monthlyRent: "10",
      rentDueDay: "1",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.leaseEnd?.[0]).toMatch(/on or after/);
      expect(parsed.errors.email?.[0]).toBeTruthy();
    }
  });
});
