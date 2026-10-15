import { describe, expect, it } from "vitest";

import { dashboardNav, isDashboardNavActive } from "@/lib/nav";

describe("dashboard nav", () => {
  it("lists properties beside the rent roll", () => {
    expect(dashboardNav.map((link) => link.label)).toEqual([
      "Rent roll",
      "Properties",
      "Rent",
      "Increases",
      "Reminders",
      "Settings",
    ]);
  });

  it("keeps the rent roll on its own page", () => {
    expect(isDashboardNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isDashboardNavActive("/dashboard/properties", "/dashboard")).toBe(false);
    expect(isDashboardNavActive("/dashboard/properties/abc", "/dashboard")).toBe(
      false,
    );
    expect(isDashboardNavActive("/dashboard/rent", "/dashboard")).toBe(false);
  });

  it("highlights properties for buildings, units, and tenant edits", () => {
    expect(isDashboardNavActive("/dashboard/properties", "/dashboard/properties")).toBe(
      true,
    );
    expect(
      isDashboardNavActive(
        "/dashboard/properties/abc/units/u/tenants/new",
        "/dashboard/properties",
      ),
    ).toBe(true);
    expect(
      isDashboardNavActive("/dashboard/tenancies/lease/edit", "/dashboard/properties"),
    ).toBe(true);
    expect(
      isDashboardNavActive("/dashboard/tenancies/lease/rent", "/dashboard/properties"),
    ).toBe(false);
  });

  it("highlights the rent ledger and payments separately from properties", () => {
    expect(isDashboardNavActive("/dashboard/rent", "/dashboard/rent")).toBe(true);
    expect(
      isDashboardNavActive("/dashboard/rent/payments/new", "/dashboard/rent"),
    ).toBe(true);
    expect(isDashboardNavActive("/dashboard/payments/pay", "/dashboard/rent")).toBe(
      true,
    );
    expect(
      isDashboardNavActive("/dashboard/tenancies/lease/rent", "/dashboard/rent"),
    ).toBe(true);
    expect(isDashboardNavActive("/dashboard/rent-increases", "/dashboard/rent")).toBe(
      false,
    );
    expect(
      isDashboardNavActive("/dashboard/properties/abc", "/dashboard/rent"),
    ).toBe(false);
  });
});
