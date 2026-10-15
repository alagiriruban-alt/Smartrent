import Link from "next/link";

import { correctCharge } from "@/actions/books";
import { CorrectionForm } from "@/components/book-forms";
import { N4LateLink } from "@/components/n4-late-link";
import { StatusPill } from "@/components/status-pill";
import { card, secondaryButton } from "@/components/styles";
import {
  listLedgerCharges,
  listLegalCases,
  listRentChanges,
  listRentCredits,
} from "@/lib/books-records";
import { requireUser } from "@/lib/dal";
import { QUEBEC_RECORD_ONLY } from "@/lib/jurisdiction";
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
  const user = await requireUser();
  const [charges, credits, changes, legal] = await Promise.all([
    listLedgerCharges(user.id, tenancyId),
    listRentCredits(user.id, tenancyId),
    listRentChanges(user.id, tenancyId),
    listLegalCases(user.id, tenancyId),
  ]);
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
          {ledger.ontarioNotices && ledger.arrears.totalOwingCents > 0 ? (
            <Link
              href={`/dashboard/tenancies/${ledger.tenancyId}/n4`}
              className={secondaryButton}
            >
              Prepare an N4
            </Link>
          ) : null}
          <Link
            href={`/dashboard/tenancies/${ledger.tenancyId}/charges/new`}
            className={secondaryButton}
          >
            Add a charge
          </Link>
          <Link
            href={`/dashboard/tenancies/${ledger.tenancyId}/credits/new`}
            className={secondaryButton}
          >
            Add a credit
          </Link>
          <Link
            href={`/dashboard/tenancies/${ledger.tenancyId}/legal/new`}
            className={secondaryButton}
          >
            Add a case
          </Link>
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
        Rent arrears are the unpaid rent whose due date has passed.
        {ledger.ontarioNotices
          ? " An N4 starts from that rent total and does not include water, fees, or other charges."
          : ` ${QUEBEC_RECORD_ONLY}`}
      </p>
      {!ledger.ontarioNotices ? (
        <p className={`${card} mt-4 p-4 text-sm`}>{QUEBEC_RECORD_ONLY}</p>
      ) : null}
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

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Lease</h2>
        <dl className={`${card} mt-4 grid gap-3 p-4 text-sm sm:grid-cols-2`}>
          <div>
            <dt className="text-muted">Lease</dt>
            <dd>
              {formatLongDate(ledger.leaseStart)}
              {" – "}
              {ledger.leaseEnd ? formatLongDate(ledger.leaseEnd) : "month-to-month"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Last month&apos;s rent held</dt>
            <dd>
              {formatCad(ledger.depositHeldCents)}
              {ledger.depositAppliedPeriod
                ? ` · applied to ${ledger.depositAppliedPeriod}`
                : ledger.depositHeldCents > 0
                  ? " · still held"
                  : ""}
            </dd>
          </div>
        </dl>
        <h3 className="mt-4 font-semibold">Rent changes</h3>
        {changes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No rent changes recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {changes.map((change) => (
              <li key={change.id} className="text-sm">
                {formatLongDate(change.effectiveOn)} · {formatCad(change.previousCents)} to{" "}
                {formatCad(change.amountCents)}
                {change.noticeType ? ` · ${change.noticeType} ${change.noticeStatus ?? ""}` : ""}
                {change.reason ? ` · ${change.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Other charges</h2>
        {charges.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No water, fees, or other charges.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {charges.map((charge) => (
              <li key={charge.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {charge.kind.replaceAll("_", " ")} · {charge.description}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {charge.period ?? "No period"} · due {formatLongDate(charge.dueOn)}
                    </p>
                  </div>
                  <p className="text-right text-sm">
                    <span className="font-semibold">{formatCad(charge.owingCents)}</span>
                    <span className="text-muted"> of {formatCad(charge.amountCents)} owing</span>
                  </p>
                </div>
                <CorrectionForm
                  action={correctCharge}
                  tenancyId={ledger.tenancyId}
                  chargeId={charge.id}
                  label={charge.description}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Rent credits</h2>
        {credits.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No credits or offsets.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {credits.map((credit) => (
              <li key={credit.id} className={`${card} p-4 text-sm`}>
                <p className="font-semibold">
                  {formatCad(credit.amountCents)} · {credit.kind === "IN_KIND" ? "In kind" : "Offset"}
                </p>
                <p className="mt-1 text-muted">
                  {formatLongDate(credit.effectiveOn)}
                  {credit.period ? ` · ${credit.period}` : ""} · {credit.reason}
                  {credit.documentId ? ` · document ${credit.documentId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Legal cases</h2>
        {legal.upcomingHearings.length > 0 ? (
          <p className="mt-2 text-sm">
            Upcoming{" "}
            {legal.upcomingHearings
              .map((item) => `${item.type} on ${formatLongDate(item.hearingOn ?? "")}`)
              .join(", ")}
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">No upcoming hearings.</p>
        )}
        {legal.cases.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No cases on this lease.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {legal.cases.map((item) => (
              <li key={item.id} className={`${card} p-4 text-sm`}>
                <p className="font-semibold">
                  {item.type}
                  {item.typeDetail ? ` · ${item.typeDetail}` : ""} · {item.status.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-muted">
                  {item.ltbFileNumber ? `${item.ltbFileNumber} · ` : ""}
                  {item.servedOn ? `served ${formatLongDate(item.servedOn)} · ` : ""}
                  {item.filedOn ? `filed ${formatLongDate(item.filedOn)} · ` : ""}
                  {item.hearingOn ? `hearing ${formatLongDate(item.hearingOn)}` : "no hearing date"}
                  {item.filingFeeCents !== null ? ` · fee ${formatCad(item.filingFeeCents)}` : ""}
                </p>
                {item.outcome ? <p className="mt-1">Outcome: {item.outcome}</p> : null}
                {item.notes ? <p className="mt-1 text-muted">{item.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
