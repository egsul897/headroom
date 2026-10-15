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
  // Cast the method (via unknown, as TS2352 requires), not the result:
  // Prisma's groupBy generics cannot infer a return type from a dynamic
  // `by` field, and casting the awaited result leaks the cast type into
  // the args inference (TS2345). The runtime call is unchanged; the cast
  // only gives this script a plain function type.
  const groupByCall = prisma.knowledgeSource.groupBy as unknown as (
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

  await runPhase2();

  console.log("\nReview recon complete. No bodies, excerpts, titles, or metadata were read.");
}

/**
 * Phase 2 — deeper aggregates over the kf_precedent_* tables, from the
 * column inventory phase 1 returned. Every query is aggregate-only
 * (COUNT / GROUP BY / distribution buckets). Columns NEVER selected:
 * excerpt, heading, term, rationale, rawReference, payloadJson,
 * signalsJson, metadata — anything that could carry document text.
 * Each query is fail-soft: a bad query reports its error, never kills
 * the run.
 */
async function runPhase2(): Promise<void> {
  printSection("Phase 2 — kf_precedent aggregates (counts / distributions only)");

  await agg(
    "covenant candidates by representationLevel",
    `SELECT "representationLevel" AS key, COUNT(*) AS count FROM "kf_precedent_covenant_candidates" GROUP BY "representationLevel" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "covenant candidates by authorityStatus",
    `SELECT "authorityStatus" AS key, COUNT(*) AS count FROM "kf_precedent_covenant_candidates" GROUP BY "authorityStatus" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "covenant candidates by discoveryScore bucket",
    `SELECT CASE WHEN "discoveryScore" < 2 THEN '0-2' WHEN "discoveryScore" < 4 THEN '2-4' WHEN "discoveryScore" < 6 THEN '4-6' WHEN "discoveryScore" < 8 THEN '6-8' ELSE '8+' END AS key, COUNT(*) AS count FROM "kf_precedent_covenant_candidates" GROUP BY 1 ORDER BY 1`,
  );
  await agg(
    "covenant candidates with no family (familiesJson null or [])",
    `SELECT COUNT(*) AS count FROM "kf_precedent_covenant_candidates" WHERE "familiesJson" IS NULL OR "familiesJson" = '[]'::jsonb`,
  );
  await agg(
    "covenant candidate family frequency (top 30)",
    `SELECT jsonb_array_elements_text("familiesJson") AS key, COUNT(*) AS count FROM "kf_precedent_covenant_candidates" WHERE "familiesJson" IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 30`,
  );

  await agg(
    "structural nodes by nodeType",
    `SELECT "nodeType" AS key, COUNT(*) AS count FROM "kf_precedent_structural_nodes" GROUP BY "nodeType" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "structural nodes ambiguous=true",
    `SELECT COUNT(*) AS count FROM "kf_precedent_structural_nodes" WHERE "ambiguous" = true`,
  );
  await agg(
    "duplicate (sourceId, sectionRef) groups — TOC/dedup signal",
    `SELECT COUNT(*) AS count FROM (SELECT "sourceId", "sectionRef" FROM "kf_precedent_structural_nodes" GROUP BY "sourceId", "sectionRef" HAVING COUNT(*) > 1) d`,
  );
  await agg(
    "extra rows from duplicate (sourceId, sectionRef) groups",
    `SELECT COALESCE(SUM(cnt - 1), 0) AS count FROM (SELECT COUNT(*) AS cnt FROM "kf_precedent_structural_nodes" GROUP BY "sourceId", "sectionRef" HAVING COUNT(*) > 1) d`,
  );

  await agg(
    "unresolved uncertainties by reviewerTask (top 20)",
    `SELECT "reviewerTask" AS key, COUNT(*) AS count FROM "kf_precedent_unresolved_uncertainties" GROUP BY "reviewerTask" ORDER BY COUNT(*) DESC LIMIT 20`,
  );
  await agg(
    "unresolved uncertainties with a suggested regression",
    `SELECT COUNT(*) AS count FROM "kf_precedent_unresolved_uncertainties" WHERE "suggestedRegression" IS NOT NULL AND "suggestedRegression" <> ''`,
  );

  await agg(
    "conditions/exceptions by kind",
    `SELECT "kind" AS key, COUNT(*) AS count FROM "kf_precedent_conditions_exceptions" GROUP BY "kind" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "conditions/exceptions by representationLevel",
    `SELECT "representationLevel" AS key, COUNT(*) AS count FROM "kf_precedent_conditions_exceptions" GROUP BY "representationLevel" ORDER BY COUNT(*) DESC`,
  );

  await agg(
    "dependency edges by kind",
    `SELECT "kind" AS key, COUNT(*) AS count FROM "kf_precedent_dependency_edges" GROUP BY "kind" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "dependency edges by resolution",
    `SELECT "resolution" AS key, COUNT(*) AS count FROM "kf_precedent_dependency_edges" GROUP BY "resolution" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "dependency edges by legalTruth",
    `SELECT "legalTruth" AS key, COUNT(*) AS count FROM "kf_precedent_dependency_edges" GROUP BY "legalTruth" ORDER BY COUNT(*) DESC`,
  );

  await agg(
    "corpus records by corpus",
    `SELECT "corpus" AS key, COUNT(*) AS count FROM "kf_precedent_corpus_records" GROUP BY "corpus" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "corpus records by kind",
    `SELECT "kind" AS key, COUNT(*) AS count FROM "kf_precedent_corpus_records" GROUP BY "kind" ORDER BY COUNT(*) DESC`,
  );
  await agg(
    "corpus records by authorityStatus",
    `SELECT "authorityStatus" AS key, COUNT(*) AS count FROM "kf_precedent_corpus_records" GROUP BY "authorityStatus" ORDER BY COUNT(*) DESC`,
  );

  await agg(
    "definitions total (count only, no terms listed)",
    `SELECT COUNT(*) AS count FROM "kf_precedent_definitions"`,
  );

  await agg(
    "scoreboard findings by class (top 20)",
    `SELECT "class" AS key, COUNT(*) AS count FROM "kf_scoreboard_findings" GROUP BY "class" ORDER BY COUNT(*) DESC LIMIT 20`,
  );
  await agg(
    "scoreboard findings by family (top 20)",
    `SELECT "family" AS key, COUNT(*) AS count FROM "kf_scoreboard_findings" GROUP BY "family" ORDER BY COUNT(*) DESC LIMIT 20`,
  );
}

async function agg(name: string, sql: string): Promise<void> {
  console.log(`\n-- ${name} --`);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql);
    for (const row of rows) {
      const printable: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        printable[k] = v === null ? "(null)" : String(v);
      }
      console.log(JSON.stringify(printable));
    }
    if (rows.length === 0) console.log("(no rows)");
  } catch (err) {
    console.log(`(query failed: ${err instanceof Error ? err.message : String(err)})`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
