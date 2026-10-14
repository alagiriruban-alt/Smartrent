import Link from "next/link";

import { saveGuideline } from "@/actions/guidelines";
import { GuidelineForm } from "@/components/guideline-form";
import { card } from "@/components/styles";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatBasisPoints } from "@/lib/rent-increase/calculate";

export const metadata = { title: "Rent increase guideline" };

export default async function GuidelinesPage() {
  await requireUser();
  const rows = await prisma.rentGuideline.findMany({
    where: { province: "ON" },
    orderBy: { year: "desc" },
  });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        Settings
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">
        Ontario guideline
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        These yearly percents apply to units that are not guideline-exempt.
        Mark a year verified only after you check it against the source. An N1
        draft is blocked when that year is missing or not verified.
      </p>
      <p className="mt-3 text-sm">
        <Link href="/dashboard/settings/agent" className="font-semibold text-pine">
          Agent access
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Years on file</h2>
        {rows.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>
            No guideline years yet. Run the sample seed, or add a year below.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {row.year} · {formatBasisPoints(row.basisPoints)}
                    </p>
                    <a
                      href={row.sourceUrl}
                      className="mt-1 block text-sm font-semibold text-pine"
                    >
                      {row.sourceUrl}
                    </a>
                  </div>
                  <p
                    className={
                      row.verified
                        ? "text-sm font-semibold text-pine"
                        : "text-sm font-semibold text-danger"
                    }
                  >
                    {row.verified ? "Verified" : "Not verified"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} mt-8 p-4`}>
        <h2 className="font-serif text-2xl">Add or update a year</h2>
        <p className="mt-2 text-sm text-muted">
          Saving an existing year replaces the percent, the source link, and
          the verified flag.
        </p>
        <div className="mt-4">
          <GuidelineForm action={saveGuideline} />
        </div>
      </section>
    </div>
  );
}
