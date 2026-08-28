/**
 * Phase 3E §161/§162 - shared real, zero-new-cost, whole-document
 * semantic-coverage regression logic for both known packages (FWRG and
 * LSB). Every input is real, already-committed evidence from this
 * repository - see scripts/phase-3e-real-fwrg-regression.ts's own header
 * for the full evidence provenance. Parameterized here so the FWRG and
 * LSB entry scripts share one implementation rather than two copies of
 * the same load/remap/report logic.
 */
import { readFileSync } from "node:fs";
import { loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { IRRule, IRDefinition } from "../lib/contract-model/ir/types";
import type { CompiledCandidateResult } from "../lib/contract-model/compiler/semantic-coverage/reconciliation";

export type RealPackage = "fwrg" | "lsb";

export function documentIdFor(pkg: RealPackage): string {
  return `${pkg}-article-6`;
}

interface RawDiscoveryCandidate extends Omit<DiscoveredCandidate, "documentId" | "structuralNodeKeys"> {
  documentId: string;
  structuralNodeKeys: string[];
}

const DISCOVERY_RUN_PATHS: Record<RealPackage, string> = {
  fwrg: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json",
  lsb: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json",
};

export function loadRealDiscoveredCandidates(pkg: RealPackage): DiscoveredCandidate[] {
  const documentId = documentIdFor(pkg);
  const raw: { candidates: RawDiscoveryCandidate[]; summary: Record<string, unknown> } = JSON.parse(readFileSync(DISCOVERY_RUN_PATHS[pkg], "utf-8"));
  console.log(`Real Phase 2B discovery run summary (${pkg}): ${JSON.stringify(raw.summary)}`);
  // The preserved run used bare documentId (e.g. "fwrg"/"lsb") - remap to the "${pkg}-article-6"
  // convention loadFwrgLsbStructuralIndex() uses, a pure identity relabeling, never a
  // re-derivation of the discovery itself.
  return raw.candidates.map((c) => ({ ...c, documentId, structuralNodeKeys: c.structuralNodeKeys.map((k) => k.replace(new RegExp(`^${pkg}::`), `${documentId}::`)) }));
}

interface PreservedCompileResult {
  id: string;
  result: { status: string; rules: IRRule[]; definitions: IRDefinition[] };
}

const PRESERVED_COMPILE_RUN_PATH = "tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json";

export function loadRealCompiledResults(pkg: RealPackage, discoveredCandidates: DiscoveredCandidate[]): CompiledCandidateResult[] {
  const preserved: { results: PreservedCompileResult[] } = JSON.parse(readFileSync(PRESERVED_COMPILE_RUN_PATH, "utf-8"));
  // Excludes each package's own "-def-" entry - a definitions-document result, out of scope
  // for THIS document's own root (Article 6), which loadFwrgLsbStructuralIndex keeps as a
  // separate document ("${pkg}-definitions").
  const sectionResults = preserved.results.filter((r) => r.id.startsWith(`${pkg}-`) && !r.id.includes("-def-"));

  const out: CompiledCandidateResult[] = [];
  for (const r of sectionResults) {
    const sectionRef = r.result.rules[0]?.sourceSectionRef ?? r.result.definitions[0]?.definitionId;
    const candidate = discoveredCandidates.find((c) => c.normalizedSourceRef === sectionRef);
    if (!candidate) {
      console.log(`  (no matching real discovered candidate found for preserved compile result "${r.id}" (sectionRef ${sectionRef}) - skipped)`);
      continue;
    }
    out.push({ candidateRef: candidate.discoveryId, rules: r.result.rules, definitions: r.result.definitions });
    console.log(`  matched preserved compile "${r.id}" -> real discoveryId ${candidate.discoveryId} (${candidate.normalizedSourceRef}), status=${r.result.status}, rules=${r.result.rules.length}`);
  }
  return out;
}

export async function runRealPackageRegression(pkg: RealPackage): Promise<void> {
  const documentId = documentIdFor(pkg);
  console.log(`================ Phase 3E real ${pkg.toUpperCase()} Article 6 regression ================\n`);

  const { index } = loadFwrgLsbStructuralIndex();
  const allNodes = index.allNodes().filter((n) => n.documentId === documentId);
  console.log(`Real StructuralIndex for ${documentId}: ${allNodes.length} structural nodes (Phase 2A's own real parser, real source text - never a hand-selected section list).\n`);

  const discoveredCandidates = loadRealDiscoveredCandidates(pkg);
  console.log(`Real Phase 2B discovery: ${discoveredCandidates.length} candidates across the ENTIRE document root.\n`);

  console.log("Matching preserved real Phase 3B compiled IR to real discovered candidates:");
  const compiledResults = loadRealCompiledResults(pkg, discoveredCandidates);
  console.log(`\n${compiledResults.length} of ${discoveredCandidates.length} real discovered candidates have real, preserved compiled IR in this repository's actual history.\n`);

  const result = await runSemanticCoverageAudit({
    companyId: `${pkg}-real-regression`,
    packageKey: `${pkg}-real-package`,
    instrumentKey: null,
    index,
    documents: [{ documentId }],
    discoveredCandidates,
    compiledResults,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });

  const doc = result.packageCoverage.documents[0]!;
  console.log("================ RESULT ================");
  console.log(`Total real material semantic units hypothesized (Layer A/B, deterministic, $0 cost): ${doc.units.length}`);
  console.log(`Raw fully-represented fraction: ${(doc.rawFullyRepresentedFraction * 100).toFixed(1)}%`);
  console.log(`Materiality-weighted fully-represented fraction: ${(doc.materialityWeightedFullyRepresentedFraction * 100).toFixed(1)}%`);
  console.log(`Document gate status: ${doc.gateStatus}`);
  console.log(`Dangerous-unaccounted units: ${doc.dangerousUnaccounted.length}`);
  const byReason = new Map<string, number>();
  for (const d of doc.dangerousUnaccounted) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
  for (const [reason, count] of byReason) console.log(`  - ${reason}: ${count}`);

  console.log("\nCoverage state breakdown:");
  const byState = new Map<string, number>();
  for (const e of doc.coverageEntries) byState.set(e.coverageState, (byState.get(e.coverageState) ?? 0) + 1);
  for (const [state, count] of byState) console.log(`  - ${state}: ${count}`);

  console.log("\nFamily summaries:");
  for (const f of doc.familySummaries) console.log(`  - ${f.family}: ${f.unitCount} unit(s), fully=${f.fullyRepresentedCount}, partial=${f.partiallyRepresentedCount}, unrepresented=${f.unrepresentedCount}, dangerous=${f.dangerousUnaccountedCount}, entireFamilyMissing=${f.entireFamilyMissing}`);

  console.log("\nCross-section relationship findings:");
  const crossSection = result.documentDetails[0]!.crossSectionFindings;
  if (crossSection.length === 0) console.log("  (none)");
  for (const f of crossSection) console.log(`  - ${f.relationshipType} found=${f.found}: ${f.reasoning}`);

  console.log(`\nPACKAGE STATUS: ${result.packageCoverage.status}`);
  for (const r of result.packageCoverage.statusReasons) console.log(`  - ${r}`);

  console.log(`\n(Every real candidate not in the compiledResults set above is honestly reported as CANDIDATE_DISCOVERED_NEVER_COMPILED or NO_CANDIDATE_EVER_DISCOVERED where applicable - this reflects genuine historical fact: this codebase has never run the real Phase 3B compiler against the FULL ${pkg.toUpperCase()} Article 6 document, only a handful of hand-selected sections across earlier phases. This is not a fabricated negative result; it is the honest, real state of the system, and is exactly the gap Phase 3E exists to surface at real document scale.)`);
}
