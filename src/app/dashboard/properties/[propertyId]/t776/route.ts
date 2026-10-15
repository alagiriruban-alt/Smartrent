import { propertyShares } from "@/lib/books-records";
import { requireUser } from "@/lib/dal";
import { formatShare } from "@/lib/shares";

export async function GET(
  _request: Request,
  context: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await context.params;
  const user = await requireUser();
  const report = await propertyShares(user.id, propertyId);
  if (!report) {
    return new Response("Not found", { status: 404 });
  }
  const header = ["line", "category", "total", ...report.owners.map((owner) => owner.name)];
  const lines = report.categories.map((category) => [
    category.line,
    category.label,
    (category.totalCents / 100).toFixed(2),
    ...category.shares.map((share) => (share.amountCents / 100).toFixed(2)),
  ]);
  const owners = report.owners
    .map((owner) => `${owner.name} ${formatShare(owner.shareBps)}`)
    .join("; ");
  const csv = [
    `# Ownership: ${owners || "none"}`,
    header.join(","),
    ...lines.map((line) => line.join(",")),
  ].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="t776-${propertyId}.csv"`,
    },
  });
}
