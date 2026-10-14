import Link from "next/link";

import { card, secondaryButton } from "@/components/styles";
import { formatLongDate } from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getPaymentRecord } from "@/lib/rent-data";

export const metadata = { title: "Payment" };

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const payment = await getPaymentRecord(paymentId);

  return (
    <div>
      <Link
        href={`/dashboard/tenancies/${payment.tenancyId}/rent`}
        className="text-sm font-semibold text-pine"
      >
        Back to {payment.tenantName}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">
            {formatCad(payment.amountCents)}
          </h1>
          <p className="mt-2 text-muted">
            {payment.methodLabel} · {formatLongDate(payment.paidOn)}
          </p>
        </div>
        <Link
          href={`/dashboard/payments/${payment.id}/receipt`}
          className={secondaryButton}
        >
          View receipt
        </Link>
      </div>

      <dl className={`${card} mt-6 grid gap-3 p-4 text-sm sm:grid-cols-2`}>
        <div>
          <dt className="text-muted">Tenant</dt>
          <dd className="font-semibold">{payment.tenantName}</dd>
        </div>
        <div>
          <dt className="text-muted">Unit</dt>
          <dd>
            {payment.unitLabel} · {payment.address}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Reference</dt>
          <dd>{payment.referenceNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Notes</dt>
          <dd>{payment.note ?? "—"}</dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Applied to</h2>
        {payment.applied.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>
            This payment is still unallocated.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {payment.applied.map((row) => (
              <li
                key={row.periodStart}
                className={`${card} flex items-center justify-between p-4`}
              >
                <span>{formatMonth(row.periodStart)}</span>
                <span className="font-semibold">{formatCad(row.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {payment.creditCents > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {formatCad(payment.creditCents)} is credit toward a later month.
          </p>
        ) : null}
      </section>
    </div>
  );
}
