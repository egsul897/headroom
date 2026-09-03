/**
 * PHASE 3 CHWY PAID RUN - zero-cost 3E re-link (Layers A/B only, NO model calls).
 * The primary 3E audit in the paid run received the compiled section units under ad-hoc candidateRefs that were not
 * present in the 2B discoveredCandidates list, so its reconciliation could not link any compiled IR to the units it
 * hypothesized ("candidate discovered but never compiled" for every unit). This deterministic re-run adds the three
 * section-level candidates the harness actually compiled to discoveredCandidates (same nodeIds, same candidateRefs)
 * and re-runs runSemanticCoverageAudit WITHOUT an aiCaller (Layer C was budget-refused in the primary run and is not
 * attempted here). Output: stage3e-coverage-linked.json next to the primary stage3e-coverage.json (never overwritten).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const RUN = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run";
const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const OUT = `${RUN}/stage3e-coverage-linked.json`;
async function main() {
  if (existsSync(OUT)) throw new Error(`FATAL: ${OUT} exists - evidence is never rewritten`);
  const text = readFileSync(SRC, "utf-8");
  const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
  const defs = detectStructuralDefinitions("doc-a", text, nodes); const refs = detectStructuralReferences("doc-a", text, nodes);
  const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), defs, refs);
  const operativeState = computeOperativeContractState({ instrumentKey: "chwy-2026-revolving-credit-instrument", baseDocumentId: "doc-a", asOfDate: new Date().toISOString().slice(0, 10), index, allEffects: [] });
  const discovered: DiscoveredCandidate[] = JSON.parse(readFileSync(`${RUN}/stage2b-discovery.json`, "utf-8")).candidates;
  const compiled: { candidateRef: string; rules: never[]; definitions: never[] }[] = []; const verified = new Set<string>(); const sectionCandidates: DiscoveredCandidate[] = [];
  for (const ref of ["1.01", "6.08", "9.04"]) {
    const u = JSON.parse(readFileSync(`${RUN}/unit-${ref}.json`, "utf-8"));
    const c = u.compile; if (!c) continue;
    compiled.push({ candidateRef: u.candidateRef, rules: c.rules, definitions: c.definitions });
    if (u.verify && (u.verify.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || u.verify.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS")) verified.add(u.candidateRef);
    sectionCandidates.push({ discoveryId: u.candidateRef, documentId: "doc-a", structuralNodeKeys: [u.unit.nodeKey], structuralNodeIds: [u.unit.nodeId], normalizedSourceRef: ref, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: u.unit.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: "", discoveryRunVersion: "phase-3-validation.paid.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package", valueAnchors: [] } as unknown as DiscoveredCandidate);
  }
  const coverage = await runSemanticCoverageAudit({ companyId: "phase-3-validation-chwy", packageKey: "chwy-2026-credit-agreement", instrumentKey: "chwy-2026-revolving-credit-instrument", index, documents: [{ documentId: "doc-a" }], discoveredCandidates: [...discovered, ...sectionCandidates], compiledResults: compiled as never, verifiedCandidateRefs: verified, operativeState, operativeVersionRef: null, structuralParserVersion: "phase-2a-structural-index", providerIdentity: "vercel-ai-gateway::anthropic/claude-sonnet-5" });
  const d = coverage.packageCoverage.documents[0]!;
  const states: Record<string, number> = {}; for (const e of d.coverageEntries) states[e.coverageState] = (states[e.coverageState] ?? 0) + 1;
  console.log(JSON.stringify({ status: coverage.packageCoverage.status, gate: d.gateStatus, units: d.units.length, states, dangerous: d.dangerousUnaccounted.length, compiledRefs: compiled.map((c) => c.candidateRef), verified: [...verified] }));
  writeFileSync(OUT, JSON.stringify({ note: "Zero-cost deterministic re-link of the primary 3E audit: the three compiled section units were added to discoveredCandidates under their real candidateRefs so reconciliation can see compiled IR. Layer C NOT run (no aiCaller). Primary stage3e-coverage.json preserved unchanged.", paidModelCalls: 0, packageCoverage: coverage.packageCoverage, documentDetails: coverage.documentDetails }, null, 2));
  console.log(`preserved ${OUT}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
