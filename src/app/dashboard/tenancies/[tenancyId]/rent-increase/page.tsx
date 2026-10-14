import Link from "next/link";

import { createRentIncreaseDraft } from "@/actions/rent-increase";
import { RentIncreaseForm } from "@/components/rent-increase-form";
import { card } from "@/components/styles";
import { getIncreaseDraft } from "@/lib/dal";
import { formatLongDate } from "@/lib/dates";
import { centsToInput, formatCad } from "@/lib/money";
import { DRAFT_DISCLAIMER } from "@/lib/rent-increase/rules";

export const metadata = { title: "Rent increase draft" };

export default async function RentIncreasePage({
  params,
}: {
  params: Promise<{ tenancyId: string }>;
}) {
  const { tenancyId } = await params;
  const { context } = await getIncreaseDraft(tenancyId);
  const { row } = context;

  return (
    <div>
      <Link
        href="/dashboard/rent-increases"
        className="text-sm font-semibold text-pine"
      >
        Back to rent increases
      </Link>
      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        {row.formCode ? `${row.formCode} draft` : "Rent increase"}
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">{row.tenantName}</h1>
      <p className="mt-2 text-muted">
        {row.unitLabel} · {row.propertyLabel}
      </p>

      <section className={`${card} mt-6 p-4 text-sm`}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Current rent</dt>
            <dd className="font-semibold">{formatCad(row.monthlyRentCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Move-in</dt>
            <dd>{formatLongDate(row.moveInOn)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last increase</dt>
            <dd>
              {row.lastIncreaseOn
                ? `${formatCad(row.lastIncreaseCents ?? 0)} on ${formatLongDate(row.lastIncreaseOn)}`
                : "None on file"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Next eligible date</dt>
            <dd>{row.eligibleOn ? formatLongDate(row.eligibleOn) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Last day to serve notice</dt>
            <dd>{row.serveBy ? formatLongDate(row.serveBy) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Form data</dt>
            <dd>
              {row.guidelineExempt
                ? "N2. You choose the amount."
                : "N1. The guideline caps the usual increase."}
            </dd>
          </div>
        </dl>
        {row.guidelineExempt && row.exemptionEvidence ? (
          <p className="mt-4 text-muted">Evidence note: {row.exemptionEvidence}</p>
        ) : null}
        <p className="mt-4">{context.guidelineNote}</p>
      </section>

      {row.supported ? (
        <div className="mt-6 max-w-xl">
          <RentIncreaseForm
            action={createRentIncreaseDraft}
            tenancyId={row.tenancyId}
            defaultEffectiveOn={context.defaultEffectiveOn}
            defaultNewRent={
              context.suggestedNewRentCents !== null
                ? centsToInput(context.suggestedNewRentCents)
                : ""
            }
          />
          <p className="mt-4 text-sm text-muted">{DRAFT_DISCLAIMER}</p>
        </div>
      ) : null}
    </div>
  );
}
