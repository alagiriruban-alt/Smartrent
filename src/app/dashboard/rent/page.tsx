import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { card, primaryButton, secondaryButton } from "@/components/styles";
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
            collected for {rent.monthLabel}.{" "}
            <Link href="/dashboard" className="font-semibold text-pine">
              Rent roll
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/properties" className={secondaryButton}>
            Properties
          </Link>
          <Link href="/dashboard/rent/payments/new" className={primaryButton}>
            Record a payment
          </Link>
        </div>
      </div>

      {rent.rows.length === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          <Link href="/dashboard/properties" className="font-semibold text-pine">
            Add a property
          </Link>{" "}
          and a tenant before recording rent.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rent.rows.map((row) => (
            <li key={row.tenancyId} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      <Link
                        href={`/dashboard/tenancies/${row.tenancyId}/rent`}
                        className="hover:text-pine"
                      >
                        {row.tenantName}
                      </Link>
                    </h2>
                    {row.monthStatus ? (
                      <StatusPill status={row.monthStatus} />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <Link
                      href={`/dashboard/properties/${row.propertyId}/units/${row.unitId}`}
                      className="hover:text-ink"
                    >
                      {row.unitLabel}
                    </Link>
                    {" · "}
                    <Link
                      href={`/dashboard/properties/${row.propertyId}`}
                      className="hover:text-ink"
                    >
                      {row.propertyLabel}
                    </Link>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-2xl tabular-nums">
                    <Link
                      href={`/dashboard/tenancies/${row.tenancyId}/rent`}
                      className="hover:text-pine"
                    >
                      {balancePhrase(row.balanceCents)}
                    </Link>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
