"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import { isIsoDate } from "@/lib/dates";
import { RentTable } from "@/components/n4-rent-table";
import { formatDmy } from "@/lib/n4/document";
import {
  earliestTerminationDate,
  N4_SERVICE_METHODS,
  N4_SERVICE_METHOD_LABELS,
  type N4ServiceMethod,
  RENT_FREQUENCIES,
  RENT_FREQUENCY_LABELS,
  type RentFrequency,
} from "@/lib/n4/rules";
import type { N4RentRow } from "@/lib/n4/table";
import type { FormState } from "@/lib/validators";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function N4Form({
  action,
  tenancyId,
  noticeId,
  defaults,
  rows,
  totalOwingCents,
}: {
  action: Action;
  tenancyId: string;
  noticeId: string | null;
  defaults: {
    givenOn: string;
    serviceMethod: N4ServiceMethod;
    rentFrequency: RentFrequency;
    terminationDate: string;
    landlordName: string;
    landlordContact: string;
    tenantNames: string;
    unitAddress: string;
  };
  rows: N4RentRow[];
  totalOwingCents: number;
}) {
  const [formState, formAction] = useActionState(action, {});
  const [givenOn, setGivenOn] = useState(defaults.givenOn);
  const [serviceMethod, setServiceMethod] = useState(defaults.serviceMethod);
  const [rentFrequency, setRentFrequency] = useState(defaults.rentFrequency);
  const [terminationDate, setTerminationDate] = useState(defaults.terminationDate);
  const error = (key: string) => formState.errors?.[key]?.[0];
  const plan = isIsoDate(givenOn)
    ? earliestTerminationDate({ givenOn, serviceMethod, rentFrequency })
    : null;
  const earliest = plan?.terminationDate ?? defaults.terminationDate;
  const shownTermination = terminationDate < earliest ? earliest : terminationDate;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      {noticeId ? <input type="hidden" name="noticeId" value={noticeId} /> : null}
      {formState.message ? (
        <p className="text-sm text-danger" role="alert">
          {formState.message}
        </p>
      ) : null}
      <Field
        label="Tenants"
        htmlFor="tenantNames"
        hint="Name every tenant who is in possession of the unit."
        error={error("tenantNames")}
      >
        <input
          id="tenantNames"
          name="tenantNames"
          defaultValue={defaults.tenantNames}
          className={textInput}
          required
        />
      </Field>
      <Field label="Rental unit address" htmlFor="unitAddress" error={error("unitAddress")}>
        <input
          id="unitAddress"
          name="unitAddress"
          defaultValue={defaults.unitAddress}
          className={textInput}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Landlord" htmlFor="landlordName" error={error("landlordName")}>
          <input
            id="landlordName"
            name="landlordName"
            defaultValue={defaults.landlordName}
            className={textInput}
            required
          />
        </Field>
        <Field
          label="Landlord phone or email"
          htmlFor="landlordContact"
          error={error("landlordContact")}
        >
          <input
            id="landlordContact"
            name="landlordContact"
            defaultValue={defaults.landlordContact}
            className={textInput}
            required
          />
        </Field>
      </div>
      <Field
        label="How often rent is paid"
        htmlFor="rentFrequency"
        hint="From September 21, 2026 the minimum is 7 days for every frequency. Before that, monthly and yearly notices needed 14 days, and daily or weekly notices needed 7."
        error={error("rentFrequency")}
      >
        <select
          id="rentFrequency"
          name="rentFrequency"
          className={textInput}
          value={rentFrequency}
          onChange={(event) => setRentFrequency(event.target.value as RentFrequency)}
        >
          {RENT_FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {RENT_FREQUENCY_LABELS[frequency]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Day you will give the notice"
          htmlFor="givenOn"
          hint="Wait until the day after rent was due. The arrears table is saved for this day."
          error={error("givenOn")}
        >
          <input
            id="givenOn"
            name="givenOn"
            type="date"
            className={textInput}
            value={givenOn}
            onChange={(event) => setGivenOn(event.target.value)}
            required
          />
        </Field>
        <Field
          label="How you will give it"
          htmlFor="serviceMethod"
          hint="Mail and Xpresspost add 5 days. Courier adds one business day."
          error={error("serviceMethod")}
        >
          <select
            id="serviceMethod"
            name="serviceMethod"
            className={textInput}
            value={serviceMethod}
            onChange={(event) => setServiceMethod(event.target.value as N4ServiceMethod)}
          >
            {N4_SERVICE_METHODS.map((method) => (
              <option key={method} value={method}>
                {N4_SERVICE_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Termination date"
        htmlFor="terminationDate"
        hint={
          plan
            ? `The notice could not legally end before ${formatDmy(earliest)}. Deemed given on ${formatDmy(plan.deemedGivenOn)}, then ${plan.noticeDays} days.`
            : "Choose the day you will give the notice first."
        }
        error={error("terminationDate")}
      >
        <input
          id="terminationDate"
          name="terminationDate"
          type="date"
          className={textInput}
          min={earliest}
          value={shownTermination}
          onChange={(event) => setTerminationDate(event.target.value)}
          required
        />
      </Field>
      <RentTable rows={rows} totalOwingCents={totalOwingCents} />
      <p className="text-sm text-muted">
        Saving stores this table. Change the give date, then save again, to
        rebuild it. The PDF stays marked DRAFT until you confirm it.
      </p>
      <SubmitButton pendingLabel="Saving">Save N4 draft</SubmitButton>
    </form>
  );
}
