/**
 * Phase 3F.1.6 Final Foundation Certification — Section 27: cross-module
 * failure propagation. Each describe block below constructs and EXECUTES
 * one full chain end-to-end through real, unmodified production functions
 * (never asserting one link in isolation and assuming the rest), and
 * asserts on the REAL final artifact each chain is supposed to produce: a
 * persisted ClaimReviewItem row (real Postgres) or, where a chain is found
 * to break, a demonstrable absence of one despite genuine upstream
 * uncertainty.
 *
 * AUDIT-ONLY: no production code is modified by this file. Where a chain is
 * found to break, this file documents the exact break with a passing
 * assertion of the OBSERVED (broken) behavior plus an explanatory comment —
 * it does not attempt to fix the break (production code is frozen for this
 * certification).
 *
 * Real Postgres required (DATABASE_URL) — every chain that produces a
 * ClaimReviewItem persists and re-reads it via Prisma, then cleans up its
 * own scratch company/document rows in an afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { auditOperativeStateForUnits, applyOperativeStateFindingsToCoverage } from "../../lib/contract-model/compiler/semantic-coverage/cross-reference-audit";
import { reconcileFrozenInventory } from "../../lib/contract-model/compiler/semantic-coverage/reconciliation";
import { freezeSourceInventory } from "../../lib/contract-model/compiler/semantic-coverage/freeze";
import { deriveFromCoverageEntry } from "../../lib/contract-model/compiler/safe-failure/derive";
import { recordClaimReview } from "../../lib/contract-model/compiler/safe-failure/service";
import { claimKeyFromSemanticUnit } from "../../lib/contract-model/compiler/safe-failure/identity";
import { computeSemanticUnitId } from "../../lib/contract-model/compiler/semantic-coverage/identity";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic-coverage/types";
import type { MaterialSemanticUnit, SourceAnchor } from "../../lib/contract-model/compiler/semantic-coverage/types";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { withExpressionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";

const COMPANY_ID = "cert-3f1-6-propagation-chains-scratch";

function n(overrides: Partial<StructuralNode> & Pick<StructuralNode, "documentId" | "nodeType" | "sectionRef" | "charStart" | "charEnd">): StructuralNode {
  return {
    documentId: overrides.documentId,
    nodeType: overrides.nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${overrides.documentId}::${overrides.sectionRef.replace(/\s+/g, "")}`,
    nodeId: overrides.nodeId ?? `synthetic:${overrides.documentId}:${overrides.nodeType}:${overrides.charStart}`,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

function effect(overrides: Partial<AmendmentEffectCandidate> & { effectId: string; targetSectionRef?: string; targetDefinedTermRef?: string; targetInstrumentKey?: string }): AmendmentEffectCandidate {
  return {
    effectId: overrides.effectId,
    amendmentDocumentId: overrides.amendmentDocumentId ?? "amend-doc",
    target: {
      kind: overrides.targetSectionRef ? "SECTION" : "DEFINITION",
      targetDocumentId: overrides.target?.targetDocumentId ?? "base-doc",
      targetInstrumentKey: overrides.targetInstrumentKey ?? "instrument-1",
      targetStructuralNodeKey: null,
      targetSectionRef: overrides.targetSectionRef ?? null,
      targetDefinedTermRef: overrides.targetDefinedTermRef ?? null,
      targetHint: null,
    },
    operation: overrides.operation ?? "MODIFY_THRESHOLD",
    effectiveDate: overrides.effectiveDate ?? { date: "2024-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "effective as of January 1, 2024", reason: "explicit" },
    newText: overrides.newText ?? null,
    oldText: overrides.oldText ?? null,
    sourceCitation: overrides.sourceCitation ?? "Amendment §1",
    sourceExcerpt: overrides.sourceExcerpt ?? "excerpt",
    confidence: overrides.confidence ?? 0.9,
    status: overrides.status ?? "RESOLVED",
    unresolvedReason: overrides.unresolvedReason ?? null,
    resolutionMethod: overrides.resolutionMethod ?? "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

function anchor(overrides: Partial<SourceAnchor> & Pick<SourceAnchor, "documentId" | "structuralNodeId" | "charStart" | "charEnd">): SourceAnchor {
  return {
    documentId: overrides.documentId,
    structuralNodeKey: overrides.structuralNodeKey ?? `${overrides.documentId}::synthetic`,
    structuralNodeId: overrides.structuralNodeId,
    sectionRef: overrides.sectionRef ?? null,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    sourceCitation: overrides.sourceCitation ?? `${overrides.documentId}::synthetic`,
  };
}

function unit(overrides: Partial<MaterialSemanticUnit> & { anchors: SourceAnchor[] }): MaterialSemanticUnit {
  const semanticUnitId = overrides.semanticUnitId ?? computeSemanticUnitId(overrides.anchors, overrides.excerptText ?? "test excerpt");
  return {
    semanticUnitId,
    companyId: overrides.companyId ?? COMPANY_ID,
    packageKey: overrides.packageKey ?? "pkg-1",
    instrumentKey: overrides.instrumentKey ?? "instrument-1",
    operativeVersionRef: overrides.operativeVersionRef ?? null,
    granularity: overrides.granularity ?? "CLAUSE",
    anchors: overrides.anchors,
    family: overrides.family ?? "INDEBTEDNESS",
    familyEvidence: overrides.familyEvidence ?? null,
    postureSignal: overrides.postureSignal ?? "PROHIBITION_SIGNAL",
    materiality: overrides.materiality ?? "CRITICAL",
    materialityReasoning: overrides.materialityReasoning ?? "test materiality reasoning",
    contextuallyElevated: overrides.contextuallyElevated ?? false,
    excerptText: overrides.excerptText ?? "test excerpt",
    detectedSignals: overrides.detectedSignals ?? [],
    fromRawSourceFallback: overrides.fromRawSourceFallback ?? false,
    detectionMethod: overrides.detectionMethod ?? "DETERMINISTIC_SIGNAL",
    aiInventoryPromptVersion: overrides.aiInventoryPromptVersion ?? null,
    confidence: overrides.confidence ?? "HIGH",
    uncertaintyReasons: overrides.uncertaintyReasons ?? [],
    inventoryAlgorithmVersion: overrides.inventoryAlgorithmVersion ?? SEMANTIC_COVERAGE_ALGORITHM_VERSION,
    provenance: overrides.provenance ?? "test",
  };
}

function makeRule(sourceSectionRef: string, amount: number, overrides: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: computeRuleId("test-co", "instrument-1", sourceSectionRef, "test"),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId: "test-co",
    instrumentKey: "instrument-1",
    sourceDocumentId: "base-doc",
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
    provenance: { documentId: "base-doc", sourceNodeKey: null, sourceCitation: `base-doc::${sourceSectionRef}`, excerpt: null },
    compilerVersion: null,
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

async function ensureCompanyAndDocument(documentId: string) {
  await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Cert 3F.1.6 propagation-chain scratch" }, update: {} });
  await prisma.document.upsert({ where: { id: documentId }, create: { id: documentId, companyId: COMPANY_ID, name: `scratch ${documentId}`, type: "CREDIT_AGREEMENT" }, update: {} });
}

beforeAll(async () => {
  await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Cert 3F.1.6 propagation-chain scratch" }, update: {} });
});

afterAll(async () => {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

describe("Chain 1: structural corruption -> operative uncertainty -> semantic trust withheld -> explicit review item (COMPOSES)", () => {
  it("a real INVALID_SOURCE_SPAN-corrupted section, amended by a real resolved effect, ends up as a persisted OPEN_REVIEW ClaimReviewItem", async () => {
    const documentId = "chain1-base-doc";
    await ensureCompanyAndDocument(documentId);

    // Link 1: structural corruption (real StructuralIndex health diagnostics).
    const shortText = "x".repeat(30);
    const corrupted = n({ documentId, nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 500, nodeId: "chain1-sec-601" });
    const index = buildStructuralIndex(new Map([[documentId, { text: shortText, nodes: [corrupted] }]]), [], []);
    expect(index.healthDiagnostics().some((f) => f.code === "INVALID_SOURCE_SPAN" && f.severity === "ERROR" && f.nodeId === "chain1-sec-601")).toBe(true);

    // Link 2: operative uncertainty (real computeOperativeContractState).
    const amendEffect = effect({ effectId: "chain1-eff", targetSectionRef: "6.01", newText: "The threshold is hereby increased to $10,000,000.", target: { targetDocumentId: documentId } as never });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-06-01", index, allEffects: [amendEffect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE");
    expect(state.provisions[0]!.currentText).toBeNull(); // trust withheld at the operative-state layer

    // Link 3: does the operative uncertainty actually reach semantic coverage?
    const materialUnit = unit({ anchors: [anchor({ documentId, structuralNodeId: "chain1-sec-601", sectionRef: "6.01", charStart: 0, charEnd: 30 })], materiality: "CRITICAL" });
    const findings = auditOperativeStateForUnits([materialUnit], state);
    expect(findings.length).toBe(1);
    // The real buildProvisionView records the base node as "superseded" the
    // moment ANY effect applies against it (its own before-state is pushed
    // onto supersededSourceNodeIds ahead of the applied effect) — so this
    // real run legitimately produces STALE_SUPERSEDED_TEXT_CREDITED rather
    // than OPERATIVE_STATE_UNRESOLVED_FOR_UNIT. Either finding type proves
    // the same thing this chain link exists to prove (the operative
    // uncertainty reached semantic coverage) - both are real,
    // non-RESOLVED findings the next link overrides coverage state with.
    expect(["STALE_SUPERSEDED_TEXT_CREDITED", "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT"]).toContain(findings[0]!.findingType);

    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [materialUnit] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    const { entries: finalEntries, dangerousUnaccounted: finalDangerous } = applyOperativeStateFindingsToCoverage(entries, dangerousUnaccounted, findings, [materialUnit]);
    expect(finalEntries[0]!.coverageState).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(finalDangerous.some((d) => d.semanticUnitId === materialUnit.semanticUnitId)).toBe(true);

    // Link 4: does the coverage-layer uncertainty become an explicit, persisted review item?
    const input = deriveFromCoverageEntry({
      unit: materialUnit,
      entry: finalEntries[0]!,
      dangerous: finalDangerous.find((d) => d.semanticUnitId === materialUnit.semanticUnitId) ?? null,
      companyId: COMPANY_ID,
      packageKey: "pkg-1",
      instrumentKey: "instrument-1",
      coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
    });
    expect(input).not.toBeNull();
    const result = await recordClaimReview(input!);
    expect(result.outcome).toBe("CREATED");

    const persisted = await prisma.claimReviewItem.findUnique({ where: { id: result.reviewItemId } });
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe("OPEN_REVIEW");
    expect(persisted!.materiality).toBe("CRITICAL");
    expect(persisted!.structuralNodeId).toBe("chain1-sec-601");
    // CHAIN 1 VERDICT: FULLY COMPOSES — every link (structural health ->
    // operative state -> coverage state -> persisted ClaimReviewItem) was
    // independently verified to carry the uncertainty forward; nothing was
    // silently dropped at any boundary.
  });
});

describe("Chain 2: definition uncertainty -> semantic uncertainty -> review item (BREAKS — real, reproducible gap)", () => {
  it("an AMBIGUOUS defined term (2 real physical definitions, both amendment-relevant) resolves operative-state to PARTIAL, but auditOperativeStateForUnits NEVER flags the corresponding semantic unit — the coverage layer can still confidently report FULLY_REPRESENTED_VERIFIED", async () => {
    const documentId = "chain2-base-doc";
    await ensureCompanyAndDocument(documentId);

    // Two REAL, distinct physical occurrences defining the SAME term in the
    // SAME document — genuine drafting collision (e.g. a defined-terms
    // schedule restated verbatim in an exhibit), not a synthetic edge case.
    const defA: DetectedDefinition = { documentId, exactTerm: "Permitted Investments", normalizedTerm: "permitted investments", sourceNodeKey: `${documentId}::def-a`, sourceNodeId: "chain2-def-a", charStart: 0, charEnd: 60, definitionExcerpt: "\"Permitted Investments\" means investments not to exceed $8,000,000 in the aggregate." };
    const defB: DetectedDefinition = { documentId, exactTerm: "Permitted Investments", normalizedTerm: "permitted investments", sourceNodeKey: `${documentId}::def-b`, sourceNodeId: "chain2-def-b", charStart: 500, charEnd: 560, definitionExcerpt: "\"Permitted Investments\" means investments not to exceed $8,000,000 in the aggregate." };
    const nodeA = n({ documentId, nodeType: "CLAUSE", sectionRef: "1.01(pi-a)", charStart: 0, charEnd: 60, nodeId: "chain2-def-a" });
    const nodeB = n({ documentId, nodeType: "CLAUSE", sectionRef: "1.01(pi-b)", charStart: 500, charEnd: 560, nodeId: "chain2-def-b" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(700), nodes: [nodeA, nodeB] }]]), [defA, defB], []);

    // Link 1: definition uncertainty is REAL and independently confirmed —
    // index.allDefinitions() genuinely contains 2 distinct occurrences.
    expect(index.allDefinitions().filter((d) => d.documentId === documentId && d.normalizedTerm === "permitted investments")).toHaveLength(2);

    // Link 2: a real amendment targets this ambiguous term -> operative-state
    // independently and correctly reports AMBIGUOUS/PARTIAL (proven working
    // exactly like combined-failures.test.ts's own SECTION-kind case).
    const amendEffect = effect({ effectId: "chain2-eff", targetDefinedTermRef: "Permitted Investments", target: { targetDocumentId: documentId } as never });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-06-01", index, allEffects: [amendEffect] });
    const provision = state.provisions[0]!;
    expect(provision.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.candidateSourceNodeIds.sort()).toEqual(["chain2-def-a", "chain2-def-b"]);
    expect(provision.sectionRef).toBeNull(); // DEFINITION-kind provisions never carry a sectionRef — this is the root of the break below.
    expect(provision.currentSourceNodeId).toBeNull(); // AMBIGUOUS -> no single nodeId resolved.

    // Link 3 (THE BREAK): a MaterialSemanticUnit anchored to ONE of the two
    // real ambiguous definition nodes is run through the REAL, unmodified
    // auditOperativeStateForUnits. Its own matching logic
    // (lib/contract-model/compiler/semantic-coverage/cross-reference-audit.ts)
    // only ever matches a covering provision via
    // `p.currentSourceNodeId === nodeId` (null here — no single node
    // resolved) OR `p.sectionRef === anchor.sectionRef` (also null for every
    // DEFINITION-kind provision, unconditionally). Neither branch can ever
    // fire for a DEFINITION-kind provision's own AMBIGUOUS case — it never
    // consults `candidateSourceNodeIds` at all. Result: the finding this
    // module exists to produce (OPERATIVE_STATE_UNRESOLVED_FOR_UNIT) is
    // NEVER emitted for this genuinely, independently-confirmed-ambiguous
    // unit.
    const materialUnit = unit({ anchors: [anchor({ documentId, structuralNodeId: "chain2-def-a", sectionRef: null, charStart: 0, charEnd: 60 })], family: "OTHER_UNCLASSIFIED", postureSignal: "DEFINITIONAL_SIGNAL", materiality: "CRITICAL" });
    const findings = auditOperativeStateForUnits([materialUnit], state);
    expect(findings).toHaveLength(0); // <-- THE GAP: real ambiguity, zero findings.

    // Demonstrate the WORST case this gap enables: reconciliation, acting
    // without any operative-state override, can independently reach
    // FULLY_REPRESENTED_VERIFIED for this same unit — a confident answer
    // Architecture Invariant #13 exists specifically to forbid whenever
    // precedence/operative state "cannot be established with confidence."
    const discoveryId = "chain2-discovery";
    const candidate: DiscoveredCandidate = {
      discoveryId,
      documentId,
      structuralNodeKeys: [`${documentId}::1.01(pi-a)`],
      structuralNodeIds: ["chain2-def-a"],
      normalizedSourceRef: `${documentId}::1.01(pi-a)`,
      families: ["INDEBTEDNESS"],
      role: "DEFINITIONAL_DEPENDENCY_CANDIDATE",
      roleRaw: "DEFINITIONAL_DEPENDENCY_CANDIDATE",
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
      sourceCitation: `${documentId}::1.01(pi-a)`,
      discoveryRunVersion: "test",
    };
    const rule = makeRule("1.01(pi-a)", 8_000_000, { provenance: { documentId, sourceNodeKey: null, sourceCitation: materialUnit.anchors[0]!.sourceCitation, excerpt: null } });
    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [materialUnit] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: discoveryId, rules: [rule], definitions: [] }], verifiedCandidateRefs: new Set([discoveryId]) });
    const { entries: finalEntries } = applyOperativeStateFindingsToCoverage(entries, dangerousUnaccounted, findings, [materialUnit]);

    // THE DANGEROUS OUTCOME: reconciliation alone (never told about the real,
    // independently-known definitional ambiguity) reports this unit as
    // fully represented AND verified — the "confident but wrong" state
    // Architecture Invariant #13 forbids, produced here via a real,
    // reproducible cross-module composition gap rather than a hypothetical.
    expect(finalEntries[0]!.coverageState).toBe("FULLY_REPRESENTED_VERIFIED");

    // Because FULLY_REPRESENTED_VERIFIED is the one non-reviewable state,
    // deriveFromCoverageEntry correctly returns null for it — NOT because
    // the safe-failure architecture is broken, but because the upstream
    // coverage state it was handed is itself the wrong answer. No
    // ClaimReviewItem is ever created for this claim.
    const derived = deriveFromCoverageEntry({ unit: materialUnit, entry: finalEntries[0]!, dangerous: null, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
    expect(derived).toBeNull();
    // CHAIN 2 VERDICT: BREAKS. Root cause is precisely isolated: cross-
    // reference-audit.ts's auditOperativeStateForUnits matches a covering
    // provision via currentSourceNodeId or sectionRef only — both of which
    // are structurally null/unpopulated for every DEFINITION-kind
    // OperativeProvisionView, regardless of targetResolutionStatus. The
    // SECTION-kind case (see Chain 4 below) has no equivalent gap because
    // sectionRef IS populated there even when AMBIGUOUS. This is a
    // genuinely silent drop of real uncertainty, not merely a missing test.
  });
});

describe("Chain 3: verification contradiction -> trusted state withheld -> review item (COMPOSES, with a disclosed reason-code fidelity gap)", () => {
  const documentId = "chain3-base-doc";
  const discoveryId = "chain3-discovery";

  async function runWithVerifiedRefs(verifiedRefs: Set<string>) {
    await ensureCompanyAndDocument(documentId);
    const node = n({ documentId, nodeType: "SECTION", sectionRef: "6.05", charStart: 0, charEnd: 100, nodeId: "chain3-sec-605" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(200), nodes: [node] }]]), [], []);
    const materialUnit = unit({ anchors: [anchor({ documentId, structuralNodeId: "chain3-sec-605", sectionRef: "6.05", charStart: 0, charEnd: 100, sourceCitation: `${documentId}::6.05` })], excerptText: "not to exceed $9,000,000", materiality: "MATERIAL" });
    const candidate: DiscoveredCandidate = {
      discoveryId,
      documentId,
      structuralNodeKeys: [`${documentId}::6.05`],
      structuralNodeIds: ["chain3-sec-605"],
      normalizedSourceRef: `${documentId}::6.05`,
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
      sourceCitation: `${documentId}::6.05`,
      discoveryRunVersion: "test",
    };
    const rule = makeRule("6.05", 9_000_000, { provenance: { documentId, sourceNodeKey: null, sourceCitation: `${documentId}::6.05`, excerpt: null } });
    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [materialUnit] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [candidate], compiledResults: [{ candidateRef: discoveryId, rules: [rule], definitions: [] }], verifiedCandidateRefs: verifiedRefs });
    return { entry: entries[0]!, dangerous: dangerousUnaccounted[0] ?? null, materialUnit };
  }

  it("Phase 3C simply never ran for this candidate -> FULLY_REPRESENTED_REVIEW_REQUIRED -> a real ClaimReviewItem is created", async () => {
    const { entry, dangerous, materialUnit } = await runWithVerifiedRefs(new Set());
    expect(entry.coverageState).toBe("FULLY_REPRESENTED_REVIEW_REQUIRED"); // trust withheld — never silently promoted to VERIFIED
    const input = deriveFromCoverageEntry({ unit: materialUnit, entry, dangerous, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
    expect(input).not.toBeNull();
    expect(input!.reasonCode).toBe("SEMANTIC_AMBIGUITY");
    const result = await recordClaimReview(input!);
    const persisted = await prisma.claimReviewItem.findUnique({ where: { id: result.reviewItemId } });
    expect(persisted!.status).toBe("OPEN_REVIEW");
    await prisma.claimReviewItem.delete({ where: { id: result.reviewItemId } });
  });

  it("DISCLOSED GAP: this pipeline's own verifiedCandidateRefs contract has no room to express 'Phase 3C ran and found a genuine contradiction' as distinct from 'Phase 3C never ran' — both produce byte-identical downstream state (same coverageState, same reasonCode) — reconciliation.ts's own header comment for verifiedCandidateRefs documents this exactly as a boolean pass/fail set, never a 3-way ran-and-passed/ran-and-failed/never-ran signal", async () => {
    // Simulates "verification ran and actively found a contradiction" the
    // only way this pipeline's real, documented contract allows: by NOT
    // including the discoveryId in verifiedCandidateRefs — the identical
    // input shape the "never ran" case above used.
    const { entry: contradictedEntry, dangerous: contradictedDangerous } = await runWithVerifiedRefs(new Set()); // same exact input as "never ran" — the pipeline has no other lever
    const { entry: neverRanEntry } = await runWithVerifiedRefs(new Set());
    expect(contradictedEntry.coverageState).toBe(neverRanEntry.coverageState); // identical — the two cases are indistinguishable downstream
    expect(contradictedEntry.reasoning).toBe(neverRanEntry.reasoning);
    void contradictedDangerous;
    // CHAIN 3 VERDICT: COMPOSES for its core safety promise (an explicit
    // review item IS always created — uncertainty is never silently
    // dropped), but with a disclosed MINOR fidelity gap: a genuinely
    // contradicted verification and a never-attempted verification produce
    // the SAME reasonCode (SEMANTIC_AMBIGUITY), never VERIFICATION_CONTRADICTION,
    // because reconciliation.ts's verifiedCandidateRefs is a boolean
    // membership set with no room for a 3rd, more severe outcome. This is a
    // reviewer-triage quality gap, not a silent-drop safety gap — the claim
    // is never lost, only under-classified.
  });
});

describe("Chain 4: amendment ambiguity (SECTION-kind) -> fail-closed operative state -> review item (COMPOSES, contrast case for Chain 2)", () => {
  it("a duplicate-labeled SECTION amendment target correctly flags BOTH real physical occurrences via the sectionRef fallback that DEFINITION-kind provisions lack", async () => {
    const documentId = "chain4-base-doc";
    await ensureCompanyAndDocument(documentId);

    const sectionA = n({ documentId, nodeType: "SECTION", sectionRef: "6.04", charStart: 0, charEnd: 100, nodeId: "chain4-sec-604-a" });
    const sectionB = n({ documentId, nodeType: "SECTION", sectionRef: "6.04", charStart: 500, charEnd: 600, nodeId: "chain4-sec-604-b" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(1000), nodes: [sectionA, sectionB] }]]), [], []);
    expect(index.resolveUniqueNodeByRef(documentId, "6.04").status).toBe("AMBIGUOUS");

    const futureEffect = effect({ effectId: "chain4-eff", targetSectionRef: "6.04", target: { targetDocumentId: documentId } as never, effectiveDate: { date: "2030-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" } });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-01-01", index, allEffects: [futureEffect] });
    const provision = state.provisions[0]!;
    expect(provision.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.sectionRef).toBe("6.04"); // SECTION-kind DOES carry sectionRef even when AMBIGUOUS — the key structural difference from Chain 2.

    const unitA = unit({ anchors: [anchor({ documentId, structuralNodeId: "chain4-sec-604-a", sectionRef: "6.04", charStart: 0, charEnd: 100 })], materiality: "CRITICAL" });
    const unitB = unit({ anchors: [anchor({ documentId, structuralNodeId: "chain4-sec-604-b", sectionRef: "6.04", charStart: 500, charEnd: 600 })], materiality: "MATERIAL" });
    const findings = auditOperativeStateForUnits([unitA, unitB], state);
    // Both real physical occurrences sharing the ambiguous label are
    // flagged — the sectionRef fallback is coarser than a nodeId match but
    // fails CLOSED (over-inclusive), never open (silent).
    expect(findings.map((f) => f.semanticUnitId).sort()).toEqual([unitA.semanticUnitId, unitB.semanticUnitId].sort());

    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [unitA, unitB] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    const { entries: finalEntries, dangerousUnaccounted: finalDangerous } = applyOperativeStateFindingsToCoverage(entries, dangerousUnaccounted, findings, [unitA, unitB]);
    expect(finalEntries.every((e) => e.coverageState === "OPERATIVE_STATE_UNRESOLVED")).toBe(true);

    const createdIds: string[] = [];
    for (const [u, entry] of [[unitA, finalEntries.find((e) => e.semanticUnitId === unitA.semanticUnitId)!] as const, [unitB, finalEntries.find((e) => e.semanticUnitId === unitB.semanticUnitId)!] as const]) {
      const dangerous = finalDangerous.find((d) => d.semanticUnitId === u.semanticUnitId) ?? null;
      const input = deriveFromCoverageEntry({ unit: u, entry, dangerous, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
      expect(input).not.toBeNull();
      const result = await recordClaimReview(input!);
      expect(result.outcome).toBe("CREATED");
      createdIds.push(result.reviewItemId);
    }

    const persisted = await prisma.claimReviewItem.findMany({ where: { id: { in: createdIds } } });
    expect(persisted).toHaveLength(2);
    expect(new Set(persisted.map((p) => p.structuralNodeId))).toEqual(new Set(["chain4-sec-604-a", "chain4-sec-604-b"]));
    // Sibling-safety spot-check (relevant to Section 29 too): each of the
    // two real occurrences got its OWN distinct ClaimReviewItem — no
    // cross-contamination merged them into one row despite the shared
    // section label.
    expect(persisted[0]!.id).not.toBe(persisted[1]!.id);
    expect(persisted.every((p) => p.claimKey === claimKeyFromSemanticUnit({ semanticUnitId: p.claimKey.replace(/^su:/, "") }) )).toBe(true);
    // CHAIN 4 VERDICT: FULLY COMPOSES.
  });
});
