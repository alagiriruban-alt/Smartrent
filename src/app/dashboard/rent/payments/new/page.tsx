import Link from "next/link";

import { recordPayment } from "@/actions/payments";
import { PaymentForm } from "@/components/payment-form";
import { card } from "@/components/styles";
import { listPayableTenancies } from "@/lib/rent-data";

export const metadata = { title: "Record a payment" };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ tenancyId?: string }>;
}) {
  const { tenancyId } = await searchParams;
  const { today, tenancies } = await listPayableTenancies();
  const initial =
    tenancyId && tenancies.some((tenancy) => tenancy.tenancyId === tenancyId)
      ? tenancyId
      : undefined;

  return (
    <div>
      <Link href="/dashboard/rent" className="text-sm font-semibold text-pine">
        Back to rent
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Record a payment</h1>
      <p className="mt-2 max-w-xl text-muted">
        Paste an Interac e-Transfer email to fill the amount, date, and
        reference, then confirm the tenant before you save.
      </p>
      {tenancies.length === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          Add a tenant before recording a payment.
        </p>
      ) : (
        <div className={`${card} mt-8 p-4`}>
          <PaymentForm
            action={recordPayment}
            tenancies={tenancies}
            initialTenancyId={initial}
            today={today}
          />
        </div>
      )}
    </div>
  );
}
