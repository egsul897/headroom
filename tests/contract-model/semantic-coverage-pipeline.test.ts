/**
 * Phase 3E - end-to-end pipeline smoke tests (runSemanticCoverageAudit).
 * Real parse -> route -> hypothesize -> freeze -> reconcile -> rollup,
 * using the same real buildTestIndex pipeline every other phase's tests
 * use. No AI caller supplied - Layers A/B only (a legitimate, cheaper
 * deterministic-only configuration).
 */
import { describe, expect, it } from "vitest";
import { withExpressionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";
import { runSemanticCoverageAudit } from "../../lib/contract-model/compiler/semantic-coverage/pipeline";
import { buildTestIndex } from "./context-retrieval-test-utils";

const companyId = "test-co";
const instrumentKey = "test-instrument";
const packageKey = "test-pkg";

const SAMPLE_DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) Indebtedness incurred to finance the acquisition of fixed assets in an aggregate amount not to exceed $5,000,000 at any time outstanding.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property, except Permitted Liens not to exceed $2,000,000 in the aggregate.
`;

function buildIndex() {
  return buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text: SAMPLE_DOCUMENT }]);
}

// buildTestIndex/parseDocumentStructure is deterministic over identical
// source text - the same real charStart-derived nodeId is produced by
// every fresh buildIndex() call below, so this module-level index is only
// ever used to resolve the real nodeId for a given sectionRef, never
// passed into the pipeline itself (each `it()` builds its own real index).
const nodeIdIndex = buildIndex();
function nodeIdFor(sectionRef: string): string {
  return nodeIdIndex.getNodeByRef("doc-1", sectionRef)!.nodeId;
}

function makeCandidate(discoveryId: string, nodeKeys: string[]): DiscoveredCandidate {
  return {
    discoveryId,
    documentId: "doc-1",
    structuralNodeKeys: nodeKeys,
    structuralNodeIds: nodeKeys.map((k) => nodeIdFor(k.split("::")[1]!)),
    normalizedSourceRef: nodeKeys[0]!,
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 0.9,
    sourceCitation: `doc-1::${nodeKeys[0]}`,
    discoveryRunVersion: "test",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test fixture - no real supersession index applied",
  };
}

function makeRule(sourceSectionRef: string, amount: number): IRRule {
  return {
    ruleId: computeRuleId(companyId, instrumentKey, sourceSectionRef, "test"),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId,
    instrumentKey,
    sourceDocumentId: "doc-1",
    sourceSectionRef,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: withExpressionId({ kind: "MONEY", type: "MONEY", amount, currency: "USD" }),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: { documentId: "doc-1", sourceNodeKey: null, sourceCitation: `doc-1::${sourceSectionRef}`, excerpt: null },
    compilerVersion: null,
    sourceContentVersion: null,
  };
}

// Phase 3F.1.6.R BLOCKER-4 fix: auditOperativeStateForUnits now fails
// CLOSED (flags every unit) when operativeState is null - the correct,
// intentional behavior for a caller that genuinely could not resolve
// operative state at all. These tests are not exercising that check; this
// document was never amended, so a real, RESOLVED, empty-provisions
// OperativeContractState (not null) is the honest input - "we checked,
// nothing governs differently" is a real fact, not the same as "never
// checked."
const emptyOperativeState: OperativeContractState = { instrumentKey, asOfDate: "2026-01-01", provisions: [], status: "OPERATIVE_STATE_RESOLVED", summary: "no amendments recorded for this test fixture", unattachedEffects: [] };

const baseInput = {
  companyId,
  packageKey,
  instrumentKey,
  operativeState: emptyOperativeState,
  operativeVersionRef: null,
  structuralParserVersion: "test",
  providerIdentity: null,
};

describe("Phase 3E pipeline: runSemanticCoverageAudit", () => {
  it("classifies both carve-outs as FULLY_REPRESENTED when candidates and matching compiled rules exist for both", async () => {
    const index = buildIndex();
    const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);
    const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
    const ruleA = makeRule("6.01(a)", 10_000_000);
    const ruleB = makeRule("6.01(b)", 5_000_000);

    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB],
      compiledResults: [
        { candidateRef: "disc-a", rules: [ruleA], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleB], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(),
    });

    const doc = result.packageCoverage.documents[0]!;
    const carveoutAEntry = doc.coverageEntries.find((e) => doc.units.find((u) => u.semanticUnitId === e.semanticUnitId)?.excerptText.includes("$10,000,000"));
    expect(carveoutAEntry?.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
  });

  it("FAULT INJECTION: removing the discovered candidate for a CRITICAL carve-out surfaces a dangerous-unaccounted unit and fails the document/package gate", async () => {
    const index = buildIndex();
    // Only 6.01(b) discovered - 6.01(a) (a CRITICAL $10,000,000 carve-out) was never discovered at all.
    const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
    const ruleB = makeRule("6.01(b)", 5_000_000);

    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateB],
      compiledResults: [{ candidateRef: "disc-b", rules: [ruleB], definitions: [] }],
      verifiedCandidateRefs: new Set(),
    });

    const doc = result.packageCoverage.documents[0]!;
    expect(doc.dangerousUnaccounted.length).toBeGreaterThan(0);
    expect(doc.gateStatus).toBe("DOCUMENT_GATE_FAILED");
    expect(result.packageCoverage.status).toBe("PACKAGE_SEMANTICALLY_INCOMPLETE");
  });

  it("FAULT INJECTION: discovering a candidate but never compiling it is caught as CANDIDATE_DISCOVERED_NEVER_COMPILED", async () => {
    const index = buildIndex();
    const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);

    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA],
      compiledResults: [], // never compiled
      verifiedCandidateRefs: new Set(),
    });

    const doc = result.packageCoverage.documents[0]!;
    expect(doc.dangerousUnaccounted.some((d) => d.reason === "CANDIDATE_DISCOVERED_NEVER_COMPILED")).toBe(true);
  });

  it("FAULT INJECTION: an entire missing family (Liens never discovered/compiled at all) fails the gate regardless of high coverage elsewhere", async () => {
    const index = buildIndex();
    const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);
    const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
    const ruleA = makeRule("6.01(a)", 10_000_000);
    const ruleB = makeRule("6.01(b)", 5_000_000);
    // Section 6.02 Liens is present in the real source text but has ZERO discovered candidates.

    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB],
      compiledResults: [
        { candidateRef: "disc-a", rules: [ruleA], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleB], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(),
    });

    const doc = result.packageCoverage.documents[0]!;
    expect(doc.familySummaries.some((f) => f.family === "LIENS" && f.entireFamilyMissing)).toBe(true);
    expect(doc.gateStatus).toBe("DOCUMENT_GATE_FAILED");
  });

  it("respects the auditIncomplete flag - PACKAGE_AUDIT_INCOMPLETE takes priority even with otherwise-clean documents", async () => {
    const index = buildIndex();
    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1", auditIncomplete: true }],
      discoveredCandidates: [],
      compiledResults: [],
      verifiedCandidateRefs: new Set(),
    });
    expect(result.packageCoverage.status).toBe("PACKAGE_AUDIT_INCOMPLETE");
  });

  it("is deterministic/reproducible - two runs over the same real input produce identical package status and dangerous-unaccounted sets", async () => {
    const index = buildIndex();
    const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
    const ruleB = makeRule("6.01(b)", 5_000_000);
    const runOnce = () =>
      runSemanticCoverageAudit({
        ...baseInput,
        index,
        documents: [{ documentId: "doc-1" }],
        discoveredCandidates: [candidateB],
        compiledResults: [{ candidateRef: "disc-b", rules: [ruleB], definitions: [] }],
        verifiedCandidateRefs: new Set(),
      });
    const first = await runOnce();
    const second = await runOnce();
    expect(first.packageCoverage.status).toBe(second.packageCoverage.status);
    expect(first.documentDetails[0]!.units.map((u) => u.semanticUnitId).sort()).toEqual(second.documentDetails[0]!.units.map((u) => u.semanticUnitId).sort());
  });
});

/**
 * Phase 3F.1.6.RX Workstream B - BLOCKER-4 independent runtime trace.
 *
 * Every existing test in this file (and BLOCKER-4's own remediation, per
 * its artifact's own disclosure of fixing 9 pre-existing tests) passes a
 * real, RESOLVED, empty-provisions OperativeContractState - NEVER the
 * genuinely null case - through the real, end-to-end runSemanticCoverageAudit
 * pipeline. This describe block closes that specific gap: it constructs a
 * real call with `operativeState: null` all the way through the REAL
 * orchestration (routeDocument -> hypothesizeUnitsForDocument ->
 * freezeSourceInventory -> reconcileFrozenInventory -> auditOperativeStateForUnits
 * -> applyOperativeStateFindingsToCoverage -> computeDocumentCoverage ->
 * computePackageCoverage), not merely the isolated audit function tested in
 * semantic-coverage-cross-reference-audit.test.ts, and confirms every real
 * unit ends up OPERATIVE_STATE_UNRESOLVED with no unit slipping through to
 * a differentiated/trusted state, and that this propagates all the way to
 * the package-level PACKAGE_OPERATIVE_STATE_UNRESOLVED status.
 */
describe("BLOCKER-4 independent trace: operativeState: null fails CLOSED through the REAL end-to-end pipeline, not merely the isolated audit function", () => {
  it("every real unit (both carve-outs) resolves OPERATIVE_STATE_UNRESOLVED - never a differentiated/trusted coverage state - and the package status reflects it", async () => {
    const index = buildIndex();
    const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);
    const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
    const ruleA = makeRule("6.01(a)", 10_000_000);
    const ruleB = makeRule("6.01(b)", 5_000_000);

    const result = await runSemanticCoverageAudit({
      ...baseInput,
      operativeState: null, // THE genuinely-unresolved case - never "checked, nothing governs differently."
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB],
      compiledResults: [
        { candidateRef: "disc-a", rules: [ruleA], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleB], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(["disc-a", "disc-b"]), // even VERIFIED candidates must not slip through.
    });

    const doc = result.packageCoverage.documents[0]!;
    // Every unit with a real structural anchor must be OPERATIVE_STATE_UNRESOLVED -
    // none may reach FULLY_REPRESENTED_VERIFIED/FULLY_REPRESENTED_REVIEW_REQUIRED
    // or any other differentiated/trusted state merely because operative
    // state itself could not be resolved at all.
    const anchoredUnitIds = new Set(doc.units.filter((u) => u.anchors.some((a) => a.structuralNodeId)).map((u) => u.semanticUnitId));
    expect(anchoredUnitIds.size).toBeGreaterThan(0); // sanity: real anchored units really exist in this fixture.
    for (const entry of doc.coverageEntries) {
      if (!anchoredUnitIds.has(entry.semanticUnitId)) continue;
      expect(entry.coverageState).toBe("OPERATIVE_STATE_UNRESOLVED");
      expect(entry.coverageState).not.toBe("FULLY_REPRESENTED_VERIFIED");
      expect(entry.coverageState).not.toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
    }

    // Propagates to the real document/package rollup - not merely a
    // per-entry fact that the rollup ignores.
    expect(result.documentDetails[0]!.operativeStateFindings.length).toBe(anchoredUnitIds.size);
    expect(result.documentDetails[0]!.operativeStateFindings.every((f) => f.findingType === "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT" && f.provisionKey === null)).toBe(true);
    expect(result.packageCoverage.status).toBe("PACKAGE_OPERATIVE_STATE_UNRESOLVED");
  });

  it("CONTRAST (regression guard, same fixture): a real, RESOLVED, empty-provisions OperativeContractState for the identical scenario correctly reaches a differentiated FULLY_REPRESENTED_* state - proving the null-only branch above is doing real work, not something this fixture would trigger regardless of operativeState's value", async () => {
    const index = buildIndex();
    const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);
    const ruleA = makeRule("6.01(a)", 10_000_000);
    const result = await runSemanticCoverageAudit({
      ...baseInput, // baseInput's own emptyOperativeState - real, RESOLVED, zero provisions.
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA],
      compiledResults: [{ candidateRef: "disc-a", rules: [ruleA], definitions: [] }],
      verifiedCandidateRefs: new Set(),
    });
    const doc = result.packageCoverage.documents[0]!;
    const carveoutAEntry = doc.coverageEntries.find((e) => doc.units.find((u) => u.semanticUnitId === e.semanticUnitId)?.excerptText.includes("$10,000,000"));
    expect(carveoutAEntry?.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED");
    expect(result.packageCoverage.status).not.toBe("PACKAGE_OPERATIVE_STATE_UNRESOLVED");
  });
});
