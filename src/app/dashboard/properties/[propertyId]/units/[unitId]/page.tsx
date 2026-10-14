import Link from "next/link";

import { deleteUnit } from "@/actions/units";
import { deleteTenant } from "@/actions/tenants";
import { DeleteForm } from "@/components/delete-form";
import { card, secondaryButton } from "@/components/styles";
import { getUnit } from "@/lib/dal";
import { formatLongDate, utcToDateOnly } from "@/lib/dates";
import {
  bedroomLabel,
  formatAddress,
  ordinal,
  propertyTitle,
  tenantName,
} from "@/lib/format";
import { formatCad } from "@/lib/money";
import { tenancyPhase, type TenancyPhase } from "@/lib/portfolio";

const phaseLabel: Record<TenancyPhase, string> = {
  current: "Current lease",
  upcoming: "Upcoming lease",
  ended: "Ended lease",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ propertyId: string; unitId: string }>;
}) {
  const { propertyId, unitId } = await params;
  const { unit } = await getUnit(propertyId, unitId);
  return { title: unit.label };
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ propertyId: string; unitId: string }>;
}) {
  const { propertyId, unitId } = await params;
  const { property, unit, today } = await getUnit(propertyId, unitId);
  const leases = unit.tenancies.map((tenancy) => ({
    tenancy,
    phase: tenancyPhase(
      {
        leaseStart: utcToDateOnly(tenancy.leaseStart),
        leaseEnd: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : null,
        monthlyRentCents: tenancy.monthlyRentCents,
        status: tenancy.status,
      },
      today,
    ),
  }));
  const beds = bedroomLabel(unit.bedrooms);

  return (
    <div>
      <Link
        href={`/dashboard/properties/${property.id}`}
        className="text-sm font-semibold text-pine"
      >
        Back to {propertyTitle(property)}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{unit.label}</h1>
          <p className="mt-2 text-muted">{formatAddress(property)}</p>
          {beds ? <p className="mt-1 text-sm">{beds}</p> : null}
        </div>
        <Link
          href={`/dashboard/properties/${property.id}/units/${unit.id}/edit`}
          className={secondaryButton}
        >
          Edit unit
        </Link>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Tenants</h2>
          <Link
            href={`/dashboard/properties/${property.id}/units/${unit.id}/tenants/new`}
            className={secondaryButton}
          >
            Add a tenant
          </Link>
        </div>
        {leases.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>This unit is vacant.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {leases.map(({ tenancy, phase }) => (
              <li key={tenancy.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gold">
                    {phaseLabel[phase]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/tenancies/${tenancy.id}/rent`}
                      className={secondaryButton}
                    >
                      Rent ledger
                    </Link>
                    <Link
                      href={`/dashboard/tenancies/${tenancy.id}/edit`}
                      className={secondaryButton}
                    >
                      Edit tenant
                    </Link>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Name</dt>
                    <dd className="font-semibold">{tenantName(tenancy.tenant)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Monthly rent</dt>
                    <dd className="font-semibold">
                      {formatCad(tenancy.monthlyRentCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Due</dt>
                    <dd>The {ordinal(tenancy.rentDueDay)} of each month</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Lease</dt>
                    <dd>
                      {formatLongDate(utcToDateOnly(tenancy.leaseStart))}
                      {" – "}
                      {tenancy.leaseEnd
                        ? formatLongDate(utcToDateOnly(tenancy.leaseEnd))
                        : "month-to-month"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Email</dt>
                    <dd>{tenancy.tenant.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Phone</dt>
                    <dd>{tenancy.tenant.phone ?? "—"}</dd>
                  </div>
                </dl>
                <div className="mt-6 border-t border-line pt-4">
                  <DeleteForm
                    action={deleteTenant}
                    id={tenancy.id}
                    label="Remove tenant"
                    confirm="I understand this removes the tenant and this lease."
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-xl">Delete this unit</h2>
        <div className="mt-3">
          <DeleteForm
            action={deleteUnit}
            id={unit.id}
            hidden={{ propertyId: property.id }}
            label="Delete unit"
            confirm="I understand this deletes the unit and any tenant on it."
          />
        </div>
      </section>
    </div>
  );
}
