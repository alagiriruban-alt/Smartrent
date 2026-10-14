import { CHARGE_STATUS_LABELS, type ChargeStatus } from "@/lib/ledger";

const tones: Record<ChargeStatus, string> = {
  PAID: "bg-[#e5f2eb] text-pine",
  DUE: "bg-[#f3ead7] text-gold",
  PARTIAL: "bg-[#f3ead7] text-gold",
  LATE: "bg-danger-soft text-danger",
};

export function StatusPill({ status }: { status: ChargeStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${tones[status]}`}
    >
      {CHARGE_STATUS_LABELS[status]}
    </span>
  );
}
