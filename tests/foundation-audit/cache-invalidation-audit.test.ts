/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Section 16 (Cache Invalidation
 * Assurance). This file adds NEW, read-only-of-production-code tests under
 * tests/foundation-audit/ per the audit's own instructions; it does not
 * modify any file under lib/, app/, or prisma/schema.prisma.
 *
 * FINDING (see audit report): orchestrator.ts's own STRUCTURE-stage
 * `inputHash` (`hashParts(documents.map(d => `${d.documentId}:${d.text}`))`,
 * orchestrator.ts line ~105) is a pure function of document identity + raw
 * text. It does NOT include STRUCTURAL_INDEX_VERSION (or any other
 * structural-algorithm identity). `getOrRunStage` resumes (skips real
 * recomputation and returns the persisted `output` verbatim) whenever a
 * persisted COMPLETED row's `inputHash` still matches the freshly computed
 * one — so a structural-parsing ALGORITHM change (STRUCTURAL_INDEX_VERSION
 * bump, or any bug fix to parseDocumentStructure) over the SAME document
 * text is invisible to this cache-gate: the orchestrator will silently keep
 * serving the OLD, pre-change structural nodes forward into every downstream
 * stage and into `persistStructuralNodes`'s own upserts, even though the
 * code driving the current in-process call would produce different output
 * if actually invoked.
 *
 * This test proves the mechanism directly against the REAL, UNMODIFIED
 * orchestrator.ts: it mocks only stage-structure.ts's own exported function
 * (`runStructureStage`) to stand in for "the structural algorithm changed",
 * while every line of orchestrator.ts, persistence.ts, and every other
 * stage module runs completely unmodified. If orchestrator.ts's inputHash
 * formula ever starts covering the algorithm version, this test's second
 * assertion (`resumed === true` while nodes differ) will start failing.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";

const COMPANY_ID = "fixture-audit-cache-invalidation-co";
const DOCUMENT_ID = "fixture-audit-cache-invalidation-doc";
const PACKAGE_KEY = "fixture-audit-cache-invalidation-pkg";

const SAMPLE_TEXT = `
ARTICLE VI NEGATIVE COVENANTS

Section 6.01. Indebtedness. The Borrower will not incur any Indebtedness, except Indebtedness in an aggregate amount not to exceed $10,000,000.

Section 6.02. Liens. The Borrower will not create any Lien, except Liens securing Indebtedness permitted by Section 6.01.
`.trim();

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

// Two DISTINCT "structural algorithm versions" of the same document text.
// v1 mirrors the real parser's output shape for SAMPLE_TEXT; v2 simulates a
// later fix/version bump that discovers additional real structure the old
// algorithm missed (e.g. a Phase 2A-style generalization). Both are
// well-formed StructuralNode[] values so downstream stages (which merely
// read node.documentId/nodeType/sectionRef/charStart/etc.) do not crash.
function makeNodesV1() {
  return [
    { documentId: DOCUMENT_ID, nodeType: "ARTICLE" as const, heading: "NEGATIVE COVENANTS", sectionRef: "VI", nodeKey: `${DOCUMENT_ID}::VI`, nodeId: "audit-v1-article-vi", charStart: 0, charEnd: SAMPLE_TEXT.length, ordinal: 0, parentSectionRef: null, parentNodeId: null },
    { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: "audit-v1-section-601", charStart: 10, charEnd: 120, ordinal: 0, parentSectionRef: "VI", parentNodeId: "audit-v1-article-vi" },
  ];
}
function makeNodesV2() {
  // "v2" (post-version-bump) additionally discovers 6.02 as its own node -
  // a materially different structural output over the IDENTICAL document text.
  return [
    ...makeNodesV1(),
    { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Liens", sectionRef: "6.02", nodeKey: `${DOCUMENT_ID}::6.02`, nodeId: "audit-v2-section-602", charStart: 130, charEnd: SAMPLE_TEXT.length, ordinal: 1, parentSectionRef: "VI", parentNodeId: "audit-v1-article-vi" },
  ];
}

describe("Section 16 — cache invalidation assurance: STRUCTURAL_INDEX_VERSION bump vs. orchestrator STRUCTURE-stage cache gate", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Audit Co (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Audit Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.contractCompilerRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.contractRule.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.definedTermNode.deleteMany({ where: { companyId: COMPANY_ID } });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("../../lib/contract-model/compiler/stage-structure");
  });

  it("FINDING: a structural-algorithm change over UNCHANGED document text is resumed (skipped) by getOrRunStage, silently serving stale nodes forward", async () => {
    // --- "Run 1": algorithm v1 ---
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV1() }) };
    });
    const { runContractCompiler: runV1 } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary1 = await runV1({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    expect(summary1.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "VI"]);

    const stageRow1 = await prisma.contractCompilerStage.findFirst({ where: { run: { companyId: COMPANY_ID }, stage: "STRUCTURE" } });
    expect(stageRow1?.status).toBe("COMPLETED");
    const inputHashAfterV1 = stageRow1!.inputHash;

    // --- "Run 2": SAME document text, but the structural algorithm has
    // materially changed (simulating a STRUCTURAL_INDEX_VERSION bump / a
    // parseDocumentStructure bug fix) and would now find an extra section. ---
    vi.resetModules();
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV2() }) };
    });
    const { runContractCompiler: runV2 } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary2 = await runV2({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });

    const stageRow2 = await prisma.contractCompilerStage.findFirst({ where: { run: { companyId: COMPANY_ID }, stage: "STRUCTURE" } });

    // THE DEFECT: the persisted STRUCTURE stage's inputHash is UNCHANGED
    // (document text/id did not change), so getOrRunStage's cache-check
    // (`existing.inputHash === inputHash`) is satisfied and it resumes the
    // OLD v1 output — even though the "algorithm" (mocked stage-structure
    // module) actually in effect for this call would produce v2's extra node.
    expect(stageRow2!.inputHash).toBe(inputHashAfterV1);
    expect(summary2.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "VI"]); // NOT ["6.01", "6.02", "VI"] — v2's real output never surfaces.
    expect(summary2.structuralNodes.map((n) => n.sectionRef).sort()).not.toEqual(makeNodesV2().map((n) => n.sectionRef).sort());

    // And the persisted DocumentNode rows (via persistStructuralNodes, run
    // unmodified on every call) reflect the same staleness: 6.02 never
    // appears, because the orchestrator never even re-invoked the "changed"
    // parser to produce it.
    const persistedSections = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID }, select: { sectionRef: true } });
    expect(persistedSections.map((n) => n.sectionRef).sort()).toEqual(["6.01", "VI"]);
  });

  it("control: `force: true` correctly bypasses the stale cache and re-runs with the new algorithm", async () => {
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV1() }) };
    });
    const { runContractCompiler: runV1 } = await import("../../lib/contract-model/compiler/orchestrator");
    await runV1({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });

    vi.resetModules();
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV2() }) };
    });
    const { runContractCompiler: runV2 } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary2 = await runV2({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] }, { force: true });
    expect(summary2.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "6.02", "VI"]);
  });

  // Phase 3F.1.4 (P1-9 remediation) updated this test's own assertions:
  // persistStructuralNodes (lib/contract-model/compiler/persistence.ts) now
  // tombstones, inside the same transaction as its upserts, any
  // previously-persisted row for a document actually represented in its
  // input whose stableKey the current run no longer produces. Asserting the
  // orphan's continued survival after this has been deliberately fixed
  // would be asserting the wrong thing, not preserving a real safety gate -
  // matching the precedent set by tests/contract-model/architecture-
  // proposal-node-identity.test.ts's own header comment for the same
  // situation.
  it("FIXED (P1-9 remediation): persistStructuralNodes now tombstones a row for a node the current parse no longer produces (orphan no longer survives)", async () => {
    const { persistStructuralNodes } = await import("../../lib/contract-model/compiler/persistence");
    // "Old algorithm": produces 6.01 and 6.02.
    await persistStructuralNodes(COMPANY_ID, [
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: "audit-orphan-601", charStart: 10, charEnd: 120, ordinal: 0, parentSectionRef: null, parentNodeId: null },
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Liens (spurious duplicate match)", sectionRef: "6.02", nodeKey: `${DOCUMENT_ID}::6.02`, nodeId: "audit-orphan-602", charStart: 130, charEnd: 200, ordinal: 1, parentSectionRef: null, parentNodeId: null },
    ]);
    const countBefore = await prisma.documentNode.count({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    expect(countBefore).toBe(2);

    // "New algorithm" (e.g. a real bug fix that recognizes 6.02's match was
    // spurious and correctly no longer emits it): produces ONLY 6.01.
    await persistStructuralNodes(COMPANY_ID, [
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: "audit-orphan-601", charStart: 10, charEnd: 120, ordinal: 0, parentSectionRef: null, parentNodeId: null },
    ]);
    const countAfter = await prisma.documentNode.count({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    // FIXED: the stale 6.02 row IS now deleted, in the same transaction as
    // the 6.01 upsert - the orphan no longer survives, and no longer shows
    // up mixed in with genuinely current nodes on a plain
    // findMany({ documentId }) read (e.g. lib/contract-model/service.ts:22).
    expect(countAfter).toBe(1);
    const stillThere = await prisma.documentNode.findFirst({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, sectionRef: "6.02" } });
    expect(stillThere).toBeNull();
    const survivor = await prisma.documentNode.findFirst({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, sectionRef: "6.01" } });
    expect(survivor).not.toBeNull(); // the row the current run DID reproduce is untouched, not merely "everything deleted."
  });

  it("FIXED (P1-9 remediation) positive control: re-persisting the EXACT SAME nodes twice never tombstones anything - a legitimate, unchanged re-run leaves every row in place", async () => {
    const { persistStructuralNodes } = await import("../../lib/contract-model/compiler/persistence");
    const nodes = [
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: "audit-stable-601", charStart: 10, charEnd: 120, ordinal: 0, parentSectionRef: null, parentNodeId: null },
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Liens", sectionRef: "6.02", nodeKey: `${DOCUMENT_ID}::6.02`, nodeId: "audit-stable-602", charStart: 130, charEnd: 200, ordinal: 1, parentSectionRef: null, parentNodeId: null },
    ];
    const first = await persistStructuralNodes(COMPANY_ID, nodes);
    const firstIds = new Set([...first.idByNodeId.values()]);
    await persistStructuralNodes(COMPANY_ID, nodes); // identical replay
    const count = await prisma.documentNode.count({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    expect(count).toBe(2); // both rows still present
    const rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    expect(new Set(rows.map((r) => r.id))).toEqual(firstIds); // same row ids as before - no spurious delete+recreate churn.
  });

  it("FIXED (P1-9 remediation) negative control: a document NOT represented at all in a persistStructuralNodes call is never touched by that call's own tombstone step", async () => {
    const { persistStructuralNodes } = await import("../../lib/contract-model/compiler/persistence");
    const OTHER_DOC_ID = "audit-p19-untouched-doc";
    await prisma.document.create({ data: { id: OTHER_DOC_ID, companyId: COMPANY_ID, name: "Untouched sibling document", type: "CREDIT_AGREEMENT" } });
    try {
      await persistStructuralNodes(COMPANY_ID, [
        { documentId: OTHER_DOC_ID, nodeType: "SECTION" as const, heading: "Untouched", sectionRef: "1.01", nodeKey: `${OTHER_DOC_ID}::1.01`, nodeId: "audit-untouched-101", charStart: 0, charEnd: 50, ordinal: 0, parentSectionRef: null, parentNodeId: null },
      ]);
      // A separate call that only mentions DOCUMENT_ID (not OTHER_DOC_ID at all) must never delete OTHER_DOC_ID's own row.
      await persistStructuralNodes(COMPANY_ID, [
        { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: "audit-orphan-601-v2", charStart: 10, charEnd: 120, ordinal: 0, parentSectionRef: null, parentNodeId: null },
      ]);
      const otherDocRow = await prisma.documentNode.findFirst({ where: { companyId: COMPANY_ID, documentId: OTHER_DOC_ID, sectionRef: "1.01" } });
      expect(otherDocRow).not.toBeNull(); // never touched - this call's own input never mentioned OTHER_DOC_ID.
    } finally {
      await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID, documentId: OTHER_DOC_ID } });
      await prisma.document.deleteMany({ where: { id: OTHER_DOC_ID } });
    }
  });

  it("FIXED (P1-9 remediation) fail-closed guard: an EMPTY `rules` array passed to persistContractRules/persistDefinedTerms never wipes previously-persisted rows for that document - only a non-empty, genuinely-reproduced run may tombstone", async () => {
    const { persistDefinedTerms, persistContractRules, persistStructuralNodes } = await import("../../lib/contract-model/compiler/persistence");
    const term = { termName: "Guard Term", sourceSectionRef: "1.01", entityScope: [] } as unknown as import("../../lib/contract-model/types").CandidateDefinedTerm;
    await persistDefinedTerms(COMPANY_ID, DOCUMENT_ID, [term]);
    const beforeTerms = await prisma.definedTermNode.count({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    expect(beforeTerms).toBeGreaterThan(0);
    await persistDefinedTerms(COMPANY_ID, DOCUMENT_ID, []); // e.g. an upstream stage failure producing zero candidates this run
    const afterTerms = await prisma.definedTermNode.count({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID } });
    expect(afterTerms).toBe(beforeTerms); // NOT wiped to 0 - the empty-array guard held.

    const nodeIndex = await persistStructuralNodes(COMPANY_ID, [
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Guard Section", sectionRef: "1.01", nodeKey: `${DOCUMENT_ID}::1.01`, nodeId: "audit-guard-101", charStart: 500, charEnd: 550, ordinal: 0, parentSectionRef: null, parentNodeId: null },
    ]);
    const rule = { sourceSectionRef: "1.01", action: "GUARD_ACTION", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", entityScope: [], entityScopeExcluded: [], conditions: [], exceptions: [], definedTermRefs: [] } as unknown as import("../../lib/contract-model/types").CandidateContractRule;
    await persistContractRules(COMPANY_ID, DOCUMENT_ID, [rule], nodeIndex, new Set());
    const beforeRules = await prisma.contractRule.count({ where: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID } });
    expect(beforeRules).toBeGreaterThan(0);
    await persistContractRules(COMPANY_ID, DOCUMENT_ID, [], nodeIndex, new Set());
    const afterRules = await prisma.contractRule.count({ where: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID } });
    expect(afterRules).toBe(beforeRules); // NOT wiped to 0 either.
  });

  it("FIXED (P1-9 remediation) concurrent-write safety: repeated concurrent persistStructuralNodes calls for a colliding key resolve to one consistent row, and the tombstone step never races into deleting a row a concurrent writer just (re-)created for the SAME current-run content", async () => {
    const { persistStructuralNodes } = await import("../../lib/contract-model/compiler/persistence");
    const nodes = [
      { documentId: DOCUMENT_ID, nodeType: "SECTION" as const, heading: "Race Section", sectionRef: "8.01", nodeKey: `${DOCUMENT_ID}::8.01`, nodeId: "audit-race-801", charStart: 700, charEnd: 750, ordinal: 0, parentSectionRef: null, parentNodeId: null },
    ];
    const results = await Promise.all(Array.from({ length: 6 }, () => persistStructuralNodes(COMPANY_ID, nodes)));
    const rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, sectionRef: "8.01" } });
    expect(rows).toHaveLength(1); // exactly one row survives 6 concurrent identical persist calls - never a duplicate, never fully deleted by another writer's tombstone step.
    const rowId = rows[0]!.id;
    for (const r of results) expect(r.idByNodeId.get("audit-race-801")).toBe(rowId); // every concurrent caller's own returned index agrees on the SAME real row id.
  });

  it("FINDING (zero mocking — real runAmendmentsStage + real orchestrator): the AMENDMENTS stage's inputHash is keyed on document LABEL only, not TEXT, so a text change that flips runAmendmentsStage's own real output is not detected", async () => {
    // runAmendmentsStage (lib/contract-model/compiler/stage-amendments.ts,
    // read verbatim, never mocked in this test) scans BOTH d.label AND
    // d.text.slice(0, 2000) for amendment markers. orchestrator.ts's own
    // cache-gating `amendmentsInputHash = hashParts(documents.map(d => d.label))`
    // (orchestrator.ts, AMENDMENTS stage) covers only `label`.
    const NON_AMENDMENT_TEXT = "Section 6.01. Indebtedness. The Borrower will not incur any Indebtedness, except as set forth below.";
    const NOW_AMENDMENT_SHAPED_TEXT = "AMENDMENT NO. 1 TO CREDIT AGREEMENT. This Amendment amends and restates Section 6.01 of the Credit Agreement, dated as of the date hereof.";
    const NEUTRAL_LABEL = "Credit Agreement"; // deliberately never mentions "amendment" - only d.text can flip runAmendmentsStage's real output here.

    const { runContractCompiler } = await import("../../lib/contract-model/compiler/orchestrator");

    const summary1 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NON_AMENDMENT_TEXT }] });
    const amendmentsStageResult1 = summary1.stages.find((s) => s.stage === "AMENDMENTS");
    expect(amendmentsStageResult1?.status).toBe("COMPLETED"); // NOT_APPLICABLE path — real runAmendmentsStage output for this text.

    // Same documentId/label, DIFFERENT text — now genuinely amendment-shaped.
    // A truly fresh call to runAmendmentsStage on this input would return
    // REVIEW_REQUIRED (verified directly, bypassing the orchestrator, below).
    const freshAmendmentsOutput = (await import("../../lib/contract-model/compiler/stage-amendments")).runAmendmentsStage([{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NOW_AMENDMENT_SHAPED_TEXT }]);
    expect(freshAmendmentsOutput.status).toBe("REVIEW_REQUIRED");

    const summary2 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NOW_AMENDMENT_SHAPED_TEXT }] });
    const amendmentsStageResult2 = summary2.stages.find((s) => s.stage === "AMENDMENTS");

    // THE DEFECT: the orchestrator's own persisted AMENDMENTS stage is
    // resumed (label unchanged => inputHash unchanged) and still reports
    // COMPLETED/NOT_APPLICABLE, even though the text is now genuinely
    // amendment-shaped and a real (unmocked) call to the same production
    // function on the same input returns REVIEW_REQUIRED.
    expect(amendmentsStageResult2?.status).toBe("COMPLETED"); // NOT REVIEW_REQUIRED — stale.
    expect(amendmentsStageResult2?.status).not.toBe(freshAmendmentsOutput.status);
  });
});
