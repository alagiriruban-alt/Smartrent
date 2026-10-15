import { formatMonth } from "@/lib/format";
import { formatCad } from "@/lib/money";

export function noticeFileName(code: string, tenantName: string): string {
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${code}-draft-${slug || "tenant"}.pdf`;
}

export function n4DraftLines(draft: {
  landlordName: string;
  tenantName: string;
  unitLabel: string;
  address: string;
  asOf: string;
  totalOwingCents: number;
  periods: Array<{ periodStart: string; owingCents: number }>;
  suggestedTerminationDate: string;
}): string[] {
  return [
    "DRAFT",
    "",
    "N4 non-payment notice draft",
    "This draft is not an official Landlord and Tenant Board form.",
    "It has not been served.",
    "",
    "Landlord",
    draft.landlordName,
    "",
    "Tenant",
    draft.tenantName,
    "",
    "Rental unit",
    `${draft.unitLabel}, ${draft.address}`,
    "",
    `As of ${draft.asOf}`,
    `Total owing ${formatCad(draft.totalOwingCents)}`,
    "",
    "Unpaid rent",
    ...(draft.periods.length === 0
      ? ["None"]
      : draft.periods.map(
          (period) => `${formatMonth(period.periodStart)}: ${formatCad(period.owingCents)}`,
        )),
    "",
    `Suggested termination date ${draft.suggestedTerminationDate}`,
  ];
}
