import Link from "next/link";

import { card } from "@/components/styles";
import { formatLongDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";
import type { IncreaseAlert } from "@/lib/rent-increase/rules";
import type { IncreaseBoardRow } from "@/lib/services/rent-increase";

const alertCopy: Record<IncreaseAlert, string> = {
  eligible_soon: "Eligible within 120 days",
  serve_by_reminder: "Reminder: the serve-by date is within 14 days",
};

export function IncreaseList({
  rows,
  empty,
}: {
  rows: IncreaseBoardRow[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className={`${card} mt-4 p-4 text-muted`}>{empty}</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.tenancyId}>
          <Link
            href={
              row.supported
                ? `/dashboard/tenancies/${row.tenancyId}/rent-increase`
                : `/dashboard/properties/${row.propertyId}`
            }
            className={`${card} block p-4 transition-colors hover:border-pine`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.tenantName}</p>
                <p className="mt-1 text-sm text-muted">
                  {row.unitLabel} · {row.propertyLabel}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {row.formCode ?? row.province}
                {row.guidelineExempt ? " · guideline exempt" : ""}
              </p>
            </div>
            {row.eligibleOn && row.serveBy ? (
              <p className="mt-3 text-sm">
                Next eligible {formatLongDate(row.eligibleOn)}
                {" · "}
                Serve by {formatLongDate(row.serveBy)}
                {" · "}
                {formatCad(row.monthlyRentCents)} now
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Rent increase rules for this province are not available yet.
              </p>
            )}
            {row.alerts.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm font-semibold text-gold">
                {row.alerts.map((alert) => (
                  <li
                    key={alert}
                    className={alert === "serve_by_reminder" ? "text-danger" : undefined}
                  >
                    {alertCopy[alert]}
                  </li>
                ))}
              </ul>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
