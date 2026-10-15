import Link from "next/link";

import { createLedgerCharge } from "@/actions/books";
import { ChargeForm } from "@/components/book-forms";
import { getTenancyLedger } from "@/lib/rent-data";

export const metadata = { title: "Add a charge" };

export default async function NewChargePage({
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
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a charge</h1>
      <p className="mt-2 max-w-xl text-muted">
        Water, utilities, fees, and LTB filing fees stay off the rent balance and off an N4.
      </p>
      <ChargeForm action={createLedgerCharge} tenancyId={tenancyId} />
    </div>
  );
}
