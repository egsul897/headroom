/**
 * Phase 3E §162 - optional second real known-document regression (LSB),
 * cost-permitting - in this case $0, reusing the exact same real-evidence
 * pattern as the FWRG run (scripts/phase-3e-real-fwrg-regression.ts):
 * the real LSB Article 6 structural index, the real, preserved,
 * whole-document Phase 2B discovery run (82 real candidates across 76
 * real structural nodes - tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json),
 * and the real, preserved Phase 3B compiled IR for the LSB sections this
 * repository has genuinely compiled before
 * (tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json).
 *
 * Run via: npx tsx scripts/phase-3e-real-lsb-regression.ts
 */
import { documentIdFor, loadRealCompiledResults as loadRealCompiledResultsForPackage, loadRealDiscoveredCandidates as loadRealDiscoveredCandidatesForPackage, runRealPackageRegression } from "./phase-3e-real-package-regression";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

export const DOCUMENT_ID = documentIdFor("lsb");

export function loadRealDiscoveredCandidates(): DiscoveredCandidate[] {
  return loadRealDiscoveredCandidatesForPackage("lsb");
}

export function loadRealCompiledResults(discoveredCandidates: DiscoveredCandidate[]) {
  return loadRealCompiledResultsForPackage("lsb", discoveredCandidates);
}

const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  runRealPackageRegression("lsb").catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
