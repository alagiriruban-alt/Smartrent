import Link from "next/link";

import { createExpense } from "@/actions/books";
import { ExpenseForm } from "@/components/book-forms";
import { getProperty } from "@/lib/dal";
import { propertyTitle } from "@/lib/format";

export const metadata = { title: "Add an expense" };

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { property } = await getProperty(propertyId);
  return (
    <div>
      <Link href={`/dashboard/properties/${property.id}`} className="text-sm font-semibold text-pine">
        Back to {propertyTitle(property)}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add an expense</h1>
      <p className="mt-2 max-w-xl text-muted">
        Subtotal plus HST is the total. The category follows CRA form T776.
      </p>
      <ExpenseForm action={createExpense} propertyId={property.id} />
    </div>
  );
}
