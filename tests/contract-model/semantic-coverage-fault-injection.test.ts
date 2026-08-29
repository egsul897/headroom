/**
 * Phase 3E §160 - the required fault-injection matrix. Mirrors Phase 2E's
 * coverage-audit-fault-injection.test.ts and Phase 3C's own fault-injection
 * harness convention: each scenario deliberately injects one real defect
 * class into an otherwise-real pipeline run and asserts the audit actually
 * catches it (or, for a positive control, correctly does NOT flag a clean
 * case). A final aggregate test enforces the same 100%-material-detection
 * gate Phase 3C's own attack-gate established - a required, not aspirational,
 * catch rate for every scenario whose defect is CRITICAL/MATERIAL.
 *
 * Runs through the real end-to-end pipeline (runSemanticCoverageAudit) over
 * real parsed source text (buildTestIndex) wherever the scenario's own
 * layer can be exercised that way - never a hand-constructed IR-only
 * fixture when the real parser can produce the same shape.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { withExpressionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { runSemanticCoverageAudit } from "../../lib/contract-model/compiler/semantic-coverage/pipeline";
import { buildTestIndex } from "./context-retrieval-test-utils";

const companyId = "test-co";
const instrumentKey = "test-instrument";
const packageKey = "test-pkg";

const SAMPLE_DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) Indebtedness incurred to finance the acquisition of fixed assets in an aggregate amount not to exceed $5,000,000 at any time outstanding, which amount shall be combined with capacity available under clause (a) as a shared cap.

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
  };
}

function makeRule(sourceSectionRef: string, amount: number, overrides: Partial<IRRule> = {}): IRRule {
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
    ...overrides,
  };
}

function fakeCaller(response: () => unknown): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      return schema.parse(response());
    },
    lastTelemetry: () => null,
  };
}

const candidateA = makeCandidate("disc-a", ["doc-1::6.01(a)"]);
const candidateB = makeCandidate("disc-b", ["doc-1::6.01(b)"]);
const ruleA = makeRule("6.01(a)", 10_000_000);
const ruleB = makeRule("6.01(b)", 5_000_000);

const baseInput = {
  companyId,
  packageKey,
  instrumentKey,
  operativeState: null,
  operativeVersionRef: null,
  structuralParserVersion: "test",
  providerIdentity: null,
};

interface FaultResult {
  name: string;
  caught: boolean;
}
const results: FaultResult[] = [];
function record(name: string, caught: boolean) {
  results.push({ name, caught });
}

describe("Phase 3E fault injection matrix (task #160)", () => {
  it("1. RAW-SOURCE FALLBACK: a document that structurally parses to zero substantive nodes still surfaces real covenant signal via the fallback path", async () => {
    const degradedText = "The Borrower shall not incur any Indebtedness except up to $7,500,000 outstanding at any time, notwithstanding any other provision hereof.";
    const index = buildTestIndex([{ documentId: "doc-degraded", label: "Degraded", text: degradedText }]);
    const result = await runSemanticCoverageAudit({ ...baseInput, index, documents: [{ documentId: "doc-degraded" }], discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    const caught = result.documentDetails[0]!.units.length > 0;
    record("raw-source-fallback-signal", caught);
    expect(caught).toBe(true);
  });

  it("2. CRITICAL carve-out never discovered - dangerous-unaccounted + document gate fails", async () => {
    const index = buildIndex();
    const result = await runSemanticCoverageAudit({ ...baseInput, index, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateB], compiledResults: [{ candidateRef: "disc-b", rules: [ruleB], definitions: [] }], verifiedCandidateRefs: new Set() });
    const doc = result.packageCoverage.documents[0]!;
    const caught = doc.dangerousUnaccounted.some((d) => d.reason === "NO_CANDIDATE_EVER_DISCOVERED") && doc.gateStatus === "DOCUMENT_GATE_FAILED";
    record("no-candidate-discovered", caught);
    expect(caught).toBe(true);
  });

  it("3. Candidate discovered but never compiled - CANDIDATE_DISCOVERED_NEVER_COMPILED caught", async () => {
    const index = buildIndex();
    const result = await runSemanticCoverageAudit({ ...baseInput, index, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateA], compiledResults: [], verifiedCandidateRefs: new Set() });
    const caught = result.packageCoverage.documents[0]!.dangerousUnaccounted.some((d) => d.reason === "CANDIDATE_DISCOVERED_NEVER_COMPILED");
    record("candidate-never-compiled", caught);
    expect(caught).toBe(true);
  });

  it("4. Compiled rule carries the WRONG dollar amount - PARTIALLY_REPRESENTED with the missing element explicitly named", async () => {
    const index = buildIndex();
    const wrongRule = makeRule("6.01(a)", 999); // real source says $10,000,000
    const result = await runSemanticCoverageAudit({ ...baseInput, index, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateA], compiledResults: [{ candidateRef: "disc-a", rules: [wrongRule], definitions: [] }], verifiedCandidateRefs: new Set() });
    const entry = result.packageCoverage.documents[0]!.coverageEntries.find((e) => result.documentDetails[0]!.units.find((u) => u.semanticUnitId === e.semanticUnitId)?.excerptText.includes("$10,000,000"));
    const caught = entry?.coverageState === "PARTIALLY_REPRESENTED" && entry.missingEconomicElement !== null;
    record("wrong-economic-value", caught);
    expect(caught).toBe(true);
  });

  it("5. A numeric value legitimately merged into a differently-anchored rule within the SAME covering candidate is still recognized (no false dangerous flag)", async () => {
    const index = buildIndex();
    const mergedRule = makeRule("6.01(merged)", 10_000_000); // same candidate, different citation, same figure
    // candidateB/ruleB (and Liens) are included unmodified so the ONLY deliberately-injected
    // anomaly in this scenario is candidateA's rule being re-anchored - everything else in the
    // document is otherwise fully, correctly accounted for.
    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB, makeCandidate("disc-liens", ["doc-1::6.02"])],
      compiledResults: [
        { candidateRef: "disc-a", rules: [mergedRule], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleB], definitions: [] },
        { candidateRef: "disc-liens", rules: [makeRule("6.02", 2_000_000)], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(),
    });
    const doc = result.packageCoverage.documents[0]!;
    const unitFor10M = result.documentDetails[0]!.units.find((u) => u.excerptText.includes("$10,000,000"));
    const entryFor10M = doc.coverageEntries.find((e) => e.semanticUnitId === unitFor10M!.semanticUnitId);
    const caught = !doc.dangerousUnaccounted.some((d) => d.semanticUnitId === unitFor10M!.semanticUnitId) && entryFor10M?.coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED";
    record("legitimate-merge-not-false-flagged", caught);
    expect(caught).toBe(true);
  });

  it("6. An entire material family (Liens) never discovered/compiled at all fails the gate regardless of high coverage elsewhere", async () => {
    const index = buildIndex();
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
    const caught = doc.familySummaries.some((f) => f.family === "LIENS" && f.entireFamilyMissing) && doc.gateStatus === "DOCUMENT_GATE_FAILED";
    record("entire-family-missing", caught);
    expect(caught).toBe(true);
  });

  it("7. Materiality-weighted fraction visibly penalizes a single missing CRITICAL carve-out that the raw fraction alone would hide among many trivial units", async () => {
    // A real short document has too few units to naturally exhibit the dilution effect this
    // scenario tests - constructed directly against computeDocumentCoverage (the same real,
    // unmocked rollup function the pipeline itself calls), not a smaller/different code path.
    const { computeDocumentCoverage } = await import("../../lib/contract-model/compiler/semantic-coverage/document-coverage");
    const critical: import("../../lib/contract-model/compiler/semantic-coverage/types").MaterialSemanticUnit = {
      semanticUnitId: "critical-1",
      companyId,
      packageKey,
      instrumentKey,
      operativeVersionRef: null,
      granularity: "SEMANTIC_UNIT",
      anchors: [],
      family: "INDEBTEDNESS",
      familyEvidence: null,
      postureSignal: "PERMISSION_SIGNAL",
      materiality: "CRITICAL",
      materialityReasoning: "test",
    contextuallyElevated: false,
      excerptText: "not to exceed $10,000,000",
      detectedSignals: ["currency_value"],
      fromRawSourceFallback: false,
      detectionMethod: "STRUCTURAL_HYPOTHESIS",
      aiInventoryPromptVersion: null,
      confidence: "HIGH",
      uncertaintyReasons: [],
      inventoryAlgorithmVersion: "test",
      provenance: "test",
    };
    const trivialUnits = Array.from({ length: 9 }, (_, i) => ({ ...critical, semanticUnitId: `info-${i}`, materiality: "INFORMATIONAL" as const }));
    const units = [critical, ...trivialUnits];
    const entries = [
      { semanticUnitId: critical.semanticUnitId, coverageState: "UNREPRESENTED" as const, matchedIrIds: [], missingEconomicElement: null, reasoning: "test", materiality: "CRITICAL" as const, coverageAlgorithmVersion: "test" },
      ...trivialUnits.map((u) => ({ semanticUnitId: u.semanticUnitId, coverageState: "FULLY_REPRESENTED_VERIFIED" as const, matchedIrIds: [], missingEconomicElement: null, reasoning: "test", materiality: "INFORMATIONAL" as const, coverageAlgorithmVersion: "test" })),
    ];
    const dangerousUnaccounted = [{ semanticUnitId: critical.semanticUnitId, reason: "NO_CANDIDATE_EVER_DISCOVERED" as const, materiality: "CRITICAL" as const, sourceEvidence: critical.excerptText, auditorReasoning: "test" }];
    const doc = computeDocumentCoverage("doc-1", units, entries, dangerousUnaccounted);
    const caught = doc.materialityWeightedFullyRepresentedFraction < doc.rawFullyRepresentedFraction && doc.rawFullyRepresentedFraction >= 0.85;
    record("weighted-fraction-penalizes-critical-miss", caught);
    expect(caught).toBe(true);
  });

  it("8. A missing shared-cap relationship is caught even though each individual basket rule looks fully represented on its own", async () => {
    const index = buildIndex();
    // Both baskets compile cleanly with their own correct dollar figures, but NEITHER rule
    // carries any SHARED_CAP_RELATIONSHIP dependency - the source text explicitly says clause
    // (b)'s capacity is "combined with capacity available under clause (a) as a shared cap."
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
    const finding = result.documentDetails[0]!.crossSectionFindings.find((f) => f.relationshipType === "SHARED_CAP");
    const caught = finding !== undefined && finding.found === false;
    record("missing-shared-cap-relationship", caught);
    expect(caught).toBe(true);
  });

  it("9. POSITIVE CONTROL: a present, correctly-linked shared-cap relationship produces NO finding", async () => {
    const index = buildIndex();
    const ruleBWithSharedCap = makeRule("6.01(b)", 5_000_000, { capacityExpression: withExpressionId({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", ruleId: null, sharedCapId: "shared-cap-1" }) });
    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB],
      compiledResults: [
        { candidateRef: "disc-a", rules: [ruleA], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleBWithSharedCap], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(),
    });
    const finding = result.documentDetails[0]!.crossSectionFindings.find((f) => f.relationshipType === "SHARED_CAP");
    const caught = finding === undefined; // "caught" here means "correctly silent" - the positive control
    record("present-shared-cap-no-false-positive", caught);
    expect(caught).toBe(true);
  });

  it("10. Stale superseded text credited as current is caught via the real OperativeContractState", async () => {
    const index = buildIndex();
    const supersededProvision: OperativeProvisionView = {
      instrumentKey,
      provisionKey: "prov-6.01a",
      kind: "SECTION",
      documentId: "doc-1",
      sectionRef: "6.01(a)",
      definedTermRef: null,
      asOfDate: "2026-01-01",
      currentSourceDocumentId: "doc-2",
      currentSourceNodeKey: "doc-2::6.01(a)-amended",
      currentSourceNodeId: "id-doc-2-6.01(a)-amended",
      currentText: "amended text",
      fullChain: [],
      appliedChain: [],
      supersededSourceNodeKeys: ["doc-1::6.01(a)"],
      supersededSourceNodeIds: [nodeIdFor("6.01(a)")],
      status: "OPERATIVE_STATE_RESOLVED",
      unresolvedIssues: [],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: null,
      reviewRequired: false,
      candidateTexts: [],
    };
    const operativeState: OperativeContractState = { instrumentKey, asOfDate: "2026-01-01", provisions: [supersededProvision], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const result = await runSemanticCoverageAudit({ ...baseInput, index, operativeState, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateA], compiledResults: [{ candidateRef: "disc-a", rules: [ruleA], definitions: [] }], verifiedCandidateRefs: new Set() });
    const caught = result.documentDetails[0]!.operativeStateFindings.some((f) => f.findingType === "STALE_SUPERSEDED_TEXT_CREDITED");
    record("stale-superseded-text", caught);
    expect(caught).toBe(true);
    // Phase 3F.1 §29-32/F3: the finding must not remain a parallel, unread
    // list - it must actually flip the affected unit's own coverageState
    // and (since this rule was compiled/verified) prevent package status
    // from reading as a clean covered/resolved state despite crediting
    // stale text.
    const doc = result.packageCoverage.documents[0]!;
    const staleEntry = doc.coverageEntries.find((e) => e.semanticUnitId === result.documentDetails[0]!.operativeStateFindings.find((f) => f.findingType === "STALE_SUPERSEDED_TEXT_CREDITED")!.semanticUnitId);
    expect(staleEntry?.coverageState).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(result.packageCoverage.status).toBe("PACKAGE_OPERATIVE_STATE_UNRESOLVED");
  });

  it("11. An unresolved (conflicted) operative state for a covering provision is caught", async () => {
    const index = buildIndex();
    const conflictedProvision: OperativeProvisionView = {
      instrumentKey,
      provisionKey: "prov-6.01a",
      kind: "SECTION",
      documentId: "doc-1",
      sectionRef: "6.01(a)",
      definedTermRef: null,
      asOfDate: "2026-01-01",
      currentSourceDocumentId: "doc-1",
      currentSourceNodeKey: "doc-1::6.01(a)",
      currentSourceNodeId: nodeIdFor("6.01(a)"),
      currentText: "test",
      fullChain: [],
      appliedChain: [],
      supersededSourceNodeKeys: [],
      supersededSourceNodeIds: [],
      status: "OPERATIVE_STATE_CONFLICTED",
      unresolvedIssues: ["two amendments conflict"],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: null,
      reviewRequired: true,
      candidateTexts: [],
    };
    const operativeState: OperativeContractState = { instrumentKey, asOfDate: "2026-01-01", provisions: [conflictedProvision], status: "OPERATIVE_STATE_CONFLICTED", summary: "test", unattachedEffects: [] };
    const result = await runSemanticCoverageAudit({ ...baseInput, index, operativeState, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateA], compiledResults: [{ candidateRef: "disc-a", rules: [ruleA], definitions: [] }], verifiedCandidateRefs: new Set() });
    const caught = result.documentDetails[0]!.operativeStateFindings.some((f) => f.findingType === "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT");
    record("unresolved-operative-state", caught);
    expect(caught).toBe(true);
    // Phase 3F.1 §29-32/F3: same wiring check as the stale-superseded case above.
    const doc = result.packageCoverage.documents[0]!;
    expect(doc.coverageEntries.some((e) => e.coverageState === "OPERATIVE_STATE_UNRESOLVED")).toBe(true);
    expect(result.packageCoverage.status).toBe("PACKAGE_OPERATIVE_STATE_UNRESOLVED");
  });

  it("12. A document flagged auditIncomplete is never silently rolled up into a passing package status", async () => {
    const index = buildIndex();
    const result = await runSemanticCoverageAudit({ ...baseInput, index, documents: [{ documentId: "doc-1", auditIncomplete: true }], discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    const caught = result.packageCoverage.status === "PACKAGE_AUDIT_INCOMPLETE";
    record("audit-incomplete-not-hidden", caught);
    expect(caught).toBe(true);
  });

  it("13. AI-layer hallucinated evidence is rejected end-to-end through the real pipeline, never becoming a unit", async () => {
    const index = buildIndex();
    const aiCaller = fakeCaller(() => ({ proposedUnits: [{ sourceQuote: "a completely invented figure never present in the source", postureSignal: "PERMISSION_SIGNAL", materiality: "CRITICAL", whyDeterministicLayerMightMiss: "x", reasoning: "y" }], overallNotes: [] }));
    const result = await runSemanticCoverageAudit({ ...baseInput, index, aiCaller, documents: [{ documentId: "doc-1" }], discoveredCandidates: [candidateA, candidateB], compiledResults: [{ candidateRef: "disc-a", rules: [ruleA], definitions: [] }], verifiedCandidateRefs: new Set() });
    const caught = !result.documentDetails[0]!.units.some((u) => u.excerptText.includes("completely invented"));
    record("ai-hallucination-rejected-e2e", caught);
    expect(caught).toBe(true);
  });

  it("14. Multiple simultaneous relationship-type omissions (shared cap AND reclassification) are BOTH caught in one run, not just the first", async () => {
    const index = buildIndex();
    const textWithReclass = SAMPLE_DOCUMENT.replace("Section 6.02 Liens.", "Section 6.02 Liens. Amounts hereunder may later be subject to reclassification into another basket.");
    const idx2 = buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text: textWithReclass }]);
    const result = await runSemanticCoverageAudit({
      ...baseInput,
      index: idx2,
      documents: [{ documentId: "doc-1" }],
      discoveredCandidates: [candidateA, candidateB],
      compiledResults: [
        { candidateRef: "disc-a", rules: [ruleA], definitions: [] },
        { candidateRef: "disc-b", rules: [ruleB], definitions: [] },
      ],
      verifiedCandidateRefs: new Set(),
    });
    const types = new Set(result.documentDetails[0]!.crossSectionFindings.map((f) => f.relationshipType));
    const caught = types.has("SHARED_CAP") && types.has("RECLASSIFICATION_OR_REDESIGNATION");
    record("multiple-simultaneous-relationship-omissions", caught);
    expect(caught).toBe(true);
  });

  it("REQUIRED GATE: 100% of the above fault-injection scenarios were caught", () => {
    expect(results.length).toBeGreaterThanOrEqual(14);
    const uncaught = results.filter((r) => !r.caught);
    expect(uncaught, `uncaught scenarios: ${uncaught.map((r) => r.name).join(", ")}`).toHaveLength(0);
  });
});
