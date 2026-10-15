import Link from "next/link";

import { IncreaseList } from "@/components/increase-list";
import { N4LateLink } from "@/components/n4-late-link";
import { primaryButton, secondaryButton, card } from "@/components/styles";
import { formatAddress, propertyTitle, daysLateLabel } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getIncreaseBoard, getPortfolio } from "@/lib/dal";
import { getRentOverview } from "@/lib/rent-data";

export const metadata = { title: "Rent roll" };

export default async function DashboardPage() {
  const { rows, totals } = await getPortfolio();
  const rent = await getRentOverview();
  const increases = await getIncreaseBoard();
  const upcomingIncreases = increases.rows.filter((row) => row.alerts.length > 0);
  const collectedPct =
    rent.expectedCents === 0
      ? 0
      : Math.min(100, Math.round((rent.collectedCents / rent.expectedCents) * 100));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
            Rent roll
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">
            {formatCad(totals.monthlyRentCents)}
            <span className="ml-2 font-sans text-base font-normal text-muted">
              expected this month
            </span>
          </h1>
          <p className="mt-2 text-muted">
            {totals.occupiedCount} of {totals.unitCount}{" "}
            {totals.unitCount === 1 ? "unit" : "units"} occupied
            {" · "}
            {totals.properties}{" "}
            {totals.properties === 1 ? "property" : "properties"}
          </p>
        </div>
        <Link href="/dashboard/properties/new" className={primaryButton}>
          Add a property
        </Link>
      </div>

      <section className={`${card} mt-8 p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
              {rent.monthLabel}
            </p>
            <h2 className="mt-1 font-serif text-3xl tracking-tight">
              {formatCad(rent.collectedCents)}
              <span className="ml-2 font-sans text-base font-normal text-muted">
                collected of {formatCad(rent.expectedCents)} expected
              </span>
            </h2>
          </div>
          <Link href="/dashboard/rent/payments/new" className={secondaryButton}>
            Record a payment
          </Link>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-pine"
            style={{ width: `${collectedPct}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          {formatCad(rent.outstandingCents)} still to collect this month
        </p>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-2xl">Rent increase alerts</h2>
          <Link href="/dashboard/rent-increases" className="text-sm font-semibold text-pine">
            All increases
          </Link>
        </div>
        <IncreaseList
          rows={upcomingIncreases}
          empty="No increase is eligible in the next 120 days."
        />
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Late and in arrears</h2>
        {rent.late.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No one is past due.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rent.late.map((tenant) => (
              <li key={tenant.tenancyId} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/tenancies/${tenant.tenancyId}/rent`}
                      className="font-semibold text-ink"
                    >
                      {tenant.tenantName}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {tenant.unitLabel} · {tenant.propertyLabel}
                    </p>
                    <p className="mt-2">
                      <N4LateLink tenancyId={tenant.tenancyId} notice={tenant.n4} />
                    </p>
                  </div>
                    <div className="text-right">
                      <p className="font-serif text-2xl tabular-nums text-danger">
                        {formatCad(tenant.arrearsCents)}
                      </p>
                      <p className="text-sm text-danger">
                        {daysLateLabel(tenant.daysLate)}
                      </p>
                    </div>
                  </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length === 0 ? (
        <div className={`${card} mt-8 p-6`}>
          <h2 className="font-serif text-2xl">No properties yet</h2>
          <p className="mt-2 max-w-md text-muted">
            Add a house, duplex, or condo. Then add the units inside it and
            the tenant on each lease.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rows.map(({ property, summary }) => (
            <li key={property.id}>
              <Link
                href={`/dashboard/properties/${property.id}`}
                className={`${card} block p-4 transition-colors hover:border-pine`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl tracking-tight">
                      {propertyTitle(property)}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {formatAddress(property)}
                    </p>
                  </div>
                  <p className="font-serif text-2xl tabular-nums">
                    {formatCad(summary.monthlyRentCents)}
                  </p>
                </div>
                <p className="mt-3 text-sm">
                  {summary.occupiedCount} of {summary.unitCount}{" "}
                  {summary.unitCount === 1 ? "unit" : "units"} occupied
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
