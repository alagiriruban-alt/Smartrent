"use client";

import { useActionState } from "react";

import { recordN4ServiceAction } from "@/actions/n4";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import {
  N4_SERVICE_METHODS,
  N4_SERVICE_METHOD_LABELS,
  type N4ServiceMethod,
} from "@/lib/n4/rules";

export function N4ServeForm({
  tenancyId,
  noticeId,
  defaultServedOn,
  defaultMethod,
}: {
  tenancyId: string;
  noticeId: string;
  defaultServedOn: string;
  defaultMethod: N4ServiceMethod;
}) {
  const [state, action] = useActionState(recordN4ServiceAction, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="noticeId" value={noticeId} />
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Day you gave the notice"
          htmlFor="servedOn"
          error={error("servedOn")}
        >
          <input
            id="servedOn"
            name="servedOn"
            type="date"
            defaultValue={defaultServedOn}
            className={textInput}
            required
          />
        </Field>
        <Field label="How you gave it" htmlFor="servedMethod" error={error("serviceMethod")}>
          <select
            id="servedMethod"
            name="serviceMethod"
            defaultValue={defaultMethod}
            className={textInput}
          >
            {N4_SERVICE_METHODS.map((method) => (
              <option key={method} value={method}>
                {N4_SERVICE_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving">Record service</SubmitButton>
    </form>
  );
}
