import Link from "next/link";

import { updateProperty } from "@/actions/properties";
import { PropertyForm } from "@/components/property-form";
import { getProperty } from "@/lib/dal";
import { propertyTitle } from "@/lib/format";

export const metadata = { title: "Edit property" };

export default async function EditPropertyPage({
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
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Edit property</h1>
      <div className="mt-6 max-w-xl">
        <PropertyForm
          action={updateProperty}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          initial={property}
        />
      </div>
    </div>
  );
}
