"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import type { FormState } from "@/lib/validators";

export function LoginForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field label="Email" htmlFor="email" error={state.errors?.email?.[0]}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={textInput}
          aria-invalid={Boolean(state.errors?.email)}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={state.errors?.password?.[0]}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={textInput}
          aria-invalid={Boolean(state.errors?.password)}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </div>
    </form>
  );
}
