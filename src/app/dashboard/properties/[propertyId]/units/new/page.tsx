import Link from "next/link";

import { createUnit } from "@/actions/units";
import { UnitForm } from "@/components/unit-form";
import { getProperty } from "@/lib/dal";
import { propertyTitle } from "@/lib/format";

export const metadata = { title: "Add unit" };

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { property } = await getProperty(propertyId);

  return (
    <div>
      <Link
        href={`/dashboard/properties/${property.id}`}
        className="text-sm font-semibold text-pine"
      >
        Back to {propertyTitle(property)}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a unit</h1>
      <p className="mt-2 text-muted">
        A unit is one rentable space: a suite, a floor, or a whole house.
      </p>
      <div className="mt-6 max-w-xl">
        <UnitForm
          action={createUnit}
          propertyId={property.id}
          submitLabel="Save unit"
          pendingLabel="Saving…"
        />
      </div>
    </div>
  );
}
