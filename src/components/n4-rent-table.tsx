import { formatDmy } from "@/lib/n4/document";
import type { N4RentRow } from "@/lib/n4/table";
import { formatCad } from "@/lib/money";

export function RentTable({
  rows,
  totalOwingCents,
}: {
  rows: N4RentRow[];
  totalOwingCents: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <caption className="mb-2 text-left font-semibold">
          Rent owing by rental period
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2 pr-3 font-semibold">Period from</th>
            <th className="py-2 pr-3 font-semibold">Period to</th>
            <th className="py-2 pr-3 text-right font-semibold">Rent charged</th>
            <th className="py-2 pr-3 text-right font-semibold">Rent paid</th>
            <th className="py-2 text-right font-semibold">Owing</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-3 text-muted">
                No rental period is past due on that day.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.periodFrom}-${row.periodTo}`} className="border-b border-line">
                <td className="py-2 pr-3 tabular-nums">{formatDmy(row.periodFrom)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatDmy(row.periodTo)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatCad(row.rentChargedCents)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatCad(row.rentPaidCents)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatCad(row.rentOwingCents)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-2 pr-3 text-right font-semibold">
              Total rent owing
            </td>
            <td className="py-2 text-right font-serif text-xl tabular-nums">
              {formatCad(totalOwingCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
