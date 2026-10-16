import Link from "next/link";

import { commitImport, reviewImport, stageImport } from "@/actions/books";
import { CommitBatchForm, ImportStageForm, ReviewRowForm } from "@/components/book-forms";
import { card } from "@/components/styles";
import { getImportBatch, listImportBatches } from "@/lib/services/import-batch";
import { requireUser } from "@/lib/dal";
import { getProperty } from "@/lib/dal";
import { propertyTitle } from "@/lib/format";
import { formatCad } from "@/lib/money";

export const metadata = { title: "Import a ledger" };

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ batch?: string }>;
}) {
  const { propertyId } = await params;
  const query = await searchParams;
  const { property } = await getProperty(propertyId);
  const user = await requireUser();
  const batches = await listImportBatches(user.id, property.id);
  const batch = query.batch ? await getImportBatch(user.id, query.batch) : null;
  const reconciliation = batch?.reconciliation as {
    matched?: boolean;
    ambiguousCount?: number;
    periods?: { key: string; parsedCents: number; sourceCents: number | null; differenceCents: number | null }[];
    years?: { key: string; parsedCents: number; sourceCents: number | null; differenceCents: number | null }[];
  } | null;

  return (
    <div>
      <Link href={`/dashboard/properties/${property.id}`} className="text-sm font-semibold text-pine">
        Back to {propertyTitle(property)}
      </Link>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Import a ledger</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Paste a JSON or CSV bundle. Rows are staged with a confidence score. Ambiguous periods stay out of the ledger until you approve them. Staging the same file again does not create a second batch.
      </p>
      <ImportStageForm action={stageImport} propertyId={property.id} />

      {batches.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-2xl">Staged files</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {batches.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard/properties/${property.id}/import?batch=${item.id}`}
                  className="font-semibold text-pine"
                >
                  {item.sourceName} · {item.status.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {batch && reconciliation ? (
        <section className="mt-10">
          <h2 className="font-serif text-2xl">{batch.sourceName}</h2>
          <p className="mt-2 text-sm">
            {reconciliation.matched ? "Totals match the source." : "Totals do not match the source."}
            {typeof reconciliation.ambiguousCount === "number"
              ? ` ${reconciliation.ambiguousCount} rows need review.`
              : ""}
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {[...(reconciliation.periods ?? []), ...(reconciliation.years ?? [])].map((line) => (
              <li key={`${line.key}`}>
                {line.key}: parsed {formatCad(line.parsedCents)}
                {line.sourceCents !== null ? ` · source ${formatCad(line.sourceCents)}` : ""}
                {line.differenceCents ? ` · difference ${formatCad(line.differenceCents)}` : ""}
              </li>
            ))}
          </ul>
          <ul className="mt-6 flex flex-col gap-4">
            {batch.rows.map((row) => {
              const parsed = row.parsed as { label?: string; tenant?: string; description?: string };
              return (
                <li key={row.id} className={`${card} p-4 text-sm`}>
                  <p className="font-semibold">
                    {row.kind.toLowerCase()} · {parsed.label || parsed.tenant || parsed.description || row.rawText}
                  </p>
                  <p className="mt-1 text-muted">
                    Confidence {row.confidence}
                    {row.flags.length > 0 ? ` · ${row.flags.join(", ")}` : ""} · {row.status.toLowerCase()}
                  </p>
                  {row.status !== "COMMITTED" ? (
                    <ReviewRowForm
                      action={reviewImport}
                      propertyId={property.id}
                      batchId={batch.id}
                      rowId={row.id}
                      periodOverride={row.periodOverride ?? ""}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <CommitBatchForm action={commitImport} propertyId={property.id} batchId={batch.id} />
        </section>
      ) : null}
    </div>
  );
}
