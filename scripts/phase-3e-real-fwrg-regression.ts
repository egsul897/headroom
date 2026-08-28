/**
 * Phase 3E §161 - first full known-document semantic-coverage regression
 * (FWRG). Zero new model calls (task's own cost discipline: "reuse cached
 * Phase 2 structure and preserved Phase 3 compiler/verifier output") -
 * every input is real, already-committed evidence from this repository:
 *
 *  - the REAL FWRG Article 6 structural index, built the exact same way
 *    scripts/phase-3b-real-regression.ts's own loadFwrgLsbStructuralIndex()
 *    already does (Phase 2A's real parser, real source text);
 *  - the REAL, preserved, whole-document Phase 2B discovery run
 *    (tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json) -
 *    252 real candidates across 418 real structural nodes, produced from
 *    the ENTIRE Article 6 text, never a hand-selected section subset;
 *  - the REAL, preserved Phase 3B compiled IR
 *    (tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json) -
 *    the real FWRG sections this repository has genuinely compiled before.
 *
 * Runs Phase 3E's real end-to-end pipeline (Layers A/B only - no AI caller,
 * $0 cost) over the REAL document root and prints the honest coverage
 * result. Shares its load/remap/report logic with the LSB entry script
 * (phase-3e-real-lsb-regression.ts) via phase-3e-real-package-regression.ts.
 *
 * Run via: npx tsx scripts/phase-3e-real-fwrg-regression.ts
 */
import { documentIdFor, loadRealCompiledResults as loadRealCompiledResultsForPackage, loadRealDiscoveredCandidates as loadRealDiscoveredCandidatesForPackage, runRealPackageRegression } from "./phase-3e-real-package-regression";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

export const DOCUMENT_ID = documentIdFor("fwrg");

/** Package-bound wrappers so tests/contract-model/semantic-coverage-real-fwrg-regression.test.ts keeps its existing call shape (no args needed). */
export function loadRealDiscoveredCandidates(): DiscoveredCandidate[] {
  return loadRealDiscoveredCandidatesForPackage("fwrg");
}

export function loadRealCompiledResults(discoveredCandidates: DiscoveredCandidate[]) {
  return loadRealCompiledResultsForPackage("fwrg", discoveredCandidates);
}

const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  runRealPackageRegression("fwrg").catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
