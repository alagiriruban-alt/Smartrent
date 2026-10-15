"use client";

import { useActionState } from "react";

import {
  saveN4CopyAction,
  saveNoticeCopyAction,
  type DocumentFormState,
} from "@/actions/documents";
import { SubmitButton } from "@/components/submit-button";

const initial: DocumentFormState = {};

export function SaveNoticeCopyForm({
  noticeId,
  label,
}: {
  noticeId: string;
  label: string;
}) {
  const [state, formAction] = useActionState(saveNoticeCopyAction, initial);
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="noticeId" value={noticeId} />
      {state.message ? (
        <p className={state.documentId ? "text-sm font-semibold text-pine" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Saving…">{label}</SubmitButton>
    </form>
  );
}

export function SaveN4CopyForm({ tenancyId }: { tenancyId: string }) {
  const [state, formAction] = useActionState(saveN4CopyAction, initial);
  return (
    <form action={formAction} className="mt-4 flex flex-col items-start gap-2">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <p className="text-sm text-muted">
        Optional. Saves a draft PDF on this lease. It is not the official form
        and it is not served.
      </p>
      {state.message ? (
        <p className={state.documentId ? "text-sm font-semibold text-pine" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save N4 draft in Documents</SubmitButton>
    </form>
  );
}
