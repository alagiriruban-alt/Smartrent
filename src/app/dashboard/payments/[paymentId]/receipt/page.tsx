import Link from "next/link";

import { PrintButton } from "@/components/print-button";
import { secondaryButton } from "@/components/styles";
import { formatMonth } from "@/lib/format";
import { formatCad } from "@/lib/money";
import { getReceipt } from "@/lib/rent-data";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const receipt = await getReceipt(paymentId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/dashboard/payments/${paymentId}`}
          className="text-sm font-semibold text-pine"
        >
          Back to payment
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a
            href={`/dashboard/payments/${paymentId}/receipt/pdf`}
            className={secondaryButton}
          >
            Download PDF
          </a>
        </div>
      </div>

      <article className="mt-6 rounded-lg border border-line bg-white px-6 py-8 print:mt-0 print:border-0">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
          Rent receipt
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">
          {receipt.landlordName}
        </h1>
        <p className="mt-2 text-sm text-muted">Receipt {receipt.receiptNumber}</p>

        <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Date received</dt>
            <dd className="font-semibold">{receipt.paidOnLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">Amount</dt>
            <dd className="font-serif text-3xl">{formatCad(receipt.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Received from</dt>
            <dd className="font-semibold">{receipt.tenantName}</dd>
          </div>
          <div>
            <dt className="text-muted">For</dt>
            <dd>
              {receipt.unitLabel}
              <span className="mt-1 block text-muted">{receipt.address}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Method</dt>
            <dd>{receipt.methodLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">Reference</dt>
            <dd>{receipt.referenceNumber ?? "—"}</dd>
          </div>
        </dl>

        {receipt.applied.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Applied to</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {receipt.applied.map((row) => (
                <li
                  key={row.periodStart}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>{formatMonth(row.periodStart)}</span>
                  <span className="font-semibold">{formatCad(row.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {receipt.creditCents > 0 ? (
          <p className="mt-4 text-sm">
            Credit toward a later month: {formatCad(receipt.creditCents)}
          </p>
        ) : null}

        {receipt.note ? (
          <p className="mt-6 text-sm">
            <span className="text-muted">Note. </span>
            {receipt.note}
          </p>
        ) : null}

        <p className="mt-8 text-sm text-muted">
          This receipt acknowledges rent received. It is not a notice from the
          Landlord and Tenant Board.
        </p>
      </article>
    </div>
  );
}
