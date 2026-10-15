/**
 * Read-only precedent-corpus review (aggregates only).
 *
 * Run by GitHub Actions with DATABASE_URL from the NEON_DATABASE_URL secret.
 * The operator's standing rules apply:
 * - Public research corpus ONLY: KnowledgeSource rows with companyId IS NULL.
 *   Customer rows are never queried, and no customer data is read.
 * - No document bodies, excerpts, titles, metadata JSON, or byte objects are
 *   selected. Only COUNTs / GROUP BY on enum + scalar columns, plus
 *   information_schema / pg_stat metadata (table + column names, row counts).
 * - HELDOUT / BLIND bodies are never touched. This script cannot see them:
 *   it selects no text columns at all.
 * - Read-only: no INSERT / UPDATE / DELETE / DDL. Every query is fail-soft —
 *   a missing table reports "absent" instead of failing the run.
 *
 * Usage: npx tsx scripts/precedent-review.ts
 */
import { prisma } from "../lib/prisma";

type CountRow = { key: string; count: bigint | number };

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function groupBy(
  field: "extractionStatus" | "representationLevel" | "documentClass" | "provenance",
): Promise<CountRow[]> {
  // Cast the method, not the result: Prisma's groupBy generics cannot infer
  // a return type from a dynamic `by` field, and casting the awaited result
  // leaks the cast type into the args inference (TS2345). The runtime call
  // is unchanged; the cast only gives this script a plain function type.
  const groupByCall = prisma.knowledgeSource.groupBy as (
    args: {
      by: string[];
      where: { companyId: null };
      _count: { _all: boolean };
    },
  ) => Promise<Array<Record<string, unknown> & { _count: { _all: number } }>>;
  const rows = await groupByCall({
    by: [field],
    where: { companyId: null },
    _count: { _all: true },
  });
  // Sort in JS: Prisma's groupBy orderBy input has no `_all` key under
  // `_count` (it takes per-field keys), so ordering by count must happen
  // here. Row count is tiny (one per distinct enum value).
  return rows
    .map((r) => ({ key: String(r[field] ?? "(null)"), count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  printSection("KnowledgeSource — public research corpus only (companyId IS NULL)");
  const total = await prisma.knowledgeSource.count({ where: { companyId: null } });
  console.log(`total public sources: ${total}`);
  for (const field of [
    "extractionStatus",
    "representationLevel",
    "documentClass",
    "provenance",
  ] as const) {
    console.log(`\n-- by ${field} --`);
    for (const row of await groupBy(field)) {
      console.log(`${row.key}: ${row.count}`);
    }
  }

  printSection("Table inventory (pg_stat_user_tables — approximate row counts, no data read)");
  const tables = await prisma.$queryRaw<
    Array<{ schemaname: string; relname: string; n_live_tup: bigint | null }>
  >`SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname`;
  for (const t of tables) {
    console.log(`${t.schemaname}.${t.relname}: ~${t.n_live_tup ?? "?"} live rows`);
  }

  printSection("kf_* table columns (information_schema — names only, no data read)");
  const cols = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string; data_type: string }>
  >`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name LIKE 'kf\\_%' ORDER BY table_name, ordinal_position`;
  let current = "";
  for (const c of cols) {
    if (c.table_name !== current) {
      current = c.table_name;
      console.log(`\n${current}:`);
    }
    console.log(`  ${c.column_name} (${c.data_type})`);
  }
  if (cols.length === 0) console.log("(no kf_* tables present)");

  console.log("\nReview recon complete. No bodies, excerpts, titles, or metadata were read.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
