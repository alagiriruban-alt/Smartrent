import Link from "next/link";

import { updateUnit } from "@/actions/units";
import { UnitForm } from "@/components/unit-form";
import { getUnit } from "@/lib/dal";

export const metadata = { title: "Edit unit" };

export default async function EditUnitPage({
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
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Edit unit</h1>
      <div className="mt-6 max-w-xl">
        <UnitForm
          action={updateUnit}
          propertyId={property.id}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          initial={unit}
        />
      </div>
    </div>
  );
}
