import Link from "next/link";

import { createTenant } from "@/actions/tenants";
import { TenantForm } from "@/components/tenant-form";
import { getUnit } from "@/lib/dal";

export const metadata = { title: "Add tenant" };

export default async function NewTenantPage({
  params,
}: {
  params: Promise<{ propertyId: string; unitId: string }>;
}) {
  const { propertyId, unitId } = await params;
  const { property, unit } = await getUnit(propertyId, unitId);

  return (
    <div>
      <Link
        href={`/dashboard/properties/${property.id}/units/${unit.id}`}
        className="text-sm font-semibold text-pine"
      >
        Back to {unit.label}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a tenant</h1>
      <p className="mt-2 text-muted">
        This creates the contact and the lease for {unit.label}.
      </p>
      <div className="mt-6 max-w-xl">
        <TenantForm
          action={createTenant}
          propertyId={property.id}
          unitId={unit.id}
          submitLabel="Save tenant"
          pendingLabel="Saving…"
        />
      </div>
    </div>
  );
}
