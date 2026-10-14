"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import type { FormState } from "@/lib/validators";

type UnitAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function UnitForm({
  action,
  propertyId,
  submitLabel,
  pendingLabel,
  initial,
}: {
  action: UnitAction;
  propertyId: string;
  submitLabel: string;
  pendingLabel: string;
  initial?: { id?: string; label?: string; bedrooms?: number | null };
}) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="propertyId" value={propertyId} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field
        label="Unit name"
        htmlFor="label"
        hint="Examples: Upper, Basement, Unit 2."
        error={error("label")}
      >
        <input
          id="label"
          name="label"
          defaultValue={initial?.label ?? ""}
          className={textInput}
          required
          maxLength={40}
          aria-invalid={Boolean(error("label"))}
        />
      </Field>
      <Field
        label="Bedrooms"
        htmlFor="bedrooms"
        hint="Optional. Use 0 for a studio."
        error={error("bedrooms")}
      >
        <input
          id="bedrooms"
          name="bedrooms"
          type="number"
          min={0}
          max={20}
          step={1}
          defaultValue={initial?.bedrooms ?? ""}
          className={textInput}
          aria-invalid={Boolean(error("bedrooms"))}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
