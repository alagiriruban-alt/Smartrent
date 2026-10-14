import { formatMonth } from "@/lib/format";
import { formatCadPlain } from "@/lib/money";

export type ReceiptView = {
  receiptNumber: string;
  landlordName: string;
  paidOnLabel: string;
  tenantName: string;
  unitLabel: string;
  address: string;
  amountCents: number;
  methodLabel: string;
  referenceNumber: string | null;
  note: string | null;
  applied: { periodStart: string; amountCents: number }[];
  creditCents: number;
};

export function receiptNumber(paymentId: string): string {
  const compact = paymentId.replace(/[^a-zA-Z0-9]/g, "");
  const tail = compact.slice(-8).toUpperCase();
  return tail || "RECEIPT";
}

export function receiptLines(receipt: ReceiptView): string[] {
  const lines = [
    "RENT RECEIPT",
    receipt.landlordName,
    "",
    `Receipt ${receipt.receiptNumber}`,
    `Date received  ${receipt.paidOnLabel}`,
    "",
    `Received from  ${receipt.tenantName}`,
    `For            ${receipt.unitLabel}`,
    `               ${receipt.address}`,
    "",
    `Amount         ${formatCadPlain(receipt.amountCents)}`,
    `Method         ${receipt.methodLabel}`,
  ];
  if (receipt.referenceNumber) {
    lines.push(`Reference      ${receipt.referenceNumber}`);
  }
  if (receipt.applied.length > 0) {
    lines.push("", "Applied to");
    for (const row of receipt.applied) {
      lines.push(
        `${formatMonth(row.periodStart)}  ${formatCadPlain(row.amountCents)}`,
      );
    }
  }
  if (receipt.creditCents > 0) {
    lines.push(
      `Credit to a later month  ${formatCadPlain(receipt.creditCents)}`,
    );
  }
  if (receipt.note) {
    lines.push("", `Note  ${receipt.note}`);
  }
  lines.push(
    "",
    "This receipt acknowledges rent received.",
    "It is not a notice from the Landlord and Tenant Board.",
  );
  return lines;
}

function escapePdfText(value: string): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, "?");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** One-page Helvetica PDF. Enough for a rent receipt, with no extra library. */
export function buildReceiptPdf(lines: string[]): Uint8Array {
  const commands = ["BT", "/F1 11 Tf", "64 740 Td", "16 TL"];
  lines.forEach((line, index) => {
    const text = escapePdfText(line.length > 0 ? line : " ");
    if (index === 0) {
      commands.push(`(${text}) Tj`);
    } else {
      commands.push(`T* (${text}) Tj`);
    }
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
