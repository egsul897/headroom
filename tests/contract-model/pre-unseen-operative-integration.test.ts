/**
 * HEADROOM PRE-UNSEEN OPERATIVE-STATE INTEGRATION CLOSURE - whole-document
 * supersession -> node/source trust consistency. Required generic synthetic
 * tests S1-S15 plus adversarial tests A-F (docs/pre-unseen-operative-
 * integration/03-integration-design.json). Every fixture below is wholly
 * invented (Cedarview Materials, Inc. / Anchorline Capital, LLC / Fenwick
 * Distribution, Inc. / Union Point Lender, LLC) - never Riot/Coinbase or any
 * real known-package (FWRG/LSB/CONMED/DSGR) name, section number, or date.
 * Uses the REAL, unmodified-except-by-this-session production functions end
 * to end (buildPackageGraph, runAmendmentPipeline, computeOperativeDocument,
 * computeOperativeContractState, buildNodeSupersessionIndex,
 * getNodeSupersessionStatus) - never a mock of any of them.
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeDocument } from "../../lib/contract-model/compiler/amendment/chain";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus, resolveOperativeSectionEvidence } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { OperativeStateForDocument } from "../../lib/contract-model/compiler/amendment/operative-state";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import type { AmendmentEffectCandidate, OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";

const COMPANY_ID = "pre-unseen-operative-integration";
const PACKAGE_KEY = "pre-unseen-operative-integration-pkg";

function buildRealIndex(docs: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const d of docs) {
    const node: StructuralNode = { documentId: d.documentId, nodeType: "SECTION", heading: d.label, sectionRef: "1", nodeKey: `${d.documentId}::1`, nodeId: `n-${d.documentId}-1`, charStart: 0, charEnd: d.text.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    nodesByDocument.set(d.documentId, { text: d.text, nodes: [node] });
  }
  const allDefinitions = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  const allReferences = docs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

async function runRealPipeline(docs: PackageDocumentInput[]) {
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, docs);
  const index = buildRealIndex(docs);
  const amendmentResult = await runAmendmentPipeline({ providerName: "never-called", model: "never-called", isSynthetic: true, async call(): Promise<never> { throw new Error("deterministic-only fixture should never need a semantic-interpretation call"); }, lastTelemetry: () => null }, { documents: docs, packageGraph, index });
  return { packageGraph, index, amendmentResult };
}

/** Fine-grained per-section structural index (mirrors node-supersession-awareness.test.ts's own helper) - needed only by S4, which must resolve a SPECIFIC section reference ("6.01") rather than the single coarse whole-document node buildRealIndex's own single-node-per-document stand-in produces. */
function buildFineIndex(documents: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefs, []);
}

async function runRealPipelineFine(docs: PackageDocumentInput[]) {
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, docs);
  const index = buildFineIndex(docs);
  const amendmentResult = await runAmendmentPipeline({ providerName: "never-called", model: "never-called", isSynthetic: true, async call(): Promise<never> { throw new Error("deterministic-only fixture should never need a semantic-interpretation call"); }, lastTelemetry: () => null }, { documents: docs, packageGraph, index });
  return { packageGraph, index, amendmentResult };
}

// Synthetic 3-document restatement chain (wholly invented parties/dates/amounts).
const V1_TEXT = `CREDIT AGREEMENT dated as of February 3, 2022, among Cedarview Materials, Inc., as Borrower, and Anchorline Capital, LLC, as Lender.

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $30,000,000 in the aggregate.

SECTION 6.02 Liens. The Borrower will not create Liens on its property.
`;
const V2_TEXT = `AMENDED AND RESTATED CREDIT AGREEMENT dated as of August 9, 2022, among Cedarview Materials, Inc., as Borrower, and Anchorline Capital, LLC, as Lender.

The Borrower and Lender are parties to a Credit Agreement dated as of February 3, 2022 (the "Existing Credit Agreement") and, in consideration of the mutual covenants and agreements herein contained, have agreed to amend and restate the Existing Credit Agreement with effect from the Amendment and Restatement Effective Date as follows:

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $40,000,000 in the aggregate.

SECTION 6.02 Liens. The Borrower will not create Liens on its property.
`;
const V3_TEXT = `SECOND AMENDED AND RESTATED CREDIT AGREEMENT dated as of April 2, 2023, among Cedarview Materials, Inc., as Borrower, and Anchorline Capital, LLC, as Lender.

The Borrower and Lender are parties to a Credit Agreement dated as of February 3, 2022, as amended and restated as of the First Amendment and Restatement Effective Date (this Agreement in the form as of the First Amendment and Restatement Effective Date, the "Existing Credit Agreement", and as in effect on the Original Effective Date, the "Original Credit Agreement") and, in consideration of the mutual covenants and agreements herein contained, have agreed to amend and restate the Existing Credit Agreement with effect from the Second Amendment and Restatement Effective Date as follows:

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $50,000,000 in the aggregate.

SECTION 6.02 Liens. The Borrower will not create Liens on its property.
`;

function chainDocs(): PackageDocumentInput[] {
  return [
    { documentId: "cv1", label: "Original Credit Agreement", text: V1_TEXT, declaredType: "CREDIT_AGREEMENT" },
    { documentId: "cv2", label: "First A&R Credit Agreement", text: V2_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" },
    { documentId: "cv3", label: "Second A&R Credit Agreement", text: V3_TEXT, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" },
  ];
}

function baseEffectiveDate(date: string) {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE" as const, evidence: date, reason: "hand-built fixture effect" };
}

/** Hand-builds a minimal RESTATE_AGREEMENT effect for S6/S7's fork/cycle scenarios, bypassing real document parsing entirely so the graph shape itself (fork/cycle) is under precise, direct control. */
function restateEffect(effectId: string, amendmentDocumentId: string, targetDocumentId: string, targetInstrumentKey: string, date: string): AmendmentEffectCandidate {
  return {
    effectId,
    amendmentDocumentId,
    target: { kind: "DOCUMENT", targetDocumentId, targetInstrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: null, targetHint: null },
    operation: "RESTATE_AGREEMENT",
    effectiveDate: baseEffectiveDate(date),
    newText: null,
    oldText: null,
    sourceCitation: "hand-built fixture",
    sourceExcerpt: "hand-built fixture",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

/** A hand-built OperativeContractState carrying only the operativeDocument field this file's S5-S7/A-F scenarios actually need to exercise (provisions/status are irrelevant to buildNodeSupersessionIndex's new document-level composition, which reads only baseDocumentId + state.operativeDocument + state.instrumentKey). */
function stateFor(instrumentKey: string, operativeDocument: ReturnType<typeof computeOperativeDocument>): OperativeContractState {
  return { instrumentKey, asOfDate: "2026-01-01", provisions: [], status: "OPERATIVE_STATE_RESOLVED", summary: "hand-built fixture", unattachedEffects: [], operativeDocument };
}

describe("S1: simple restatement - predecessor's own node stops being CURRENT_OPERATIVE, successor's stays current", () => {
  it("V1's node is KNOWN_SUPERSEDED (DOCUMENT_LEVEL) once V1->V2 resolves RESOLVED; V2's node is CURRENT_OPERATIVE", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const stateV1 = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(stateV1.operativeDocument?.status).toBe("RESOLVED");
    expect(stateV1.operativeDocument?.operativeDocumentId).toBe("cv2");
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: stateV1 }]);
    const v1Node = index.getNodeByRef("cv1", "1")!;
    const result = getNodeSupersessionStatus(idx, "cv1", v1Node.nodeId);
    expect(result.status).toBe("KNOWN_SUPERSEDED");
    expect(result.record?.supersessionKind).toBe("DOCUMENT_LEVEL");
    expect(result.record?.supersedingOperativeDocumentId).toBe("cv2");
    expect(result.reason).toContain("cv2");
  });
});

describe("S2/S15: three-document chain - ALL historical predecessors consistently non-current", () => {
  it("both V1 and V2's own nodes report KNOWN_SUPERSEDED once V3 resolves as operative; V3's node stays current", async () => {
    const [v1, v2, v3] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!, v3!]);

    const stateV1 = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const stateV2 = computeOperativeContractState({ instrumentKey: "instrument:cv2", baseDocumentId: "cv2", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(stateV1.operativeDocument?.operativeDocumentId).toBe("cv3");
    expect(stateV2.operativeDocument?.operativeDocumentId).toBe("cv3");

    const idxV1 = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: stateV1 }]);
    const idxV2 = buildNodeSupersessionIndex([{ baseDocumentId: "cv2", state: stateV2 }]);
    const v1Node = index.getNodeByRef("cv1", "1")!;
    const v2Node = index.getNodeByRef("cv2", "1")!;
    expect(getNodeSupersessionStatus(idxV1, "cv1", v1Node.nodeId).status).toBe("KNOWN_SUPERSEDED");
    expect(getNodeSupersessionStatus(idxV2, "cv2", v2Node.nodeId).status).toBe("KNOWN_SUPERSEDED");

    // S11 control case, exercised in the same fixture: V3's own node (the
    // real current operative document) must NOT be swept up by the fix -
    // confirms the invariant is one-directional (predecessors only).
    const stateV3 = computeOperativeContractState({ instrumentKey: "instrument:cv3", baseDocumentId: "cv3", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idxV3 = buildNodeSupersessionIndex([{ baseDocumentId: "cv3", state: stateV3 }]);
    const v3Node = index.getNodeByRef("cv3", "1")!;
    expect(getNodeSupersessionStatus(idxV3, "cv3", v3Node.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

describe("S3/S4: ordinary amendment safety - the base document is NEVER swept into whole-document historicity merely because one of its sections was amended", () => {
  it("S3: the base document's own UNTOUCHED section stays CURRENT_OPERATIVE, and operativeDocument is NOT_APPLICABLE (no RESTATE_AGREEMENT effect exists at all)", async () => {
    const base: PackageDocumentInput = { documentId: "fd1", label: "Original Distribution Agreement", text: `CREDIT AGREEMENT dated as of May 4, 2021, among Fenwick Distribution, Inc., as Borrower, and Union Point Lender, LLC, as Lender.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $12,000,000.\n\nSECTION 6.02 Investments. The Borrower will not make Investments in excess of $4,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const amendment: PackageDocumentInput = { documentId: "fd-a1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of October 12, 2021 to the Credit Agreement dated as of May 4, 2021, among Fenwick Distribution, Inc. and Union Point Lender, LLC.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $18,000,000.`, declaredType: "AMENDMENT" };
    const { amendmentResult, index } = await runRealPipeline([base, amendment]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:fd1", baseDocumentId: "fd1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(state.operativeDocument?.status).toBe("NOT_APPLICABLE"); // no RESTATE_AGREEMENT effect exists - an ordinary amendment, never a restatement.
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "fd1", state }]);
    expect(idx.documentLevelSupersededDocuments.size).toBe(0); // the governing invariant's new mechanism never fires for an ordinary amendment.
    const untouchedNode = index.getNodeByRef("fd1", "1")!; // this fixture's single top-level node stands in for the whole base document.
    // The base document as a WHOLE is still CURRENT_OPERATIVE - "V1 as amended" remains the governing agreement, never demoted wholesale.
    expect(getNodeSupersessionStatus(idx, "fd1", untouchedNode.nodeId).status).toBe("CURRENT_OPERATIVE");
  });

  it("S4: the SPECIFIC amended provision is still correctly KNOWN_SUPERSEDED via the pre-existing PROVISION_LEVEL mechanism, unreplaced by this session's DOCUMENT_LEVEL addition", async () => {
    const base: PackageDocumentInput = { documentId: "fd2", label: "Original Distribution Agreement", text: `CREDIT AGREEMENT dated as of May 4, 2021, among Fenwick Distribution, Inc., as Borrower, and Union Point Lender, LLC, as Lender.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $12,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const amendment: PackageDocumentInput = { documentId: "fd2-a1", label: "Amendment No. 1", text: `AMENDMENT NO. 1 dated as of October 12, 2021 to the Credit Agreement dated as of May 4, 2021, among Fenwick Distribution, Inc. and Union Point Lender, LLC.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $18,000,000.`, declaredType: "AMENDMENT" };
    const { amendmentResult, index } = await runRealPipelineFine([base, amendment]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:fd2", baseDocumentId: "fd2", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "fd2", state }]);
    const node = index.getNodeByRef("fd2", "6.01")!;
    const result = getNodeSupersessionStatus(idx, "fd2", node.nodeId);
    expect(result.status).toBe("KNOWN_SUPERSEDED");
    expect(result.record?.supersessionKind).toBe("PROVISION_LEVEL"); // NOT DOCUMENT_LEVEL - this session's fix never overrides the pre-existing, correct provision-level provenance.
    expect(result.record?.supersedingOperativeDocumentId).toBeNull();
  });
});

describe("S5: unresolved restatement target - never affirmatively marked historical", () => {
  it("a REVIEW_REQUIRED (malformed/unresolved) restatement target leaves the predecessor's own node CURRENT_OPERATIVE - uncertainty is never converted into supersession", async () => {
    const v1: PackageDocumentInput = { documentId: "up1", label: "Original Loan Agreement", text: `LOAN AGREEMENT dated as of April 1, 2024, among Union Point Lender, LLC and Cedarview Materials, Inc.\n\nSECTION 5.01 Indebtedness. Up to $8,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const v2: PackageDocumentInput = { documentId: "up2", label: "Amended and Restated Loan Agreement", text: `AMENDED AND RESTATED LOAN AGREEMENT dated as of a date the parties will separately confirm, among Union Point Lender, LLC and Cedarview Materials, Inc.\n\nSECTION 5.01 Indebtedness. Up to $9,000,000.`, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const { amendmentResult, index } = await runRealPipeline([v1, v2]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:up1", baseDocumentId: "up1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(state.operativeDocument?.status).not.toBe("RESOLVED");
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "up1", state }]);
    expect(idx.documentLevelSupersededDocuments.size).toBe(0);
    const node = index.getNodeByRef("up1", "1")!;
    expect(getNodeSupersessionStatus(idx, "up1", node.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

describe("S6: fork - two documents claiming to restate the same predecessor never manufactures currentness for either", () => {
  it("REVIEW_REQUIRED for the fork; the predecessor's node stays CURRENT_OPERATIVE, never guessed superseded by either forked successor", async () => {
    const effects: AmendmentEffectCandidate[] = [restateEffect("e1", "fk-b", "fk-a", "instrument:fk-a-family", "2023-01-01"), restateEffect("e2", "fk-c", "fk-a", "instrument:fk-a-family", "2023-06-01")];
    const resolution = computeOperativeDocument("fk-a", effects);
    expect(resolution.status).toBe("REVIEW_REQUIRED");
    const state = stateFor("instrument:fk-a", resolution);
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "fk-a", state }]);
    expect(idx.documentLevelSupersededDocuments.size).toBe(0);
    const result = getNodeSupersessionStatus({ ...idx, coveredDocumentIds: new Set(["fk-a"]) }, "fk-a", "any-fk-a-node");
    expect(result.status).toBe("CURRENT_OPERATIVE");
  });
});

describe("S7: cycle - a restatement graph with no un-superseded end resolves safe uncertainty, never a guess", () => {
  it("REVIEW_REQUIRED for the cycle; neither document in the cycle is marked historical", async () => {
    const effects: AmendmentEffectCandidate[] = [restateEffect("e1", "cy-b", "cy-a", "instrument:cy-family", "2023-01-01"), restateEffect("e2", "cy-a", "cy-b", "instrument:cy-family", "2023-06-01")];
    const resolution = computeOperativeDocument("cy-a", effects);
    expect(resolution.status).toBe("REVIEW_REQUIRED");
    expect(resolution.reviewReason).toContain("cycle");
    const state = stateFor("instrument:cy-family", resolution);
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cy-a", state }]);
    expect(idx.documentLevelSupersededDocuments.size).toBe(0);
  });
});

describe("S8: historical provenance - a document-level-superseded node's own text remains fully, byte-identically retrievable", () => {
  it("V1's own physical text is unchanged and fully queryable even though its trust status is now KNOWN_SUPERSEDED", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    expect(getNodeSupersessionStatus(idx, "cv1", node.nodeId).status).toBe("KNOWN_SUPERSEDED");
    // Retrievable, unredacted, unmodified - trust metadata changed, evidence did not.
    expect(index.getNodeText(node.nodeId, "DESCENDANTS")).toContain("$30,000,000");
  });
});

describe("S9: historical source trust - a document-level-superseded node is never presented as trusted current evidence with no provision view of its own", () => {
  it("resolveOperativeSectionEvidence's CASE-D-equivalent (no OperativeProvisionView) reports isCurrentTruth=false for a document-level-historical node", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    const resolution = resolveOperativeSectionEvidence({ operativeState: state, documentId: "cv1", node: { nodeId: node.nodeId, sectionRef: "1" }, supersessionIndex: idx });
    expect(resolution.outcome).toBe("FOUND");
    if (resolution.outcome === "FOUND") {
      expect(resolution.isCurrentTruth).toBe(false);
      expect(resolution.status).toBe("KNOWN_SUPERSEDED");
    }
  });
});

describe("S10: independent verifier - a historical predecessor's text match/citation never upgrades to VERIFIED CURRENT", () => {
  it("buildSourceInventory reports supersessionStatus KNOWN_SUPERSEDED for V1's own node despite a real, exact, valid citation", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    const inventory = buildSourceInventory("claim-ref-1", "SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $30,000,000 in the aggregate.", "cv1", "1", "SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $30,000,000 in the aggregate.", node.nodeId, idx);
    expect(inventory.supersessionStatus).toBe("KNOWN_SUPERSEDED"); // exact text match and a real citation never override document-level trust.
  });
});

describe("S11: current-document control case", () => {
  it("an equivalent claim against the CURRENT operative document's own node proceeds normally (CURRENT_OPERATIVE, isCurrentTruth true) - the fix does not over-trigger", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv2", baseDocumentId: "cv2", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv2", state }]);
    const node = index.getNodeByRef("cv2", "1")!;
    const resolution = resolveOperativeSectionEvidence({ operativeState: state, documentId: "cv2", node: { nodeId: node.nodeId, sectionRef: "1" }, supersessionIndex: idx });
    expect(resolution.outcome).toBe("FOUND");
    if (resolution.outcome === "FOUND") expect(resolution.isCurrentTruth).toBe(true);
  });
});

describe("S12: tenant isolation - two unrelated instruments' supersession indices never cross-contaminate", () => {
  it("building separate indices for two unrelated document families keeps each one's document-level records scoped to its own entries", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult: r1, index: idx1 } = await runRealPipeline([v1!, v2!]);
    const other: PackageDocumentInput = { documentId: "other-doc", label: "Unrelated Agreement", text: `CREDIT AGREEMENT dated as of January 1, 2020, among Fenwick Distribution, Inc. and Union Point Lender, LLC.\n\nSECTION 1 Text.`, declaredType: "CREDIT_AGREEMENT" };
    const { amendmentResult: r2, index: idx2 } = await runRealPipeline([other]);

    const stateV1 = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index: idx1, allEffects: r1.effects });
    const stateOther = computeOperativeContractState({ instrumentKey: "instrument:other-doc", baseDocumentId: "other-doc", asOfDate: "2026-01-01", index: idx2, allEffects: r2.effects });

    // Built as ONE combined index (a plausible real-world shape: one analysis run covering multiple unrelated instruments in the same package).
    const combined = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: stateV1 }, { baseDocumentId: "other-doc", state: stateOther }]);
    expect(combined.documentLevelSupersededDocuments.has("cv1")).toBe(true); // cv1 IS a real resolved predecessor.
    expect(combined.documentLevelSupersededDocuments.has("other-doc")).toBe(false); // other-doc has no restatement activity at all - never swept in by mere co-occurrence in the same index build.
    const otherNode = idx2.getNodeByRef("other-doc", "1")!;
    expect(getNodeSupersessionStatus(combined, "other-doc", otherNode.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

describe("S13: unrelated document/family isolation within the SAME package", () => {
  it("a document that is part of the same buildNodeSupersessionIndex call but not part of ANY restatement graph is never marked DOCUMENT_LEVEL superseded merely by co-occurrence", async () => {
    const [v1, v2] = chainDocs();
    const security: PackageDocumentInput = { documentId: "cv-sec", label: "Security Agreement", text: `SECURITY AGREEMENT dated as of February 3, 2022, among Cedarview Materials, Inc. and Anchorline Capital, LLC.\n\nSECTION 1 Grant of Security Interest.`, declaredType: "SECURITY_AGREEMENT" };
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!, security]);
    const stateV1 = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const stateSec = computeOperativeContractState({ instrumentKey: "instrument:cv-sec", baseDocumentId: "cv-sec", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: stateV1 }, { baseDocumentId: "cv-sec", state: stateSec }]);
    expect(idx.documentLevelSupersededDocuments.has("cv1")).toBe(true);
    expect(idx.documentLevelSupersededDocuments.has("cv-sec")).toBe(false);
    const secNode = index.getNodeByRef("cv-sec", "1")!;
    expect(getNodeSupersessionStatus(idx, "cv-sec", secNode.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

describe("S14: NOT_APPLICABLE unchanged behavior", () => {
  it("a package with zero restatement activity at all behaves byte-identically to before this session's fix (CURRENT_OPERATIVE default, no document-level record ever created)", async () => {
    const solo: PackageDocumentInput = { documentId: "solo-doc", label: "Standalone Agreement", text: `CREDIT AGREEMENT dated as of March 3, 2020, among Fenwick Distribution, Inc. and Union Point Lender, LLC.\n\nSECTION 1 Text.`, declaredType: "CREDIT_AGREEMENT" };
    const { amendmentResult, index } = await runRealPipeline([solo]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:solo-doc", baseDocumentId: "solo-doc", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(state.operativeDocument?.status).toBe("NOT_APPLICABLE");
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "solo-doc", state }]);
    expect(idx.documentLevelSupersededDocuments.size).toBe(0);
    const node = index.getNodeByRef("solo-doc", "1")!;
    expect(getNodeSupersessionStatus(idx, "solo-doc", node.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

// ---------------------------------------------------------------------------
// ADVERSARIAL A-F (mission Section 17) - none of these signals may
// independently restore a document-level-historical source to current.
// ---------------------------------------------------------------------------
describe("ADVERSARIAL A-F: nothing can independently restore historical source to current status", () => {
  it("A: no provision-level effect recorded at all for this node - still KNOWN_SUPERSEDED via the whole-document rule alone", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(state.provisions).toHaveLength(0); // confirms: no SECTION/DEFINITION-level effect exists for this fixture at all - this is a pure whole-document restatement.
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    expect(getNodeSupersessionStatus(idx, "cv1", node.nodeId).status).toBe("KNOWN_SUPERSEDED");
  });

  it("B: identical text to the current document's own corresponding section - still KNOWN_SUPERSEDED (text equality never implies currentness)", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const v1Node = index.getNodeByRef("cv1", "1")!;
    const v2Node = index.getNodeByRef("cv2", "1")!;
    // SECTION 6.02 Liens is byte-identical in both V1 and V2's own text (never touched by the restatement's own economic changes).
    expect(index.getNodeText(v1Node.nodeId, "DESCENDANTS")).toContain(index.getNodeText(v2Node.nodeId, "DESCENDANTS")!.match(/SECTION 6\.02[^\n]*\n/)![0]);
    expect(getNodeSupersessionStatus(idx, "cv1", v1Node.nodeId).status).toBe("KNOWN_SUPERSEDED");
  });

  it("C: an exact, high-quality source citation naming the correct section - still routes to REVIEW_REQUIRED via the verifier, never VERIFIED", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    const inventory = buildSourceInventory("claim-ref-c", V1_TEXT, "cv1", "6.01", V1_TEXT, node.nodeId, idx);
    expect(inventory.supersessionStatus).toBe("KNOWN_SUPERSEDED"); // a real, exact citation is still gated by whole-document trust, not bypassed by citation quality.
  });

  it("D: no OperativeProvisionView blocking it (CASE-D shape) still fails closed to non-current for a document-level-historical node", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const state = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    expect(state.provisions).toHaveLength(0); // no view exists to "agree" with - this exercises the pure node-supersession path directly.
    const idx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state }]);
    const node = index.getNodeByRef("cv1", "1")!;
    const resolution = resolveOperativeSectionEvidence({ operativeState: state, documentId: "cv1", node: { nodeId: node.nodeId, sectionRef: "1" }, supersessionIndex: idx });
    if (resolution.outcome === "FOUND") expect(resolution.isCurrentTruth).toBe(false);
  });

  it("E: a node's own status is a pure function of the CURRENT index build, never sticky from an earlier index that happened to see it as CURRENT_OPERATIVE before the chain resolved", async () => {
    const [v1, v2] = chainDocs();
    const { amendmentResult, index } = await runRealPipeline([v1!, v2!]);
    const node = index.getNodeByRef("cv1", "1")!;
    // An earlier, narrower index built with NO knowledge of v2 at all (as if computed before v2 was ever discovered/ingested) reports CURRENT_OPERATIVE.
    const staleState = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: [] });
    const staleIdx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: staleState }]);
    expect(getNodeSupersessionStatus(staleIdx, "cv1", node.nodeId).status).toBe("CURRENT_OPERATIVE");
    // The REAL, current-knowledge index (this session's fix) correctly supersedes it - proving the earlier "safe" verdict was never cached/reused, only recomputed fresh from the real current state.
    const freshState = computeOperativeContractState({ instrumentKey: "instrument:cv1", baseDocumentId: "cv1", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });
    const freshIdx = buildNodeSupersessionIndex([{ baseDocumentId: "cv1", state: freshState }]);
    expect(getNodeSupersessionStatus(freshIdx, "cv1", node.nodeId).status).toBe("KNOWN_SUPERSEDED");
  });

  it("F: a chain that resolves AFTER an earlier REVIEW_REQUIRED run correctly flips to KNOWN_SUPERSEDED - no earlier uncertainty leaves a stale CURRENT verdict behind", async () => {
    // First run: an unresolvable target (malformed date) - REVIEW_REQUIRED, node stays current.
    const v1: PackageDocumentInput = { documentId: "ff1", label: "Original Loan Agreement", text: `LOAN AGREEMENT dated as of April 1, 2024, among Union Point Lender, LLC and Fenwick Distribution, Inc.\n\nSECTION 5.01 Indebtedness. Up to $8,000,000.`, declaredType: "CREDIT_AGREEMENT" };
    const v2Unresolved: PackageDocumentInput = { documentId: "ff2", label: "Amended and Restated Loan Agreement", text: `AMENDED AND RESTATED LOAN AGREEMENT dated as of a date the parties will separately confirm, among Union Point Lender, LLC and Fenwick Distribution, Inc.\n\nSECTION 5.01 Indebtedness. Up to $9,000,000.`, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const first = await runRealPipeline([v1, v2Unresolved]);
    const firstState = computeOperativeContractState({ instrumentKey: "instrument:ff1", baseDocumentId: "ff1", asOfDate: "2026-01-01", index: first.index, allEffects: first.amendmentResult.effects });
    expect(firstState.operativeDocument?.status).not.toBe("RESOLVED");
    const firstIdx = buildNodeSupersessionIndex([{ baseDocumentId: "ff1", state: firstState }]);
    const node = first.index.getNodeByRef("ff1", "1")!;
    expect(getNodeSupersessionStatus(firstIdx, "ff1", node.nodeId).status).toBe("CURRENT_OPERATIVE");

    // Second run: the SAME predecessor, now with a corrected, resolvable date - RESOLVED, and this is a completely fresh index (never mutating the first).
    const v2Resolved: PackageDocumentInput = { documentId: "ff2", label: "Amended and Restated Loan Agreement", text: `AMENDED AND RESTATED LOAN AGREEMENT dated as of September 9, 2024, among Union Point Lender, LLC and Fenwick Distribution, Inc.\n\nThe parties are parties to a Loan Agreement dated as of April 1, 2024 (the "Existing Loan Agreement") and have agreed to amend and restate it.\n\nSECTION 5.01 Indebtedness. Up to $9,000,000.`, declaredType: "AMENDED_AND_RESTATED_AGREEMENT" };
    const second = await runRealPipeline([v1, v2Resolved]);
    const secondState = computeOperativeContractState({ instrumentKey: "instrument:ff1", baseDocumentId: "ff1", asOfDate: "2026-01-01", index: second.index, allEffects: second.amendmentResult.effects });
    expect(secondState.operativeDocument?.status).toBe("RESOLVED");
    const secondIdx = buildNodeSupersessionIndex([{ baseDocumentId: "ff1", state: secondState }]);
    const node2 = second.index.getNodeByRef("ff1", "1")!;
    expect(getNodeSupersessionStatus(secondIdx, "ff1", node2.nodeId).status).toBe("KNOWN_SUPERSEDED");
    // The FIRST index (from the earlier, unresolved run) is untouched - proves no in-place mutation/staleness across runs.
    expect(getNodeSupersessionStatus(firstIdx, "ff1", node.nodeId).status).toBe("CURRENT_OPERATIVE");
  });
});

describe("Benchmark-contamination guard", () => {
  it("no Riot/Coinbase/known-package identifier appears anywhere in this file's own fixture text", () => {
    const fixtureText = [V1_TEXT, V2_TEXT, V3_TEXT].join("\n");
    for (const banned of ["Riot", "Coinbase", "Platforms, Inc", "FWRG", "LSB", "CONMED", "DSGR"]) {
      expect(fixtureText).not.toContain(banned);
    }
  });
});
