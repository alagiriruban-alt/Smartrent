const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const APP_TIME_ZONE = "America/Toronto";

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Calendar date stored in Postgres `@db.Date` (UTC midnight). */
export function dateOnlyToUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function utcToDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayDateOnly(
  now = new Date(),
  timeZone = APP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export type DateRange = {
  start: string;
  end: string | null;
};

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.end ?? "9999-12-31";
  const bEnd = b.end ?? "9999-12-31";
  return a.start <= bEnd && b.start <= aEnd;
}
