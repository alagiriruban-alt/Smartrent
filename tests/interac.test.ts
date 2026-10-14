import { describe, expect, it } from "vitest";

import { parseInteracEmail, suggestTenant } from "@/lib/interac";

const tenants = [
  { tenancyId: "jordan", firstName: "Jordan", lastName: "Patel" },
  { tenancyId: "sam", firstName: "Sam", lastName: "Okonkwo" },
];

describe("parseInteracEmail", () => {
  it("reads a labeled bank notification", () => {
    const parsed = parseInteracEmail(`
      You've received an Interac e-Transfer.

      Amount: $1,450.00
      From: Sam Okonkwo
      Date: October 14, 2026
      Reference Number: CA9F2E81B4
      Message: October rent
    `);
    expect(parsed).toEqual({
      amountCents: 145_000,
      senderName: "Sam Okonkwo",
      paidOn: "2026-10-14",
      referenceNumber: "CA9F2E81B4",
      message: "October rent",
    });
  });

  it("reads a sentence-style deposit notice", () => {
    const parsed = parseInteracEmail(
      "You have received an Interac e-Transfer of $1,850.00 from Jordan Patel. Reference #: CAJP202610. Sent: 2026-10-01.",
    );
    expect(parsed.amountCents).toBe(185_000);
    expect(parsed.senderName).toBe("Jordan Patel");
    expect(parsed.paidOn).toBe("2026-10-01");
    expect(parsed.referenceNumber).toBe("CAJP202610");
  });

  it("reads a day-first date and a short ref label", () => {
    const parsed = parseInteracEmail(`
      Jordan Patel sent you $500.00
      Ref: CHQ1042
      Date: 1 Oct 2026
    `);
    expect(parsed.amountCents).toBe(50_000);
    expect(parsed.senderName).toBe("Jordan Patel");
    expect(parsed.paidOn).toBe("2026-10-01");
    expect(parsed.referenceNumber).toBe("CHQ1042");
  });

  it("returns nulls for an empty paste", () => {
    expect(parseInteracEmail("   ")).toEqual({
      amountCents: null,
      senderName: null,
      paidOn: null,
      referenceNumber: null,
      message: null,
    });
  });
});

describe("suggestTenant", () => {
  it("matches a full name and a unique last name", () => {
    expect(suggestTenant("Sam Okonkwo", tenants)?.tenancyId).toBe("sam");
    expect(suggestTenant("PATEL, JORDAN", tenants)?.tenancyId).toBe("jordan");
    expect(suggestTenant("Okonkwo", tenants)?.tenancyId).toBe("sam");
  });

  it("does not guess when two tenants share a last name", () => {
    expect(
      suggestTenant("Patel", [
        ...tenants,
        { tenancyId: "other", firstName: "Riya", lastName: "Patel" },
      ]),
    ).toBeNull();
  });

  it("ignores a sender that is not a tenant", () => {
    expect(suggestTenant("Interac", tenants)).toBeNull();
    expect(suggestTenant(null, tenants)).toBeNull();
  });
});
