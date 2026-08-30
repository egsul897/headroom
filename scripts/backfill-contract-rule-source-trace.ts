/**
 * Phase 3F.1.6.R (Workstream E) - BLOCKER-7 remediation.
 *
 * docs/phase-3f1-6-final-foundation-certification/09-source-trace-
 * certification.json (finding S11-F1): Phase 3F.1.5.R fixed
 * persistContractRules (lib/contract-model/compiler/persistence.ts) to store
 * each ContractRule.definedTermRefs entry as the correct, document-scoped
 * DefinedTermNode.stableKey (`defined-term:<sha256-slice>`) instead of the
 * raw defined-term NAME string it used to store. That fix is prospective
 * only - it is independently re-confirmed correct for freshly-compiled data,
 * but it does not retroactively touch ContractRule rows that were already
 * persisted before it shipped. Those rows still carry the OLD, pre-fix
 * value (a bare term-name string, e.g. "Consolidated EBITDA") in
 * definedTermRefs, which can never equal a real stableKey - so
 * getRuleSourceTrace's `definedTerms` field silently returns an EMPTY array
 * for every one of these rows, indistinguishable from the legitimate "this
 * rule has no term dependencies" state (lib/contract-model/service.ts).
 *
 * THIS SCRIPT closes that specific, named data-completeness gap: it
 * recomputes each affected row's definedTermRefs using
 * `toDefinedTermStableKeys` - persistence.ts's own exported helper,
 * imported here unmodified, NOT a parallel re-derivation of the formula -
 * so the backfilled value is always exactly what persistContractRules would
 * compute for that row today.
 *
 * SCOPE: this script touches ONLY ContractRule.definedTermRefs. It does not
 * touch DocumentNode, DefinedTermNode, or any other table, and does not
 * change persistContractRules' own logic (already correct - Phase 3F.1.5.R).
 * See docs/phase-3f1-6-r-blocker-remediation/10-contract-rule-backfill.json
 * for a documented, DISCOVERED-BUT-OUT-OF-SCOPE adjacent finding (stale
 * pre-P0-2 DefinedTermNode.stableKey values for the same two fixture
 * companies) that this script deliberately does not fix, per that scope
 * boundary.
 *
 * IDENTIFICATION (by data condition, never a hardcoded id list): a
 * ContractRule row is AFFECTED if any of its definedTermRefs entries does
 * NOT match the current stableKey format `defined-term:<hex digest>` - the
 * format is derived at runtime from a real `computeStableKey` call, never a
 * hardcoded digest length, so this script cannot silently drift out of sync
 * with lib/contract-model/stable-keys.ts.
 *
 * IDEMPOTENT: re-running this script finds zero affected rows the second
 * time (every entry now matches the current format) and writes nothing -
 * safe to run as many times as needed, including as a startup/CI gate.
 *
 * TENANT ISOLATION: processed per companyId; every read, computation, and
 * write for a row uses ONLY that row's own companyId and sourceDocumentId -
 * never another tenant's data, and rows are updated one at a time by their
 * own primary key (never a broad company-wide or table-wide write).
 *
 * MODES:
 *   npx tsx scripts/backfill-contract-rule-source-trace.ts            (dry run, default - reports only, writes nothing)
 *   npx tsx scripts/backfill-contract-rule-source-trace.ts --write    (applies the fix, one transaction per company)
 *
 * REFUSES TO GUESS: an entry that is empty/whitespace-only after the format
 * check (never a real term name any real extraction could have produced) is
 * logged to the `unrecoverable` list with its reason, and its ROW is left
 * completely untouched (no partial-row write) rather than writing a
 * fabricated stableKey for a name that cannot legitimately mean anything.
 */
import { prisma } from "../lib/prisma";
import { computeStableKey } from "../lib/contract-model/stable-keys";
import { toDefinedTermStableKeys } from "../lib/contract-model/compiler/persistence";

// Derived from a real computeStableKey call - never a hardcoded digest
// length - so this format check can never drift out of sync with
// lib/contract-model/stable-keys.ts's own implementation.
const SAMPLE_KEY = computeStableKey("defined-term", "__sample_company__", "__sample_document__", "__sample_term__");
const DIGEST_LENGTH = SAMPLE_KEY.length - "defined-term:".length;
const CURRENT_STABLE_KEY_FORMAT = new RegExp(`^defined-term:[0-9a-f]{${DIGEST_LENGTH}}$`);

export interface RowFinding {
  id: string;
  companyId: string;
  sourceDocumentId: string;
  before: string[];
  after: string[] | null; // null when unrecoverable
  changedEntries: number;
  unrecoverableReason: string | null;
}

export interface CompanyReport {
  companyId: string;
  totalRulesWithDefinedTermRefs: number;
  affectedRows: number;
  correctedRows: number;
  unrecoverableRows: number;
  unchangedRows: number;
  affectedEntries: number;
  correctedEntries: number;
  findings: RowFinding[];
}

/** Recomputes one row's definedTermRefs using persistence.ts's own canonical formula, leaving already-correct-format entries untouched and refusing to guess at an empty/whitespace-only entry. */
function reconstructRow(companyId: string, sourceDocumentId: string, definedTermRefs: string[]): { after: string[] | null; changedEntries: number; unrecoverableReason: string | null } {
  const after: string[] = [];
  let changedEntries = 0;
  for (const entry of definedTermRefs) {
    if (CURRENT_STABLE_KEY_FORMAT.test(entry)) {
      after.push(entry); // already the current, correct format - pass through unchanged.
      continue;
    }
    if (entry.length === 0) {
      return { after: null, changedEntries: 0, unrecoverableReason: `definedTermRefs contains an empty-string entry - no real term name to recompute a stableKey from (refusing to guess)` };
    }
    // Same canonical logic persistContractRules itself uses today - never a
    // parallel re-derivation. toDefinedTermStableKeys lowercases internally.
    const recomputed = toDefinedTermStableKeys(companyId, sourceDocumentId, [entry])[0];
    if (!recomputed) throw new Error(`toDefinedTermStableKeys returned no key for a single-element input - this should be structurally impossible.`);
    after.push(recomputed);
    changedEntries++;
  }
  return { after, changedEntries, unrecoverableReason: null };
}

export async function analyzeCompany(companyId: string): Promise<CompanyReport> {
  const rows = await prisma.contractRule.findMany({
    where: { companyId, definedTermRefs: { isEmpty: false } },
    select: { id: true, companyId: true, sourceDocumentId: true, definedTermRefs: true },
    orderBy: { id: "asc" },
  });

  const findings: RowFinding[] = [];
  let affectedEntries = 0;

  for (const row of rows) {
    const nonConforming = row.definedTermRefs.filter((e) => !CURRENT_STABLE_KEY_FORMAT.test(e));
    if (nonConforming.length === 0) continue; // already fully conforming - not affected, no finding recorded.

    affectedEntries += nonConforming.length;
    const { after, changedEntries, unrecoverableReason } = reconstructRow(row.companyId, row.sourceDocumentId, row.definedTermRefs);
    findings.push({
      id: row.id,
      companyId: row.companyId,
      sourceDocumentId: row.sourceDocumentId,
      before: row.definedTermRefs,
      after,
      changedEntries,
      unrecoverableReason,
    });
  }

  const correctedRows = findings.filter((f) => f.unrecoverableReason === null).length;
  const unrecoverableRows = findings.filter((f) => f.unrecoverableReason !== null).length;
  const correctedEntries = findings.filter((f) => f.unrecoverableReason === null).reduce((sum, f) => sum + f.changedEntries, 0);

  return {
    companyId,
    totalRulesWithDefinedTermRefs: rows.length,
    affectedRows: findings.length,
    correctedRows,
    unrecoverableRows,
    unchangedRows: rows.length - findings.length,
    affectedEntries,
    correctedEntries,
    findings,
  };
}

/** Applies one company's corrections inside a single transaction - tenant-scoped, all-or-nothing for that company. Rows with a null `after` (unrecoverable) are never written. */
export async function applyCompany(report: CompanyReport): Promise<void> {
  const writable = report.findings.filter((f) => f.after !== null);
  if (writable.length === 0) return;
  // Interactive-callback $transaction (matching persistence.ts's own
  // convention throughout this file) - one atomic, tenant-scoped
  // transaction per company; a partial failure rolls back the whole batch
  // rather than leaving this company's rows half-corrected.
  await prisma.$transaction(
    async (tx) => {
      for (const f of writable) {
        // updateMany (not update) so the write itself can be guarded by
        // BOTH id and companyId together - defense in depth beyond the read
        // that produced `f`, never relying on `id` alone to imply the
        // correct tenant.
        const { count } = await tx.contractRule.updateMany({
          where: { id: f.id, companyId: report.companyId },
          data: { definedTermRefs: f.after! },
        });
        if (count !== 1) {
          throw new Error(`Expected to update exactly 1 row for ContractRule ${f.id} in company ${report.companyId}, matched ${count} - refusing to proceed (possible tenant mismatch or row disappeared mid-run).`);
        }
      }
    },
    { timeout: 30_000 }
  );
}

export interface BackfillTotals {
  scanned: number;
  affectedRows: number;
  affectedEntries: number;
  correctedRows: number;
  correctedEntries: number;
  unrecoverableRows: number;
}

export interface BackfillResult {
  write: boolean;
  reports: CompanyReport[];
  totals: BackfillTotals;
  stillAffectedUnexplained: number | null; // null in dry-run mode (no post-write verification pass runs)
}

/**
 * Runs the full identify -> (optionally) correct -> verify cycle. Exported
 * so both this file's own CLI `main()` and tests/contract-model/backfill-
 * contract-rule-source-trace.test.ts can call the exact same logic - a test
 * exercising anything other than this real function would not actually be
 * testing the backfill.
 *
 * `companyIds` restricts the scan to a specific tenant set (tests use this
 * to scope to their own synthetic fixture company, never touching real
 * companies' rows); omitted in production use, where every company is
 * scanned - the tenant-isolation discipline itself is unconditional
 * (per-row companyId is always what is read/written), this parameter only
 * narrows which tenants get processed IN this run.
 */
export async function runBackfill(options: { write: boolean; companyIds?: string[]; log?: (line: string) => void }): Promise<BackfillResult> {
  const { write, companyIds } = options;
  const log = options.log ?? console.log;
  log(`BLOCKER-7 source-trace backfill - mode: ${write ? "WRITE (transactional)" : "DRY RUN (no writes)"}`);
  log(`Current stableKey format for 'defined-term': ^defined-term:[0-9a-f]{${DIGEST_LENGTH}}$\n`);

  const companies = companyIds ? companyIds.map((id) => ({ id })) : await prisma.company.findMany({ select: { id: true } });
  const reports: CompanyReport[] = [];

  for (const { id: companyId } of companies) {
    const report = await analyzeCompany(companyId);
    if (report.affectedRows === 0 && report.totalRulesWithDefinedTermRefs === 0) continue; // nothing to say about a company with zero relevant rows.
    reports.push(report);

    log(`Company: ${companyId}`);
    log(`  ContractRule rows with non-empty definedTermRefs: ${report.totalRulesWithDefinedTermRefs}`);
    log(`  Affected rows (>=1 non-conforming entry):        ${report.affectedRows}`);
    log(`  Affected entries:                                ${report.affectedEntries}`);
    log(`  Recoverable (will be corrected):                 ${report.correctedRows} rows / ${report.correctedEntries} entries`);
    log(`  Unrecoverable (left untouched, logged):          ${report.unrecoverableRows}`);
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
      scanned: acc.scanned + r.totalRulesWithDefinedTermRefs,
      affectedRows: acc.affectedRows + r.affectedRows,
      affectedEntries: acc.affectedEntries + r.affectedEntries,
      correctedRows: acc.correctedRows + r.correctedRows,
      correctedEntries: acc.correctedEntries + r.correctedEntries,
      unrecoverableRows: acc.unrecoverableRows + r.unrecoverableRows,
    }),
    { scanned: 0, affectedRows: 0, affectedEntries: 0, correctedRows: 0, correctedEntries: 0, unrecoverableRows: 0 }
  );

  log("=== TOTALS ===");
  log(`  Rows scanned (non-empty definedTermRefs):  ${totals.scanned}`);
  log(`  Rows affected (pre-fix format):             ${totals.affectedRows}`);
  log(`  Entries affected:                           ${totals.affectedEntries}`);
  log(`  Rows corrected${write ? "" : " (would be)"}:                    ${totals.correctedRows}`);
  log(`  Entries corrected${write ? "" : " (would be)"}:                 ${totals.correctedEntries}`);
  log(`  Rows unrecoverable:                         ${totals.unrecoverableRows}`);

  let stillAffectedUnexplained: number | null = null;
  if (write) {
    // Post-write verification: re-scan for any row still non-conforming
    // that was NOT explicitly logged as unrecoverable - that would mean a
    // write silently failed to take effect.
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

// Guarded so tests/contract-model/backfill-contract-rule-source-trace.test.ts
// can `import { runBackfill, analyzeCompany, applyCompany } from
// "../../scripts/backfill-contract-rule-source-trace"` and exercise the
// exact real backfill logic without also triggering this file's own
// production run (which would scan/write every real company) merely by
// importing it - the same discipline scripts/phase-3b-real-regression.ts
// already established for this codebase.
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
