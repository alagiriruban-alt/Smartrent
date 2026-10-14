import { addCalendarMonths, addDays, daysBetween } from "@/lib/dates";

export const LTB_FORMS_URL = "https://tribunalsontario.ca/ltb/forms/";

export const DRAFT_DISCLAIMER =
  "DRAFT. This is not legal advice and it is not an official Landlord and Tenant Board form. Verify the current form before you serve notice.";

export type RentNoticeForm = {
  code: "N1" | "N2";
  name: string;
  officialUrl: string;
};

/** Date and form rules for one province. Only Ontario is registered. */
export type ProvinceRentRules = {
  province: string;
  noticePeriodDays: number;
  monthsBetweenIncreases: number;
  alertLeadDays: number;
  serveReminderLeadDays: number;
  /** First residential occupancy after this date is guideline-exempt. */
  exemptionCutoff: string;
  standardForm: RentNoticeForm;
  exemptForm: RentNoticeForm;
};

export const ontarioRentRules: ProvinceRentRules = {
  province: "ON",
  noticePeriodDays: 90,
  monthsBetweenIncreases: 12,
  alertLeadDays: 120,
  serveReminderLeadDays: 14,
  exemptionCutoff: "2018-11-15",
  standardForm: {
    code: "N1",
    name: "Notice of Rent Increase",
    officialUrl: LTB_FORMS_URL,
  },
  exemptForm: {
    code: "N2",
    name: "Notice of Rent Increase (unit partially exempt)",
    officialUrl: LTB_FORMS_URL,
  },
};

const byProvince: Record<string, ProvinceRentRules> = {
  ON: ontarioRentRules,
};

export function rulesForProvince(province: string): ProvinceRentRules | null {
  return byProvince[province] ?? null;
}

export type IncreaseSchedule = {
  anchorOn: string;
  anchor: "move_in" | "last_increase";
  eligibleOn: string;
  serveBy: string;
};

export function increaseSchedule(
  rules: ProvinceRentRules,
  moveInOn: string,
  lastIncreaseOn: string | null,
): IncreaseSchedule {
  const anchorOn = lastIncreaseOn ?? moveInOn;
  const eligibleOn = addCalendarMonths(anchorOn, rules.monthsBetweenIncreases);
  return {
    anchorOn,
    anchor: lastIncreaseOn ? "last_increase" : "move_in",
    eligibleOn,
    serveBy: addDays(eligibleOn, -rules.noticePeriodDays),
  };
}

export type IncreaseAlert = "eligible_soon" | "serve_by_reminder";

export function increaseAlerts(
  rules: ProvinceRentRules,
  schedule: IncreaseSchedule,
  today: string,
): IncreaseAlert[] {
  const alerts: IncreaseAlert[] = [];
  const untilEligible = daysBetween(today, schedule.eligibleOn);
  const untilServe = daysBetween(today, schedule.serveBy);
  if (untilEligible >= 0 && untilEligible <= rules.alertLeadDays) {
    alerts.push("eligible_soon");
  }
  if (untilServe >= 0 && untilServe <= rules.serveReminderLeadDays) {
    alerts.push("serve_by_reminder");
  }
  return alerts;
}

/** Latest of the 12-month date and the first day that allows 90 days' notice. */
export function defaultEffectiveDate(
  rules: ProvinceRentRules,
  eligibleOn: string,
  preparedOn: string,
): string {
  const earliestByNotice = addDays(preparedOn, rules.noticePeriodDays);
  return earliestByNotice > eligibleOn ? earliestByNotice : eligibleOn;
}

export function noticeFormFor(
  rules: ProvinceRentRules,
  guidelineExempt: boolean,
): RentNoticeForm {
  return guidelineExempt ? rules.exemptForm : rules.standardForm;
}
