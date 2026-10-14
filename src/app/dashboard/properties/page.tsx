import Link from "next/link";

import { primaryButton, card } from "@/components/styles";
import { getPortfolio } from "@/lib/dal";
import { formatAddress, propertyTitle } from "@/lib/format";
import { formatCad } from "@/lib/money";

export const metadata = { title: "Properties" };

export default async function PropertiesPage() {
  const { rows, totals } = await getPortfolio();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
            Properties
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">
            {totals.properties}{" "}
            {totals.properties === 1 ? "property" : "properties"}
          </h1>
          <p className="mt-2 text-muted">
            {totals.occupiedCount} of {totals.unitCount}{" "}
            {totals.unitCount === 1 ? "unit" : "units"} occupied
            {" · "}
            <Link href="/dashboard" className="font-semibold text-pine">
              Rent roll
            </Link>
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
            the tenant on each lease. Rent for those leases shows on the{" "}
            <Link href="/dashboard" className="font-semibold text-pine">
              rent roll
            </Link>
            .
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
