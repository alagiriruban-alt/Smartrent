import Link from "next/link";

import { IncreaseList } from "@/components/increase-list";
import { secondaryButton } from "@/components/styles";
import { getIncreaseBoard } from "@/lib/dal";

export const metadata = { title: "Rent increases" };

export default async function RentIncreasesPage() {
  const { rows } = await getIncreaseBoard();
  const alerts = rows.filter((row) => row.alerts.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
            Ontario
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">Rent increases</h1>
          <p className="mt-2 max-w-xl text-muted">
            The next eligible date is 12 months after move-in, or after the last
            increase. Written notice has to be given at least 90 days before the
            new rent starts. A heads-up appears 120 days before the eligible
            date, and a reminder appears in the 14 days before the serve-by date.
          </p>
        </div>
        <Link href="/dashboard/settings/guidelines" className={secondaryButton}>
          Guideline table
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Alerts</h2>
        <IncreaseList
          rows={alerts}
          empty="No lease is inside the 120-day window."
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Active leases</h2>
        <IncreaseList rows={rows} empty="No active leases yet." />
      </section>
    </div>
  );
}
