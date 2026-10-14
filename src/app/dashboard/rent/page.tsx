import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { card, primaryButton } from "@/components/styles";
import { balancePhrase, daysLateLabel } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getRentOverview } from "@/lib/rent-data";

export const metadata = { title: "Rent" };

export default async function RentPage() {
  const rent = await getRentOverview();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
            Ledger
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">Rent</h1>
          <p className="mt-2 text-muted">
            {formatCad(rent.collectedCents)} of {formatCad(rent.expectedCents)}{" "}
            collected for {rent.monthLabel}.
          </p>
        </div>
        <Link href="/dashboard/rent/payments/new" className={primaryButton}>
          Record a payment
        </Link>
      </div>

      {rent.rows.length === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          Add a tenant before recording rent.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rent.rows.map((row) => (
            <li key={row.tenancyId}>
              <Link
                href={`/dashboard/tenancies/${row.tenancyId}/rent`}
                className={`${card} block p-4 transition-colors hover:border-pine`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{row.tenantName}</h2>
                      {row.monthStatus ? (
                        <StatusPill status={row.monthStatus} />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {row.unitLabel} · {row.propertyLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-2xl tabular-nums">
                      {balancePhrase(row.balanceCents)}
                    </p>
                    {row.arrearsCents > 0 ? (
                      <p className="text-sm text-danger">
                        {formatCad(row.arrearsCents)} in arrears ·{" "}
                        {daysLateLabel(row.daysLate)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">No arrears</p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
