"use client";

import { useActionState } from "react";

import { createAgentToken, type AgentTokenFormState } from "@/actions/agent-access";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";

const initial: AgentTokenFormState = {};

export function AgentTokenForm() {
  const [state, formAction] = useActionState(createAgentToken, initial);
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.token ? (
        <div className="rounded-md border border-pine/40 bg-white p-3" role="status">
          <p className="text-sm font-semibold">
            Copy {state.tokenName}. It will not be shown again.
          </p>
          <p className="mt-2 break-all font-mono text-sm">{state.token}</p>
        </div>
      ) : null}
      <Field label="Name" htmlFor="name" error={error("name")} hint="For example, Grok Bot.">
        <input id="name" name="name" required className={textInput} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">What it can do</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="access" value="read" defaultChecked />
          Read the rent roll, ledger, reminders, and receipts
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="access" value="write" />
          Read, and also record payments and save N4 drafts
        </label>
        {error("access") ? (
          <p className="text-sm text-danger" role="alert">
            {error("access")}
          </p>
        ) : null}
      </fieldset>
      <div>
        <SubmitButton pendingLabel="Creating…">Create token</SubmitButton>
      </div>
    </form>
  );
}
