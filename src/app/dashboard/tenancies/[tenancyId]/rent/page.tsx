import Link from "next/link";

import { N4LateLink } from "@/components/n4-late-link";
import { StatusPill } from "@/components/status-pill";
import { card, secondaryButton } from "@/components/styles";
import { formatLongDate } from "@/lib/dates";
import {
  balancePhrase,
  daysLateLabel,
  formatMonth,
} from "@/lib/format";
import { CHARGE_STATUS_LABELS } from "@/lib/ledger";
import { formatCad } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import { getTenancyLedger, getTenancyN4Notices } from "@/lib/rent-data";
import { formatDmy } from "@/lib/n4/document";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenancyId: string }>;
}) {
  const { tenancyId } = await params;
  const ledger = await getTenancyLedger(tenancyId);
  return { title: `${ledger.tenantName} rent` };
}

export default async function TenancyRentPage({
  params,
}: {
  params: Promise<{ tenancyId: string }>;
}) {
  const { tenancyId } = await params;
  const ledger = await getTenancyLedger(tenancyId);
  const notices = await getTenancyN4Notices(tenancyId);
  const latest = notices.find((notice) => notice.status !== "VOID") ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={`/dashboard/properties/${ledger.propertyId}/units/${ledger.unitId}`}
          className="text-sm font-semibold text-pine"
        >
          Back to {ledger.unitLabel}
        </Link>
        <Link href="/dashboard" className="text-sm font-semibold text-pine">
          Rent roll
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{ledger.tenantName}</h1>
          <p className="mt-2 text-muted">
            {ledger.unitLabel} · {ledger.address}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ledger.arrears.totalOwingCents > 0 ? (
            <Link
              href={`/dashboard/tenancies/${ledger.tenancyId}/n4`}
              className={secondaryButton}
            >
              Prepare an N4
            </Link>
          ) : null}
          <Link
            href={`/dashboard/rent/payments/new?tenancyId=${ledger.tenancyId}`}
            className={secondaryButton}
          >
            Record a payment
          </Link>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className={`${card} p-4`}>
          <dt className="text-sm text-muted">Balance</dt>
          <dd className="mt-1 font-serif text-2xl">
            {balancePhrase(ledger.summary.balanceCents)}
          </dd>
        </div>
        <div className={`${card} p-4`}>
          <dt className="text-sm text-muted">Arrears</dt>
          <dd className="mt-1 font-serif text-2xl">
            {formatCad(ledger.arrears.totalOwingCents)}
          </dd>
        </div>
        <div className={`${card} p-4`}>
          <dt className="text-sm text-muted">Collected</dt>
          <dd className="mt-1 font-serif text-2xl">
            {formatCad(ledger.summary.totalPaidCents)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        Arrears are the unpaid amounts whose due date has passed. An N4 starts
        from that total.
      </p>
      {ledger.arrears.totalOwingCents > 0 || notices.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-serif text-2xl">N4 notices</h2>
          {ledger.arrears.totalOwingCents > 0 ? (
            <p className="mt-2">
              <N4LateLink
                tenancyId={ledger.tenancyId}
                notice={
                  latest
                    ? {
                        noticeId: latest.noticeId,
                        status: latest.status === "SERVED" ? "SERVED" : "DRAFT",
                        confirmed: latest.confirmed,
                        terminationDate: latest.terminationDate,
                      }
                    : null
                }
              />
            </p>
          ) : null}
          {notices.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {notices.map((notice) => (
                <li key={notice.noticeId}>
                  <Link
                    href={`/dashboard/tenancies/${ledger.tenancyId}/notices/${notice.noticeId}`}
                    className="text-sm font-semibold text-pine"
                  >
                    {notice.status === "SERVED"
                      ? "Served"
                      : notice.confirmed
                        ? "Confirmed draft"
                        : "Draft"}
                    {notice.terminationDate
                      ? ` · termination ${formatDmy(notice.terminationDate)}`
                      : ""}
                    {notice.servedOn ? ` · served ${formatDmy(notice.servedOn)}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Months</h2>
        {ledger.summary.charges.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>
            No rent is due yet on this lease.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {ledger.summary.charges.map((charge) => (
              <li key={charge.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        {formatMonth(charge.periodStart)}
                      </h3>
                      <StatusPill status={charge.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Due {formatLongDate(charge.dueOn)}
                      {charge.daysLate > 0
                        ? ` · ${daysLateLabel(charge.daysLate)}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-right text-sm">
                    <span className="font-semibold">
                      {formatCad(charge.paidCents)}
                    </span>
                    <span className="text-muted">
                      {" "}
                      of {formatCad(charge.amountCents)}
                    </span>
                    {charge.owingCents > 0 ? (
                      <span className="mt-1 block text-danger">
                        {formatCad(charge.owingCents)}{" "}
                        {CHARGE_STATUS_LABELS[charge.status].toLowerCase()}
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Payments</h2>
        {ledger.payments.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No payments recorded.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {ledger.payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/dashboard/payments/${payment.id}`}
                  className={`${card} block p-4 transition-colors hover:border-pine`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {formatLongDate(payment.paidOn)}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {PAYMENT_METHOD_LABELS[payment.method]}
                        {payment.referenceNumber
                          ? ` · ${payment.referenceNumber}`
                          : ""}
                      </p>
                    </div>
                    <p className="font-serif text-2xl tabular-nums">
                      {formatCad(payment.amountCents)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
