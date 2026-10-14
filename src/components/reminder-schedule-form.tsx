"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { secondaryButton, textInput } from "@/components/styles";
import { offsetLabel, type ReminderRuleInput } from "@/lib/reminders";
import type { FormState } from "@/lib/validators";

type ScheduleAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ReminderScheduleForm({
  action,
  initial,
}: {
  action: ScheduleAction;
  initial: ReminderRuleInput[];
}) {
  const [state, formAction] = useActionState(action, {});
  const [rules, setRules] = useState(initial);
  const [addOffset, setAddOffset] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function addRule() {
    if (!/^-?\d{1,3}$/.test(addOffset.trim())) {
      setAddError("Use a whole number of days, negative for before the due date.");
      return;
    }
    const offsetDays = Number(addOffset);
    if (offsetDays < -60 || offsetDays > 90) {
      setAddError("Use a number from 60 days before to 90 days after.");
      return;
    }
    if (rules.some((rule) => rule.offsetDays === offsetDays)) {
      setAddError("That reminder is already on the schedule.");
      return;
    }
    setRules(
      [...rules, { offsetDays, enabled: true }].sort(
        (a, b) => a.offsetDays - b.offsetDays,
      ),
    );
    setAddOffset("");
    setAddError(null);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.errors?.offsetDays?.[0] ? (
        <p className="text-sm text-danger" role="alert">
          {state.errors.offsetDays[0]}
        </p>
      ) : null}
      {rules.length === 0 ? (
        <p className="text-sm text-muted">
          No reminders. Add one, or save to turn the list off.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.offsetDays}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2"
            >
              <input type="hidden" name="offsetDays" value={rule.offsetDays} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  value={rule.offsetDays}
                  checked={rule.enabled}
                  onChange={(event) =>
                    setRules((current) =>
                      current.map((item) =>
                        item.offsetDays === rule.offsetDays
                          ? { ...item, enabled: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                {offsetLabel(rule.offsetDays)}
              </label>
              <button
                type="button"
                className="text-sm font-semibold text-danger"
                onClick={() =>
                  setRules((current) =>
                    current.filter((item) => item.offsetDays !== rule.offsetDays),
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Add a reminder"
          htmlFor="addOffset"
          hint="Negative means before the due date. 0 is the due date. 3 is three days late."
          error={addError ?? undefined}
        >
          <input
            id="addOffset"
            value={addOffset}
            onChange={(event) => setAddOffset(event.target.value)}
            inputMode="numeric"
            className={textInput}
            placeholder="-3"
          />
        </Field>
        <button type="button" className={secondaryButton} onClick={addRule}>
          Add
        </button>
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">Save schedule</SubmitButton>
      </div>
    </form>
  );
}
