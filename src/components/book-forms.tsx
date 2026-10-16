"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { secondaryButton, textInput } from "@/components/styles";
import { T776_LINES } from "@/lib/t776";
import type { FormState } from "@/lib/validators";

type BookAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function FormError({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }
  return (
    <p className="text-sm text-danger" role="alert">
      {state.message}
    </p>
  );
}

export function ChargeForm({ action, tenancyId }: { action: BookAction; tenancyId: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="Kind" htmlFor="kind">
        <select id="kind" name="kind" className={textInput} defaultValue="WATER">
          <option value="WATER">Water</option>
          <option value="UTILITIES">Utilities</option>
          <option value="FEE">Fee</option>
          <option value="LTB_FILING">LTB filing fee</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="Period" htmlFor="period" hint="Optional YYYY-MM. Leave blank if it is not for one month.">
        <input id="period" name="period" className={textInput} placeholder="2026-09" />
      </Field>
      <Field label="Description" htmlFor="description">
        <input id="description" name="description" className={textInput} required />
      </Field>
      <Field label="Amount" htmlFor="amount" error={state.errors?.amount?.[0]}>
        <input id="amount" name="amount" className={textInput} inputMode="decimal" required />
      </Field>
      <Field label="Due" htmlFor="dueOn">
        <input id="dueOn" name="dueOn" type="date" className={textInput} required />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save charge</SubmitButton>
    </form>
  );
}

export function CreditForm({ action, tenancyId }: { action: BookAction; tenancyId: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="Kind" htmlFor="kind" error={state.errors?.kind?.[0]}>
        <select id="kind" name="kind" className={textInput} defaultValue="OFFSET">
          <option value="OFFSET">Offset</option>
          <option value="IN_KIND">In kind</option>
        </select>
      </Field>
      <Field label="Amount" htmlFor="amount" error={state.errors?.amount?.[0]}>
        <input id="amount" name="amount" className={textInput} inputMode="decimal" required />
      </Field>
      <Field label="Reason" htmlFor="reason">
        <input id="reason" name="reason" className={textInput} required />
      </Field>
      <Field label="Document id" htmlFor="documentId" hint="Optional link to a document already on the lease.">
        <input id="documentId" name="documentId" className={textInput} />
      </Field>
      <Field label="Rent period" htmlFor="period" hint="Optional YYYY-MM. Blank credits the oldest open rent.">
        <input id="period" name="period" className={textInput} placeholder="2026-09" />
      </Field>
      <Field label="Date" htmlFor="effectiveOn">
        <input id="effectiveOn" name="effectiveOn" type="date" className={textInput} required />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save credit</SubmitButton>
    </form>
  );
}

export function LegalForm({ action, tenancyId }: { action: BookAction; tenancyId: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="Type" htmlFor="type">
        <select id="type" name="type" className={textInput} defaultValue="N4">
          <option value="N4">N4</option>
          <option value="L1">L1</option>
          <option value="L2">L2</option>
          <option value="N12">N12</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="Other type" htmlFor="typeDetail" hint="Used when the type is Other.">
        <input id="typeDetail" name="typeDetail" className={textInput} />
      </Field>
      <Field label="LTB file number" htmlFor="ltbFileNumber">
        <input id="ltbFileNumber" name="ltbFileNumber" className={textInput} />
      </Field>
      <Field label="Filing fee" htmlFor="filingFee">
        <input id="filingFee" name="filingFee" className={textInput} inputMode="decimal" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Served" htmlFor="servedOn">
          <input id="servedOn" name="servedOn" type="date" className={textInput} />
        </Field>
        <Field label="Filed" htmlFor="filedOn">
          <input id="filedOn" name="filedOn" type="date" className={textInput} />
        </Field>
      </div>
      <Field label="Hearing" htmlFor="hearingOn">
        <input id="hearingOn" name="hearingOn" type="date" className={textInput} />
      </Field>
      <Field label="Status" htmlFor="status">
        <select id="status" name="status" className={textInput} defaultValue="OPEN">
          <option value="OPEN">Open</option>
          <option value="SERVED">Served</option>
          <option value="FILED">Filed</option>
          <option value="HEARING_SET">Hearing set</option>
          <option value="DECIDED">Decided</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="CLOSED">Closed</option>
        </select>
      </Field>
      <Field label="Outcome" htmlFor="outcome">
        <input id="outcome" name="outcome" className={textInput} />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" name="notes" className={textInput} rows={3} />
      </Field>
      <Field label="Reason" htmlFor="reason" hint="Required when you change a case that is already saved.">
        <input id="reason" name="reason" className={textInput} defaultValue="Recorded on the lease" />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save case</SubmitButton>
    </form>
  );
}

export function ExpenseForm({ action, propertyId }: { action: BookAction; propertyId: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field label="Date" htmlFor="incurredOn">
        <input id="incurredOn" name="incurredOn" type="date" className={textInput} required />
      </Field>
      <Field label="Vendor" htmlFor="vendor">
        <input id="vendor" name="vendor" className={textInput} />
      </Field>
      <Field label="Invoice number" htmlFor="invoiceNumber">
        <input id="invoiceNumber" name="invoiceNumber" className={textInput} />
      </Field>
      <Field label="Description" htmlFor="description">
        <input id="description" name="description" className={textInput} required />
      </Field>
      <Field label="T776 category" htmlFor="category">
        <select id="category" name="category" className={textInput} defaultValue="REPAIRS_MAINTENANCE">
          {T776_LINES.map((line) => (
            <option key={line.category} value={line.category}>
              {line.line} {line.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subtotal" htmlFor="subtotal">
          <input id="subtotal" name="subtotal" className={textInput} inputMode="decimal" required />
        </Field>
        <Field label="HST" htmlFor="hst">
          <input id="hst" name="hst" className={textInput} inputMode="decimal" required defaultValue="0.00" />
        </Field>
      </div>
      <Field label="Receipt document id" htmlFor="receiptDocumentId">
        <input id="receiptDocumentId" name="receiptDocumentId" className={textInput} />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save expense</SubmitButton>
    </form>
  );
}

export function OwnersForm({
  action,
  propertyId,
  initial,
}: {
  action: BookAction;
  propertyId: string;
  initial: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-4 flex max-w-xl flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field label="Owners" htmlFor="owners" hint="One per line, such as Avery Chen, 50.">
        <textarea id="owners" name="owners" className={textInput} rows={4} defaultValue={initial} />
      </Field>
      <Field label="Reason" htmlFor="reason">
        <input id="reason" name="reason" className={textInput} required defaultValue="Ownership recorded" />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save owners</SubmitButton>
    </form>
  );
}

export function ImportStageForm({ action, propertyId }: { action: BookAction; propertyId: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <FormError state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field label="File name" htmlFor="sourceName">
        <input id="sourceName" name="sourceName" className={textInput} defaultValue="bundle.json" />
      </Field>
      <Field label="JSON or CSV" htmlFor="raw">
        <textarea id="raw" name="raw" className={`${textInput} min-h-48 font-mono text-sm`} required />
      </Field>
      <SubmitButton pendingLabel="Staging…">Stage for review</SubmitButton>
    </form>
  );
}

export function ReviewRowForm({
  action,
  propertyId,
  batchId,
  rowId,
  periodOverride,
}: {
  action: BookAction;
  propertyId: string;
  batchId: string;
  rowId: string;
  periodOverride: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <FormError state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <Field label="Period" htmlFor={`period-${rowId}`}>
        <input
          id={`period-${rowId}`}
          name="periodOverride"
          defaultValue={periodOverride}
          placeholder="YYYY-MM"
          className={`${textInput} w-32`}
        />
      </Field>
      <button name="status" value="APPROVED" className={secondaryButton} type="submit">
        Approve
      </button>
      <button name="status" value="REJECTED" className={secondaryButton} type="submit">
        Reject
      </button>
    </form>
  );
}

export function CommitBatchForm({
  action,
  propertyId,
  batchId,
}: {
  action: BookAction;
  propertyId: string;
  batchId: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6">
      <FormError state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton pendingLabel="Committing…">Commit approved rows</SubmitButton>
    </form>
  );
}

export function CorrectionForm({
  action,
  tenancyId,
  chargeId,
  label,
}: {
  action: BookAction;
  tenancyId: string;
  chargeId: string;
  label: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="chargeId" value={chargeId} />
      <Field label={`Correct ${label}`} htmlFor={`amount-${chargeId}`}>
        <input id={`amount-${chargeId}`} name="amount" className={textInput} inputMode="decimal" required />
      </Field>
      <Field label="Reason" htmlFor={`reason-${chargeId}`}>
        <input id={`reason-${chargeId}`} name="reason" className={textInput} required />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save correction</SubmitButton>
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
    </form>
  );
}
