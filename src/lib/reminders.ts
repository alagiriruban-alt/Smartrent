import { daysBetween } from "@/lib/dates";
import type { OutboundEmail } from "@/lib/email";
import { formatMonth } from "@/lib/format";
import { formatCadPlain } from "@/lib/money";

export const DEFAULT_REMINDER_OFFSETS = [-3, 0, 3] as const;

export type ReminderRuleInput = {
  offsetDays: number;
  enabled: boolean;
};

export type ReminderKind = "before" | "due" | "late";

export function defaultReminderRules(): ReminderRuleInput[] {
  return DEFAULT_REMINDER_OFFSETS.map((offsetDays) => ({
    offsetDays,
    enabled: true,
  }));
}

export function reminderKind(offsetDays: number): ReminderKind {
  if (offsetDays < 0) {
    return "before";
  }
  if (offsetDays === 0) {
    return "due";
  }
  return "late";
}

export function offsetLabel(offsetDays: number): string {
  if (offsetDays === 0) {
    return "On the due date";
  }
  const days = Math.abs(offsetDays);
  const unit = days === 1 ? "day" : "days";
  if (offsetDays < 0) {
    return `${days} ${unit} before the due date`;
  }
  return `${days} ${unit} after the due date`;
}

export type OpenCharge = {
  tenancyId: string;
  chargeId: string;
  dueOn: string;
  periodStart: string;
  owingCents: number;
  chargedCents: number;
};

export type DueReminder = OpenCharge & {
  offsetDays: number;
  kind: ReminderKind;
  daysLate: number;
  daysUntilDue: number;
};

function calendarKind(daysFromDue: number): ReminderKind {
  if (daysFromDue < 0) {
    return "before";
  }
  if (daysFromDue === 0) {
    return "due";
  }
  return "late";
}

/**
 * A charge stays on the list once the earliest matching reminder has
 * been reached, and the message follows the latest rule that has arrived.
 */
export function dueReminders(
  charges: OpenCharge[],
  rules: ReminderRuleInput[],
  today: string,
): DueReminder[] {
  const enabled = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.offsetDays - b.offsetDays);
  const reminders: DueReminder[] = [];
  for (const charge of charges) {
    if (charge.owingCents <= 0) {
      continue;
    }
    const daysFromDue = daysBetween(charge.dueOn, today);
    const reached = enabled.filter((rule) => daysFromDue >= rule.offsetDays);
    const rule = reached[reached.length - 1];
    if (!rule) {
      continue;
    }
    reminders.push({
      ...charge,
      offsetDays: rule.offsetDays,
      kind: calendarKind(daysFromDue),
      daysLate: Math.max(0, daysFromDue),
      daysUntilDue: Math.max(0, -daysFromDue),
    });
  }
  return reminders;
}

export function buildReminderEmail(input: {
  landlordName: string;
  tenantFirstName: string;
  tenantEmail: string | null;
  unitLabel: string;
  place: string;
  periodStart: string;
  dueOnLabel: string;
  owingCents: number;
  chargedCents: number;
  kind: ReminderKind;
  daysUntilDue: number;
  daysLate: number;
}): OutboundEmail {
  const owing = formatCadPlain(input.owingCents);
  const charged = formatCadPlain(input.chargedCents);
  const period = formatMonth(input.periodStart);
  let subject: string;
  let detail: string;
  if (input.kind === "before") {
    subject = `Rent due ${input.dueOnLabel} — ${input.unitLabel}`;
    const when =
      input.daysUntilDue === 1 ? "tomorrow" : `in ${input.daysUntilDue} days`;
    detail = `Rent of ${charged} for ${period} at ${input.place} is due on ${input.dueOnLabel} (${when}).`;
  } else if (input.kind === "due") {
    subject = `Rent is due today — ${input.unitLabel}`;
    detail = `Rent of ${charged} for ${period} at ${input.place} is due today, ${input.dueOnLabel}.`;
  } else {
    subject = `Rent outstanding — ${input.unitLabel}`;
    const late = input.daysLate === 1 ? "1 day late" : `${input.daysLate} days late`;
    detail = `Rent of ${charged} for ${period} at ${input.place} was due on ${input.dueOnLabel}. It is ${late}. ${owing} is still owing for this month.`;
  }
  const ask =
    input.kind === "late"
      ? "Please send the outstanding amount by Interac e-Transfer."
      : "Please send it by Interac e-Transfer so it arrives by the due date.";
  const text = [
    `Hello ${input.tenantFirstName},`,
    "",
    detail,
    "",
    ask,
    "",
    "Thank you,",
    input.landlordName,
  ].join("\n");
  return {
    to: input.tenantEmail,
    subject,
    text,
  };
}
