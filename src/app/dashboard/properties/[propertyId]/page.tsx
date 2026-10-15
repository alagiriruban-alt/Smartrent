import Link from "next/link";

import { deleteProperty } from "@/actions/properties";
import { DeleteForm } from "@/components/delete-form";
import { card, secondaryButton } from "@/components/styles";
import { getProperty } from "@/lib/dal";
import { formatLongDate, utcToDateOnly } from "@/lib/dates";
import {
  bedroomLabel,
  formatAddress,
  ordinal,
  propertyTitle,
  tenantName,
} from "@/lib/format";
import { formatCad } from "@/lib/money";
import { tenancyPhase } from "@/lib/portfolio";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  try {
    const { property } = await getProperty(propertyId);
    return { title: propertyTitle(property) };
  } catch {
    return { title: "Property" };
  }
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { property, today, summary } = await getProperty(propertyId);

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/dashboard/properties" className="text-sm font-semibold text-pine">
          Back to properties
        </Link>
        <Link href="/dashboard" className="text-sm font-semibold text-pine">
          Rent roll
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">
            {propertyTitle(property)}
          </h1>
          <p className="mt-2 text-muted">{formatAddress(property)}</p>
          <p className="mt-2 text-sm">
            {summary.occupiedCount} of {summary.unitCount}{" "}
            {summary.unitCount === 1 ? "unit" : "units"} occupied ·{" "}
            {formatCad(summary.monthlyRentCents)} / month
          </p>
        </div>
        <Link
          href={`/dashboard/properties/${property.id}/edit`}
          className={secondaryButton}
        >
          Edit property
        </Link>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Units</h2>
        <Link
          href={`/dashboard/properties/${property.id}/units/new`}
          className={secondaryButton}
        >
          Add a unit
        </Link>
      </div>

      {property.units.length === 0 ? (
        <p className={`${card} mt-4 p-4 text-muted`}>
          No units yet. Add the suites, floors, or rooms you rent out.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {property.units.map((unit) => {
            const phased = unit.tenancies.map((tenancy) => ({
              tenancy,
              phase: tenancyPhase(
                {
                  leaseStart: utcToDateOnly(tenancy.leaseStart),
                  leaseEnd: tenancy.leaseEnd
                    ? utcToDateOnly(tenancy.leaseEnd)
                    : null,
                  monthlyRentCents: tenancy.monthlyRentCents,
                  status: tenancy.status,
                },
                today,
              ),
            }));
            const current = phased.find((item) => item.phase === "current")?.tenancy;
            const upcoming = phased
              .filter((item) => item.phase === "upcoming")
              .map((item) => item.tenancy)
              .sort((a, b) => a.leaseStart.getTime() - b.leaseStart.getTime())[0];
            const shown = current ?? upcoming;
            const beds = bedroomLabel(unit.bedrooms);
            return (
              <li key={unit.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">
                      <Link
                        href={`/dashboard/properties/${property.id}/units/${unit.id}`}
                        className="hover:text-pine"
                      >
                        {unit.label}
                      </Link>
                    </h3>
                    {beds ? <p className="text-sm text-muted">{beds}</p> : null}
                  </div>
                  <p className="font-serif text-xl tabular-nums">
                    {current
                      ? formatCad(current.monthlyRentCents)
                      : upcoming
                        ? "Upcoming"
                        : "Vacant"}
                  </p>
                </div>
                {shown ? (
                  <p className="mt-3 text-sm">
                    {upcoming && !current ? "Starts later · " : null}
                    {tenantName(shown.tenant)} · due on the{" "}
                    {ordinal(shown.rentDueDay)} ·{" "}
                    {formatLongDate(utcToDateOnly(shown.leaseStart))}
                    {shown.leaseEnd
                      ? ` to ${formatLongDate(utcToDateOnly(shown.leaseEnd))}`
                      : " · month-to-month"}
                    {" · "}
                    <Link
                      href={`/dashboard/tenancies/${shown.id}/rent`}
                      className="font-semibold text-pine"
                    >
                      Rent ledger
                    </Link>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted">No current lease.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-xl">Delete this property</h2>
        <p className="mt-1 text-sm text-muted">
          This removes the property, its units, and the tenants on those units.
        </p>
        <div className="mt-3">
          <DeleteForm
            action={deleteProperty}
            id={property.id}
            label="Delete property"
            confirm="I understand this deletes the property, its units, and their tenants."
          />
        </div>
      </section>
    </div>
  );
}
