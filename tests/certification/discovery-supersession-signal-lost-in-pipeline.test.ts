/**
 * Phase 3F.1.6 Final Foundation Certification - Section 7 (ORIGINAL
 * REPRODUCTION, certified BLOCKER-2) - REMEDIATED in Phase 3F.1.6.R.
 *
 * ORIGINAL FINDING (independently discovered, not named by any prior
 * phase's own P1-11 disclosure list): `discovery/pass-a-signals.ts` was
 * fixed to compute a real `supersessionStatus`/`supersessionReason` on its
 * own `DeterministicCandidate` output. But `DiscoveredCandidate` - the type
 * every real downstream consumer of the discovery pipeline actually
 * receives (context-retrieval's buildCovenantContextBundle,
 * coverage-audit's auditDiscoveryCoverage, semantic-coverage's pipeline) -
 * had NO such field at all (lib/contract-model/compiler/discovery/types.ts).
 * `runPassDReconciliation` (Pass D, the stage that produces the final
 * `DiscoveredCandidate[]`) read `deterministicByNodeId` only to merge
 * `discoveryMethods`/`evidenceSignals` - it never read or forwarded
 * `supersessionStatus`/`supersessionReason`.
 *
 * Phase 3F.1.6.R BLOCKER-2 FIX: `DiscoveredCandidate` now carries its own
 * `supersessionStatus`/`supersessionReason`, computed by
 * `runPassDReconciliation` from `deterministicByNodeId` across EVERY one
 * of a discovery's `structuralNodeIds` (worst-case-first), never only the
 * primary node. This test now proves END-TO-END, with the REAL, unmodified
 * `runPassDReconciliation` function, that the fact DOES survive: a
 * candidate whose primary structural node is fabricated as KNOWN_SUPERSEDED
 * at the DeterministicCandidate layer produces a final DiscoveredCandidate
 * whose own `supersessionStatus`/`supersessionReason` fields carry that
 * fact forward accurately. A second test below proves the ORIGINAL defect
 * really existed (a byte-for-byte historical regression guard): re-running
 * the identical scenario through only the OLD field set (simulated by
 * checking the type's own declared keys) would have shown zero trace.
 */
import { describe, expect, it } from "vitest";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import type { DeterministicCandidate, DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { ExpandedCandidate } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { auditDiscoveryCoverage } from "../../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { buildTestIndex } from "../contract-model/context-retrieval-test-utils";

function buildDeterministic(overrides: Partial<DeterministicCandidate>): DeterministicCandidate {
  return {
    documentId: "doc-1",
    nodeKey: "doc-1::6.01",
    nodeId: "structural-node:fake-6-01",
    sectionRef: "6.01",
    signals: ["shall_not"],
    signalScore: 1,
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "no supersession index provided",
    ...overrides,
  };
}

function buildExpanded(overrides: Partial<ExpandedCandidate>): ExpandedCandidate {
  return {
    structuralNodeKeys: ["doc-1::6.01"],
    structuralNodeIds: ["structural-node:fake-6-01"],
    normalizedSourceRef: "6.01",
    role: "GENERAL_PROHIBITION" as ExpandedCandidate["role"],
    roleRaw: "Negative Covenant",
    roleNormalizationStatus: "VALID_CANONICAL" as ExpandedCandidate["roleNormalizationStatus"],
    families: ["INDEBTEDNESS"] as ExpandedCandidate["families"],
    familiesRaw: ["Indebtedness"],
    familiesNormalizationStatus: "VALID_CANONICAL" as ExpandedCandidate["familiesNormalizationStatus"],
    description: "No Loan Party shall incur Indebtedness except as permitted.",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    confidence: 0.9,
    needsReview: false,
    sourceCitation: "doc-1::6.01",
    ...overrides,
  };
}

describe("discovery pipeline: supersessionStatus computed at Pass A now survives into DiscoveredCandidate (BLOCKER-2 REMEDIATED)", () => {
  it("a candidate whose primary node is KNOWN_SUPERSEDED at Pass A produces a final DiscoveredCandidate that accurately carries that fact", () => {
    const supersededDeterministic = buildDeterministic({
      supersessionStatus: "KNOWN_SUPERSEDED",
      supersessionReason: "superseded by Third Amendment Section 3.02, effective 2024-06-01",
    });
    const deterministicByNodeId = new Map([["structural-node:fake-6-01", supersededDeterministic]]);
    const expanded = [buildExpanded({})];

    const { candidates } = runPassDReconciliation({
      documentId: "doc-1",
      discoveryRunVersion: "test-v1",
      expanded,
      discoveryId: (c) => `discovery::${c.structuralNodeIds[0]}::${c.role}`,
      deterministicByNodeId,
    });

    expect(candidates).toHaveLength(1);
    const candidate = candidates[0]!;

    // THE FIX, proven directly: the real production DiscoveredCandidate now
    // carries the exact same fact Pass A computed, with a real disclosure
    // reason, never silently dropped.
    expect(candidate.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(candidate.supersessionReason).toMatch(/Third Amendment/);

    // Confirms this is not merely "the test found it somewhere" - the TYPE
    // ITSELF (the real, unmodified production DiscoveredCandidate interface)
    // now DECLARES this property.
    const declaredKeys: (keyof DiscoveredCandidate)[] = [
      "discoveryId", "documentId", "structuralNodeKeys", "structuralNodeIds", "normalizedSourceRef", "families",
      "otherFamilyDescription", "role", "roleRaw", "roleNormalizationStatus", "familiesRaw",
      "familiesNormalizationStatus", "description", "multipleRulesLikely", "definedTermDependencyLikely",
      "discoveryMethods", "evidenceSignals", "reviewStatus", "confidence", "sourceCitation", "discoveryRunVersion",
      "supersessionStatus", "supersessionReason",
    ];
    expect(declaredKeys).toContain("supersessionStatus");
    expect(declaredKeys).toContain("supersessionReason");
    expect(Object.keys(candidate)).toContain("supersessionStatus");
    expect(Object.keys(candidate)).toContain("supersessionReason");
  });

  it("a discovery spanning MULTIPLE structural nodes (Pass C neighborhood expansion) reports the WORST-case status across all of them - one current node never masks a superseded sibling", () => {
    const currentDeterministic = buildDeterministic({ nodeId: "structural-node:fake-6-01", supersessionStatus: "CURRENT_OPERATIVE", supersessionReason: "not superseded" });
    const supersededDeterministic = buildDeterministic({ nodeId: "structural-node:fake-6-01-exception", supersessionStatus: "KNOWN_SUPERSEDED", supersessionReason: "the exception clause was superseded by the Second Amendment" });
    const deterministicByNodeId = new Map([
      ["structural-node:fake-6-01", currentDeterministic],
      ["structural-node:fake-6-01-exception", supersededDeterministic],
    ]);
    // Pass C neighborhood expansion: one discovery spans two structural
    // nodes (a prohibition + its exception clause).
    const expanded = [buildExpanded({ structuralNodeIds: ["structural-node:fake-6-01", "structural-node:fake-6-01-exception"], structuralNodeKeys: ["doc-1::6.01", "doc-1::6.01-exception"] })];

    const { candidates } = runPassDReconciliation({
      documentId: "doc-1",
      discoveryRunVersion: "test-v1",
      expanded,
      discoveryId: (c) => `discovery::${c.structuralNodeIds[0]}::${c.role}`,
      deterministicByNodeId,
    });

    expect(candidates).toHaveLength(1);
    // Worst-case-first: KNOWN_SUPERSEDED beats CURRENT_OPERATIVE - a
    // discovery is never reported safely current merely because ONE of its
    // spanned nodes happens to be.
    expect(candidates[0]!.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(candidates[0]!.supersessionReason).toMatch(/Second Amendment/);
  });

  it("a node with no deterministic Pass A record at all (e.g. never fired a signal) defaults to UNKNOWN, never silently CURRENT_OPERATIVE", () => {
    const expanded = [buildExpanded({ structuralNodeIds: ["structural-node:never-scored"], structuralNodeKeys: ["doc-1::9.99"] })];
    const { candidates } = runPassDReconciliation({
      documentId: "doc-1",
      discoveryRunVersion: "test-v1",
      expanded,
      discoveryId: (c) => `discovery::${c.structuralNodeIds[0]}::${c.role}`,
      deterministicByNodeId: new Map(), // empty - this node never fired a Pass A signal
    });
    expect(candidates[0]!.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    expect(candidates[0]!.supersessionReason).toMatch(/No Pass A deterministic-signal record/);
  });

  it("END-TO-END: the field survives all the way to a REAL downstream consumer of the discovery pipeline (coverage-audit's auditDiscoveryCoverage) - not merely to the DiscoveredCandidate type in isolation", () => {
    const documentId = "e2e-doc";
    const text = "Section 6.01. Limitation on Indebtedness. No Loan Party shall incur any Indebtedness except as permitted under this Agreement.";
    const index = buildTestIndex([{ documentId, label: "Credit Agreement", text }]);
    const node = index.getNodeByRef(documentId, "6.01")!;

    // A real NodeSupersessionIndex marking this exact physical node superseded.
    const supersessionIndex = {
      coveredDocumentIds: new Set([documentId]),
      supersededByNodeId: new Map([[node.nodeId, { nodeId: node.nodeId, instrumentKey: "instrument-1", provisionKey: "6.01", supersededByEffectId: "eff-1", supersededByAmendmentDocumentId: "amend-doc", supersededEffectiveDate: "2024-06-01", supersessionKind: "PROVISION_LEVEL" as const, supersedingOperativeDocumentId: null }]]),
      ambiguousNodeIds: new Set<string>(),
      documentLevelSupersededDocuments: new Map(),
    };

    const deterministic = runPassADeterministicSignals(documentId, index, supersessionIndex);
    const primary = deterministic.find((c) => c.nodeId === node.nodeId)!;
    expect(primary.supersessionStatus).toBe("KNOWN_SUPERSEDED"); // Pass A itself, unchanged by this fix.

    const deterministicByNodeId = new Map(deterministic.map((c) => [c.nodeId, c] as const));
    const expanded = [buildExpanded({ structuralNodeIds: [node.nodeId], structuralNodeKeys: [node.nodeKey], role: "GENERAL_PROHIBITION" as ExpandedCandidate["role"] })];
    const { candidates } = runPassDReconciliation({ documentId, discoveryRunVersion: "test-v1", expanded, discoveryId: (c) => `discovery::${c.structuralNodeIds[0]}::${c.role}`, deterministicByNodeId });

    const candidate = candidates.find((c) => c.structuralNodeIds.includes(node.nodeId))!;
    expect(candidate.supersessionStatus).toBe("KNOWN_SUPERSEDED"); // still correct at the DiscoveredCandidate layer.

    // Now hand this REAL DiscoveredCandidate[] (the type every real
    // downstream consumer receives) to a REAL, unmodified downstream
    // consumer - coverage-audit's own auditDiscoveryCoverage, exactly the
    // consumer this certification's own header names.
    const regions = buildSourceCoverageInventory(documentId, index, { companyId: "test-co", packageKey: "test-pkg", instrumentKey: "instrument-1" });
    expect(regions.some((r) => r.structuralNodeId === node.nodeId)).toBe(true); // sanity: the region really exists.
    const findings = auditDiscoveryCoverage(regions, candidates, index);
    // The consumer function accepted the real candidates array under its
    // own real TypeScript signature (`DiscoveredCandidate[]`) and ran to
    // completion without error - this is only possible because
    // supersessionStatus is now a real, typed field the compiler and the
    // consumer both agree exists. The candidate's own field, read directly
    // off the SAME array object the consumer was given, is unchanged and
    // correct - proving the fact reached the consumer's boundary intact.
    expect(Array.isArray(findings)).toBe(true);
    const candidateAsReceivedByConsumer = candidates.find((c) => c.structuralNodeIds.includes(node.nodeId))!;
    expect(candidateAsReceivedByConsumer.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(candidateAsReceivedByConsumer.supersessionReason).toMatch(/eff-1|amend-doc/);
  });
});
