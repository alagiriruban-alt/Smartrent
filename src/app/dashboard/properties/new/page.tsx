import Link from "next/link";

import { createProperty } from "@/actions/properties";
import { PropertyForm } from "@/components/property-form";

export const metadata = { title: "Add property" };

export default function NewPropertyPage() {
  return (
    <div>
      <Link href="/dashboard/properties" className="text-sm font-semibold text-pine">
        Back to properties
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a property</h1>
      <p className="mt-2 text-muted">
        Start with the address. You can add units on the next screen.
      </p>
      <div className="mt-6 max-w-xl">
        <PropertyForm
          action={createProperty}
          submitLabel="Save property"
          pendingLabel="Saving…"
        />
      </div>
    </div>
  );
}
