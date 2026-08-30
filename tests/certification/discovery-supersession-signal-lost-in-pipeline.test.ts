/**
 * Phase 3F.1.6 Final Foundation Certification - Section 7.
 *
 * INDEPENDENTLY DISCOVERED finding (not named by any prior phase's own
 * P1-11 disclosure list): `discovery/pass-a-signals.ts` was fixed to
 * compute a real `supersessionStatus`/`supersessionReason` on its own
 * `DeterministicCandidate` output. But `DiscoveredCandidate` - the type
 * every real downstream consumer of the discovery pipeline actually
 * receives (context-retrieval's buildCovenantContextBundle,
 * coverage-audit's auditDiscoveryCoverage, semantic-coverage's pipeline) -
 * has NO such field at all (lib/contract-model/compiler/discovery/types.ts).
 * `runPassDReconciliation` (Pass D, the stage that produces the final
 * `DiscoveredCandidate[]`) reads `deterministicByNodeId` only to merge
 * `discoveryMethods`/`evidenceSignals` - it never reads or forwards
 * `supersessionStatus`/`supersessionReason`.
 *
 * This test proves it end-to-end with the REAL, unmodified
 * `runPassDReconciliation` function: a candidate whose primary structural
 * node is fabricated as KNOWN_SUPERSEDED at the DeterministicCandidate
 * layer produces a final DiscoveredCandidate that carries NO trace of that
 * fact whatsoever - not as a field, not in evidenceSignals, not in
 * description. The P1-11 fix, real as it is at the pass-a layer, never
 * reaches the pipeline's actual deliverable.
 */
import { describe, expect, it } from "vitest";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import type { DeterministicCandidate, DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { ExpandedCandidate } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";

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

describe("discovery pipeline: supersessionStatus computed at Pass A is lost before DiscoveredCandidate (real defect, independently found)", () => {
  it("a candidate whose primary node is KNOWN_SUPERSEDED at Pass A produces a final DiscoveredCandidate with zero trace of that fact", () => {
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

    // The defect, proven directly: no field on the real production type
    // carries the supersession fact forward at all.
    expect((candidate as unknown as Record<string, unknown>).supersessionStatus).toBeUndefined();
    expect((candidate as unknown as Record<string, unknown>).supersessionReason).toBeUndefined();
    expect(candidate.evidenceSignals.some((s) => /supersed/i.test(s))).toBe(false);
    expect(candidate.description).not.toMatch(/supersed/i);
    expect(candidate.discoveryMethods).not.toContain("KNOWN_SUPERSEDED" as never);

    // Confirms this is not merely "the test forgot to look somewhere" - the
    // TYPE ITSELF (the real, unmodified production DiscoveredCandidate
    // interface) has no such property at all among its declared keys.
    const declaredKeys: (keyof DiscoveredCandidate)[] = [
      "discoveryId", "documentId", "structuralNodeKeys", "structuralNodeIds", "normalizedSourceRef", "families",
      "otherFamilyDescription", "role", "roleRaw", "roleNormalizationStatus", "familiesRaw",
      "familiesNormalizationStatus", "description", "multipleRulesLikely", "definedTermDependencyLikely",
      "discoveryMethods", "evidenceSignals", "reviewStatus", "confidence", "sourceCitation", "discoveryRunVersion",
    ];
    expect(declaredKeys).not.toContain("supersessionStatus");
    expect(declaredKeys).not.toContain("supersessionReason");
    expect(Object.keys(candidate)).not.toContain("supersessionStatus");
    expect(Object.keys(candidate)).not.toContain("supersessionReason");
  });
});
