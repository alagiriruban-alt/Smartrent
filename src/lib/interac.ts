import { isIsoDate } from "@/lib/dates";
import { parseCadToCents } from "@/lib/money";

export type ParsedInterac = {
  amountCents: number | null;
  senderName: string | null;
  paidOn: string | null;
  referenceNumber: string | null;
  message: string | null;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const SENDER_STOP = new Set([
  "interac",
  "e-transfer",
  "etransfer",
  "e transfer",
  "your",
  "the",
  "account",
  "money",
  "sender",
  "email",
]);

function cleanSender(raw: string): string | null {
  const prefix = raw.match(
    /[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3}/,
  );
  const name = (prefix?.[0] ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) {
    return null;
  }
  const lower = name.toLowerCase();
  if (SENDER_STOP.has(lower) || lower.includes("interac")) {
    return null;
  }
  if (!/[a-z]/i.test(name)) {
    return null;
  }
  return name;
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseFlexibleDate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const slash = text.match(/\b(20\d{2})\/(\d{2})\/(\d{2})\b/);
  if (slash) {
    return isoFromParts(Number(slash[1]), Number(slash[2]), Number(slash[3]));
  }
  const monthName =
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const long = new RegExp(
    `\\b(${monthName})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
    "i",
  ).exec(text);
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    if (month) {
      return isoFromParts(Number(long[3]), month, Number(long[2]));
    }
  }
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthName})\\s+(20\\d{2})\\b`,
    "i",
  ).exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (month) {
      return isoFromParts(Number(dayFirst[3]), month, Number(dayFirst[1]));
    }
  }
  return null;
}

function parseAmount(text: string): number | null {
  const labeled = text.match(
    /amount\s*[:\-]?\s*(?:cad\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i,
  );
  if (labeled) {
    const cents = parseCadToCents(labeled[1]);
    if (cents !== null && cents > 0) {
      return cents;
    }
  }
  const received = text.match(
    /(?:received|sent you|transfer of|deposited)\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  );
  if (received) {
    const cents = parseCadToCents(received[1]);
    if (cents !== null && cents > 0) {
      return cents;
    }
  }
  const dollar = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (dollar) {
    const cents = parseCadToCents(dollar[1]);
    if (cents !== null && cents > 0) {
      return cents;
    }
  }
  const cad = text.match(/\b([\d,]+\.\d{2})\s*CAD\b/i);
  if (cad) {
    const cents = parseCadToCents(cad[1]);
    if (cents !== null && cents > 0) {
      return cents;
    }
  }
  return null;
}

function parseSender(text: string): string | null {
  const labeled = text.match(
    /(?:^|\n)\s*(?:from|sender)\s*[:\-]\s*([^\n]{2,80})/i,
  );
  if (labeled) {
    const name = cleanSender(labeled[1]);
    if (name) {
      return name;
    }
  }
  const sentYou = text.match(
    /\b([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})\s+sent you\b/,
  );
  if (sentYou) {
    const name = cleanSender(sentYou[1]);
    if (name) {
      return name;
    }
  }
  const fromName = text.match(
    /\bfrom\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})\b/,
  );
  if (fromName) {
    return cleanSender(fromName[1]);
  }
  return null;
}

function parsePaidOn(text: string): string | null {
  const labeled = text.match(
    /(?:^|\n)\s*(?:date|sent|deposited on|received on)\s*[:\-]\s*([^\n]{6,40})/i,
  );
  if (labeled) {
    const parsed = parseFlexibleDate(labeled[1]);
    if (parsed) {
      return parsed;
    }
  }
  return parseFlexibleDate(text);
}

function parseReference(text: string): string | null {
  const match = text.match(
    /(?:reference|ref\.?|confirmation)(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,29})/i,
  );
  return match ? match[1] : null;
}

function parseMessage(text: string): string | null {
  const match = text.match(/^\s*message\s*[:\-]\s*(.+)$/im);
  if (!match) {
    return null;
  }
  const message = match[1].trim();
  if (!message || message.length > 500) {
    return message ? message.slice(0, 500) : null;
  }
  return message;
}

export function parseInteracEmail(text: string): ParsedInterac {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) {
    return {
      amountCents: null,
      senderName: null,
      paidOn: null,
      referenceNumber: null,
      message: null,
    };
  }
  return {
    amountCents: parseAmount(source),
    senderName: parseSender(source),
    paidOn: parsePaidOn(source),
    referenceNumber: parseReference(source),
    message: parseMessage(source),
  };
}

export type TenantMatchCandidate = {
  tenancyId: string;
  firstName: string;
  lastName: string;
};

export type TenantMatch = {
  tenancyId: string;
  score: number;
};

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreName(senderName: string, candidate: TenantMatchCandidate): number {
  const sender = normalizeName(senderName);
  const first = normalizeName(candidate.firstName);
  const last = normalizeName(candidate.lastName);
  if (!sender || !first || !last) {
    return 0;
  }
  const full = `${first} ${last}`;
  const flipped = `${last} ${first}`;
  if (sender === full || sender === flipped) {
    return 100;
  }
  const tokens = new Set(sender.split(" "));
  const hasFirst = tokens.has(first);
  const hasLast = tokens.has(last);
  if (hasFirst && hasLast) {
    return 90;
  }
  if (hasLast && last.length >= 3) {
    return 70;
  }
  return 0;
}

/** Matches at 70 or above, highest first. Ties are kept so a caller can refuse to guess. */
export function rankTenants(
  senderName: string | null,
  candidates: TenantMatchCandidate[],
): TenantMatch[] {
  if (!senderName) {
    return [];
  }
  return candidates
    .map((candidate) => ({
      tenancyId: candidate.tenancyId,
      score: scoreName(senderName, candidate),
    }))
    .filter((row) => row.score >= 70)
    .sort((a, b) => b.score - a.score || a.tenancyId.localeCompare(b.tenancyId));
}

export function suggestTenant(
  senderName: string | null,
  candidates: TenantMatchCandidate[],
): TenantMatch | null {
  const scored = rankTenants(senderName, candidates);
  if (scored.length === 0) {
    return null;
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return null;
  }
  return scored[0];
}
