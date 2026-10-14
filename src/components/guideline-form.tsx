"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import type { FormState } from "@/lib/validators";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function GuidelineForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];
  const saved = Boolean(state.message) && !state.errors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p className={saved ? "text-sm text-pine" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Year" htmlFor="year" error={error("year")}>
          <input
            id="year"
            name="year"
            inputMode="numeric"
            className={textInput}
            placeholder="2027"
            required
            aria-invalid={Boolean(error("year"))}
          />
        </Field>
        <Field
          label="Guideline percent"
          htmlFor="percent"
          hint="For example, 2.1 or 1.9."
          error={error("percent")}
        >
          <input
            id="percent"
            name="percent"
            inputMode="decimal"
            className={textInput}
            placeholder="2.1"
            required
            aria-invalid={Boolean(error("percent"))}
          />
        </Field>
      </div>
      <Field
        label="Source link"
        htmlFor="sourceUrl"
        hint="Use the official page you checked."
        error={error("sourceUrl")}
      >
        <input
          id="sourceUrl"
          name="sourceUrl"
          type="url"
          className={textInput}
          placeholder="https://www.ontario.ca/page/residential-rent-increases"
          required
          aria-invalid={Boolean(error("sourceUrl"))}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="verified" value="on" className="mt-1" />
        <span>
          Verified. I checked this percent against the source. N1 drafts stay
          blocked for years that are not verified.
        </span>
      </label>
      {error("verified") ? (
        <p className="text-sm text-danger" role="alert">
          {error("verified")}
        </p>
      ) : null}
      <div>
        <SubmitButton pendingLabel="Saving…">Save guideline</SubmitButton>
      </div>
    </form>
  );
}
