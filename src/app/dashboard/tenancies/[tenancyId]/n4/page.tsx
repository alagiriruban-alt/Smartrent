import Link from "next/link";
import { notFound } from "next/navigation";

import { saveN4DraftAction } from "@/actions/n4";
import { N4Form } from "@/components/n4-form";
import { card } from "@/components/styles";
import { requireUser } from "@/lib/dal";
import { todayDateOnly } from "@/lib/dates";
import { earliestTerminationDate } from "@/lib/n4/rules";
import { ServiceError } from "@/lib/services/errors";
import { getN4Notice, previewN4Notice } from "@/lib/services/n4";

export const metadata = { title: "Prepare an N4" };

export default async function PrepareN4Page({
  params,
  searchParams,
}: {
  params: Promise<{ tenancyId: string }>;
  searchParams: Promise<{ noticeId?: string }>;
}) {
  const { tenancyId } = await params;
  const { noticeId } = await searchParams;
  const user = await requireUser();
  const existing = noticeId ? await getN4Notice(user.id, noticeId) : null;
  if (noticeId && (!existing || existing.tenancyId !== tenancyId)) {
    notFound();
  }
  if (existing?.served) {
    return (
      <div>
        <Link
          href={`/dashboard/tenancies/${tenancyId}/notices/${existing.noticeId}`}
          className="text-sm font-semibold text-pine"
        >
          Back to the notice
        </Link>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">This N4 was served</h1>
        <p className={`${card} mt-6 p-4 text-muted`}>
          A served notice stays as it was recorded. Prepare a new one if the
          arrears have changed.
        </p>
      </div>
    );
  }

  const givenOn = existing?.givenOn ?? todayDateOnly();
  let preview: Awaited<ReturnType<typeof previewN4Notice>>;
  try {
    preview = await previewN4Notice(user.id, {
      tenancyId,
      givenOn,
      serviceMethod: existing?.serviceMethod ?? "IN_PERSON",
      rentFrequency: existing?.rentFrequency ?? "MONTHLY",
      terminationDate: null,
      landlordName: existing?.landlordName ?? null,
      landlordContact: existing?.landlordContact ?? null,
      tenantNames: existing?.tenantNames ?? null,
      unitAddress: existing?.unitAddress ?? null,
    });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") {
      notFound();
    }
    const message =
      error instanceof ServiceError ? error.message : "That notice could not be prepared.";
    return (
      <div>
        <Link
          href={`/dashboard/tenancies/${tenancyId}/rent`}
          className="text-sm font-semibold text-pine"
        >
          Back to the tenant
        </Link>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">Prepare an N4</h1>
        <p className={`${card} mt-6 p-4`}>{message}</p>
      </div>
    );
  }

  const plan = earliestTerminationDate({
    givenOn: preview.givenOn,
    serviceMethod: preview.serviceMethod,
    rentFrequency: preview.rentFrequency,
  });
  const terminationDate =
    existing && existing.terminationDate >= plan.terminationDate
      ? existing.terminationDate
      : plan.terminationDate;

  return (
    <div>
      <Link
        href={`/dashboard/tenancies/${tenancyId}/rent`}
        className="text-sm font-semibold text-pine"
      >
        Back to {preview.tenantName}
      </Link>
      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        Non-payment
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Prepare an N4</h1>
      <p className="mt-2 max-w-xl text-muted">
        The figures come from the rent ledger. Review them, then save a draft.
        The download stays marked DRAFT until you confirm it. This is not the
        official form and it is not legal advice.
      </p>
      {preview.totalOwingCents <= 0 ? (
        <p className={`${card} mt-8 p-4`}>
          Nothing is past due on {givenOn}. The N4 instructions say to wait
          until the day after rent was due.
        </p>
      ) : (
        <div className={`${card} mt-8 p-4`}>
          <N4Form
            action={saveN4DraftAction}
            tenancyId={tenancyId}
            noticeId={existing?.noticeId ?? null}
            rows={preview.rows}
            totalOwingCents={preview.totalOwingCents}
            defaults={{
              givenOn: preview.givenOn,
              serviceMethod: preview.serviceMethod,
              rentFrequency: preview.rentFrequency,
              terminationDate,
              landlordName: preview.landlordName,
              landlordContact: preview.landlordContact,
              tenantNames: preview.tenantNames,
              unitAddress: preview.unitAddress,
            }}
          />
        </div>
      )}
    </div>
  );
}
