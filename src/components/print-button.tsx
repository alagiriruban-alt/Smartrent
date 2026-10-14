"use client";

import { secondaryButton } from "@/components/styles";

export function PrintButton() {
  return (
    <button
      type="button"
      className={`${secondaryButton} print:hidden`}
      onClick={() => window.print()}
    >
      Print or save as PDF
    </button>
  );
}
