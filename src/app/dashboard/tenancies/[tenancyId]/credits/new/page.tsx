import Link from "next/link";

import { createRentCredit } from "@/actions/books";
import { CreditForm } from "@/components/book-forms";
import { getTenancyLedger } from "@/lib/rent-data";

export const metadata = { title: "Add a credit" };

export default async function NewCreditPage({
  params,
}: {
  params: Promise<{ tenancyId: string }>;
}) {
  const { tenancyId } = await params;
  const ledger = await getTenancyLedger(tenancyId);
  return (
    <div>
      <Link href={`/dashboard/tenancies/${tenancyId}/rent`} className="text-sm font-semibold text-pine">
        Back to {ledger.tenantName}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a rent credit</h1>
      <p className="mt-2 max-w-xl text-muted">
        Use this for an in-kind credit, such as an appliance the tenant bought, or an offset such as a repair.
      </p>
      <CreditForm action={createRentCredit} tenancyId={tenancyId} />
    </div>
  );
}
