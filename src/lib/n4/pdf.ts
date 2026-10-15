function escapePdfText(value: string): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, "?");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, width = 92): string[] {
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

function pageStream(lines: string[]): string {
  const commands = ["BT", "/F1 10 Tf", "54 748 Td", "12 TL"];
  lines.forEach((line, index) => {
    const text = escapePdfText(line.length > 0 ? line : " ");
    if (index === 0) {
      commands.push(`(${text}) Tj`);
    } else {
      commands.push(`T* (${text}) Tj`);
    }
  });
  commands.push("ET");
  return commands.join("\n");
}

const LINES_PER_PAGE = 50;

/** Text PDF used for the N4 data sheet. It is not a copy of the LTB form. */
export function buildTextPdf(lines: string[]): Uint8Array {
  const wrapped = lines.flatMap((line) => wrapLine(line));
  const draft = wrapped.some((line) => line.trim() === "DRAFT");
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += LINES_PER_PAGE) {
    const slice = wrapped.slice(index, index + LINES_PER_PAGE);
    if (pages.length > 0 && draft) {
      pages.push(["DRAFT", "N4 data sheet (continued)", "", ...slice]);
    } else if (pages.length > 0) {
      pages.push(["N4 data sheet (continued)", "", ...slice]);
    } else {
      pages.push(slice);
    }
  }
  if (pages.length === 0) {
    pages.push([" "]);
  }

  const fontId = 3 + pages.length * 2;
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  ];
  pages.forEach((pageLines) => {
    const stream = pageStream(pageLines);
    const contentId = objects.length + 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

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
