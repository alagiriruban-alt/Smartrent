"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { secondaryButton, textInput } from "@/components/styles";
import { parseInteracEmail, suggestTenant } from "@/lib/interac";
import { centsToInput } from "@/lib/money";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/lib/payment-methods";
import type { FormState } from "@/lib/validators";

type TenancyOption = {
  tenancyId: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
};

type PaymentAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function PaymentForm({
  action,
  tenancies,
  initialTenancyId,
  today,
}: {
  action: PaymentAction;
  tenancies: TenancyOption[];
  initialTenancyId?: string;
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [emailText, setEmailText] = useState("");
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [tenancyId, setTenancyId] = useState(initialTenancyId ?? "");
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("E_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const error = (key: string) => state.errors?.[key]?.[0];

  function fillFromEmail() {
    const parsed = parseInteracEmail(emailText);
    const match = suggestTenant(parsed.senderName, tenancies);
    const notes: string[] = [];
    if (parsed.amountCents) {
      setAmount(centsToInput(parsed.amountCents));
    } else {
      notes.push("No amount was found.");
    }
    if (parsed.paidOn) {
      setPaidOn(parsed.paidOn);
    }
    if (parsed.referenceNumber) {
      setReferenceNumber(parsed.referenceNumber);
    }
    if (parsed.message) {
      setNote(parsed.message);
    }
    setMethod("E_TRANSFER");
    if (match) {
      const tenant = tenancies.find((item) => item.tenancyId === match.tenancyId);
      setTenancyId(match.tenancyId);
      notes.unshift(
        tenant
          ? `This looks like a payment from ${tenant.tenantName}. Confirm the lease before you save.`
          : "A tenant matched. Confirm the lease before you save.",
      );
    } else if (parsed.senderName) {
      notes.push(
        `No single tenant matched ${parsed.senderName}. Choose the lease yourself.`,
      );
    } else {
      notes.push("No sender name was found. Choose the lease yourself.");
    }
    setParseNote(notes.join(" "));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field
        label="Interac e-Transfer email"
        htmlFor="interacEmail"
        hint="Paste the notification. Nothing is sent or saved from this box until you record the payment."
      >
        <textarea
          id="interacEmail"
          value={emailText}
          onChange={(event) => setEmailText(event.target.value)}
          rows={7}
          className={textInput}
          placeholder={"Amount: $1,450.00\nFrom: Sam Okonkwo\nDate: October 14, 2026\nReference Number: CA9F2E81B4\nMessage: October rent"}
        />
      </Field>
      <div>
        <button type="button" className={secondaryButton} onClick={fillFromEmail}>
          Fill in the payment
        </button>
      </div>
      {parseNote ? <p className="text-sm text-ink">{parseNote}</p> : null}
      <Field label="Lease" htmlFor="tenancyId" error={error("tenancyId")}>
        <select
          id="tenancyId"
          name="tenancyId"
          value={tenancyId}
          onChange={(event) => setTenancyId(event.target.value)}
          className={textInput}
          required
          aria-invalid={Boolean(error("tenancyId"))}
        >
          <option value="">Choose a lease</option>
          {tenancies.map((tenancy) => (
            <option key={tenancy.tenancyId} value={tenancy.tenancyId}>
              {tenancy.tenantName} · {tenancy.unitLabel} · {tenancy.propertyLabel}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date received" htmlFor="paidOn" error={error("paidOn")}>
          <input
            id="paidOn"
            name="paidOn"
            type="date"
            max={today}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            className={textInput}
            required
            aria-invalid={Boolean(error("paidOn"))}
          />
        </Field>
        <Field label="Amount (CAD)" htmlFor="amount" error={error("amount")}>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={textInput}
            placeholder="1450.00"
            required
            aria-invalid={Boolean(error("amount"))}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Method" htmlFor="method" error={error("method")}>
          <select
            id="method"
            name="method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className={textInput}
            aria-invalid={Boolean(error("method"))}
          >
            {PAYMENT_METHODS.map((item) => (
              <option key={item} value={item}>
                {PAYMENT_METHOD_LABELS[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Reference number"
          htmlFor="referenceNumber"
          hint="Optional. Interac confirmation numbers go here."
          error={error("referenceNumber")}
        >
          <input
            id="referenceNumber"
            name="referenceNumber"
            value={referenceNumber}
            onChange={(event) => setReferenceNumber(event.target.value)}
            className={textInput}
            aria-invalid={Boolean(error("referenceNumber"))}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="note" hint="Optional." error={error("note")}>
        <textarea
          id="note"
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={textInput}
          aria-invalid={Boolean(error("note"))}
        />
      </Field>
      <p className="text-sm text-muted">
        The payment is applied to the oldest unpaid month first. Anything left
        over waits for a later month.
      </p>
      <div>
        <SubmitButton pendingLabel="Saving…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
