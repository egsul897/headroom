/**
 * F-2 downstream deterministic re-link (zero paid calls): rebuilds the Chewy structural index with the corrected
 * clause hierarchy and shows that (1) the compiler-emitted 6.08 refs recorded in the paid run (unit-6.08.json)
 * and the verifier's citations now resolve to real structural nodes, (2) 2A deterministic discovery refs for
 * 6.08 are the true refs, (3) the 6.08 context bundle / source unit are rebuilt, and (4) the 3E Layers A/B
 * audit re-linked against the RECORDED compiled output improves. No semantic re-evaluation.
 * Run: npx tsx scripts/f2-chewy-relink.ts
 */
import { readFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { runSemanticCoverageAudit } from "../lib/contract-model/compiler/semantic-coverage/pipeline";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const DET = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run";
const PAID = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run";
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const defs = detectStructuralDefinitions("doc-a", text, nodes);
const refs = detectStructuralReferences("doc-a", text, nodes);
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), defs, refs);
const beforeNodes: { sectionRef: string; charStart: number; nodeType: string }[] = JSON.parse(readFileSync(`${DET}/stage1-all-nodes.json`, "utf-8"));
const beforeRefs = new Set(beforeNodes.filter((n) => n.charStart > 8980).map((n) => n.sectionRef));
const afterRefs = new Set(nodes.filter((n) => n.charStart > 8980).map((n) => n.sectionRef));
const unit = JSON.parse(readFileSync(`${PAID}/unit-6.08.json`, "utf-8"));
const emitted: string[] = [...new Set<string>([...unit.compile.rules.map((r: { sourceSectionRef: string | null }) => r.sourceSectionRef).filter(Boolean), ...unit.verify.findings.map((f: { sourceCitation: string | null }) => (f.sourceCitation ?? "").replace(/^§/, "")).filter((s: string) => /^6\.08/.test(s))])];
const resolve = (ref: string) => index.findNodesByRef("doc-a", ref).filter((n) => n.charStart > 8980);
const rows = emitted.map((ref) => ({ ref, existedBefore: beforeRefs.has(ref), existsAfter: afterRefs.has(ref), resolvesAfter: resolve(ref).length, anchorsRealText: resolve(ref)[0] ? text.slice(resolve(ref)[0]!.charStart, resolve(ref)[0]!.charStart + 50).replace(/\s+/g, " ") : null }));
const det = runPassADeterministicSignals("doc-a", index);
const det608 = det.map((c) => c.sectionRef).filter((r) => r.startsWith("6.08"));
const beforeDet: { sectionRef: string }[] = JSON.parse(readFileSync(`${DET}/stage2a-deterministic-candidates.json`, "utf-8"));
const sec = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08" && n.charStart > 8980)!;
const packageGraph = buildPackageGraph("phase-3-validation-chwy", "chwy-2026-credit-agreement", [{ documentId: "doc-a", label: "chwy", text }]);
const operativeState = computeOperativeContractState({ instrumentKey: "chwy-2026-revolving-credit-instrument", baseDocumentId: "doc-a", asOfDate: "2026-09-03", index, allEffects: [] });
const candidate = { discoveryId: "phase-3-validation:chwy:6.08", documentId: "doc-a", structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: "6.08", families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: "", discoveryRunVersion: "f2-relink", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "", valueAnchors: [] } as unknown as DiscoveredCandidate;
const bundle = buildCovenantContextBundle({ candidate, packageKey: "chwy-2026-credit-agreement", companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument" }, { index, packageGraph, exactTermsByDocument: new Map([["doc-a", new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm]))]]) });
const sc = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: index.getNodeText(sec.nodeId, "DESCENDANTS"), anchorNodeId: sec.nodeId, operativeCharStart: sec.charStart, documentText: text });
const beforeUnit = (JSON.parse(readFileSync(`${DET}/stage4-6pre-units.json`, "utf-8")) as { sectionRef: string; charStart: number; contextBundle: { items: number; sufficiency: string; unresolvedDependencies?: number }; sourceContext: { state: string; regions: number } }[]).find((u) => u.sectionRef === "6.08" && u.charStart > 8980)!;
async function main() {
  const discovered: DiscoveredCandidate[] = JSON.parse(readFileSync(`${PAID}/stage2b-discovery.json`, "utf-8")).candidates;
  const compiled = [{ candidateRef: unit.candidateRef, rules: unit.compile.rules, definitions: unit.compile.definitions }];
  const cov = await runSemanticCoverageAudit({ companyId: "phase-3-validation-chwy", packageKey: "chwy-2026-credit-agreement", instrumentKey: "chwy-2026-revolving-credit-instrument", index, documents: [{ documentId: "doc-a" }], discoveredCandidates: discovered, compiledResults: compiled as never, verifiedCandidateRefs: new Set<string>(), operativeState, operativeVersionRef: null, structuralParserVersion: "phase-2a-structural-index+f2", providerIdentity: null });
  // Re-keyed variant: 3E keys compiled results by the discovered candidate's discoveryId (reconciliation.ts compiledByRef);
  // the paid harness compiled under an ad-hoc section-level candidateRef, so its output can never be credited by 3E
  // whatever the structure. To isolate the STRUCTURAL effect, the same recorded 6.08 rules are supplied under every
  // 2B candidate anchored inside 6.08 - no semantic re-evaluation, same IR.
  const in608 = discovered.filter((c) => c.structuralNodeIds.some((id) => { const n = index.getNodeById(id); return n && n.charStart >= sec.charStart && n.charEnd <= sec.charEnd; }));
  const rekeyed = in608.map((c) => ({ candidateRef: c.discoveryId, rules: unit.compile.rules, definitions: unit.compile.definitions }));
  const covRekeyed = await runSemanticCoverageAudit({ companyId: "phase-3-validation-chwy", packageKey: "chwy-2026-credit-agreement", instrumentKey: "chwy-2026-revolving-credit-instrument", index, documents: [{ documentId: "doc-a" }], discoveredCandidates: discovered, compiledResults: rekeyed as never, verifiedCandidateRefs: new Set<string>(), operativeState, operativeVersionRef: null, structuralParserVersion: "phase-2a-structural-index+f2", providerIdentity: null });
  const before3e = JSON.parse(readFileSync(`${PAID}/stage3e-coverage.json`, "utf-8"));
  const tally = (doc: { units: { semanticUnitId: string; anchors: { charStart: number; charEnd: number; sectionRef?: string | null }[] }[]; coverageEntries: { semanticUnitId: string; coverageState: string }[] }) => {
    const st = new Map(doc.coverageEntries.map((e) => [e.semanticUnitId, e.coverageState]));
    const out: Record<string, number> = {};
    for (const u of doc.units) if (u.anchors.some((a) => (a.charStart >= sec.charStart && a.charEnd <= sec.charEnd) || (a.sectionRef ?? "").startsWith("6.08"))) { const s = st.get(u.semanticUnitId) ?? "NO_ENTRY"; out[s] = (out[s] ?? 0) + 1; }
    return out;
  };
  console.log(JSON.stringify({
    structure: { nodesBefore: beforeNodes.length, nodesAfter: nodes.length, section608: { charStart: sec.charStart, charEnd: sec.charEnd } },
    recordedCompilerRefs: { total: rows.length, existedBefore: rows.filter((r) => r.existedBefore).length, resolveAfter: rows.filter((r) => r.resolvesAfter > 0).length, rows },
    deterministicDiscovery608: { before: { candidates: beforeDet.filter((c) => c.sectionRef.startsWith("6.08")).length, sample: beforeDet.filter((c) => c.sectionRef.startsWith("6.08(i)")).slice(0, 5).map((c) => c.sectionRef) }, after: { candidates: det608.length, false608i: det608.filter((r) => r.startsWith("6.08(i)")).length, real608b: det608.filter((r) => /^6\.08\(b\)\(\d+\)/.test(r)).length, sample: det608.filter((r) => /^6\.08\(b\)\(1[0-5]\)/.test(r)).slice(0, 6) } },
    contextBundle608: { before: beforeUnit.contextBundle, after: { items: bundle.items.length, sufficiency: bundle.sufficiencyState, unresolvedDependencies: bundle.unresolvedDependencies.length } },
    sourceUnit608: { before: beforeUnit.sourceContext, after: { state: sc.state, regions: sc.regions.length, chars: sc.regions[0]?.text.length } },
    coverage3eLayersAB_608_recordedCompiledOutput: { asRecordedCandidateRef: { committedRun: tally(before3e.packageCoverage.documents[0]), thisStructure: tally(cov.packageCoverage.documents[0] as never) }, rekeyedToDiscoveredCandidates: { candidatesIn608: in608.length, thisStructure: tally(covRekeyed.packageCoverage.documents[0] as never) }, packageStatusBefore: before3e.packageCoverage.status, packageStatusAfter: cov.packageCoverage.status },
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
