import { formatCadPlain } from "@/lib/money";

import {
  N4_FORM_NAME,
  N4_INSTRUCTIONS_URL,
  N4_OFFICIAL_FORM_URL,
  type N4ServiceMethod,
  N4_SERVICE_METHOD_LABELS,
  type RentFrequency,
  RENT_FREQUENCY_LABELS,
} from "@/lib/n4/rules";
import type { N4RentRow } from "@/lib/n4/table";

export function formatDmy(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export type N4Sheet = {
  confirmed: boolean;
  status: "DRAFT" | "SERVED" | "VOID";
  landlordName: string;
  landlordContact: string;
  tenantNames: string;
  unitAddress: string;
  givenOn: string;
  serviceMethod: N4ServiceMethod;
  rentFrequency: RentFrequency;
  terminationDate: string;
  earliestTerminationDate: string;
  deemedGivenOn: string;
  servedOn: string | null;
  servedMethod: N4ServiceMethod | null;
  rows: N4RentRow[];
  totalOwingCents: number;
};

export function n4DocumentLines(sheet: N4Sheet): string[] {
  const lines: string[] = [];
  if (!sheet.confirmed) {
    lines.push("DRAFT");
  }
  lines.push("SmartRentBoss");
  lines.push(N4_FORM_NAME);
  lines.push("Form N4 data sheet");
  lines.push("");
  lines.push("This is not the official Landlord and Tenant Board form.");
  lines.push(`Official form: ${N4_OFFICIAL_FORM_URL}`);
  lines.push(`Instructions: ${N4_INSTRUCTIONS_URL}`);
  lines.push("");
  lines.push(`To (tenants): ${sheet.tenantNames}`);
  lines.push(`From (landlord): ${sheet.landlordName}`);
  lines.push(`Landlord contact: ${sheet.landlordContact}`);
  lines.push(`Address of the rental unit: ${sheet.unitAddress}`);
  lines.push("");
  lines.push(`Rent frequency: ${RENT_FREQUENCY_LABELS[sheet.rentFrequency]}`);
  lines.push(
    `Notice will be given on: ${formatDmy(sheet.givenOn)} by ${N4_SERVICE_METHOD_LABELS[sheet.serviceMethod]}`,
  );
  lines.push(`Deemed given on: ${formatDmy(sheet.deemedGivenOn)}`);
  lines.push(`Termination date: ${formatDmy(sheet.terminationDate)}`);
  lines.push(
    `Earliest date this notice could legally end: ${formatDmy(sheet.earliestTerminationDate)}`,
  );
  lines.push("");
  lines.push("The following information is from the landlord.");
  lines.push("Rent owing by rental period");
  lines.push("Rent period from | Rent period to | Rent charged | Rent paid | Rent owing");
  if (sheet.rows.length === 0) {
    lines.push("No rental period is past due.");
  }
  for (const row of sheet.rows) {
    lines.push(
      `${formatDmy(row.periodFrom)} | ${formatDmy(row.periodTo)} | ${formatCadPlain(row.rentChargedCents)} | ${formatCadPlain(row.rentPaidCents)} | ${formatCadPlain(row.rentOwingCents)}`,
    );
  }
  lines.push(`Total rent owing: ${formatCadPlain(sheet.totalOwingCents)}`);
  lines.push("");
  if (sheet.status === "SERVED" && sheet.servedOn) {
    const method = sheet.servedMethod
      ? N4_SERVICE_METHOD_LABELS[sheet.servedMethod]
      : "the method on file";
    lines.push(`Recorded as served on ${formatDmy(sheet.servedOn)} by ${method}.`);
  } else if (sheet.confirmed) {
    lines.push("Confirmed by the landlord. Service has not been recorded.");
  } else {
    lines.push("DRAFT. The landlord has not confirmed this notice.");
  }
  lines.push(
    "Not legal advice. Sign and give the official N4. This data sheet is not filed with the Board.",
  );
  return lines;
}
