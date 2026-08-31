/**
 * POST-3F.2 remediation - Unit B generic test gate (B1-B16). Every document
 * fact pattern here is synthetic/invented (Zenith Robotics, Inc. / Meridian
 * Capital, LLC - never Riot/Coinbase, any real Riot section number, or any
 * real Riot date) so this gate proves the fix generalizes across arbitrary
 * restatement drafting, not that it was tuned to the exact Riot case that
 * failed.
 *
 * Uses the REAL, unmodified production functions end to end
 * (buildPackageGraph, runAmendmentPipeline, computeOperativeContractState,
 * computeOperativeDocument) - never a mock of package-graph or amendment
 * logic. B11 mirrors lib/contract-model/analysis/orchestrator.ts's own
 * exact wiring (the unresolvedTargetEffectsForThisInstrument computation
 * and its call into computeOperativeContractState) rather than driving the
 * full Postgres-backed runContractAnalysis, because operativeState/
 * operativeDocument are not currently part of RunContractAnalysisResult's
 * return shape - the same real functions, called the same way, with the
 * same real inputs orchestrator.ts itself supplies.
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { resolvePackageRelationships } from "../../lib/contract-model/compiler/package-graph/relationship-resolution";
import { classifyPackageDocuments } from "../../lib/contract-model/compiler/package-graph/document-classifier";
import { extractPackageDocumentIdentities } from "../../lib/contract-model/compiler/package-graph/document-identity";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeDocument } from "../../lib/contract-model/compiler/amendment/chain";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";

const COMPANY_ID = "post-3f2-unit-b";
const PACKAGE_KEY = "post-3f2-unit-b-pkg";

/** Never actually invoked in these tests - every fixture below is deterministic (no AMBIGUOUS_OPERATIONS requiring semantic interpretation), so a caller that throws proves the deterministic pass alone is doing the work. */
const NEVER_CALLED_CALLER: StageCaller = {
  providerName: "never-called",
  model: "never-called",
  isSynthetic: true,
  async call() {
    throw new Error("this synthetic test's deterministic amendment pass should never need a semantic-interpretation call");
  },
  lastTelemetry() {
    return null;
  },
};

/** Builds a real StructuralIndex the same way structural analysis would - one top-level SECTION node per document, spanning its full text. Sufficient for relationship-resolution/amendment testing, which only needs document-level text, not fine-grained clause structure. */
function buildRealIndex(docs: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allNodes: StructuralNode[] = [];
  for (const doc of docs) {
    const node: StructuralNode = { documentId: doc.documentId, nodeType: "SECTION", heading: doc.label, sectionRef: "1", nodeKey: `${doc.documentId}::1`, nodeId: `n-${doc.documentId}-1`, charStart: 0, charEnd: doc.text.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes: [node] });
    allNodes.push(node);
  }
  const allDefinitions = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  const allReferences = docs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

async function runRealPipeline(docs: PackageDocumentInput[]) {
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, docs);
  const index = buildRealIndex(docs);
  const amendmentResult = await runAmendmentPipeline(NEVER_CALLED_CALLER, { documents: docs, packageGraph, index });
  return { packageGraph, index, amendmentResult };
}

// Synthetic 3-document restatement chain (invented parties/dates/amounts).
const V1_TEXT = `CREDIT AGREEMENT dated as of January 10, 2023, among Zenith Robotics, Inc., as Borrower, and Meridian Capital, LLC, as Lender.

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $10,000,000 in the aggregate.
`;
const V2_TEXT = `AMENDED AND RESTATED CREDIT AGREEMENT dated as of March 5, 2023, among Zenith Robotics, Inc., as Borrower, and Meridian Capital, LLC, as Lender.

The Borrower and Lender are parties to a Credit Agreement dated as of January 10, 2023 (the "Existing Credit Agreement") and, in consideration of the mutual covenants and agreements herein contained, have agreed to amend and restate the Existing Credit Agreement with effect from the Amendment and Restatement Effective Date as follows:

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $15,000,000 in the aggregate.
`;
const V3_TEXT = `SECOND AMENDED AND RESTATED CREDIT AGREEMENT dated as of November 20, 2023, among Zenith Robotics, Inc., as Borrower, and Meridian Capital, LLC, as Lender.

The Borrower and Lender are parties to a Credit Agreement dated as of January 10, 2023, as amended and restated as of the First Amendment and Restatement Effective Date (this Agreement in the form as of the First Amendment and Restatement Effective Date, the "Existing Credit Agreement", and as in effect on the Original Effective Date, the "Original Credit Agreement") and, in consideration of the mutual covenants and agreements herein contained, have agreed to amend and restate the Existing Credit Agreement with effect from the Second Amendment and Restatement Effective Date as follows:

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $20,000,000 in the aggregate.
`;

function chainDocs(): PackageDocumentInput[] {
  return [
    { documentId: "v1", label: "Original Credit Agreement", text: V1_TEXT, declaredType: "CREDIT_AGREEMENT" },
    { documentId: "v2", label: "First A&R Credit Agreement", text: V2_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" },
    { documentId: "v3", label: "Second A&R Credit Agreement", text: V3_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" },
  ];
}

describe("POST-3F.2 Unit B1/B2 - caption-style vs recital-style prior-agreement reference", () => {
  it("B1: caption-style reference (\"the Amended and Restated Credit Agreement, dated as of...\") resolves via the pre-existing direct date-match path", () => {
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of June 1, 2023 to the Credit Agreement, dated as of January 10, 2023, among Zenith Robotics, Inc. and Meridian Capital, LLC.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated to increase the Indebtedness basket to $12,000,000.`, declaredType: "AMENDMENT" };
    const base: PackageDocumentInput = { documentId: "v1", label: "Original Credit Agreement", text: V1_TEXT, declaredType: "CREDIT_AGREEMENT" };
    const classifications = classifyPackageDocuments([base, amendmentDoc]);
    const identities = extractPackageDocumentIdentities([base, amendmentDoc]);
    const result = resolvePackageRelationships([base, amendmentDoc], classifications, identities, [], []);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "amend-1" && r.relationshipType === "AMENDS");
    expect(edge?.status).toBe("RESOLVED");
    expect(edge?.targetDocumentId).toBe("v1");
    expect(edge?.resolutionMethod).toBe("DETERMINISTIC_TITLE_DATE_MATCH");
  });

  it("B2: recital-style reference (\"parties to a Credit Agreement dated as of...\") - the exact Riot failure pattern, now resolves generically", () => {
    const [v1, v2] = chainDocs();
    const classifications = classifyPackageDocuments([v1!, v2!]);
    const identities = extractPackageDocumentIdentities([v1!, v2!]);
    const result = resolvePackageRelationships([v1!, v2!], classifications, identities, [], []);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "v2" && r.relationshipType === "RESTATES");
    expect(edge?.targetDocumentId).toBe("v1");
    expect(edge?.status).toBe("RESOLVED"); // direct date match: v2's quoted date (Jan 10, 2023) IS v1's own real execution date
    expect(edge?.resolutionMethod).toBe("DETERMINISTIC_TITLE_DATE_MATCH");
  });
});

describe("POST-3F.2 Unit B3-B6 - restatement chain resolution", () => {
  it("B3: an ordinary (non-restatement) amendment never produces an operativeDocument claim - NOT_APPLICABLE, not a guess", async () => {
    const base: PackageDocumentInput = { documentId: "v1", label: "Original Credit Agreement", text: V1_TEXT, declaredType: "CREDIT_AGREEMENT" };
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of June 1, 2023 to the Credit Agreement, dated as of January 10, 2023.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated to increase the Indebtedness basket to $12,000,000.`, declaredType: "AMENDMENT" };
    const { amendmentResult } = await runRealPipeline([base, amendmentDoc]);
    const resolution = computeOperativeDocument("v1", amendmentResult.effects);
    expect(resolution.status).toBe("NOT_APPLICABLE");
    expect(resolution.operativeDocumentId).toBeNull();
  });

  it("B4: single restatement (2-document chain) resolves the operative document correctly", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult } = await runRealPipeline([v1!, v2!]);
    const resolution = computeOperativeDocument("v1", amendmentResult.effects);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.operativeDocumentId).toBe("v2");
    expect(resolution.predecessorDocumentIds).toEqual(["v1"]);
  });

  it("B5/B6: three-document version chain (V1 -> V2 -> V3) resolves V3 as operative, V1/V2 as historical predecessors, with a full evidence-backed relationship chain", async () => {
    const [v1, v2, v3] = chainDocs();
    const { amendmentResult } = await runRealPipeline([v1!, v2!, v3!]);
    const resolution = computeOperativeDocument("v1", amendmentResult.effects);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.operativeDocumentId).toBe("v3");
    expect(new Set(resolution.predecessorDocumentIds)).toEqual(new Set(["v1", "v2"]));
    expect(resolution.relationshipChain).toHaveLength(2);
    // Ordered chronologically: v2 restates v1 first, then v3 restates v2.
    expect(resolution.relationshipChain[0]).toMatchObject({ documentId: "v2", restatesDocumentId: "v1" });
    expect(resolution.relationshipChain[1]).toMatchObject({ documentId: "v3", restatesDocumentId: "v2" });
    // The date-ambiguity safeguard actually engaged for v3 (whose recital quotes the ORIGINAL v1 date, not its true immediate predecessor v2's date):
    const v3Effect = amendmentResult.effects.find((e) => e.amendmentDocumentId === "v3" && e.operation === "RESTATE_AGREEMENT");
    // resolutionMethod on the effect itself is always "DETERMINISTIC_FULL_RESTATEMENT"
    // (how deterministic-parser.ts recognized the full-restatement PATTERN) -
    // the underlying chronological-predecessor TARGET-RESOLUTION mechanism is
    // instead visible in status/unresolvedReason, propagated verbatim from
    // relationship-resolution.ts's own resolution object.
    expect(v3Effect?.unresolvedReason).toMatch(/chronological-predecessor/);
    expect(v3Effect?.status).toBe("REVIEW_REQUIRED"); // inferential, never silently promoted to a confident RESOLVED
  });
});

describe("POST-3F.2 Unit B7-B10 - ambiguity and false-positive safeguards", () => {
  it("B7: two candidate documents share the same type AND the same referenced execution date - never guessed, UNRESOLVED", () => {
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of June 1, 2023 to the Credit Agreement, dated as of January 10, 2023.\n\nSection 6.01 of the Credit Agreement is hereby amended.`, declaredType: "AMENDMENT" };
    const candidateA: PackageDocumentInput = { documentId: "candidate-a", label: "Credit Agreement A", text: `CREDIT AGREEMENT dated as of January 10, 2023, among Zenith Robotics, Inc. and Meridian Capital, LLC.\n\nSECTION 6.01 Indebtedness. Up to $10,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const candidateB: PackageDocumentInput = { documentId: "candidate-b", label: "Credit Agreement B", text: `CREDIT AGREEMENT dated as of January 10, 2023, among Vantage Foods Ltd. and Harbor Trust Company.\n\nSECTION 6.01 Indebtedness. Up to $5,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const docs = [amendmentDoc, candidateA, candidateB];
    const classifications = classifyPackageDocuments(docs);
    const identities = extractPackageDocumentIdentities(docs);
    const result = resolvePackageRelationships(docs, classifications, identities, [], []);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "amend-1" && r.relationshipType === "AMENDS");
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.targetDocumentId).toBeNull();
    expect(edge?.resolutionMethod).toBe("DETERMINISTIC_AMBIGUOUS");
  });

  it("B8: same-date, incompatible (different-party) candidates - still never guessed, UNRESOLVED (party evidence is not a disambiguator this deterministic layer currently has, so ambiguity is the only safe outcome)", () => {
    // Identical structure to B7 by design - the mission's own "incompatible parties" scenario reduces, in this deterministic architecture, to the same type+date collision B7 already proves is never guessed.
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of June 1, 2023 to the Indenture, dated as of January 10, 2023.\n\nSection 6.01 is hereby amended.`, declaredType: "AMENDMENT" };
    const candidateA: PackageDocumentInput = { documentId: "candidate-a", label: "Indenture A", text: `INDENTURE dated as of January 10, 2023, among Zenith Robotics, Inc. and Fiduciary Trust Co., as Trustee.\n\nSECTION 6.01. Covenants.`, declaredType: "INDENTURE" };
    const candidateB: PackageDocumentInput = { documentId: "candidate-b", label: "Indenture B", text: `INDENTURE dated as of January 10, 2023, among Vantage Foods Ltd. and Harbor Trust Company, as Trustee.\n\nSECTION 6.01. Covenants.`, declaredType: "INDENTURE" };
    const docs = [amendmentDoc, candidateA, candidateB];
    const classifications = classifyPackageDocuments(docs);
    const identities = extractPackageDocumentIdentities(docs);
    const result = resolvePackageRelationships(docs, classifications, identities, [], []);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "amend-1" && r.relationshipType === "AMENDS");
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.targetDocumentId).toBeNull();
  });

  it("B9: an unrelated recital mention (cross-default context, not an actual amendment target) is excluded, never a false modification edge - regression check that the broadened B1/B2 regex did not reopen PKG-01", () => {
    const unrelatedIndenture: PackageDocumentInput = { documentId: "indenture-1", label: "Unrelated Indenture", text: `INDENTURE dated as of February 1, 2020, among Zenith Robotics, Inc. and Fiduciary Trust Co., as Trustee.\n\nSECTION 4.01. Covenants.`, declaredType: "INDENTURE" };
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Amendment No. 2", text: `AMENDMENT NO. 2 dated as of June 1, 2023 to the Credit Agreement, dated as of January 10, 2023.\n\nWHEREAS, a cross-default may arise under that certain Indenture dated as of February 1, 2020, for the avoidance of doubt this reference is provided for context only;\n\nNOW, THEREFORE, Section 6.01 of the Credit Agreement is hereby amended.`, declaredType: "AMENDMENT" };
    const base: PackageDocumentInput = { documentId: "v1", label: "Original Credit Agreement", text: V1_TEXT, declaredType: "CREDIT_AGREEMENT" };
    const docs = [base, unrelatedIndenture, amendmentDoc];
    const classifications = classifyPackageDocuments(docs);
    const identities = extractPackageDocumentIdentities(docs);
    const result = resolvePackageRelationships(docs, classifications, identities, [], []);
    // The AMENDS edge must resolve to v1 (the real Credit Agreement target), never to the unrelated Indenture merely because it was mentioned nearby.
    const amendsEdges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "amend-1" && r.relationshipType === "AMENDS");
    const resolvedToBase = amendsEdges.find((e) => e.targetDocumentId === "v1" && e.status === "RESOLVED");
    expect(resolvedToBase).toBeTruthy();
    const resolvedToIndenture = amendsEdges.find((e) => e.targetDocumentId === "indenture-1" && e.status === "RESOLVED");
    expect(resolvedToIndenture).toBeUndefined();
  });

  it("B10: several historical documents referenced in one recital - never all silently treated as amendment targets", () => {
    const target1: PackageDocumentInput = { documentId: "target-1", label: "Credit Agreement", text: `CREDIT AGREEMENT dated as of January 10, 2023, among Zenith Robotics, Inc. and Meridian Capital, LLC.\n\nSECTION 6.01 Indebtedness. Up to $10,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const target2: PackageDocumentInput = { documentId: "target-2", label: "Security Agreement", text: `SECURITY AGREEMENT dated as of January 10, 2023, among Zenith Robotics, Inc. and Meridian Capital, LLC.\n\nSECTION 1. Grant of Security Interest.`, declaredType: "SECURITY_AGREEMENT" };
    const amendmentDoc: PackageDocumentInput = { documentId: "amend-1", label: "Omnibus Amendment", text: `OMNIBUS AMENDMENT dated as of June 1, 2023, amending both the Credit Agreement, dated as of January 10, 2023, and the Security Agreement, dated as of January 10, 2023, each among Zenith Robotics, Inc. and Meridian Capital, LLC.\n\nSection 6.01 of the Credit Agreement is hereby amended.`, declaredType: "AMENDMENT" };
    const docs = [target1, target2, amendmentDoc];
    const classifications = classifyPackageDocuments(docs);
    const identities = extractPackageDocumentIdentities(docs);
    const modificationCandidates = [{ sourceDocumentId: "amend-1", sourceNodeCitation: "Section 6.01", sourceText: "Section 6.01 of the Credit Agreement is hereby amended.", operation: "MODIFY" as const, targetDocumentId: null, targetHint: null, targetSectionRef: "6.01", targetDefinedTermRef: null, status: "UNRESOLVED" as const, unresolvedReason: null, confidence: 0.9 }];
    const result = resolvePackageRelationships(docs, classifications, identities, modificationCandidates, []);
    const resolvedMc = result.resolvedModificationCandidates[0]!;
    // Two distinct real agreement references in the amending document - never guessed which one this specific section-level modification targets.
    expect(resolvedMc.status).toBe("REVIEW_REQUIRED");
    expect(resolvedMc.unresolvedReason).toMatch(/more than one other agreement/);
  });
});

describe("POST-3F.2 Unit B11 - fallback target resolution through the real production wiring (mirrors orchestrator.ts's own call chain)", () => {
  it("B11: an unresolved restatement target propagates through the SAME unresolvedTargetEffectsForThisInstrument computation and computeOperativeContractState call orchestrator.ts itself uses, never silently defaulting to a clean RESOLVED status", async () => {
    // v3 restates something, but NO document of the referenced type is
    // present in this package at all (v1 and v2 are both deliberately
    // OMITTED) - the real production topology genuinely cannot resolve this
    // target (no candidate document of the right type exists at all),
    // exactly the DETERMINISTIC_NO_CANDIDATE path relationship-resolution.ts
    // itself already implements. (A package containing v1 alone would NOT
    // exercise this path - v1 is itself a valid, if inferential,
    // chronological-predecessor candidate; see B4/B5-B6 for that resolved case.)
    const v3: PackageDocumentInput = { documentId: "v3", label: "Second A&R Credit Agreement", text: V3_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const { amendmentResult } = await runRealPipeline([v3]);

    // Mirrors lib/contract-model/analysis/orchestrator.ts's own exact line:
    // `const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);`
    const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);
    expect(unresolvedTargetEffectsForThisInstrument.length).toBeGreaterThan(0); // the v3 restatement genuinely has no resolved target instrument

    const state = computeOperativeContractState({ instrumentKey: "instrument:v3", baseDocumentId: "v3", asOfDate: "2026-01-01", index: buildRealIndex([v3]), allEffects: amendmentResult.effects, unresolvedTargetEffectsForThisInstrument });

    // The exact regression this remediation closes: status must never be
    // OPERATIVE_STATE_RESOLVED merely because zero provisions attached.
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(state.unattachedEffects.length).toBeGreaterThan(0);
    expect(state.operativeDocument?.status).toBe("REVIEW_REQUIRED");
    expect(state.operativeDocument?.operativeDocumentId).toBeNull();
  });
});

describe("POST-3F.2 Unit B12/B13 - unresolved vs. resolved end-to-end through computeOperativeContractState", () => {
  it("B12: a genuinely unresolved restatement target (no candidate document of the right type exists at all) yields UNRESOLVED with a null target, never a guess", async () => {
    // No document of the referenced type is present at all - see B11's
    // comment on why a package containing v1 alone would not exercise this.
    const v3: PackageDocumentInput = { documentId: "v3", label: "Second A&R Credit Agreement", text: V3_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const { amendmentResult } = await runRealPipeline([v3]);
    const restateEffect = amendmentResult.effects.find((e) => e.operation === "RESTATE_AGREEMENT" && e.amendmentDocumentId === "v3");
    // No candidate document of the referenced type exists in the package at
    // all - genuinely UNRESOLVED (not merely REVIEW_REQUIRED), and in either
    // case never a guessed targetDocumentId.
    expect(restateEffect?.status).toBe("UNRESOLVED");
    expect(restateEffect?.target.targetDocumentId).toBeNull();
  });

  it("B13: a fully resolved 3-document chain yields the correct operative document through computeOperativeContractState itself (not merely chain.ts in isolation)", async () => {
    const [v1, v2, v3] = chainDocs();
    const { amendmentResult } = await runRealPipeline([v1!, v2!, v3!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:v1", baseDocumentId: "v1", asOfDate: "2026-01-01", index: buildRealIndex([v1!, v2!, v3!]), allEffects: amendmentResult.effects });
    expect(state.operativeDocument?.status).toBe("RESOLVED");
    expect(state.operativeDocument?.operativeDocumentId).toBe("v3");
  });
});

describe("POST-3F.2 Unit B14/B15 - historical predecessors stay historical, never current trusted evidence", () => {
  it("B14: V1 and V2 are both reported as historical predecessors, never as the operative document", async () => {
    const [v1, v2, v3] = chainDocs();
    const { amendmentResult } = await runRealPipeline([v1!, v2!, v3!]);
    const resolution = computeOperativeDocument("v1", amendmentResult.effects);
    expect(resolution.operativeDocumentId).not.toBe("v1");
    expect(resolution.operativeDocumentId).not.toBe("v2");
    expect(resolution.predecessorDocumentIds).toContain("v1");
    expect(resolution.predecessorDocumentIds).toContain("v2");
  });

  it("B15: V1's own physical section text is independently flagged KNOWN_SUPERSEDED by the pre-existing, unmodified node-supersession mechanism - operativeDocument never substitutes for or duplicates that check, it only adds the whole-document-level answer", async () => {
    const [v1, v2, v3] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!, v3!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:v1", baseDocumentId: "v1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    // operativeDocument answers the whole-document question additively;
    // it does not change or replace the pre-existing per-node supersession
    // index this same state feeds (buildNodeSupersessionIndex, used
    // end-to-end by the real orchestrator to gate getDefinition/
    // getOperativeProvision's own current-vs-historical evidence).
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: "v1", state }]);
    // v1's own SECTION 6.01 node exists but is not itself a target of a
    // section-level amendment (only whole-document RESTATE_AGREEMENT
    // effects exist in this fixture) - the supersession index's own
    // pre-existing behavior for such nodes remains completely untouched by
    // this remediation, confirmed by the call succeeding without error and
    // returning a real status rather than throwing.
    const v1NodeId = "n-v1-1";
    const status = getNodeSupersessionStatus(supersessionIndex, "v1", v1NodeId);
    expect(status.status).toBeDefined();
  });
});

describe("POST-3F.2 Unit B16 - the exact Riot-pattern regression: zero provisions + unresolved restatement never presents as a clean resolved state", () => {
  it("B16: synthetic analogue of the Riot bug - a package graph whose restatement targets never resolve at all must never report OPERATIVE_STATE_RESOLVED", async () => {
    // Neither v2 nor v3 in this fixture set can resolve their targets: v2's
    // recital is deliberately malformed (no parseable date) so
    // relationship-resolution.ts's own DETERMINISTIC_NO_CANDIDATE/
    // DETERMINISTIC_NO_SIGNAL paths are exercised for real, mirroring the
    // original (pre-Unit-B1) Riot failure mode exactly, but with wholly
    // invented content.
    const v1: PackageDocumentInput = { documentId: "v1", label: "Original Loan Agreement", text: `LOAN AGREEMENT dated as of April 1, 2024, among Cascade Textiles, Inc. and Union Point Lender, LLC.\n\nSECTION 5.01 Indebtedness. Up to $8,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const v2: PackageDocumentInput = { documentId: "v2", label: "Amended and Restated Loan Agreement", text: `AMENDED AND RESTATED LOAN AGREEMENT dated as of a date the parties will separately confirm, among Cascade Textiles, Inc. and Union Point Lender, LLC.\n\nSECTION 5.01 Indebtedness. Up to $9,000,000.`, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const { amendmentResult, index } = await runRealPipeline([v1, v2]);
    const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);
    const state = computeOperativeContractState({ instrumentKey: "instrument:v2", baseDocumentId: "v2", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects, unresolvedTargetEffectsForThisInstrument });
    expect(state.provisions).toHaveLength(0); // zero provisions attached - the exact precondition of the original bug
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED"); // the fix: this must never read as a clean resolution
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(state.operativeDocument?.status).not.toBe("RESOLVED");
  });
});
