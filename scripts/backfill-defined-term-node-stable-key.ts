/**
 * Phase 3F.1.6.RX (Part A, Workstream C) - BLOCKER-7 + AUDIT-F5 remediation.
 *
 * docs/phase-3f1-6-r-blocker-remediation/10-contract-rule-backfill.json's own
 * `adjacentDiscoveredFindingOutOfScope` disclosed - but deliberately did not
 * fix - a SECOND, distinct staleness defect: `DefinedTermNode.stableKey`
 * itself is still the OLD, pre-P0-2 format
 * (`computeStableKey("defined-term", companyId, normalizedName)` - no
 * documentId) for every row created before Phase 3F.1.4's P0-2 fix shipped.
 * Phase 3F.1.4 fixed `persistDefinedTerms`/`persistStructuralDefinitions`
 * (lib/contract-model/compiler/persistence.ts) to compute the NEW,
 * document-scoped stableKey (`computeStableKey("defined-term", companyId,
 * documentId, normalizedName)`) prospectively - but, exactly like BLOCKER-7's
 * ContractRule defect, that fix never shipped with a historical backfill for
 * rows already persisted under the old formula. Because both persist
 * functions upsert by `where: { companyId_stableKey }`, an old-format row can
 * never be self-healed by a normal re-run: a fresh compile computes the NEW
 * key, finds no row at that key, and would CREATE a second, duplicate-content
 * row rather than update the old one in place - the old row is simply
 * orphaned, not corrected.
 *
 * PRACTICAL IMPACT (reproduced against this environment's real Postgres -
 * see docs/phase-3f1-6-rx-final-blocker-closure/05-source-trace-referential-
 * integrity.json for the full run): `getRuleSourceTrace`'s
 * `prisma.definedTermNode.findMany({ where: { companyId, stableKey: { in:
 * rule.definedTermRefs } } })` (lib/contract-model/service.ts) does an EXACT
 * stableKey match with no fallback, so a ContractRule's now-correctly-shaped
 * definedTermRefs (BLOCKER-7's own backfill, scripts/backfill-contract-rule-
 * source-trace.ts) still silently resolves to an EMPTY `definedTerms` array
 * for every company whose DefinedTermNode rows are this stale - a real,
 * referential-integrity gap, not merely a shape/format one. This script
 * closes THAT gap: it does not touch ContractRule at all.
 *
 * IDENTIFICATION (by data condition, never a hardcoded id list, never scoped
 * to the two companies that happened to surface this during BLOCKER-7): a
 * DefinedTermNode row is AFFECTED if recomputing the CURRENT, canonical
 * formula from the row's OWN already-stored (companyId, documentId,
 * normalizedName) columns does not equal its own stored `stableKey`. Unlike
 * the ContractRule case (where the raw name had to be parsed out of an opaque
 * array entry), DefinedTermNode already stores documentId and normalizedName
 * as real columns, so this is a direct, unambiguous recomputation - never a
 * guess, never a format-regex heuristic.
 *
 * CANONICAL LOGIC REUSE: recomputation uses `computeStableKey` (lib/
 * contract-model/stable-keys.ts) with the EXACT same argument order
 * `persistDefinedTerms` itself uses today (companyId, documentId,
 * normalizedName) - never a second, parallel re-derivation of the formula.
 *
 * COLLISION HANDLING (refuses to guess): if a DIFFERENT row already exists at
 * the target (companyId, correctStableKey) - i.e. a forward re-run since the
 * P0-2 fix shipped already created the correct-format row for this same real
 * definition, leaving the old-format row an orphaned duplicate - this script
 * does NOT attempt to merge or delete either row. Merging would require
 * deciding whose sourceNodeId/definitionTextRef/effectiveFrom/reviewStatus
 * wins and re-pointing every dependent FK (AmendmentEffect.targetTermId,
 * ContractReferenceEdge.targetTermId, DefinedTermDependencyEdge.fromTermId/
 * toTermId, UnresolvedContractItem.sourceTermId - all keyed by the term's
 * `id`, not its `stableKey`) from the old row's id to the new row's id - a
 * distinct, non-trivial migration analogous to scripts/backfill-golden-test-
 * stable-keys.ts's own create-then-repoint-then-tombstone-old-row bridge
 * pattern, not a mechanical rename. Such a row is logged unrecoverable with
 * both ids named, left completely untouched, and reported distinctly from
 * the "safe to rename in place" case. (Not encountered in this environment:
 * see runResults - every affected row's target key was free.)
 *
 * WHY AN IN-PLACE RENAME IS SAFE FOR THE NON-COLLIDING CASE: `id` is the
 * primary key and is NEVER changed by this script - only the `stableKey`
 * column. Every downstream consumer of a DefinedTermNode row other than
 * `getRuleSourceTrace`/`validateDefinedTermTargetsExist`'s own stableKey
 * lookups (lib/contract-model/service.ts, lib/contract-model/validators.ts)
 * references the row by `id` via a real FK (grep-confirmed: AmendmentEffect,
 * ContractReferenceEdge, DefinedTermDependencyEdge, UnresolvedContractItem
 * all reference DefinedTermNode.id, never .stableKey) - so renaming
 * `stableKey` in place changes nothing about those relationships and cannot
 * silently break or repoint any dependent row.
 *
 * IDEMPOTENT: re-running this script finds zero affected rows once every row
 * matches the current formula, and writes nothing.
 *
 * TENANT ISOLATION: processed per companyId; every read, computation, and
 * write for a row uses ONLY that row's own companyId/documentId/
 * normalizedName; the collision check itself is also scoped to (companyId,
 * candidateKey) - never a cross-tenant lookup; writes are guarded by
 * `updateMany({ where: { id, companyId } })` asserting `count === 1`.
 *
 * MODES:
 *   npx tsx scripts/backfill-defined-term-node-stable-key.ts            (dry run, default - reports only, writes nothing)
 *   npx tsx scripts/backfill-defined-term-node-stable-key.ts --write    (applies the fix, one transaction per company)
 */
import { prisma } from "../lib/prisma";
import { computeStableKey } from "../lib/contract-model/stable-keys";

/** The one, current, canonical formula - byte-for-byte the same expression persistDefinedTerms/persistStructuralDefinitions use today. Never re-derived a second way. */
function correctStableKeyFor(companyId: string, documentId: string, normalizedName: string): string {
  return computeStableKey("defined-term", companyId, documentId, normalizedName);
}

export interface RowFinding {
  id: string;
  companyId: string;
  documentId: string;
  normalizedName: string;
  before: string;
  after: string; // the correct, canonical stableKey this row SHOULD have.
  collisionRowId: string | null; // set when a DIFFERENT row already owns `after` - unrecoverable.
  unrecoverableReason: string | null;
}

export interface CompanyReport {
  companyId: string;
  totalRows: number;
  affectedRows: number;
  correctedRows: number;
  unrecoverableRows: number;
  unchangedRows: number;
  findings: RowFinding[];
}

export async function analyzeCompany(companyId: string): Promise<CompanyReport> {
  const rows = await prisma.definedTermNode.findMany({
    where: { companyId },
    select: { id: true, companyId: true, documentId: true, stableKey: true, normalizedName: true },
    orderBy: { id: "asc" },
  });

  const findings: RowFinding[] = [];
  for (const row of rows) {
    const correct = correctStableKeyFor(row.companyId, row.documentId, row.normalizedName);
    if (correct === row.stableKey) continue; // already conforming - not affected, no finding recorded.

    // Collision check: is `correct` already claimed by a DIFFERENT row in
    // this same tenant? Scoped strictly to (companyId, correct) - never a
    // cross-tenant lookup, matching the unique index's own scoping
    // (companyId_stableKey).
    const existing = await prisma.definedTermNode.findUnique({
      where: { companyId_stableKey: { companyId: row.companyId, stableKey: correct } },
      select: { id: true },
    });
    const collisionRowId = existing && existing.id !== row.id ? existing.id : null;

    findings.push({
      id: row.id,
      companyId: row.companyId,
      documentId: row.documentId,
      normalizedName: row.normalizedName,
      before: row.stableKey,
      after: correct,
      collisionRowId,
      unrecoverableReason: collisionRowId
        ? `Target stableKey ${correct} is already owned by a different DefinedTermNode row (${collisionRowId}) in this tenant - this is a duplicate-content collision (this row and ${collisionRowId} both represent the same document's definition of the same term under the old vs. new stableKey formula) that requires a dedicated merge/FK-repoint migration, never a mechanical rename. Refusing to guess which row's sourceNodeId/definitionTextRef/effectiveFrom/reviewStatus should win. Row ${row.id} left completely untouched.`
        : null,
    });
  }

  const correctedRows = findings.filter((f) => f.unrecoverableReason === null).length;
  const unrecoverableRows = findings.filter((f) => f.unrecoverableReason !== null).length;

  return {
    companyId,
    totalRows: rows.length,
    affectedRows: findings.length,
    correctedRows,
    unrecoverableRows,
    unchangedRows: rows.length - findings.length,
    findings,
  };
}

/** Applies one company's corrections inside a single transaction - tenant-scoped, all-or-nothing for that company. Collision rows (unrecoverableReason set) are never written. */
export async function applyCompany(report: CompanyReport): Promise<void> {
  const writable = report.findings.filter((f) => f.unrecoverableReason === null);
  if (writable.length === 0) return;
  await prisma.$transaction(
    async (tx) => {
      for (const f of writable) {
        // updateMany (not update) so the write is guarded by BOTH id and
        // companyId together - defense in depth beyond the read that
        // produced `f`, matching scripts/backfill-contract-rule-source-
        // trace.ts's own convention. `id` (the primary key, and every
        // dependent FK's join column) is never touched - only `stableKey`.
        const { count } = await tx.definedTermNode.updateMany({
          where: { id: f.id, companyId: report.companyId },
          data: { stableKey: f.after },
        });
        if (count !== 1) {
          throw new Error(`Expected to update exactly 1 row for DefinedTermNode ${f.id} in company ${report.companyId}, matched ${count} - refusing to proceed (possible tenant mismatch or row disappeared mid-run).`);
        }
      }
    },
    { timeout: 30_000 }
  );
}

export interface BackfillTotals {
  scanned: number;
  affectedRows: number;
  correctedRows: number;
  unrecoverableRows: number;
}

export interface BackfillResult {
  write: boolean;
  reports: CompanyReport[];
  totals: BackfillTotals;
  stillAffectedUnexplained: number | null; // null in dry-run mode (no post-write verification pass runs)
}

/**
 * Runs the full identify -> (optionally) correct -> verify cycle. Exported so
 * both this file's own CLI `main()` and tests/contract-model/backfill-
 * defined-term-node-stable-key.test.ts can call the exact same logic.
 *
 * `companyIds` restricts the scan to a specific tenant set (tests use this to
 * scope to their own synthetic fixture company, never touching real
 * companies' rows); omitted in production use, where every company is
 * scanned.
 */
export async function runBackfill(options: { write: boolean; companyIds?: string[]; log?: (line: string) => void }): Promise<BackfillResult> {
  const { write, companyIds } = options;
  const log = options.log ?? console.log;
  log(`BLOCKER-7/AUDIT-F5 DefinedTermNode.stableKey backfill - mode: ${write ? "WRITE (transactional)" : "DRY RUN (no writes)"}`);
  log(`Canonical formula: computeStableKey("defined-term", companyId, documentId, normalizedName)\n`);

  const companies = companyIds ? companyIds.map((id) => ({ id })) : await prisma.company.findMany({ select: { id: true } });
  const reports: CompanyReport[] = [];

  for (const { id: companyId } of companies) {
    const report = await analyzeCompany(companyId);
    if (report.totalRows === 0) continue; // nothing to say about a company with zero DefinedTermNode rows.
    reports.push(report);

    log(`Company: ${companyId}`);
    log(`  DefinedTermNode rows:                    ${report.totalRows}`);
    log(`  Affected rows (stale stableKey):          ${report.affectedRows}`);
    log(`  Recoverable (will be corrected):          ${report.correctedRows}`);
    log(`  Unrecoverable (collision, left untouched): ${report.unrecoverableRows}`);
    if (report.unrecoverableRows > 0) {
      for (const f of report.findings.filter((x) => x.unrecoverableReason)) {
        log(`    UNRECOVERABLE ${f.id}: ${f.unrecoverableReason}`);
      }
    }
    if (write && report.correctedRows > 0) {
      await applyCompany(report);
      log(`  WROTE: ${report.correctedRows} row(s) updated in one transaction for ${companyId}.`);
    }
    log("");
  }

  const totals: BackfillTotals = reports.reduce(
    (acc, r) => ({
      scanned: acc.scanned + r.totalRows,
      affectedRows: acc.affectedRows + r.affectedRows,
      correctedRows: acc.correctedRows + r.correctedRows,
      unrecoverableRows: acc.unrecoverableRows + r.unrecoverableRows,
    }),
    { scanned: 0, affectedRows: 0, correctedRows: 0, unrecoverableRows: 0 }
  );

  log("=== TOTALS ===");
  log(`  Rows scanned:                               ${totals.scanned}`);
  log(`  Rows affected (stale stableKey):            ${totals.affectedRows}`);
  log(`  Rows corrected${write ? "" : " (would be)"}:                      ${totals.correctedRows}`);
  log(`  Rows unrecoverable (collision):              ${totals.unrecoverableRows}`);

  let stillAffectedUnexplained: number | null = null;
  if (write) {
    // Post-write verification: re-scan for any row still non-conforming that
    // was NOT explicitly logged as unrecoverable - that would mean a write
    // silently failed to take effect.
    stillAffectedUnexplained = 0;
    for (const { id: companyId } of companies) {
      const after = await analyzeCompany(companyId);
      const unexplained = after.findings.filter((f) => f.unrecoverableReason === null);
      stillAffectedUnexplained += unexplained.length;
      if (unexplained.length > 0) {
        log(`VERIFICATION FAILURE: ${companyId} still has ${unexplained.length} affected row(s) with no unrecoverable reason after write mode ran.`);
      }
    }
    log(`\nPost-write verification: ${stillAffectedUnexplained === 0 ? "OK - no unexplained affected rows remain." : `FAILED - ${stillAffectedUnexplained} unexplained affected row(s) remain.`}`);
  } else {
    log("\nDry run only - no writes were made. Re-run with --write to apply.");
  }

  return { write, reports, totals, stillAffectedUnexplained };
}

async function main() {
  const write = process.argv.includes("--write");
  const result = await runBackfill({ write });
  if (result.stillAffectedUnexplained !== null && result.stillAffectedUnexplained > 0) {
    process.exitCode = 1;
  }
}

// Guarded so tests/contract-model/backfill-defined-term-node-stable-key.test.ts
// can import { runBackfill, analyzeCompany, applyCompany } and exercise the
// exact real backfill logic without also triggering this file's own
// production run merely by importing it.
const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
