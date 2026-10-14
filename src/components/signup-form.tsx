"use client";

import { useActionState } from "react";

import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import type { FormState } from "@/lib/validators";

export function SignupForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const error = (key: string) => state.errors?.[key]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Field label="Your name" htmlFor="name" error={error("name")}>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          className={textInput}
          aria-invalid={Boolean(error("name"))}
        />
      </Field>
      <Field label="Email" htmlFor="email" error={error("email")}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={textInput}
          aria-invalid={Boolean(error("email"))}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters, with a letter and a number."
        error={error("password")}
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={textInput}
          aria-invalid={Boolean(error("password"))}
        />
      </Field>
      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        error={error("confirmPassword")}
      >
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={textInput}
          aria-invalid={Boolean(error("confirmPassword"))}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </div>
    </form>
  );
}
