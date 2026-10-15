import Link from "next/link";

import { createLegalCase } from "@/actions/books";
import { LegalForm } from "@/components/book-forms";
import { getTenancyLedger } from "@/lib/rent-data";

export const metadata = { title: "Add a legal case" };

export default async function NewLegalCasePage({
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
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Add a legal case</h1>
      <p className="mt-2 max-w-xl text-muted">
        Record an N4, L1, L2, N12, or another case against this lease. This does not file anything.
      </p>
      <LegalForm action={createLegalCase} tenancyId={tenancyId} />
    </div>
  );
}
