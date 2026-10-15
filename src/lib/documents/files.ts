import { MAX_DOCUMENT_BYTES } from "@/lib/documents/catalog";

export type AcceptedFile = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

type FileRule = {
  extensions: string[];
  mimeType: string;
  sniff: (bytes: Uint8Array) => boolean;
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
}

function isJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isPng(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  return (
    ftyp === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"].includes(brand)
  );
}

const RULES: FileRule[] = [
  { extensions: ["pdf"], mimeType: "application/pdf", sniff: isPdf },
  { extensions: ["jpg", "jpeg"], mimeType: "image/jpeg", sniff: isJpeg },
  { extensions: ["png"], mimeType: "image/png", sniff: isPng },
  { extensions: ["heic"], mimeType: "image/heic", sniff: isHeif },
  { extensions: ["heif"], mimeType: "image/heif", sniff: isHeif },
  {
    extensions: ["docx"],
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sniff: isZip,
  },
];

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    return "";
  }
  return fileName.slice(dot + 1).toLowerCase();
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
  return cleaned.slice(0, 180);
}

export function contentDisposition(fileName: string): string {
  const safeName = sanitizeFileName(fileName) || "document";
  const ascii = safeName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safeName);
  const inline = /\.(pdf|jpe?g|png|heic|heif)$/i.test(safeName);
  const kind = inline ? "inline" : "attachment";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function inspectDocumentFile(input: {
  fileName: string;
  bytes: Uint8Array;
}): { ok: true; file: AcceptedFile } | { ok: false; message: string } {
  if (input.bytes.byteLength === 0) {
    return { ok: false, message: "That file is empty." };
  }
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: "Each file must be 10 MB or smaller." };
  }
  const fileName = sanitizeFileName(input.fileName);
  if (!fileName) {
    return { ok: false, message: "Choose a file with a name." };
  }
  const extension = extensionOf(fileName);
  const rule = RULES.find((item) => item.extensions.includes(extension));
  if (!rule) {
    return {
      ok: false,
      message: "Use a PDF, JPG, PNG, HEIC, or DOCX file.",
    };
  }
  if (!rule.sniff(input.bytes)) {
    return {
      ok: false,
      message: "That file does not match its extension.",
    };
  }
  return { ok: true, file: { fileName, mimeType: rule.mimeType, bytes: input.bytes } };
}
