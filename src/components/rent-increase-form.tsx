"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import type { IncreaseFormState } from "@/lib/rent-increase/parse";
import { warningKey } from "@/lib/rent-increase/calculate";

type Action = (prev: IncreaseFormState, formData: FormData) => Promise<IncreaseFormState>;

export function RentIncreaseForm({
  action,
  tenancyId,
  defaultEffectiveOn,
  defaultNewRent,
}: {
  action: Action;
  tenancyId: string;
  defaultEffectiveOn: string;
  defaultNewRent: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];
  const warnings = state.warnings ?? [];
  const accepted = warningKey(warnings);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field
        label="Effective date"
        htmlFor="effectiveOn"
        hint="The new rent starts on this day. It should be at least 12 months after move-in or the last increase, and at least 90 days after you give notice."
        error={error("effectiveOn")}
      >
        <input
          id="effectiveOn"
          name="effectiveOn"
          type="date"
          defaultValue={defaultEffectiveOn}
          className={textInput}
          required
          aria-invalid={Boolean(error("effectiveOn"))}
        />
      </Field>
      <Field
        label="New monthly rent (CAD)"
        htmlFor="newRent"
        hint="For a unit covered by the guideline, this starts at the guideline amount. You can change it."
        error={error("newRent")}
      >
        <input
          id="newRent"
          name="newRent"
          inputMode="decimal"
          defaultValue={defaultNewRent}
          className={textInput}
          required
          aria-invalid={Boolean(error("newRent"))}
        />
      </Field>
      {warnings.length > 0 ? (
        <div className="rounded-md border border-danger/40 bg-danger-soft p-4">
          <p className="text-sm font-semibold">Check these before you save</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          <input type="hidden" name="acceptedWarnings" value={accepted} />
          <label key={accepted} className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" name="acknowledge" value="yes" className="mt-1" required />
            <span>I have read these warnings. Save the draft anyway.</span>
          </label>
        </div>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Saving draft…">Save draft</SubmitButton>
      </div>
    </form>
  );
}
