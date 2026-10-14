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

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Add calendar months and clamp the day to the last real day of the
 * target month. 29 February 2024 plus 12 months is 28 February 2025.
 */
export function addCalendarMonths(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const monthIndex = Number(iso.slice(5, 7)) - 1;
  const day = Number(iso.slice(8, 10));
  const shifted = monthIndex + months;
  const nextYear = year + Math.floor(shifted / 12);
  const nextMonthIndex = ((shifted % 12) + 12) % 12;
  const nextMonth = nextMonthIndex + 1;
  const nextDay = Math.min(day, lastDayOfMonth(nextYear, nextMonth));
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

export function addMonths(monthStartIso: string, count: number): string {
  const year = Number(monthStartIso.slice(0, 4));
  const month = Number(monthStartIso.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = date.getUTCMonth() + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(startIso: string, endIso: string): number {
  const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
  const [endYear, endMonth, endDay] = endIso.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000);
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
