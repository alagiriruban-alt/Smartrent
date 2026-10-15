"use client";

import { useActionState } from "react";

import { uploadDocumentAction, type DocumentFormState } from "@/actions/documents";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { textInput } from "@/components/styles";
import {
  DOCUMENT_KIND_LABELS,
  UPLOAD_KINDS,
} from "@/lib/documents/catalog";
import type { UploadTarget } from "@/lib/services/documents";

const initial: DocumentFormState = {};

function targetValue(target: UploadTarget): string {
  return `${target.subject}:${target.id}`;
}

export function DocumentUploadForm({ targets }: { targets: UploadTarget[] }) {
  const [state, formAction] = useActionState(uploadDocumentAction, initial);
  const error = (key: string) => state.errors?.[key]?.[0];
  const saved = Boolean(state.documentId);

  if (targets.length === 0) {
    return <p className="text-sm text-muted">Add a property before uploading a file.</p>;
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {saved ? (
        <p className="text-sm font-semibold text-pine" role="status">
          {state.message}
        </p>
      ) : state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      {targets.length === 1 ? (
        <input type="hidden" name="target" value={targetValue(targets[0])} />
      ) : (
        <Field label="Attach to" htmlFor="target" error={error("target")}>
          <select
            id="target"
            name="target"
            className={textInput}
            defaultValue={targetValue(targets[0])}
            aria-invalid={Boolean(error("target"))}
          >
            {targets.map((target) => (
              <option key={targetValue(target)} value={targetValue(target)}>
                {target.group}: {target.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Category" htmlFor="kind" error={error("kind")}>
        <select id="kind" name="kind" className={textInput} defaultValue="LEASE">
          {UPLOAD_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {DOCUMENT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Expiry date"
        htmlFor="expiresOn"
        hint="Optional. Use this for insurance, ID, or anything else that runs out."
        error={error("expiresOn")}
      >
        <input id="expiresOn" name="expiresOn" type="date" className={textInput} />
      </Field>
      <Field
        label="File"
        htmlFor="file"
        hint="PDF, JPG, PNG, HEIC, or DOCX. 10 MB maximum."
        error={error("file")}
      >
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.docx,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="text-sm"
          aria-invalid={Boolean(error("file"))}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
      </div>
    </form>
  );
}
