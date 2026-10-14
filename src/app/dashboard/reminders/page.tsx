import Link from "next/link";

import { saveReminderSchedule } from "@/actions/reminders";
import { CopyMessage } from "@/components/copy-message";
import { ReminderScheduleForm } from "@/components/reminder-schedule-form";
import { card } from "@/components/styles";
import { daysLateLabel } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getReminderBoard } from "@/lib/rent-data";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const board = await getReminderBoard();

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        Reminders
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Who to nudge</h1>
      <p className="mt-2 max-w-xl text-muted">
        The list follows your schedule. Messages are ready to copy. Email is
        not sent yet.
      </p>

      {board.cards.length === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          Nothing matches the schedule today.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {board.cards.map((cardItem) => (
            <li key={cardItem.chargeId} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    <Link
                      href={`/dashboard/tenancies/${cardItem.tenancyId}/rent`}
                      className="hover:text-pine"
                    >
                      {cardItem.tenantName}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {cardItem.unitLabel} · {cardItem.propertyLabel}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-2xl">{formatCad(cardItem.owingCents)}</p>
                  <p className="text-sm text-muted">
                    {cardItem.daysLate > 0
                      ? daysLateLabel(cardItem.daysLate)
                      : cardItem.scheduleLabel}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-line bg-white p-3">
                <p className="text-sm font-semibold">{cardItem.emailSubject}</p>
                {cardItem.emailTo ? (
                  <p className="mt-1 text-sm text-muted">To {cardItem.emailTo}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted">No email on file</p>
                )}
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">
                  {cardItem.emailText}
                </pre>
              </div>
              <div className="mt-3">
                <CopyMessage
                  text={`To: ${cardItem.emailTo ?? ""}\nSubject: ${cardItem.emailSubject}\n\n${cardItem.emailText}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className={`${card} mt-10 p-4`}>
        <h2 className="font-serif text-2xl">Schedule</h2>
        <p className="mt-2 text-sm text-muted">
          A reminder stays on the list after its day arrives, until the month
          is paid. Turn one off to stop using it.
        </p>
        <div className="mt-4">
          <ReminderScheduleForm
            key={board.rules
              .map((rule) => `${rule.offsetDays}:${rule.enabled}`)
              .join("|")}
            action={saveReminderSchedule}
            initial={board.rules}
          />
        </div>
      </section>
    </div>
  );
}
