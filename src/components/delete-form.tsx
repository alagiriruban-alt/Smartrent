"use client";

import { useActionState } from "react";

import { dangerButton } from "@/components/styles";
import type { FormState } from "@/lib/validators";

type DeleteAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function DeleteForm({
  action,
  id,
  hidden,
  label,
  confirm,
}: {
  action: DeleteAction;
  id: string;
  hidden?: Record<string, string>;
  label: string;
  confirm: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {hidden
        ? Object.entries(hidden).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
        <span>{confirm}</span>
      </label>
      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <div>
        <button type="submit" className={dangerButton} disabled={pending}>
          {pending ? "Deleting…" : label}
        </button>
      </div>
    </form>
  );
}
