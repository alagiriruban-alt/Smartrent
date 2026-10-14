"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import { PROVINCES } from "@/lib/provinces";
import type { FormState } from "@/lib/validators";

type PropertyAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function PropertyForm({
  action,
  submitLabel,
  pendingLabel,
  initial,
}: {
  action: PropertyAction;
  submitLabel: string;
  pendingLabel: string;
  initial?: {
    id?: string;
    name?: string | null;
    streetAddress?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
}) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field
        label="Property name"
        htmlFor="name"
        hint="Optional. A name you will recognize, such as King Street duplex."
        error={error("name")}
      >
        <input
          id="name"
          name="name"
          defaultValue={initial?.name ?? ""}
          className={textInput}
          maxLength={80}
          aria-invalid={Boolean(error("name"))}
        />
      </Field>
      <Field label="Street address" htmlFor="streetAddress" error={error("streetAddress")}>
        <input
          id="streetAddress"
          name="streetAddress"
          defaultValue={initial?.streetAddress ?? ""}
          className={textInput}
          autoComplete="street-address"
          required
          aria-invalid={Boolean(error("streetAddress"))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city" error={error("city")}>
          <input
            id="city"
            name="city"
            defaultValue={initial?.city ?? ""}
            className={textInput}
            autoComplete="address-level2"
            required
            aria-invalid={Boolean(error("city"))}
          />
        </Field>
        <Field
          label="Province or territory"
          htmlFor="province"
          hint="Ontario is selected because this app is for Ontario landlords."
          error={error("province")}
        >
          <select
            id="province"
            name="province"
            defaultValue={initial?.province ?? "ON"}
            className={textInput}
            aria-invalid={Boolean(error("province"))}
          >
            {PROVINCES.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Postal code" htmlFor="postalCode" error={error("postalCode")}>
        <input
          id="postalCode"
          name="postalCode"
          defaultValue={initial?.postalCode ?? ""}
          className={textInput}
          autoComplete="postal-code"
          placeholder="A1A 1A1"
          required
          aria-invalid={Boolean(error("postalCode"))}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
