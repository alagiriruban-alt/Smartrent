import { RentTable } from "@/components/n4-rent-table";
import { formatDmy } from "@/lib/n4/document";
import {
  N4_BROCHURE_URL,
  N4_FORM_NAME,
  N4_INSTRUCTIONS_URL,
  N4_OFFICIAL_FORM_URL,
  N4_SERVICE_METHOD_LABELS,
  RENT_FREQUENCY_LABELS,
} from "@/lib/n4/rules";
import type { N4NoticeView } from "@/lib/services/n4";
import { formatCad } from "@/lib/money";

export function N4Sheet({ notice }: { notice: N4NoticeView }) {
  const banner = !notice.confirmedAt
    ? "Draft"
    : notice.served
      ? "Served"
      : "Confirmed";

  return (
    <article className="rounded-lg border border-line bg-white px-6 py-8 print:border-0">
      <p
        className={`text-sm font-semibold uppercase tracking-[0.2em] ${
          notice.confirmedAt ? "text-pine" : "text-danger"
        }`}
      >
        {banner}
      </p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight">{N4_FORM_NAME}</h1>
      <p className="mt-2 text-sm text-muted">N4 data sheet</p>
      <p className="mt-1 text-sm">This is not an official Landlord and Tenant Board form.</p>

      <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">To</dt>
          <dd className="font-semibold">{notice.tenantNames}</dd>
        </div>
        <div>
          <dt className="text-muted">From</dt>
          <dd className="font-semibold">{notice.landlordName}</dd>
          <dd className="text-muted">{notice.landlordContact}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Address of the rental unit</dt>
          <dd>{notice.unitAddress}</dd>
        </div>
        <div>
          <dt className="text-muted">Rent frequency</dt>
          <dd>{RENT_FREQUENCY_LABELS[notice.rentFrequency]}</dd>
        </div>
        <div>
          <dt className="text-muted">Total rent owing</dt>
          <dd className="font-serif text-3xl">{formatCad(notice.totalOwingCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Day the notice is given</dt>
          <dd>{formatDmy(notice.givenOn)}</dd>
          <dd className="text-muted">{N4_SERVICE_METHOD_LABELS[notice.serviceMethod]}</dd>
        </div>
        <div>
          <dt className="text-muted">Termination date</dt>
          <dd className="font-semibold">{formatDmy(notice.terminationDate)}</dd>
          <dd className="text-muted">
            Cannot be earlier than {formatDmy(notice.earliestTerminationDate)}
          </dd>
        </div>
      </dl>

      <div className="mt-8">
        <RentTable rows={notice.rows} totalOwingCents={notice.totalOwingCents} />
      </div>

      <p className="mt-8 border-t border-line pt-4 text-sm">
        {notice.served && notice.servedOn
          ? `Recorded as served on ${formatDmy(notice.servedOn)}${
              notice.servedMethod
                ? ` by ${N4_SERVICE_METHOD_LABELS[notice.servedMethod]}`
                : ""
            }.`
          : notice.confirmedAt
            ? "Confirmed by the landlord. Service has not been recorded."
            : "DRAFT. The landlord has not confirmed this notice."}{" "}
        Not legal advice. Sign and give the official N4. This data sheet is not
        filed with the Board.
      </p>
      <p className="mt-2 text-sm">
        Official form:{" "}
        <a href={N4_OFFICIAL_FORM_URL} className="font-semibold text-pine">
          {N4_OFFICIAL_FORM_URL}
        </a>
      </p>
      <p className="mt-1 text-sm">
        Instructions:{" "}
        <a href={N4_INSTRUCTIONS_URL} className="font-semibold text-pine">
          N4 instructions
        </a>
        {" · "}
        <a href={N4_BROCHURE_URL} className="font-semibold text-pine">
          If a tenant does not pay rent
        </a>
      </p>
    </article>
  );
}
