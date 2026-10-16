import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { dryRunBundle } from "../src/lib/services/import-batch";
import { stageImportBundle } from "../src/lib/services/import-batch";

const prisma = new PrismaClient();

function flag(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function printReport(report: ReturnType<typeof dryRunBundle>) {
  const { reconciliation } = report;
  console.log(reconciliation.matched ? "Totals match." : "Totals do not match.");
  console.log(`Ambiguous rows: ${reconciliation.ambiguousCount}`);
  console.log(`Rent collected: ${(reconciliation.rentCollectedCents / 100).toFixed(2)}`);
  for (const line of [...reconciliation.periods, ...reconciliation.years, ...reconciliation.expenses]) {
    const source = line.sourceCents === null ? "n/a" : (line.sourceCents / 100).toFixed(2);
    const difference = line.differenceCents === null ? "n/a" : (line.differenceCents / 100).toFixed(2);
    console.log(
      `${line.key}  parsed ${(line.parsedCents / 100).toFixed(2)}  source ${source}  difference ${difference}`,
    );
  }
  for (const row of report.parsed.ledger) {
    const mark = row.needsReview ? "review" : "ok";
    console.log(
      `${mark}  ${row.externalKey}  ${row.confidence}  ${row.flags.join(",") || "-"}  ${row.label}`,
    );
  }
}

async function main() {
  const file = flag("--file");
  if (!file) {
    console.error("Usage: npm run import:bundle -- --file fixtures/import/harbour-court.bundle.json [--dry-run] [--email landlord@example.com] [--property-id id]");
    process.exit(1);
  }
  const raw = readFileSync(file, "utf8");
  const report = dryRunBundle(file, raw);
  printReport(report);
  if (process.argv.includes("--dry-run") || !flag("--email")) {
    return;
  }
  const email = flag("--email");
  if (!email) {
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No landlord found for ${email}.`);
  }
  const staged = await stageImportBundle({
    ownerId: user.id,
    propertyId: flag("--property-id"),
    sourceName: file,
    raw,
  });
  console.log(staged.alreadyStaged ? `Already staged: ${staged.batchId}` : `Staged: ${staged.batchId}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
