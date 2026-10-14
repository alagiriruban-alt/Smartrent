"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import { ordinal } from "@/lib/format";
import type { FormState } from "@/lib/validators";

type TenantAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const dueDays = Array.from({ length: 31 }, (_, index) => index + 1);

export function TenantForm({
  action,
  propertyId,
  unitId,
  tenancyId,
  submitLabel,
  pendingLabel,
  initial,
}: {
  action: TenantAction;
  propertyId?: string;
  unitId?: string;
  tenancyId?: string;
  submitLabel: string;
  pendingLabel: string;
  initial?: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    leaseStart?: string;
    leaseEnd?: string | null;
    monthlyRent?: string;
    rentDueDay?: number;
  };
}) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}
      {unitId ? <input type="hidden" name="unitId" value={unitId} /> : null}
      {tenancyId ? <input type="hidden" name="tenancyId" value={tenancyId} /> : null}
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={error("firstName")}>
          <input
            id="firstName"
            name="firstName"
            defaultValue={initial?.firstName ?? ""}
            className={textInput}
            autoComplete="given-name"
            required
            aria-invalid={Boolean(error("firstName"))}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={error("lastName")}>
          <input
            id="lastName"
            name="lastName"
            defaultValue={initial?.lastName ?? ""}
            className={textInput}
            autoComplete="family-name"
            required
            aria-invalid={Boolean(error("lastName"))}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" hint="Optional." error={error("email")}>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className={textInput}
            autoComplete="email"
            aria-invalid={Boolean(error("email"))}
          />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="Optional." error={error("phone")}>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            className={textInput}
            autoComplete="tel"
            aria-invalid={Boolean(error("phone"))}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lease start" htmlFor="leaseStart" error={error("leaseStart")}>
          <input
            id="leaseStart"
            name="leaseStart"
            type="date"
            defaultValue={initial?.leaseStart ?? ""}
            className={textInput}
            required
            aria-invalid={Boolean(error("leaseStart"))}
          />
        </Field>
        <Field
          label="Lease end"
          htmlFor="leaseEnd"
          hint="Leave blank for month-to-month."
          error={error("leaseEnd")}
        >
          <input
            id="leaseEnd"
            name="leaseEnd"
            type="date"
            defaultValue={initial?.leaseEnd ?? ""}
            className={textInput}
            aria-invalid={Boolean(error("leaseEnd"))}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Monthly rent (CAD)"
          htmlFor="monthlyRent"
          error={error("monthlyRent")}
        >
          <input
            id="monthlyRent"
            name="monthlyRent"
            inputMode="decimal"
            defaultValue={initial?.monthlyRent ?? ""}
            className={textInput}
            placeholder="1850.00"
            required
            aria-invalid={Boolean(error("monthlyRent"))}
          />
        </Field>
        <Field
          label="Rent due day"
          htmlFor="rentDueDay"
          hint="If a month is shorter than this day, treat rent as due on the last day."
          error={error("rentDueDay")}
        >
          <select
            id="rentDueDay"
            name="rentDueDay"
            defaultValue={initial?.rentDueDay ?? 1}
            className={textInput}
            aria-invalid={Boolean(error("rentDueDay"))}
          >
            {dueDays.map((day) => (
              <option key={day} value={day}>
                {ordinal(day)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
