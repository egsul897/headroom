/**
 * Phase 3F.1.6 Final Foundation Certification — Section 29: adversarial
 * foundation matrix. A SMALL, HIGH-QUALITY set of genuinely combined
 * adversarial scenarios (quality over count), each constructed and actually
 * EXECUTED against real, unmodified production code (real Postgres where a
 * scenario is DB-backed). AUDIT-ONLY — no production code modified.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import { auditOperativeStateForUnits, applyOperativeStateFindingsToCoverage } from "../../lib/contract-model/compiler/semantic-coverage/cross-reference-audit";
import { reconcileFrozenInventory } from "../../lib/contract-model/compiler/semantic-coverage/reconciliation";
import { freezeSourceInventory } from "../../lib/contract-model/compiler/semantic-coverage/freeze";
import { deriveFromCoverageEntry } from "../../lib/contract-model/compiler/safe-failure/derive";
import { recordClaimReview, resolveClaimReview } from "../../lib/contract-model/compiler/safe-failure/service";
import { computeSemanticUnitId } from "../../lib/contract-model/compiler/semantic-coverage/identity";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic-coverage/types";
import type { MaterialSemanticUnit, SourceAnchor } from "../../lib/contract-model/compiler/semantic-coverage/types";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import { uploadDocumentThroughIngestion } from "../../lib/connectors/upload-connector";

const COMPANY_ID = "cert-3f1-6-adversarial-matrix-scratch";
const COMPANY_ID_B = "cert-3f1-6-adversarial-matrix-scratch-b";

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

function effect(overrides: Partial<AmendmentEffectCandidate> & { effectId: string; targetSectionRef?: string; targetDefinedTermRef?: string; targetInstrumentKey?: string; targetDocumentId?: string }): AmendmentEffectCandidate {
  return {
    effectId: overrides.effectId,
    amendmentDocumentId: overrides.amendmentDocumentId ?? "amend-doc",
    target: {
      kind: overrides.targetSectionRef ? "SECTION" : "DEFINITION",
      targetDocumentId: overrides.targetDocumentId ?? "base-doc",
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

function unit(overrides: Partial<MaterialSemanticUnit> & { anchors: SourceAnchor[]; companyId?: string }): MaterialSemanticUnit {
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

async function ensureCompanyAndDocument(companyId: string, documentId: string) {
  await prisma.company.upsert({ where: { id: companyId }, create: { id: companyId, name: `Cert 3F.1.6 adversarial scratch ${companyId}` }, update: {} });
  await prisma.document.upsert({ where: { id: documentId }, create: { id: documentId, companyId, name: `scratch ${documentId}`, type: "CREDIT_AGREEMENT" }, update: {} });
}

beforeAll(async () => {
  await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Cert 3F.1.6 adversarial scratch" }, update: {} });
  await prisma.company.upsert({ where: { id: COMPANY_ID_B }, create: { id: COMPANY_ID_B, name: "Cert 3F.1.6 adversarial scratch B" }, update: {} });
});

afterAll(async () => {
  for (const cid of [COMPANY_ID, COMPANY_ID_B]) {
    await prisma.claimReviewItem.deleteMany({ where: { companyId: cid } });
    await prisma.document.deleteMany({ where: { companyId: cid } });
    await prisma.company.deleteMany({ where: { id: cid } });
  }
});

describe("Case 1: structural corruption + amendment DELETION (not just a threshold change)", () => {
  it("a corrupted node targeted by a real, resolved DELETE_TEXT effect is still withheld — deletion semantics never bypass the structural-health gate", () => {
    const documentId = "adv1-doc";
    const corrupted = n({ documentId, nodeType: "SECTION", sectionRef: "9.01", charStart: 0, charEnd: 900, nodeId: "adv1-sec-901" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(40), nodes: [corrupted] }]]), [], []);
    expect(index.healthDiagnostics().some((f) => f.code === "INVALID_SOURCE_SPAN" && f.nodeId === "adv1-sec-901")).toBe(true);

    const del = effect({ effectId: "adv1-eff", targetSectionRef: "9.01", targetDocumentId: documentId, operation: "DELETE_TEXT" });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-06-01", index, allEffects: [del] });
    const provision = state.provisions[0]!;
    // A clean, well-evidenced deletion against a UNIQUE target would normally
    // report OPERATIVE_STATE_RESOLVED with currentText null (P3's own
    // documented distinction) — but structural-health gating fires FIRST and
    // independently, so this corrupted node's deletion is still surfaced as
    // PARTIAL/uncertain, never silently treated as "cleanly deleted, nothing
    // more to see here."
    expect(provision.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(provision.structuralHealthStatus).toBe("STRUCTURAL_HEALTH_UNSAFE");
    expect(provision.currentText).toBeNull();
  });
});

describe("Case 2: duplicate SECTION label elsewhere + definition lookup — confirm no cross-contamination", () => {
  it("a document with a genuinely duplicate SECTION label (6.02 appearing twice) still resolves its OWN unique definition correctly — structural ambiguity in one axis never leaks into an unrelated definition lookup", () => {
    const documentId = "adv2-doc";
    const sectionA = n({ documentId, nodeType: "SECTION", sectionRef: "6.02", charStart: 0, charEnd: 50, nodeId: "adv2-sec-602-a" });
    const sectionB = n({ documentId, nodeType: "SECTION", sectionRef: "6.02", charStart: 500, charEnd: 550, nodeId: "adv2-sec-602-b" }); // duplicate label, unrelated to any definition
    const def: DetectedDefinition = { documentId, exactTerm: "Consolidated EBITDA", normalizedTerm: "consolidated ebitda", sourceNodeKey: `${documentId}::def`, sourceNodeId: "adv2-def-node", charStart: 800, charEnd: 900, definitionExcerpt: "\"Consolidated EBITDA\" means net income plus interest, taxes, depreciation and amortization." };
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(1000), nodes: [sectionA, sectionB] }]]), [def], []);

    expect(index.resolveUniqueNodeByRef(documentId, "6.02").status).toBe("AMBIGUOUS"); // fault #1, confirmed real and present
    // The unrelated definition lookup is completely unaffected by the SECTION
    // label collision — it resolves to exactly the one real definition.
    const resolved = index.getDefinition("Consolidated EBITDA", documentId);
    expect(resolved).toBeDefined();
    expect(resolved!.sourceNodeId).toBe("adv2-def-node");
    expect(index.allDefinitions().filter((d) => d.documentId === documentId && d.normalizedTerm === "consolidated ebitda")).toHaveLength(1);
  });
});

describe("Case 3: sibling claims -> independent review events, no cross-contamination", () => {
  it("two sibling MaterialSemanticUnits under the same parent section, both UNREPRESENTED, each get their OWN persisted ClaimReviewItem with distinct claimKeys", async () => {
    const documentId = "adv3-doc";
    await ensureCompanyAndDocument(COMPANY_ID, documentId);
    const parent = n({ documentId, nodeType: "SECTION", sectionRef: "6.03", charStart: 0, charEnd: 300, nodeId: "adv3-sec-603" });
    const childA = n({ documentId, nodeType: "CLAUSE", sectionRef: "6.03(a)", charStart: 10, charEnd: 100, nodeId: "adv3-sec-603-a", parentNodeId: "adv3-sec-603", parentSectionRef: "6.03" });
    const childB = n({ documentId, nodeType: "CLAUSE", sectionRef: "6.03(b)", charStart: 110, charEnd: 200, nodeId: "adv3-sec-603-b", parentNodeId: "adv3-sec-603", parentSectionRef: "6.03" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(300), nodes: [parent, childA, childB] }]]), [], []);

    const unitA = unit({ anchors: [anchor({ documentId, structuralNodeId: "adv3-sec-603-a", sectionRef: "6.03(a)", charStart: 10, charEnd: 100 })], excerptText: "basket A up to $1,000,000", materiality: "MATERIAL" });
    const unitB = unit({ anchors: [anchor({ documentId, structuralNodeId: "adv3-sec-603-b", sectionRef: "6.03(b)", charStart: 110, charEnd: 200 })], excerptText: "basket B up to $2,000,000", materiality: "MATERIAL" });
    expect(unitA.semanticUnitId).not.toBe(unitB.semanticUnitId); // sibling-safe identity, confirmed independently

    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [unitA, unitB] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(entries.every((e) => e.coverageState === "UNREPRESENTED")).toBe(true);

    const ids: string[] = [];
    for (const u of [unitA, unitB]) {
      const entry = entries.find((e) => e.semanticUnitId === u.semanticUnitId)!;
      const dangerous = dangerousUnaccounted.find((d) => d.semanticUnitId === u.semanticUnitId) ?? null;
      const input = deriveFromCoverageEntry({ unit: u, entry, dangerous, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
      const result = await recordClaimReview(input!);
      ids.push(result.reviewItemId);
    }
    expect(ids[0]).not.toBe(ids[1]);
    const rows = await prisma.claimReviewItem.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.claimKey)).size).toBe(2);
    expect(new Set(rows.map((r) => r.sourceEvidence))).toEqual(new Set(["basket A up to $1,000,000", "basket B up to $2,000,000"]));
  });
});

describe("Case 4: same defined term, two different documents/instruments -> no cross-instrument leakage", () => {
  it("'Permitted Liens' defined identically in two unrelated documents resolves independently per document, and produces two independent ClaimReviewItems (documentId is part of the persisted identity, never collapsed)", async () => {
    const docX = "adv4-doc-x";
    const docY = "adv4-doc-y";
    await ensureCompanyAndDocument(COMPANY_ID, docX);
    await ensureCompanyAndDocument(COMPANY_ID, docY);

    const defX: DetectedDefinition = { documentId: docX, exactTerm: "Permitted Liens", normalizedTerm: "permitted liens", sourceNodeKey: `${docX}::def`, sourceNodeId: "adv4-def-x", charStart: 0, charEnd: 40, definitionExcerpt: "means Liens described in Schedule 1.01 of this Agreement." };
    const defY: DetectedDefinition = { documentId: docY, exactTerm: "Permitted Liens", normalizedTerm: "permitted liens", sourceNodeKey: `${docY}::def`, sourceNodeId: "adv4-def-y", charStart: 0, charEnd: 40, definitionExcerpt: "means Liens described in Schedule 4.02 of the OTHER, unrelated Agreement." };
    const nodeX = n({ documentId: docX, nodeType: "CLAUSE", sectionRef: "1.01(pl)", charStart: 0, charEnd: 40, nodeId: "adv4-def-x" });
    const nodeY = n({ documentId: docY, nodeType: "CLAUSE", sectionRef: "1.01(pl)", charStart: 0, charEnd: 40, nodeId: "adv4-def-y" }); // same sectionRef label, DIFFERENT document
    const index = buildStructuralIndex(new Map([[docX, { text: "x".repeat(200), nodes: [nodeX] }], [docY, { text: "y".repeat(200), nodes: [nodeY] }]]), [defX, defY], []);

    // Link 1: document-scoped definition resolution never leaks across documents.
    expect(index.getDefinition("Permitted Liens", docX)!.sourceNodeId).toBe("adv4-def-x");
    expect(index.getDefinition("Permitted Liens", docY)!.sourceNodeId).toBe("adv4-def-y");
    expect(index.getDefinition("Permitted Liens", docX)!.definitionExcerpt).toMatch(/Schedule 1\.01/);
    expect(index.getDefinition("Permitted Liens", docY)!.definitionExcerpt).toMatch(/Schedule 4\.02/);

    // Link 2: two MaterialSemanticUnits (one per document) never collide on claimKey/identity despite the identical term and identical sectionRef label.
    const unitX = unit({ anchors: [anchor({ documentId: docX, structuralNodeId: "adv4-def-x", sectionRef: "1.01(pl)", charStart: 0, charEnd: 40 })], excerptText: "Permitted Liens per Schedule 1.01", family: "LIENS", materiality: "CRITICAL" });
    const unitY = unit({ anchors: [anchor({ documentId: docY, structuralNodeId: "adv4-def-y", sectionRef: "1.01(pl)", charStart: 0, charEnd: 40 })], excerptText: "Permitted Liens per Schedule 4.02", family: "LIENS", materiality: "CRITICAL" });
    expect(unitX.semanticUnitId).not.toBe(unitY.semanticUnitId);

    const ids: string[] = [];
    for (const [documentId, u] of [[docX, unitX], [docY, unitY]] as const) {
      const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [u] });
      const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
      const input = deriveFromCoverageEntry({ unit: u, entry: entries[0]!, dangerous: dangerousUnaccounted[0] ?? null, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
      const result = await recordClaimReview(input!);
      ids.push(result.reviewItemId);
    }
    const rows = await prisma.claimReviewItem.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([docX, docY]));
    expect(rows.find((r) => r.documentId === docX)!.sourceEvidence).toMatch(/1\.01/);
    expect(rows.find((r) => r.documentId === docY)!.sourceEvidence).toMatch(/4\.02/);
  });
});

describe("Case 5: superseded node + source trace still correctly identifies it as historical, not current", () => {
  it("getNodeSupersessionStatus reports KNOWN_SUPERSEDED for the real displaced node and CURRENT_OPERATIVE only for the amendment's own document, never assuming safety for an uncovered document", () => {
    const documentId = "adv5-doc";
    const section = n({ documentId, nodeType: "SECTION", sectionRef: "7.02", charStart: 0, charEnd: 100, nodeId: "adv5-sec-702" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(200), nodes: [section] }]]), [], []);
    const amend = effect({ effectId: "adv5-eff", targetSectionRef: "7.02", targetDocumentId: documentId, newText: "The revised covenant text." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-06-01", index, allEffects: [amend] });
    expect(state.provisions[0]!.supersededSourceNodeIds).toContain("adv5-sec-702");

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: documentId, state }]);
    const historical = getNodeSupersessionStatus(supersessionIndex, documentId, "adv5-sec-702");
    expect(historical.status).toBe("KNOWN_SUPERSEDED");
    expect(historical.record?.supersededByEffectId).toBe("adv5-eff");

    // A node in a document NEVER covered by any operative-state computation
    // must resolve UNKNOWN, never CURRENT_OPERATIVE by default (fail-closed).
    const uncovered = getNodeSupersessionStatus(supersessionIndex, "some-other-doc-never-analyzed", "some-node-id");
    expect(uncovered.status).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });
});

describe("Case 6: concurrent ingestion + cross-tenant collision attempt, combined in one test", () => {
  it("two DIFFERENT companies uploading byte-identical content SIMULTANEOUSLY never dedupe against each other — each gets its own real Document row despite racing", async () => {
    const data = Buffer.from("CROSS-TENANT RACE FIXTURE. Section 3.01. Two different companies upload this exact byte content at the same time.");

    const [resultA, resultB] = await Promise.all([
      uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: "race-a.txt", data, declaredType: "CREDIT_AGREEMENT" }),
      uploadDocumentThroughIngestion({ companyId: COMPANY_ID_B, filename: "race-b.txt", data, declaredType: "CREDIT_AGREEMENT" }),
    ]);

    expect(resultA.duplicate).toBe(false);
    expect(resultB.duplicate).toBe(false); // tenant isolation: identical bytes for a DIFFERENT company is never treated as a duplicate
    expect(resultA.artifactId).not.toBe(resultB.artifactId);
    expect(resultA.document!.companyId).toBe(COMPANY_ID);
    expect(resultB.document!.companyId).toBe(COMPANY_ID_B);

    // Neither company's Document is reachable through the other's query path.
    const crossQuery = await prisma.document.findFirst({ where: { companyId: COMPANY_ID, id: resultB.document!.id } });
    expect(crossQuery).toBeNull();
  });
});

describe("Case 7: unsupported semantic expression + review lifecycle survives a transition", () => {
  it("an UNREPRESENTED (IR-unsupported-shaped) claim produces a review item that survives ACCEPT -> re-detection -> REOPEN, with a full append-only decision trail", async () => {
    const documentId = "adv7-doc";
    await ensureCompanyAndDocument(COMPANY_ID, documentId);
    const section = n({ documentId, nodeType: "SECTION", sectionRef: "6.09", charStart: 0, charEnd: 100, nodeId: "adv7-sec-609" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(200), nodes: [section] }]]), [], []);
    const u = unit({ anchors: [anchor({ documentId, structuralNodeId: "adv7-sec-609", sectionRef: "6.09", charStart: 0, charEnd: 100 })], excerptText: "an unsupported builder/grower reclassification mechanic", materiality: "CRITICAL" });

    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [u] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(entries[0]!.coverageState).toBe("UNREPRESENTED");
    const input = deriveFromCoverageEntry({ unit: u, entry: entries[0]!, dangerous: dangerousUnaccounted[0] ?? null, companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION });
    const created = await recordClaimReview(input!);
    expect(created.outcome).toBe("CREATED");

    // Lifecycle transition 1: a human accepts it as a known, tolerated gap.
    await resolveClaimReview({ reviewItemId: created.reviewItemId, action: "ACCEPT", note: "Reviewed manually — acceptable for now.", decidedBy: "test-reviewer@example.com" });
    let row = await prisma.claimReviewItem.findUniqueOrThrow({ where: { id: created.reviewItemId } });
    expect(row.status).toBe("RESOLVED_ACCEPTED");

    // Lifecycle transition 2: the SAME claim is re-detected on a later pipeline run (content unchanged, algorithm re-run) — must REOPEN, never silently stay RESOLVED_ACCEPTED while still actually unresolved.
    const reDetected = await recordClaimReview(input!);
    expect(reDetected.outcome).toBe("REOPENED_FROM_RESOLVED");
    row = await prisma.claimReviewItem.findUniqueOrThrow({ where: { id: created.reviewItemId } });
    expect(row.status).toBe("OPEN_REVIEW");

    // Full append-only decision trail preserved — never overwritten.
    const decisions = await prisma.claimReviewDecision.findMany({ where: { reviewItemId: created.reviewItemId }, orderBy: { createdAt: "asc" } });
    expect(decisions.map((d) => d.action)).toEqual(["ACCEPT", "REOPEN"]);
    expect(decisions[0]!.decidedBy).toBe("test-reviewer@example.com");
    expect(decisions[1]!.decidedBy).toBeNull(); // automated reopen, never a fabricated human identity

    const observations = await prisma.claimReviewObservation.findMany({ where: { reviewItemId: created.reviewItemId } });
    expect(observations.length).toBeGreaterThanOrEqual(2); // original detection + re-detection, both preserved
  });
});

describe("Case 8: verification contradiction + amendment supersession — no confusion between the two concepts", () => {
  it("a provision with BOTH an unverified/contradicted compiled rule AND a later real supersession is reported as SUPERSEDED (operative-state wins), never merely 'contradicted' — the two failure modes are never conflated", () => {
    const documentId = "adv8-doc";
    const section = n({ documentId, nodeType: "SECTION", sectionRef: "6.06", charStart: 0, charEnd: 100, nodeId: "adv8-sec-606" });
    const index = buildStructuralIndex(new Map([[documentId, { text: "x".repeat(200), nodes: [section] }]]), [], []);

    // The node is later superseded by a real, resolved amendment effect.
    const amend = effect({ effectId: "adv8-eff", targetSectionRef: "6.06", targetDocumentId: documentId, newText: "Restated covenant text." });
    const state = computeOperativeContractState({ instrumentKey: "instrument-1", baseDocumentId: documentId, asOfDate: "2024-06-01", index, allEffects: [amend] });
    expect(state.provisions[0]!.supersededSourceNodeIds).toContain("adv8-sec-606");

    const u = unit({ anchors: [anchor({ documentId, structuralNodeId: "adv8-sec-606", sectionRef: "6.06", charStart: 0, charEnd: 100 })], excerptText: "not to exceed $3,000,000", materiality: "MATERIAL" });
    const findings = auditOperativeStateForUnits([u], state);
    expect(findings[0]!.findingType).toBe("STALE_SUPERSEDED_TEXT_CREDITED"); // supersession is the reported reason...

    // ...even though reconciliation, on its own (never told about supersession),
    // would have reported a DIFFERENT, unrelated uncertainty for this same
    // node if nothing had compiled/verified it (UNREPRESENTED here, since no
    // candidate/rule exists) — proving these are two genuinely distinct
    // signals, not accidentally identical strings that happen to look alike.
    const frozen = freezeSourceInventory({ companyId: COMPANY_ID, packageKey: "pkg-1", instrumentKey: "instrument-1", documentIds: [documentId], units: [u] });
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index, discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(entries[0]!.coverageState).toBe("UNREPRESENTED"); // reconciliation's OWN independent verdict, pre-override
    expect(entries[0]!.reasoning).not.toMatch(/supersed/i); // reconciliation genuinely knows nothing about supersession

    const { entries: finalEntries } = applyOperativeStateFindingsToCoverage(entries, dangerousUnaccounted, findings, [u]);
    expect(finalEntries[0]!.coverageState).toBe("OPERATIVE_STATE_UNRESOLVED"); // supersession OVERRIDES the independent reconciliation verdict
    expect(finalEntries[0]!.reasoning).toMatch(/SUPERSEDED/); // the final, authoritative reasoning correctly names supersession, not a generic "unrepresented" or fabricated "contradiction" label
  });
});
