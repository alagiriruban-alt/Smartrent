import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { secondaryButton } from "@/components/styles";
import { getIncreaseNotice } from "@/lib/dal";
import { formatLongDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";
import { formatBasisPoints } from "@/lib/rent-increase/calculate";
import { DRAFT_DISCLAIMER } from "@/lib/rent-increase/rules";

export const metadata = { title: "Rent increase draft" };

export default async function RentIncreaseNoticePage({
  params,
}: {
  params: Promise<{ tenancyId: string; noticeId: string }>;
}) {
  const { tenancyId, noticeId } = await params;
  const { notice } = await getIncreaseNotice(noticeId);
  if (notice.tenancyId !== tenancyId) {
    notFound();
  }
  const document = notice.document;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/dashboard/tenancies/${tenancyId}/rent-increase`}
          className="text-sm font-semibold text-pine"
        >
          Back to the draft form
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a
            href={`/dashboard/tenancies/${tenancyId}/notices/${noticeId}/pdf`}
            className={secondaryButton}
          >
            Download PDF
          </a>
        </div>
      </div>

      <article className="mt-6 rounded-lg border border-line bg-white px-6 py-8 print:mt-0 print:border-0">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-danger">
          Draft
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">
          Rent increase notice
        </h1>
        <p className="mt-2 text-sm text-muted">
          {document.formCode} data · {document.formName}
        </p>
        <p className="mt-1 text-sm">This draft is not an official form.</p>

        <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Landlord</dt>
            <dd className="font-semibold">{document.landlordName}</dd>
          </div>
          <div>
            <dt className="text-muted">Tenant</dt>
            <dd className="font-semibold">{document.tenantName}</dd>
          </div>
          <div>
            <dt className="text-muted">Rental unit</dt>
            <dd>
              {document.unitLabel}
              <span className="mt-1 block text-muted">{document.address}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Move-in</dt>
            <dd>{formatLongDate(document.moveInOn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last rent increase</dt>
            <dd>
              {document.lastIncreaseOn
                ? `${formatCad(document.lastIncreaseCents ?? 0)} on ${formatLongDate(document.lastIncreaseOn)}`
                : "None on file"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Prepared</dt>
            <dd>{formatLongDate(document.preparedOn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Current rent</dt>
            <dd className="font-semibold">{formatCad(document.currentRentCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">New rent</dt>
            <dd className="font-serif text-3xl">{formatCad(document.newRentCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Increase</dt>
            <dd>
              {formatCad(document.increaseCents)} (
              {formatBasisPoints(document.increaseBasisPoints)})
            </dd>
          </div>
          <div>
            <dt className="text-muted">Effective date</dt>
            <dd className="font-semibold">{formatLongDate(document.effectiveOn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Earliest eligible date</dt>
            <dd>{formatLongDate(document.eligibleOn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last day to serve for that date</dt>
            <dd>{formatLongDate(document.serveBy)}</dd>
          </div>
        </dl>

        <section className="mt-8 text-sm">
          <h2 className="font-serif text-2xl">Guideline</h2>
          {document.formCode === "N2" ? (
            <>
              <p className="mt-2">
                The guideline does not apply. This unit was first occupied for
                residential use after November 15, 2018. The landlord chooses
                the amount.
              </p>
              {document.exemptionEvidence ? (
                <p className="mt-2 text-muted">
                  Evidence note: {document.exemptionEvidence}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2">
              {document.guidelineYear} Ontario guideline:{" "}
              {document.guidelineBasisPoints !== null
                ? formatBasisPoints(document.guidelineBasisPoints)
                : "not on file"}
              {document.guidelineSourceUrl ? (
                <>
                  {" "}
                  <a
                    href={document.guidelineSourceUrl}
                    className="font-semibold text-pine"
                  >
                    Source
                  </a>
                </>
              ) : null}
            </p>
          )}
        </section>

        {document.warnings.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Warnings</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {document.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 border-t border-line pt-4 text-sm">{DRAFT_DISCLAIMER}</p>
        <p className="mt-2 text-sm">
          Official form ({document.formCode}):{" "}
          <a href={document.officialUrl} className="font-semibold text-pine">
            {document.officialUrl}
          </a>
        </p>
      </article>
    </div>
  );
}
