import Link from "next/link";

import { saveOwners } from "@/actions/books";
import { deleteProperty } from "@/actions/properties";
import { OwnersForm } from "@/components/book-forms";
import { DeleteForm } from "@/components/delete-form";
import { DocumentSection } from "@/components/document-section";
import { card, secondaryButton } from "@/components/styles";
import { listExpenses, propertyShares } from "@/lib/books-records";
import { getProperty } from "@/lib/dal";
import { loadDocumentPanel } from "@/lib/services/documents";
import { formatLongDate, utcToDateOnly } from "@/lib/dates";
import {
  bedroomLabel,
  formatAddress,
  ordinal,
  propertyTitle,
  tenantName,
} from "@/lib/format";
import { QUEBEC_RECORD_ONLY, ontarioNoticesEnabled } from "@/lib/jurisdiction";
import { formatCad } from "@/lib/money";
import { tenancyPhase } from "@/lib/portfolio";
import { formatShare } from "@/lib/shares";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  try {
    const { property } = await getProperty(propertyId);
    return { title: propertyTitle(property) };
  } catch {
    return { title: "Property" };
  }
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { user, property, today, summary } = await getProperty(propertyId);
  const shares = await propertyShares(user.id, property.id);
  const expenses = await listExpenses(user.id, property.id);
  const ontario = ontarioNoticesEnabled(property);
  const ownerLines =
    shares?.owners.map((owner) => `${owner.name}, ${formatShare(owner.shareBps).replace("%", "")}`).join("\n") ??
    "";
  const documents = await loadDocumentPanel(user.id, {
    type: "property",
    propertyId: property.id,
  });

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/dashboard/properties" className="text-sm font-semibold text-pine">
          Back to properties
        </Link>
        <Link href="/dashboard" className="text-sm font-semibold text-pine">
          Rent roll
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">
            {propertyTitle(property)}
          </h1>
          <p className="mt-2 text-muted">{formatAddress(property)}</p>
          <p className="mt-2 text-sm">
            {summary.occupiedCount} of {summary.unitCount}{" "}
            {summary.unitCount === 1 ? "unit" : "units"} occupied ·{" "}
            {formatCad(summary.monthlyRentCents)} / month ·{" "}
            {property.jurisdiction === "QC" ? "Quebec, record only" : "Ontario"}
          </p>
          {!ontario ? <p className="mt-2 max-w-xl text-sm text-muted">{QUEBEC_RECORD_ONLY}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/properties/${property.id}/import`} className={secondaryButton}>
            Import ledger
          </Link>
          <Link href={`/dashboard/properties/${property.id}/expenses/new`} className={secondaryButton}>
            Add expense
          </Link>
          <Link href={`/dashboard/properties/${property.id}/edit`} className={secondaryButton}>
            Edit property
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Units</h2>
        <Link
          href={`/dashboard/properties/${property.id}/units/new`}
          className={secondaryButton}
        >
          Add a unit
        </Link>
      </div>

      {property.units.length === 0 ? (
        <p className={`${card} mt-4 p-4 text-muted`}>
          No units yet. Add the suites, floors, or rooms you rent out.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {property.units.map((unit) => {
            const phased = unit.tenancies.map((tenancy) => ({
              tenancy,
              phase: tenancyPhase(
                {
                  leaseStart: utcToDateOnly(tenancy.leaseStart),
                  leaseEnd: tenancy.leaseEnd
                    ? utcToDateOnly(tenancy.leaseEnd)
                    : null,
                  monthlyRentCents: tenancy.monthlyRentCents,
                  status: tenancy.status,
                },
                today,
              ),
            }));
            const current = phased.find((item) => item.phase === "current")?.tenancy;
            const upcoming = phased
              .filter((item) => item.phase === "upcoming")
              .map((item) => item.tenancy)
              .sort((a, b) => a.leaseStart.getTime() - b.leaseStart.getTime())[0];
            const shown = current ?? upcoming;
            const beds = bedroomLabel(unit.bedrooms);
            return (
              <li key={unit.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">
                      <Link
                        href={`/dashboard/properties/${property.id}/units/${unit.id}`}
                        className="hover:text-pine"
                      >
                        {unit.label}
                      </Link>
                    </h3>
                    {beds ? <p className="text-sm text-muted">{beds}</p> : null}
                  </div>
                  <p className="font-serif text-xl tabular-nums">
                    {current
                      ? formatCad(current.monthlyRentCents)
                      : upcoming
                        ? "Upcoming"
                        : "Vacant"}
                  </p>
                </div>
                {shown ? (
                  <p className="mt-3 text-sm">
                    {upcoming && !current ? "Starts later · " : null}
                    {tenantName(shown.tenant)} · due on the{" "}
                    {ordinal(shown.rentDueDay)} ·{" "}
                    {formatLongDate(utcToDateOnly(shown.leaseStart))}
                    {shown.leaseEnd
                      ? ` to ${formatLongDate(utcToDateOnly(shown.leaseEnd))}`
                      : " · month-to-month"}
                    {" · "}
                    <Link
                      href={`/dashboard/tenancies/${shown.id}/rent`}
                      className="font-semibold text-pine"
                    >
                      Rent ledger
                    </Link>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted">No current lease.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Owners</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Percentages split T776 totals. They have to add up to 100.
        </p>
        {shares && shares.owners.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {shares.owners.map((owner) => (
              <li key={owner.id}>
                {owner.name} · {formatShare(owner.shareBps)}
                {shares.totalCents > 0
                  ? ` · ${formatCad(shares.ownerTotals.find((line) => line.id === owner.id)?.amountCents ?? 0)} of expenses`
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No owners recorded yet.</p>
        )}
        <OwnersForm action={saveOwners} propertyId={property.id} initial={ownerLines} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Expenses</h2>
          <a href={`/dashboard/properties/${property.id}/t776`} className={secondaryButton}>
            Download T776 split
          </a>
        </div>
        {expenses.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No expenses yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {expenses.map((expense) => (
              <li key={expense.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{expense.description}</p>
                    <p className="mt-1 text-sm text-muted">
                      {formatLongDate(expense.incurredOn)}
                      {expense.vendor ? ` · ${expense.vendor}` : ""}
                      {expense.invoiceNumber ? ` · ${expense.invoiceNumber}` : ""}
                      {" · "}
                      {expense.category.replaceAll("_", " ").toLowerCase()}
                    </p>
                  </div>
                  <p className="font-serif text-xl tabular-nums">{formatCad(expense.totalCents)}</p>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Subtotal {formatCad(expense.subtotalCents)} · HST {formatCad(expense.hstCents)}
                  {expense.receiptDocumentId ? ` · receipt ${expense.receiptDocumentId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {shares && shares.categories.length > 0 ? (
          <div className="mt-4">
            <h3 className="font-serif text-xl">T776 by owner</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {shares.categories.map((category) => (
                <li key={category.category}>
                  {category.line} {category.label} · {formatCad(category.totalCents)}
                  {category.shares.length > 0
                    ? ` · ${category.shares.map((share) => `${share.name} ${formatCad(share.amountCents)}`).join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <DocumentSection
        documents={documents.documents}
        targets={documents.targets}
        storageMode={documents.storageMode}
        showIndexLink
      />

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-xl">Delete this property</h2>
        <p className="mt-1 text-sm text-muted">
          This removes the property, its units, and the tenants on those units.
        </p>
        <div className="mt-3">
          <DeleteForm
            action={deleteProperty}
            id={property.id}
            label="Delete property"
            confirm="I understand this deletes the property, its units, and their tenants."
          />
        </div>
      </section>
    </div>
  );
}
