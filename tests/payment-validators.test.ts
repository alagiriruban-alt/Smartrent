import { describe, expect, it } from "vitest";

import { parsePayment, parseReminderSchedule } from "@/lib/validators";

const today = "2026-10-14";

describe("parsePayment", () => {
  it("accepts an Interac payment", () => {
    const parsed = parsePayment(
      {
        tenancyId: "tenancy-1",
        paidOn: "2026-10-14",
        amount: "$1,450.00",
        method: "E_TRANSFER",
        referenceNumber: " CA9F2E81B4 ",
        note: "October rent",
      },
      today,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.amountCents).toBe(145_000);
      expect(parsed.data.referenceNumber).toBe("CA9F2E81B4");
      expect(parsed.data.method).toBe("E_TRANSFER");
    }
  });

  it("rejects a future date, a zero amount, and an unknown method", () => {
    const parsed = parsePayment(
      {
        tenancyId: "",
        paidOn: "2026-10-15",
        amount: "0",
        method: "WIRE",
        referenceNumber: "",
        note: "",
      },
      today,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.tenancyId?.[0]).toBeTruthy();
      expect(parsed.errors.paidOn?.[0]).toMatch(/future/);
      expect(parsed.errors.amount?.[0]).toBeTruthy();
      expect(parsed.errors.method?.[0]).toBeTruthy();
    }
  });
});

describe("parseReminderSchedule", () => {
  it("keeps enabled offsets and rejects duplicates", () => {
    const parsed = parseReminderSchedule({
      offsetDays: ["-3", "0", "3"],
      enabled: ["-3", "3"],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.rules).toEqual([
        { offsetDays: -3, enabled: true },
        { offsetDays: 0, enabled: false },
        { offsetDays: 3, enabled: true },
      ]);
    }
    const duplicate = parseReminderSchedule({
      offsetDays: ["3", "3"],
      enabled: ["3"],
    });
    expect(duplicate.ok).toBe(false);
  });
});
