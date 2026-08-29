/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Section 16 / §R (Cache
 * Invalidation Assurance). This file adds NEW, read-only-of-production-code
 * tests under tests/foundation-audit/ per the audit's own instructions.
 *
 * Phase 3F.1.4 UPDATE: the two P1 defects this file originally documented
 * (§R / 10-cache-invalidation-assurance.json — the STRUCTURE-stage cache
 * gate ignoring STRUCTURAL_INDEX_VERSION, and the AMENDMENTS-stage cache
 * gate ignoring document text) are now FIXED in orchestrator.ts
 * (structureInputHash now folds in STRUCTURAL_INDEX_VERSION;
 * amendmentsInputHash now folds in document text, not just label). The
 * tests below that originally proved the BUG's existence (labeled
 * "FINDING") are kept and their assertions FLIPPED to prove the FIX instead
 * — matching the precedent in
 * tests/contract-model/architecture-proposal-node-identity.test.ts's own
 * header comment ("asserting a bug's continued presence after it has been
 * deliberately fixed would be asserting the wrong thing, not preserving a
 * real safety gate"). Each such test keeps a comment explaining what the
 * original defect was, immediately above the new, corrected assertion.
 *
 * New tests were added for: a positive control proving legitimate
 * cache-hit/resume behavior still works (the whole reason this cache gate
 * exists — real cost/performance, not merely correctness) via BOTH an
 * "was the real stage function actually re-invoked" spy check AND a
 * "did ContractCompilerStage.attemptCount change" DB-level check (the
 * generic, mock-free signal: getOrRunStage only touches attemptCount when
 * it actually runs `run()`, never on a cache-hit resume); 8D replay
 * equivalence (fresh run vs. cache-hit replay produce identical canonical
 * output when nothing changed); and a documented, deliberate over-
 * invalidation trade-off for AMENDMENTS (a whitespace-only text edit that
 * cannot flip amendment-shaped detection still forces recompute, because
 * this stage is a free deterministic scan with no LLM cost — see the
 * matching comment in orchestrator.ts).
 *
 * The one test NOT touched by this update (persistStructuralNodes never
 * tombstoning an orphaned row) documents a DIFFERENT, still-open P1 defect
 * in persistence.ts, which is out of scope for this fix (a different
 * workstream's file) and is left exactly as the prior audit wrote it.
 *
 * Every test proves its claim against the REAL, UNMODIFIED orchestrator.ts
 * cache-gate formulas; the only things ever mocked are (a) stage-structure.ts's
 * exported runStructureStage function, standing in for "the structural
 * algorithm's output", and (b) the STRUCTURAL_INDEX_VERSION constant
 * exported from types.ts (a value-only export — the interfaces the module
 * also exports are erased at compile time and have no runtime presence to
 * disturb), standing in for "the structural algorithm's declared identity
 * bumped" — the same, real mechanism this codebase already uses everywhere
 * else for cache versioning (DISCOVERY_RUN_VERSION, COVERAGE_AUDIT_ALGORITHM_VERSION,
 * etc.). runAmendmentsStage is never mocked anywhere in this file — every
 * AMENDMENTS assertion runs the real, unmodified function.
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

async function stageRow(stage: "STRUCTURE" | "AMENDMENTS") {
  return prisma.contractCompilerStage.findFirst({ where: { run: { companyId: COMPANY_ID }, stage } });
}

describe("Section 16 / §R — cache invalidation assurance: STRUCTURE-stage cache gate vs. STRUCTURAL_INDEX_VERSION", () => {
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
    vi.doUnmock("../../lib/contract-model/compiler/types");
  });

  it("FIX PROOF (was FINDING): a STRUCTURAL_INDEX_VERSION bump over UNCHANGED document text now correctly forces recomputation, no longer silently resumed", async () => {
    // ORIGINAL DEFECT (pre-fix): orchestrator.ts's structureInputHash was
    // `hashParts(documents.map(d => \`${d.documentId}:${d.text}\`))` — a pure
    // function of document identity + raw text, never referencing
    // STRUCTURAL_INDEX_VERSION. A real version bump (the codebase's own,
    // disciplined mechanism for signalling "the structural-parsing
    // algorithm's identity changed" — see STRUCTURAL_INDEX_VERSION's own
    // doc comment in types.ts) over the SAME document text was therefore
    // invisible to getOrRunStage's cache-check, which resumed and
    // re-persisted the stale, pre-bump structural nodes forever.
    //
    // --- "Run 1": structural-algorithm version v1 ---
    vi.doMock("../../lib/contract-model/compiler/types", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/types")>("../../lib/contract-model/compiler/types");
      return { ...actual, STRUCTURAL_INDEX_VERSION: "audit-fixture-structural-version.v1" };
    });
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV1() }) };
    });
    const { runContractCompiler: runV1 } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary1 = await runV1({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    expect(summary1.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "VI"]);

    const stageRow1 = await stageRow("STRUCTURE");
    expect(stageRow1?.status).toBe("COMPLETED");
    const inputHashAfterV1 = stageRow1!.inputHash;
    const attemptCountAfterV1 = stageRow1!.attemptCount;

    // --- "Run 2": SAME document text, but the structural algorithm's
    // declared identity has been bumped (STRUCTURAL_INDEX_VERSION changed)
    // and would now find an extra section. No `force` passed — this must be
    // detected by the cache gate itself, not by an explicit override. ---
    vi.resetModules();
    vi.doMock("../../lib/contract-model/compiler/types", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/types")>("../../lib/contract-model/compiler/types");
      return { ...actual, STRUCTURAL_INDEX_VERSION: "audit-fixture-structural-version.v2" };
    });
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: () => ({ status: "COMPLETED" as const, output: makeNodesV2() }) };
    });
    const { runContractCompiler: runV2 } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary2 = await runV2({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });

    const stageRow2 = await stageRow("STRUCTURE");

    // THE FIX: the persisted STRUCTURE stage's inputHash CHANGES purely from
    // the version bump (document text/id are byte-identical to Run 1), so
    // getOrRunStage's cache-check correctly misses and re-runs — attemptCount
    // increments, and the real (mocked-as-"v2") algorithm's output actually
    // surfaces, rather than the stale v1 output being resumed.
    expect(stageRow2!.inputHash).not.toBe(inputHashAfterV1);
    expect(stageRow2!.attemptCount).toBe(attemptCountAfterV1 + 1);
    expect(summary2.structuralNodes.map((n) => n.sectionRef).sort()).toEqual(["6.01", "6.02", "VI"]); // v2's real output now surfaces.

    // And the persisted DocumentNode rows (via persistStructuralNodes, run
    // unmodified on every call) now correctly reflect the recomputed output.
    const persistedSections = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID, documentId: DOCUMENT_ID }, select: { sectionRef: true } });
    expect(persistedSections.map((n) => n.sectionRef).sort()).toEqual(["6.01", "6.02", "VI"]);
  });

  it("control: `force: true` correctly bypasses the cache and re-runs with the new algorithm regardless", async () => {
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

  it("positive control + 8D replay equivalence: UNCHANGED STRUCTURAL_INDEX_VERSION + UNCHANGED text correctly resumes (real cache-hit), never re-invoking the parser, and yields output identical to the original fresh run", async () => {
    // This is the other half of 8D and the reason this cache gate exists at
    // all (real cost/performance for a package re-run) — the fix above must
    // never make the gate over-fire and defeat that purpose for genuinely
    // unchanged input.
    const structureSpy = vi.fn(() => ({ status: "COMPLETED" as const, output: makeNodesV1() }));
    vi.doMock("../../lib/contract-model/compiler/stage-structure", async () => {
      const actual = await vi.importActual<typeof import("../../lib/contract-model/compiler/stage-structure")>("../../lib/contract-model/compiler/stage-structure");
      return { ...actual, runStructureStage: structureSpy };
    });
    const { runContractCompiler } = await import("../../lib/contract-model/compiler/orchestrator");
    const input = { companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] };

    // "Fresh run".
    const fresh = await runContractCompiler(input);
    expect(structureSpy).toHaveBeenCalledTimes(1);
    const rowAfterFresh = await stageRow("STRUCTURE");
    const attemptCountAfterFresh = rowAfterFresh!.attemptCount;
    const inputHashAfterFresh = rowAfterFresh!.inputHash;

    // "Cache/replay run" - identical input, no force.
    const replay = await runContractCompiler(input);

    // Real cache-hit: the actual structural-parsing function is never
    // re-invoked, and the persisted stage row's attemptCount (which
    // getOrRunStage only ever touches inside its own `run()` branch) is
    // untouched - the generic, mock-free signal that this was a resume, not
    // a recompute.
    expect(structureSpy).toHaveBeenCalledTimes(1);
    const rowAfterReplay = await stageRow("STRUCTURE");
    expect(rowAfterReplay!.attemptCount).toBe(attemptCountAfterFresh);
    expect(rowAfterReplay!.inputHash).toBe(inputHashAfterFresh);

    // 8D replay equivalence: the cache-hit replay's canonical output is
    // exactly the fresh run's output - a resumed stage must never silently
    // diverge from what a fresh computation actually produced.
    expect(replay.structuralNodes).toEqual(fresh.structuralNodes);
  });

  // Phase 3F.1.4 (P1-9 remediation, Workstream B) updated this test's own
  // assertions: persistStructuralNodes (lib/contract-model/compiler/
  // persistence.ts) now tombstones, inside the same transaction as its
  // upserts, any previously-persisted row for a document actually
  // represented in its input whose stableKey the current run no longer
  // produces. Asserting the orphan's continued survival after this has been
  // deliberately fixed would be asserting the wrong thing, not preserving a
  // real safety gate - matching the precedent set by tests/contract-model/
  // architecture-proposal-node-identity.test.ts's own header comment for the
  // same situation.
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
});

describe("Section 16 / §R — cache invalidation assurance: AMENDMENTS-stage cache gate vs. document text", () => {
  const NON_AMENDMENT_TEXT = "Section 6.01. Indebtedness. The Borrower will not incur any Indebtedness, except as set forth below.";
  const NOW_AMENDMENT_SHAPED_TEXT = "AMENDMENT NO. 1 TO CREDIT AGREEMENT. This Amendment amends and restates Section 6.01 of the Credit Agreement, dated as of the date hereof.";
  const NEUTRAL_LABEL = "Credit Agreement"; // deliberately never mentions "amendment" - only d.text can flip runAmendmentsStage's real output here.

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
  });

  it("FIX PROOF (was FINDING, zero mocking — real runAmendmentsStage + real orchestrator): a text change that flips runAmendmentsStage's own real output now correctly forces recomputation", async () => {
    // ORIGINAL DEFECT (pre-fix): amendmentsInputHash was
    // `hashParts(documents.map(d => d.label))` — label only — while the real
    // runAmendmentsStage (stage-amendments.ts, never mocked, read verbatim)
    // scans BOTH d.label AND d.text.slice(0, 2000). Same documentId/label,
    // text edited from ordinary prose to a genuinely amendment-shaped
    // preamble, used to be resumed as stale COMPLETED/NOT_APPLICABLE.
    const { runContractCompiler } = await import("../../lib/contract-model/compiler/orchestrator");

    const summary1 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NON_AMENDMENT_TEXT }] });
    const amendmentsStageResult1 = summary1.stages.find((s) => s.stage === "AMENDMENTS");
    expect(amendmentsStageResult1?.status).toBe("COMPLETED"); // NOT_APPLICABLE path — real runAmendmentsStage output for this text.
    const rowAfter1 = await stageRow("AMENDMENTS");
    const hashAfter1 = rowAfter1!.inputHash;
    const attemptCountAfter1 = rowAfter1!.attemptCount;

    // Same documentId/label, DIFFERENT text — now genuinely amendment-shaped.
    // A truly fresh call to runAmendmentsStage on this input returns
    // REVIEW_REQUIRED (verified directly, bypassing the orchestrator, below).
    const freshAmendmentsOutput = (await import("../../lib/contract-model/compiler/stage-amendments")).runAmendmentsStage([{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NOW_AMENDMENT_SHAPED_TEXT }]);
    expect(freshAmendmentsOutput.status).toBe("REVIEW_REQUIRED");

    const summary2 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NOW_AMENDMENT_SHAPED_TEXT }] });
    const amendmentsStageResult2 = summary2.stages.find((s) => s.stage === "AMENDMENTS");
    const rowAfter2 = await stageRow("AMENDMENTS");

    // THE FIX: the text-only change (label unchanged) now changes
    // amendmentsInputHash, so getOrRunStage correctly misses cache and
    // re-runs the real function — attemptCount increments, and the
    // orchestrator's own AMENDMENTS stage now matches what a truly fresh
    // call to the same production function on the same input produces.
    expect(rowAfter2!.inputHash).not.toBe(hashAfter1);
    expect(rowAfter2!.attemptCount).toBe(attemptCountAfter1 + 1);
    expect(amendmentsStageResult2?.status).toBe("REVIEW_REQUIRED");
    expect(amendmentsStageResult2?.status).toBe(freshAmendmentsOutput.status);
  });

  it("adversarial variant: a whitespace-only text edit that does NOT flip amendment-shaped detection still forces recompute (documented, deliberate over-invalidation trade-off)", async () => {
    // Design decision (see the matching comment in orchestrator.ts):
    // amendmentsInputHash hashes the FULL text, not only the 2000-char
    // window runAmendmentsStage actually reads, and does not attempt to
    // fingerprint "only the part that matters to AMENDMENT_MARKERS". A
    // whitespace-only edit therefore forces a recompute even though the
    // real function's classification cannot change. This is intentionally
    // conservative (over-invalidation, never under-invalidation): AMENDMENTS
    // is a free deterministic regex scan with zero LLM cost, so the
    // performance cost of this false-positive recompute is negligible,
    // while a smarter content-fingerprint that tried to track exactly what
    // AMENDMENT_MARKERS cares about would be strictly more fragile for no
    // measurable benefit on this particular stage.
    const { runContractCompiler } = await import("../../lib/contract-model/compiler/orchestrator");
    const summary1 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NON_AMENDMENT_TEXT }] });
    const rowAfter1 = await stageRow("AMENDMENTS");
    const hashAfter1 = rowAfter1!.inputHash;
    const attemptCountAfter1 = rowAfter1!.attemptCount;

    const WHITESPACE_ONLY_EDIT = `${NON_AMENDMENT_TEXT}\n\n   `; // trailing whitespace only - AMENDMENT_MARKERS still does not match.
    const summary2 = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: WHITESPACE_ONLY_EDIT }] });
    const rowAfter2 = await stageRow("AMENDMENTS");

    expect(rowAfter2!.inputHash).not.toBe(hashAfter1); // forced recompute...
    expect(rowAfter2!.attemptCount).toBe(attemptCountAfter1 + 1); // ...genuinely re-ran (not resumed)...
    expect(summary2.stages.find((s) => s.stage === "AMENDMENTS")?.status).toBe(summary1.stages.find((s) => s.stage === "AMENDMENTS")?.status); // ...yet the real classification outcome is unchanged, as expected.
  });

  it("positive control + 8D replay equivalence: UNCHANGED label + UNCHANGED text correctly resumes AMENDMENTS (real cache-hit), and replay output is identical to the fresh run", async () => {
    const { runContractCompiler } = await import("../../lib/contract-model/compiler/orchestrator");
    const input = { companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: NEUTRAL_LABEL, text: NON_AMENDMENT_TEXT }] };

    const fresh = await runContractCompiler(input);
    const rowAfterFresh = await stageRow("AMENDMENTS");
    const attemptCountAfterFresh = rowAfterFresh!.attemptCount;
    const hashAfterFresh = rowAfterFresh!.inputHash;

    const replay = await runContractCompiler(input); // identical input, no force.
    const rowAfterReplay = await stageRow("AMENDMENTS");

    expect(rowAfterReplay!.attemptCount).toBe(attemptCountAfterFresh); // never re-ran - real cache-hit.
    expect(rowAfterReplay!.inputHash).toBe(hashAfterFresh);
    expect(replay.stages.find((s) => s.stage === "AMENDMENTS")).toEqual(fresh.stages.find((s) => s.stage === "AMENDMENTS")); // 8D replay equivalence.
  });
});
