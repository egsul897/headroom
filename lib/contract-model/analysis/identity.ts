/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - stable run identity
 * for the live contract-analysis orchestration boundary
 * (docs/phase-3f1-6-r-blocker-remediation/16-live-analysis-idempotency.json).
 *
 * `computeAnalysisPackageKey` is deliberately content-derived from this
 * run's own sorted document-id SET, never a human-chosen label and never an
 * incrementing counter - reusing the exact same `hashParts` primitive
 * lib/contract-model/compiler/hashing.ts already established for every
 * other stage-input-hash in this codebase, rather than inventing a second
 * hashing convention.
 *
 * Document rows in this codebase are immutable once created (a re-upload of
 * byte-identical content converges on the EXISTING Document row via
 * lib/connectors/upload-connector.ts's own dedup contract - see its own
 * header comment - and no code path ever mutates an existing Document's
 * stored bytes in place), so a document's id is already a safe, sufficient
 * proxy for its content identity here. This means:
 *
 *  - re-running analysis over the SAME document set resolves to the SAME
 *    packageKey (idempotent retry/resume);
 *  - adding a genuinely NEW document to the analyzed set changes the sorted
 *    id list and therefore the packageKey ("a new document version runs
 *    independently");
 *  - `analysisAlgorithmVersion` is a SEPARATE axis of the same identity
 *    (see service.ts's `@@unique([companyId, packageKey,
 *    analysisAlgorithmVersion])`) - bumping it deliberately mints a new
 *    AnalysisRun row and causes fresh reprocessing of an otherwise-unchanged
 *    document set.
 */
import { hashParts } from "../compiler/hashing";

/** The live orchestrator's own composed-pipeline version. Bump this whenever the SEQUENCE this orchestrator composes changes (a stage added/removed/reordered) - never for a change confined entirely inside one already-independently-versioned sub-module (STRUCTURAL_INDEX_VERSION, DISCOVERY_RUN_VERSION, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_COVERAGE_ALGORITHM_VERSION already each independently version their own internals; this constant versions the ORCHESTRATION itself). */
export const CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION = "phase-3f1-6-r.live-contract-analysis.v1";

/** Sorted, de-duplicated document-id list - the canonical order every packageKey/documentIds column derivation must use, so two calls with the same set in different input order still converge on the same identity. */
export function canonicalDocumentIdOrder(documentIds: readonly string[]): string[] {
  return [...new Set(documentIds)].sort();
}

/** Content-derived hash of this run's own sorted document-id set - see this module's own header comment. Never a human-chosen label. */
export function computeAnalysisPackageKey(companyId: string, documentIds: readonly string[]): string {
  const sorted = canonicalDocumentIdOrder(documentIds);
  return `pkg-${hashParts([companyId, ...sorted]).slice(0, 32)}`;
}

/** Stable, content-derived instrument key for a document set the package-graph pipeline did NOT confidently group into any real InstrumentGroupingResult - e.g. a single freshly-uploaded document with no amendment/relationship evidence yet. Never a fresh random id (mirrors this codebase's own "candidateRef/discoveryId must be stable and content-derived, never randomly generated" discipline, applied here to the one remaining case package-graph's own real instrumentKey does not cover). */
export function standaloneInstrumentKey(baseDocumentId: string): string {
  return `standalone-instrument:${baseDocumentId}`;
}
