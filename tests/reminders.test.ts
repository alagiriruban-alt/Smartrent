import { describe, expect, it } from "vitest";

import { UnconfiguredEmailService } from "@/lib/email";
import { formatCadPlain } from "@/lib/money";
import {
  buildReminderEmail,
  defaultReminderRules,
  dueReminders,
  offsetLabel,
} from "@/lib/reminders";

const charge = {
  tenancyId: "sam",
  chargeId: "oct",
  dueOn: "2026-10-01",
  periodStart: "2026-10-01",
  owingCents: 145_000,
  chargedCents: 145_000,
};

describe("dueReminders", () => {
  const rules = defaultReminderRules();

  it("stays quiet until the first reminder day", () => {
    expect(dueReminders([charge], rules, "2026-09-27")).toEqual([]);
  });

  it("uses the latest schedule point that has arrived", () => {
    const before = dueReminders([charge], rules, "2026-09-28");
    expect(before[0]?.offsetDays).toBe(-3);
    expect(before[0]?.kind).toBe("before");

    const due = dueReminders([charge], rules, "2026-10-01");
    expect(due[0]?.kind).toBe("due");

    const late = dueReminders([charge], rules, "2026-10-14");
    expect(late[0]?.offsetDays).toBe(3);
    expect(late[0]?.kind).toBe("late");
    expect(late[0]?.daysLate).toBe(13);
  });

  it("drops a charge once it is paid", () => {
    expect(
      dueReminders([{ ...charge, owingCents: 0 }], rules, "2026-10-14"),
    ).toEqual([]);
  });

  it("skips a disabled rule", () => {
    expect(
      dueReminders(
        [charge],
        [
          { offsetDays: -3, enabled: false },
          { offsetDays: 0, enabled: false },
          { offsetDays: 3, enabled: true },
        ],
        "2026-10-02",
      ),
    ).toEqual([]);
  });
});

describe("reminder email", () => {
  it("describes a late balance without sending it", async () => {
    const message = buildReminderEmail({
      landlordName: "Avery Chen",
      tenantFirstName: "Sam",
      tenantEmail: "sam@example.com",
      unitLabel: "Lower",
      place: "Lower, 18 King Street West, Hamilton ON L8P 1A1",
      periodStart: "2026-10-01",
      dueOnLabel: "Oct 1, 2026",
      owingCents: 145_000,
      chargedCents: 145_000,
      kind: "late",
      daysUntilDue: 0,
      daysLate: 13,
    });
    expect(message.to).toBe("sam@example.com");
    expect(message.subject).toContain("Lower");
    expect(message.text).toContain("Hello Sam");
    expect(message.text).toContain(formatCadPlain(145_000));
    expect(message.text).toContain("13 days late");
    expect(message.text).toContain("Avery Chen");
    expect(offsetLabel(3)).toBe("3 days after the due date");
    expect(offsetLabel(-3)).toBe("3 days before the due date");
    expect(offsetLabel(0)).toBe("On the due date");

    const result = await new UnconfiguredEmailService().send(message);
    expect(result).toEqual({ delivered: false, reason: "not-configured" });
  });
});
