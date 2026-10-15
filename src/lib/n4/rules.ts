import { addDays } from "@/lib/dates";

/**
 * Termination dates for Ontario LTB Form N4 (Notice to End your Tenancy
 * Early for Non-payment of Rent).
 *
 * Checked against Tribunals Ontario on 2026-10-15:
 *
 * N4 instructions, updated September 21, 2026:
 * https://tribunalsontario.ca/documents/ltb/Notices%20of%20Termination%20%26%20Instructions/N4_Instructions.html
 * The termination date must be at least 7 days after the notice is given.
 * Do not count the day the notice is given. Handed to the tenant on March 3,
 * the earliest termination date is March 10. Fax is deemed given on the date
 * imprinted on the fax. Courier adds one business day. Mail or Xpresspost
 * adds five calendar days (mailed March 3, termination March 15 under the
 * 7-day rule). The notice cannot be given until the day after rent was due.
 * Posting it on the door is not allowed.
 *
 * Brochure "If a Tenant Does Not Pay Rent", last updated September 21, 2026:
 * https://tribunalsontario.ca/documents/ltb/Brochures/If%20a%20Tenant%20Does%20Not%20Pay%20Rent%20(EN).html
 * On or after September 21, 2026 the termination date is at least 7 days
 * after the N4 is given, for every rent frequency. Before that date, daily
 * or weekly rent needed at least 7 days, and monthly or yearly rent needed
 * at least 14 days. The brochure does not use a 28-day N4 period.
 *
 * Interpretation Guideline 11, Rent Arrears:
 * https://tribunalsontario.ca/documents/ltb/Interpretation%20Guidelines/11%20-%20Rent%20Arrears.html
 * The N4 must be given at least 7 days before the termination date. A notice
 * given before September 21, 2026 follows the earlier deadlines. The amount
 * must be the rent owing on the day the notice is given.
 *
 * LTB Rules of Procedure (holiday and deemed service):
 * https://tribunalsontario.ca/documents/ltb/Rules/LTB%20Rules%20of%20Procedure.html
 * A holiday is a Saturday, Sunday, or other day the LTB offices are closed.
 * Courier service is deemed the day after the document is given to the
 * courier, or the next day that is not a holiday. Mail is the fifth day
 * after mailing. A notice may take effect on a holiday, so the termination
 * date itself is not moved off a weekend or holiday.
 *
 * "Given" for the September 21, 2026 cutoff is the deemed service date.
 * Mail sent on September 18 is deemed given on September 23, so the 7-day
 * rule applies.
 */

export const N4_RULE_CHANGE_ON = "2026-09-21";

export const N4_OFFICIAL_FORM_URL =
  "https://tribunalsontario.ca/documents/ltb/Notices%20of%20Termination%20&%20Instructions/N4.pdf";

export const N4_INSTRUCTIONS_URL =
  "https://tribunalsontario.ca/documents/ltb/Notices%20of%20Termination%20%26%20Instructions/N4_Instructions.html";

export const N4_BROCHURE_URL =
  "https://tribunalsontario.ca/documents/ltb/Brochures/If%20a%20Tenant%20Does%20Not%20Pay%20Rent%20(EN).html";

export const N4_FORM_NAME = "Notice to End your Tenancy Early for Non-payment of Rent";

export const RENT_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export type RentFrequency = (typeof RENT_FREQUENCIES)[number];

export const N4_SERVICE_METHODS = [
  "IN_PERSON",
  "MAILBOX",
  "UNDER_DOOR",
  "FAX",
  "COURIER",
  "MAIL",
  "XPRESSPOST",
] as const;

export type N4ServiceMethod = (typeof N4_SERVICE_METHODS)[number];

export const RENT_FREQUENCY_LABELS: Record<RentFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const N4_SERVICE_METHOD_LABELS: Record<N4ServiceMethod, string> = {
  IN_PERSON: "Handed to the tenant or an adult in the unit",
  MAILBOX: "Left in the mailbox or where mail is ordinarily delivered",
  UNDER_DOOR: "Slid under the door or through a mail slot",
  FAX: "Faxed",
  COURIER: "Courier",
  MAIL: "Mail",
  XPRESSPOST: "Xpresspost",
};

export function isRentFrequency(value: string): value is RentFrequency {
  return (RENT_FREQUENCIES as readonly string[]).includes(value);
}

export function isN4ServiceMethod(value: string): value is N4ServiceMethod {
  return (N4_SERVICE_METHODS as readonly string[]).includes(value);
}

/** Minimum days after the deemed given date. The given date itself is not counted. */
export function minimumNoticeDays(deemedGivenOn: string, frequency: RentFrequency): number {
  if (deemedGivenOn >= N4_RULE_CHANGE_ON) {
    return 7;
  }
  if (frequency === "DAILY" || frequency === "WEEKLY") {
    return 7;
  }
  return 14;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayIndex(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Anonymous Gregorian computus. Returns Easter Sunday. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function nthMonday(year: number, month: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const delta = (1 - first.getUTCDay() + 7) % 7;
  return iso(year, month, 1 + delta + (n - 1) * 7);
}

function mondayOnOrBefore(date: string): string {
  let cursor = date;
  while (weekdayIndex(cursor) !== 1) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/**
 * Days the LTB offices are closed. Weekends, Ontario statutory holidays,
 * the August civic holiday (provincial offices are closed), and the next
 * weekday when New Year's Day, Canada Day, Christmas, or Boxing Day falls
 * on a weekend.
 */
export function isLtbHoliday(date: string): boolean {
  const day = weekdayIndex(date);
  if (day === 0 || day === 6) {
    return true;
  }
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(5);
  if (
    monthDay === "01-01" ||
    monthDay === "07-01" ||
    monthDay === "12-25" ||
    monthDay === "12-26"
  ) {
    return true;
  }
  const observed = ["01-01", "07-01", "12-25", "12-26"].map((monthDayPart) => {
    const holiday = `${year}-${monthDayPart}`;
    const holidayDay = weekdayIndex(holiday);
    if (holidayDay === 6) {
      return addDays(holiday, 2);
    }
    if (holidayDay === 0) {
      return addDays(holiday, 1);
    }
    return holiday;
  });
  if (observed.includes(date)) {
    return true;
  }
  const goodFriday = addDays(easterSunday(year), -2);
  if (date === goodFriday) {
    return true;
  }
  if (date === nthMonday(year, 2, 3)) {
    return true;
  }
  if (date === mondayOnOrBefore(addDays(`${year}-05-25`, -1))) {
    return true;
  }
  if (date === nthMonday(year, 8, 1)) {
    return true;
  }
  if (date === nthMonday(year, 9, 1)) {
    return true;
  }
  if (date === nthMonday(year, 10, 2)) {
    return true;
  }
  return false;
}

/** The day the tenant is deemed to have the notice. */
export function deemedGivenOn(sentOn: string, method: N4ServiceMethod): string {
  if (method === "MAIL" || method === "XPRESSPOST") {
    return addDays(sentOn, 5);
  }
  if (method === "COURIER") {
    let cursor = addDays(sentOn, 1);
    while (isLtbHoliday(cursor)) {
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }
  return sentOn;
}

export type TerminationPlan = {
  deemedGivenOn: string;
  noticeDays: number;
  terminationDate: string;
};

/**
 * Earliest termination date for this give date, service method, and
 * rent frequency. A later date is allowed. An earlier date is not.
 */
export function earliestTerminationDate(input: {
  givenOn: string;
  serviceMethod: N4ServiceMethod;
  rentFrequency: RentFrequency;
}): TerminationPlan {
  const deemed = deemedGivenOn(input.givenOn, input.serviceMethod);
  const noticeDays = minimumNoticeDays(deemed, input.rentFrequency);
  return {
    deemedGivenOn: deemed,
    noticeDays,
    terminationDate: addDays(deemed, noticeDays),
  };
}

export function terminationTooEarly(terminationDate: string, earliest: string): boolean {
  return terminationDate < earliest;
}
