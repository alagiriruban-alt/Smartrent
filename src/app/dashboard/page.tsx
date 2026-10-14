import Link from "next/link";

import { primaryButton, card } from "@/components/styles";
import { formatAddress, propertyTitle } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getPortfolio } from "@/lib/dal";

export const metadata = { title: "Rent roll" };

export default async function DashboardPage() {
  const { rows, totals } = await getPortfolio();

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
