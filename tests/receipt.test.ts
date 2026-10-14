import { describe, expect, it } from "vitest";

import { buildReceiptPdf, receiptLines, receiptNumber } from "@/lib/receipt";

describe("receipt", () => {
  const view = {
    receiptNumber: "AB12CD34",
    landlordName: "Avery Chen",
    paidOnLabel: "Oct 14, 2026",
    tenantName: "Sam Okonkwo",
    unitLabel: "Lower",
    address: "18 King Street West, Hamilton ON L8P 1A1",
    amountCents: 145_000,
    methodLabel: "Interac e-Transfer",
    referenceNumber: "CA9F2E81B4",
    note: "October rent",
    applied: [
      { periodStart: "2026-09-01", amountCents: 95_000 },
      { periodStart: "2026-10-01", amountCents: 50_000 },
    ],
    creditCents: 0,
  };

  it("uses the end of the payment id as the receipt number", () => {
    expect(receiptNumber("ckpaymentAB12CD34")).toBe("AB12CD34");
  });

  it("builds a one-page PDF that includes the payment", () => {
    const lines = receiptLines(view);
    expect(lines.join("\n")).toContain("Sam Okonkwo");
    expect(lines.join("\n")).toContain("CA9F2E81B4");
    expect(lines.join("\n")).toContain("$1,450.00");
    const pdf = Buffer.from(buildReceiptPdf(lines)).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Sam Okonkwo");
    expect(pdf).toContain("CA9F2E81B4");
    expect(pdf).toContain("%%EOF");
  });
});
