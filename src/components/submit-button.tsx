"use client";

import { useFormStatus } from "react-dom";

import { primaryButton } from "@/components/styles";

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={primaryButton} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
