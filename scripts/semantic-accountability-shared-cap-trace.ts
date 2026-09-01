/**
 * SEMANTIC-ACCOUNTABILITY mission, Section 14 - ZERO-COST deterministic
 * trace of the real shared-cap region Mission 4 identified (DSGR doc-a
 * §6.01(b)(iii)/(c)(iii) <-> §6.04(b): one 15%-of-EBITDA aggregate cap
 * shared by intercompany debt, guarantees, and investments). No model
 * call is made here. This script re-derives, from the same real source and
 * the same real deterministic pipeline the Mission 4 reality check used:
 *   SOURCE  -> is the shared-cap language physically present in each region window?
 *   CONTEXT -> did Phase 2D's context bundle for each region carry the
 *              cross-referenced sibling provision (items / unresolvedDependencies)?
 *   INDEX   -> does the structural index resolve the exact cross-reference
 *              strings the model tried ("Section 6.01(b)(iii)", "6.04(b)")?
 * The COMPOSITION/NORMALIZATION layers are read from the preserved Mission 4
 * output (which did preserve rules + sufficiencyReasons, but not
 * sharedCapacities/toolCallLog/rawModelOutput - itself a measurement gap
 * this trace documents).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const DSGR_A = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt";
const OUT = "docs/semantic-accountability/06-shared-cap-root-cause-trace.json";

const REGIONS = [
  { id: "debt-dsgr", sourceSectionRef: "6.01", startOffset: 436142, windowChars: 4500, preserved: "tests/fixtures/unseen-packages/final-semantic-decomposition-reality-check/reality-check-debt-dsgr.json" },
  { id: "investments-dsgr", sourceSectionRef: "6.04", startOffset: 455225, windowChars: 4000, preserved: "tests/fixtures/unseen-packages/final-semantic-decomposition-reality-check/reality-check-investments-dsgr.json" },
];
const CROSS_REFS = ["Section 6.01(b)(iii)", "6.01(b)(iii)", "Section 6.01(c)(iii)", "6.01(c)(iii)", "Section 6.04(b)", "6.04(b)", "6.01(b)", "6.04"];

function findAnchorNode(nodes: StructuralNode[], documentId: string, idx: number): StructuralNode | null {
  // Half-open [charStart, charEnd) - Mission 4's own scripts used a closed interval, which let a preceding node whose charEnd == idx win the anchor (the investments region anchored to the PRECEDING clause 6.03(g)).
  const cands = nodes.filter((n) => n.documentId === documentId && n.charStart <= idx && idx < n.charEnd);
  cands.sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart));
  return cands[0] ?? null;
}

function main() {
  const text = readFileSync(DSGR_A, "utf-8");
  const documents = [{ documentId: "dsgr-a", label: "dsgr-a", text }];
  const allNodes: StructuralNode[] = runStructureStage(documents).output;
  const nodesByDocument = new Map([["dsgr-a", { text, nodes: allNodes }]]);
  const defs: DetectedDefinition[] = detectStructuralDefinitions("dsgr-a", text, allNodes);
  const refs: DetectedReference[] = detectStructuralReferences("dsgr-a", text, allNodes);
  const index = buildStructuralIndex(nodesByDocument, defs, refs);
  const packageGraph = buildPackageGraph("trace-co", "trace-pkg", documents);
  const exactTermsByDocument = new Map<string, Map<string, string>>([["dsgr-a", new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm]))]]);
  const access = { index, packageGraph, exactTermsByDocument };

  const indexResolution: Record<string, unknown> = {};
  for (const ref of CROSS_REFS) {
    const r = index.resolveUniqueNodeByRef("dsgr-a", ref);
    const all = index.findNodesByRef("dsgr-a", ref);
    indexResolution[ref] = { status: r.status, uniqueNode: r.status === "UNIQUE" ? { nodeId: r.node.nodeId, sectionRef: r.node.sectionRef, charStart: r.node.charStart, charEnd: r.node.charEnd, textHead: text.slice(r.node.charStart, r.node.charStart + 120) } : null, candidateCount: all.length, candidates: all.slice(0, 5).map((n) => ({ nodeId: n.nodeId, sectionRef: n.sectionRef, charStart: n.charStart, textHead: text.slice(n.charStart, n.charStart + 80) })) };
  }

  const perRegion: Record<string, unknown> = {};
  for (const region of REGIONS) {
    const window = text.slice(region.startOffset, region.startOffset + region.windowChars);
    const anchor = findAnchorNode(allNodes, "dsgr-a", region.startOffset);
    const sharedCapSentences = Array.from(window.matchAll(/[^.;]*together with the aggregate[^;]*15%[^;]*/g)).map((m) => m[0].replace(/\s+/g, " ").trim());
    const candidate = {
      discoveryId: `trace:${region.id}`,
      documentId: "dsgr-a",
      structuralNodeKeys: anchor ? [anchor.nodeKey] : [],
      structuralNodeIds: [],
      normalizedSourceRef: region.sourceSectionRef,
      families: [],
      role: "GENERAL_PROHIBITION",
      roleRaw: "",
      roleNormalizationStatus: "VALID_CANONICAL",
      familiesRaw: [],
      familiesNormalizationStatus: "VALID_CANONICAL",
      description: "trace",
      multipleRulesLikely: true,
      definedTermDependencyLikely: true,
      discoveryMethods: ["DETERMINISTIC_SIGNAL"],
      evidenceSignals: ["headline_heading"],
      reviewStatus: "NEEDS_REVIEW",
      confidence: 1,
      sourceCitation: window.slice(0, 200),
      discoveryRunVersion: "trace.v1",
      supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: "trace",
      valueAnchors: [],
    } as unknown as DiscoveredCandidate;
    const summarize = (bundle: ReturnType<typeof buildCovenantContextBundle>) => ({
        sufficiencyState: bundle.sufficiencyState,
        stopReasons: bundle.stopReasons,
        itemCount: bundle.items.length,
        itemsByType: bundle.items.reduce<Record<string, number>>((acc, i) => ((acc[i.type] = (acc[i.type] ?? 0) + 1), acc), {}),
        crossReferenceItems: bundle.items.filter((i) => i.type === "CROSS_REFERENCE" || i.type === "SHARED_CAP").map((i) => ({ type: i.type, normalizedRef: i.normalizedRef, citation: i.sourceCitation, reason: i.reason.slice(0, 160), excerptHead: i.excerptText.slice(0, 120) })),
        itemsMentioningSiblingSection: bundle.items.filter((i) => /6\.04\(b\)|6\.01\(b\)\(iii\)|6\.01\(c\)\(iii\)/.test(i.excerptText) || /6\.04\(b\)|6\.01\(b\)\(iii\)|6\.01\(c\)\(iii\)/.test(i.normalizedRef)).map((i) => ({ type: i.type, normalizedRef: i.normalizedRef })),
        unresolvedDependencies: bundle.unresolvedDependencies.map((u) => ({ type: u.dependencyType, severity: u.severity, sourceText: u.sourceText.slice(0, 120), reason: u.reason.slice(0, 160) })),
    });
    let bundleSummary: unknown;
    let bundleSummaryWithNodeIds: unknown;
    try {
      // Pass 1: EXACTLY what Mission 4's validation scripts did - structuralNodeKeys set, structuralNodeIds EMPTY.
      bundleSummary = summarize(buildCovenantContextBundle({ candidate, packageKey: "trace-pkg", companyId: "trace-co", instrumentKey: "trace-instr" }, access));
      // Pass 2: the corrected harness - the real physical nodeId populated (what the real discovery pipeline always does).
      const candidateWithIds = { ...candidate, structuralNodeIds: anchor ? [anchor.nodeId] : [] } as DiscoveredCandidate;
      bundleSummaryWithNodeIds = summarize(buildCovenantContextBundle({ candidate: candidateWithIds, packageKey: "trace-pkg", companyId: "trace-co", instrumentKey: "trace-instr" }, access));
    } catch (err) {
      bundleSummary = { error: err instanceof Error ? err.message : String(err) };
    }
    const preserved = JSON.parse(readFileSync(region.preserved, "utf-8"));
    const rules = preserved.compile.rules as { ruleId: string; sourceSectionRef: string; capacityExpression: { kind: string; sharedCapId?: string | null } | null; dependsOn: unknown[]; sufficiency: string; sufficiencyReasons: string[] }[];
    perRegion[region.id] = {
      sourceLayer: { anchorNode: anchor ? { nodeKey: anchor.nodeKey, sectionRef: anchor.sectionRef, charStart: anchor.charStart, charEnd: anchor.charEnd } : null, sharedCapLanguagePresentInWindow: sharedCapSentences.length > 0, sharedCapSentences },
      contextLayerAsRunInMission4_emptyStructuralNodeIds: bundleSummary,
      contextLayerWithRealNodeId: bundleSummaryWithNodeIds,
      compositionLayerFromPreservedOutput: {
        rules: rules.map((r) => ({ ruleId: r.ruleId, sourceSectionRef: r.sourceSectionRef, capacityKind: r.capacityExpression?.kind ?? null, sharedCapId: r.capacityExpression?.sharedCapId ?? null, dependsOnCount: r.dependsOn.length, sufficiency: r.sufficiency, droppedDependencyReasons: r.sufficiencyReasons.filter((s) => /did not resolve|dropped/.test(s)) })),
        anyLedgerUsageReference: rules.some((r) => r.capacityExpression?.kind === "LEDGER_USAGE_REFERENCE"),
        preservedFieldsAvailable: Object.keys(preserved.compile),
        sharedCapacitiesFieldPreserved: "sharedCapacities" in preserved.compile,
      },
    };
  }

  const out = { generatedAt: new Date().toISOString(), method: "zero-cost deterministic re-derivation (no model call) of the SOURCE/CONTEXT/INDEX layers for the two real DSGR regions sharing one 15%-of-EBITDA cap, plus a read of the preserved Mission 4 composition output", structuralIndexResolution: indexResolution, regions: perRegion };
  if (!existsSync("docs/semantic-accountability")) mkdirSync("docs/semantic-accountability", { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
main();
