import Link from "next/link";

import { updateTenant } from "@/actions/tenants";
import { TenantForm } from "@/components/tenant-form";
import { getTenancy } from "@/lib/dal";
import { utcToDateOnly } from "@/lib/dates";
import { centsToInput } from "@/lib/money";

export const metadata = { title: "Edit tenant" };

export default async function EditTenancyPage({
  params,
}: {
  params: Promise<{ tenancyId: string }>;
}) {
  const { tenancyId } = await params;
  const tenancy = await getTenancy(tenancyId);

  return (
    <div>
      <Link
        href={`/dashboard/properties/${tenancy.unit.propertyId}/units/${tenancy.unitId}`}
        className="text-sm font-semibold text-pine"
      >
        Back to {tenancy.unit.label}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Edit tenant</h1>
      <div className="mt-6 max-w-xl">
        <TenantForm
          action={updateTenant}
          tenancyId={tenancy.id}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          initial={{
            firstName: tenancy.tenant.firstName,
            lastName: tenancy.tenant.lastName,
            email: tenancy.tenant.email,
            phone: tenancy.tenant.phone,
            leaseStart: utcToDateOnly(tenancy.leaseStart),
            leaseEnd: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : "",
            monthlyRent: centsToInput(tenancy.monthlyRentCents),
            rentDueDay: tenancy.rentDueDay,
          }}
        />
      </div>
    </div>
  );
}
