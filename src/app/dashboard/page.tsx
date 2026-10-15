import Link from "next/link";

import { IncreaseList } from "@/components/increase-list";
import { secondaryButton, card } from "@/components/styles";
import { daysLateLabel } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getIncreaseBoard, getPortfolio } from "@/lib/dal";
import { getRentOverview } from "@/lib/rent-data";

export const metadata = { title: "Rent roll" };

export default async function DashboardPage() {
  const [{ totals }, rent, increases] = await Promise.all([
    getPortfolio(),
    getRentOverview(),
    getIncreaseBoard(),
  ]);
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
            <Link href="/dashboard/properties" className="font-semibold text-pine">
              {totals.properties}{" "}
              {totals.properties === 1 ? "property" : "properties"}
            </Link>
          </p>
        </div>
        <Link href="/dashboard/properties" className={secondaryButton}>
          Properties
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
          {" · "}
          <Link href="/dashboard/rent" className="font-semibold text-pine">
            Open the ledger
          </Link>
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
              <li key={tenant.tenancyId}>
                <div
                  className={`${card} p-4 transition-colors hover:border-danger/40`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        <Link
                          href={`/dashboard/tenancies/${tenant.tenancyId}/rent`}
                          className="hover:text-pine"
                        >
                          {tenant.tenantName}
                        </Link>
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        <Link
                          href={`/dashboard/properties/${tenant.propertyId}/units/${tenant.unitId}`}
                          className="hover:text-ink"
                        >
                          {tenant.unitLabel}
                        </Link>
                        {" · "}
                        <Link
                          href={`/dashboard/properties/${tenant.propertyId}`}
                          className="hover:text-ink"
                        >
                          {tenant.propertyLabel}
                        </Link>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-2xl tabular-nums text-danger">
                        <Link
                          href={`/dashboard/tenancies/${tenant.tenancyId}/rent`}
                          className="hover:text-pine"
                        >
                          {formatCad(tenant.arrearsCents)}
                        </Link>
                      </p>
                      <p className="text-sm text-danger">
                        {daysLateLabel(tenant.daysLate)}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {totals.properties === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          No properties yet.{" "}
          <Link href="/dashboard/properties/new" className="font-semibold text-pine">
            Add a property
          </Link>{" "}
          before recording rent.
        </p>
      ) : null}
    </div>
  );
}
