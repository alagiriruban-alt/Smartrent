"use client";

import { useState } from "react";

import { secondaryButton } from "@/components/styles";

export function CopyMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={secondaryButton}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy message"}
    </button>
  );
}
