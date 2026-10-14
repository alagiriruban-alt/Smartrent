function escapePdfText(value: string): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, "?");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, width = 90): string[] {
  if (line.length <= width) {
    return [line];
  }
  const rows: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > width && current.length > 0) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) {
    rows.push(current);
  }
  return rows.length > 0 ? rows : [line];
}

/** One-page Helvetica PDF. Used for drafts the landlord prints and checks. */
export function buildPlainPdf(lines: string[]): Uint8Array {
  const wrapped = lines.flatMap((line) => wrapLine(line));
  const commands = ["BT", "/F1 10 Tf", "54 748 Td", "12 TL"];
  wrapped.forEach((line, index) => {
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
