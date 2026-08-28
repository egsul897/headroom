/**
 * Foundation Audit (Section 19) - Part 1: Systematic Fault Injection,
 * persistence layer, against the REAL live Postgres (DATABASE_URL set,
 * schema migrated). Uses uniquely-prefixed fixture ids (`audit-g-*`) and
 * tears down in afterAll - never touches existing coherent/matthews/fwrg/lsb
 * rows. AUDIT-ONLY: no production code under lib/ is modified by this file.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { persistStructuralNodes, persistStructuralDefinitions, persistDefinedTerms, persistStructuralReferences, resolveUniquePersistedNodeByRef } from "../../lib/contract-model/compiler/persistence";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import type { DetectedReference } from "../../lib/contract-model/compiler/structural-references";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { CandidateDefinedTerm } from "../../lib/contract-model/types";

const COMPANY = "audit-g-persist-co";
const COMPANY_2 = "audit-g-persist-co-2";
const DOC_1 = "audit-g-persist-doc-1";
const DOC_2 = "audit-g-persist-doc-2";
const DOC_3 = "audit-g-persist-doc-3";

const TEXT_1 = "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) the Senior Obligations; (b) other Indebtedness. Section 6.02. Liens. \"Permitted Liens\" means Liens described on Schedule 6.02.";
const TEXT_2 = "Section 7.01. Restricted Payments. The Company shall not make Restricted Payments, except: (a) dividends permitted hereunder.";

async function teardown() {
  await prisma.contractReferenceEdge.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
  await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
  await prisma.documentNode.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
  await prisma.document.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY, COMPANY_2] } } });
}

describe("Persistence fault injection (real DB)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY, name: "Audit-G Persist Co (test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: COMPANY_2, name: "Audit-G Persist Co 2 (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOC_1, companyId: COMPANY, name: "Audit-G Doc 1", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOC_2, companyId: COMPANY, name: "Audit-G Doc 2", type: "INDENTURE" } });
    await prisma.document.create({ data: { id: DOC_3, companyId: COMPANY_2, name: "Audit-G Doc 3 (other tenant)", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.contractReferenceEdge.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
    await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
    await prisma.documentNode.deleteMany({ where: { companyId: { in: [COMPANY, COMPANY_2] } } });
  });

  describe("Duplicate ingestion (persist the SAME structural nodes twice)", () => {
    it("is idempotent - no duplicate rows, matching 3F.1.2's own claim", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      await persistStructuralNodes(COMPANY, nodes);
      const countAfterFirst = await prisma.documentNode.count({ where: { companyId: COMPANY, documentId: DOC_1 } });
      await persistStructuralNodes(COMPANY, nodes);
      const countAfterSecond = await prisma.documentNode.count({ where: { companyId: COMPANY, documentId: DOC_1 } });
      expect(countAfterSecond).toBe(countAfterFirst);
      expect(countAfterFirst).toBeGreaterThan(0);
    });
  });

  describe("Persistence replay with SLIGHTLY different node data for the same stableKey", () => {
    it("update path correctly applies the new heading/span, not merely idempotent-when-identical", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      await persistStructuralNodes(COMPANY, nodes);
      const before = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_1, sectionRef: "6.01" } });
      expect(before.heading).toBe("Indebtedness");

      // Replay with the SAME charStart (same stableKey) but a different heading - simulates a re-extraction that fixed a mis-parsed title.
      const mutated: StructuralNode[] = nodes.map((n) => (n.sectionRef === "6.01" ? { ...n, heading: "Indebtedness (Revised Title)" } : n));
      await persistStructuralNodes(COMPANY, mutated);
      const after = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_1, sectionRef: "6.01" } });
      expect(after.id).toBe(before.id); // same row, updated in place
      expect(after.heading).toBe("Indebtedness (Revised Title)"); // update path really applies new data
      const count = await prisma.documentNode.count({ where: { companyId: COMPANY, documentId: DOC_1 } });
      expect(count).toBe(nodes.length); // no stray extra row
    });
  });

  describe("Corrupted persisted relation: parentId points to a row that was since deleted", () => {
    it("(a) DIRECT parent-row deletion is actually protected by a real DB constraint (ON DELETE SET NULL, see migration.sql) - the child's parentId is atomically nulled, never left dangling; this is NOT a gap", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      await persistStructuralNodes(COMPANY, nodes);
      const parent = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_1, sectionRef: "6.01" } });
      const child = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_1, sectionRef: "6.01(a)" } });
      expect(child.parentId).toBe(parent.id);
      await prisma.documentNode.delete({ where: { id: parent.id } });
      const reread = await prisma.documentNode.findUnique({ where: { id: child.id } });
      expect(reread).not.toBeNull();
      expect(reread!.parentId).toBeNull(); // FK-enforced SET NULL - the DB itself closes this gap, independent of any application code.
    });

    it("(b) a STALE in-memory PersistedNodeIndex (built before a concurrent row deletion) crashes persistStructuralReferences with an uncaught FK violation rather than degrading gracefully - a real gap, not covered by (a)'s protection", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndex = await persistStructuralNodes(COMPANY, nodes);
      const sourceNode = nodes.find((n) => n.sectionRef === "6.01(a)")!;
      const sourceRowId = nodeIndex.idByNodeId.get(sourceNode.nodeId)!;
      // Simulate a "replaced source document" mid-run: the row this in-memory nodeIndex still references is deleted out from under it
      // (e.g. a concurrent re-ingestion of the same document, or an operator-triggered document replacement) BEFORE a later stage
      // (persistStructuralReferences) uses the now-stale nodeIndex to create a brand-new edge row.
      await prisma.documentNode.delete({ where: { id: sourceRowId } });

      const staleRef: DetectedReference = { documentId: DOC_1, sourceNodeKey: null, sourceNodeId: sourceNode.nodeId, targetNodeKey: null, targetNodeId: null, referenceText: "Section 6.02", resolved: false, unresolvedReason: "test", charStart: 0, charEnd: 10 } as unknown as DetectedReference;

      let threw: unknown = null;
      try {
        await persistStructuralReferences(COMPANY, [staleRef], nodeIndex);
      } catch (err) {
        threw = err;
      }
      // CONFIRMED GAP: this throws an uncaught PrismaClientKnownRequestError (P2003, foreign key constraint violation) straight out of
      // persistStructuralReferences - there is no try/catch here, unlike discovery/pipeline.ts's per-section fault isolation (Phase 2F.2).
      // A caller that does not wrap this call itself will have this ONE stale reference abort the ENTIRE references-persistence step for
      // the whole document, not just this one reference - a narrower failure-isolation gap than Phase 2F.2 already closed for discovery.
      expect(threw).not.toBeNull();
      expect(String(threw)).toMatch(/Foreign key constraint|P2003/);
    });
  });

  describe("Cross-document definition leakage at the PERSISTENCE layer - persistStructuralDefinitions (dead code, never called by orchestrator.ts) - FIXED (P0-2 remediation)", () => {
    // Phase 3F.1.4 (P0-2 remediation) updated this test's own assertions:
    // computeStableKey('defined-term', companyId, def.documentId, def.normalizedTerm)
    // now includes documentId, so two documents' own definitions of the
    // identically-named term persist as two genuinely separate,
    // internally-consistent rows instead of colliding onto one
    // contradictory row. Asserting the collision's continued presence
    // after it has been deliberately fixed would be asserting the wrong
    // thing, not preserving a real safety gate - matching the precedent set
    // by tests/contract-model/architecture-proposal-node-identity.test.ts's
    // own header comment for the same situation.
    it("stableKey now includes documentId - two documents' own DIFFERENT definitions of the identically-named term persist as two separate, internally-consistent rows, never colliding", async () => {
      const nodesA = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodesB = parseDocumentStructure({ documentId: DOC_2, label: "Indenture", text: TEXT_1.replace("Schedule 6.02", "Schedule 9.02 of the Indenture") });
      const nodeIndexA = await persistStructuralNodes(COMPANY, nodesA);
      const nodeIndexB = await persistStructuralNodes(COMPANY, nodesB);
      const defsA = detectStructuralDefinitions(DOC_1, TEXT_1, nodesA); // declares "Permitted Liens"
      const defsB = detectStructuralDefinitions(DOC_2, TEXT_1.replace("Schedule 6.02", "Schedule 9.02 of the Indenture"), nodesB); // ALSO declares "Permitted Liens" - a different document, a legitimately different definition in real drafting

      await persistStructuralDefinitions(COMPANY, defsA, nodeIndexA);
      const afterA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, normalizedName: "permitted liens", documentId: DOC_1 } });
      expect(afterA.documentId).toBe(DOC_1);

      await persistStructuralDefinitions(COMPANY, defsB, nodeIndexB);
      const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, normalizedName: "permitted liens" }, orderBy: { documentId: "asc" } });
      expect(rows).toHaveLength(2); // FIXED: two distinct documents' own definitions of "Permitted Liens" now persist as two genuinely separate rows.
      expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([DOC_1, DOC_2]));
      expect(rows.map((r) => r.id)).not.toContain(undefined);
      expect(new Set(rows.map((r) => r.id)).size).toBe(2); // two distinct row ids, never the same row silently reused.

      // Each row is now internally CONSISTENT: its own documentId and its own sourceNodeId's documentId always agree (never one for Alpha's document, one for Beta's, on the SAME row).
      for (const row of rows) {
        const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: row.sourceNodeId! } });
        expect(sourceNode.documentId).toBe(row.documentId);
      }
    });

    it("re-persisting the SAME document's definitions again (idempotent replay) still converges on that document's own single row - the fix adds document scoping, it does not regress idempotency", async () => {
      const nodesA = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndexA = await persistStructuralNodes(COMPANY, nodesA);
      const defsA = detectStructuralDefinitions(DOC_1, TEXT_1, nodesA);

      await persistStructuralDefinitions(COMPANY, defsA, nodeIndexA);
      const firstRow = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, normalizedName: "permitted liens", documentId: DOC_1 } });
      await persistStructuralDefinitions(COMPANY, defsA, nodeIndexA); // exact same input, replayed
      const rowsAfterReplay = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, normalizedName: "permitted liens", documentId: DOC_1 } });
      expect(rowsAfterReplay).toHaveLength(1);
      expect(rowsAfterReplay[0]!.id).toBe(firstRow.id); // same row, updated in place - not a second insert.
    });
  });

  describe("Cross-document definition leakage - persistDefinedTerms (the LLM-candidate path actually wired into orchestrator.ts) - FIXED (P0-2 remediation)", () => {
    // Phase 3F.1.4 (P0-2 remediation) updated this test's own assertions -
    // see the sibling describe block immediately above for the full
    // rationale (matches tests/contract-model/architecture-proposal-node-
    // identity.test.ts's own precedent for updating a test after a
    // deliberate fix).
    it("stableKey now includes documentId - the production-wired function no longer collides two unrelated documents' own same-named terms", async () => {
      const termA: CandidateDefinedTerm = { termName: "Applicable Margin", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm;
      const termB: CandidateDefinedTerm = { termName: "Applicable Margin", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm;
      await persistDefinedTerms(COMPANY, DOC_1, [termA]);
      const afterA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, normalizedName: "applicable margin", documentId: DOC_1 } });
      expect(afterA.documentId).toBe(DOC_1);

      await persistDefinedTerms(COMPANY, DOC_2, [termB]); // a SECOND, unrelated document in the SAME company that also defines "Applicable Margin" (an extremely common term name across multiple credit facilities for one borrower)
      const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, normalizedName: "applicable margin" }, orderBy: { documentId: "asc" } });
      expect(rows).toHaveLength(2); // FIXED: DOC_2's own term is now its own separate, reachable row - never a silent collision into DOC_1's row identity.
      expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([DOC_1, DOC_2]));
      const doc2Row = rows.find((r) => r.documentId === DOC_2)!;
      expect(doc2Row).toBeDefined();
      expect(doc2Row.id).not.toBe(afterA.id);
    });

    it("generalized adversarial variant: THREE documents (not just two) in one company all defining the identically-named term, with case/whitespace variation, all persist as three separate rows", async () => {
      const DOC_3_LOCAL = "audit-g-persist-doc-3-defterms"; // a third document, distinct from the shared DOC_3 fixture (which belongs to COMPANY_2 in this file's own setup)
      await prisma.document.create({ data: { id: DOC_3_LOCAL, companyId: COMPANY, name: "Audit-G Doc 3 (defined-terms variant)", type: "CREDIT_AGREEMENT" } });
      try {
        const variants: [string, CandidateDefinedTerm][] = [
          [DOC_1, { termName: "Consolidated EBITDA", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm],
          [DOC_2, { termName: "consolidated ebitda", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm], // lowercase variant - same normalizedName
          [DOC_3_LOCAL, { termName: "  Consolidated   EBITDA  ", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm], // extra whitespace variant - CandidateDefinedTerm's own termName.toLowerCase() does NOT collapse internal whitespace, so this is a genuinely different normalizedName; included to prove the fix handles it as a real, distinct, correctly-scoped row rather than mis-colliding it with the other two.
        ];
        for (const [documentId, term] of variants) await persistDefinedTerms(COMPANY, documentId, [term]);

        const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, documentId: { in: [DOC_1, DOC_2, DOC_3_LOCAL] }, normalizedName: { contains: "consolidated" } } });
        expect(rows).toHaveLength(3); // three documents, three separate rows - no cross-document collision regardless of case/whitespace variation.
        expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([DOC_1, DOC_2, DOC_3_LOCAL]));
        expect(new Set(rows.map((r) => r.id)).size).toBe(3);
      } finally {
        await prisma.definedTermNode.deleteMany({ where: { companyId: COMPANY, documentId: DOC_3_LOCAL } });
        await prisma.document.deleteMany({ where: { id: DOC_3_LOCAL } });
      }
    });

    it("concurrent-write safety: repeated concurrent persistDefinedTerms calls for the SAME colliding (company, document, term) resolve to one consistent, correct row - never a duplicate, never a race", async () => {
      const term: CandidateDefinedTerm = { termName: "Concurrent Term", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm;
      await Promise.all(Array.from({ length: 8 }, () => persistDefinedTerms(COMPANY, DOC_1, [term])));
      const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, documentId: DOC_1, normalizedName: "concurrent term" } });
      expect(rows).toHaveLength(1); // Postgres's own (companyId, stableKey) unique constraint + upsert resolves 8 concurrent writers to exactly one row.
    });
  });

  describe("Persistence reload + duplicated labels: resolveUniquePersistedNodeByRef after a real DB round-trip", () => {
    it("two colliding-label-but-distinct-nodeId occurrences reload from DB and still correctly report ambiguous, not just in-memory", async () => {
      const a: StructuralNode = { documentId: DOC_1, nodeType: "SECTION", heading: "First", sectionRef: "9.09", nodeKey: `${DOC_1}::9.09`, nodeId: "audit-g-nodeA", charStart: 5, charEnd: 50, ordinal: 0, parentSectionRef: null, parentNodeId: null };
      const b: StructuralNode = { documentId: DOC_1, nodeType: "SECTION", heading: "Second", sectionRef: "9.09", nodeKey: `${DOC_1}::9.09`, nodeId: "audit-g-nodeB", charStart: 900, charEnd: 950, ordinal: 1, parentSectionRef: null, parentNodeId: null };
      const nodeIndex = await persistStructuralNodes(COMPANY, [a, b]);
      expect(resolveUniquePersistedNodeByRef(nodeIndex, DOC_1, "9.09")).toBeUndefined(); // in-memory, immediately after persisting

      // Simulate a genuine reload: rebuild a PersistedNodeIndex purely from freshly-queried DB rows (a new process resuming, never reusing the in-memory nodeIndex object).
      const rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: DOC_1, sectionRef: "9.09" } });
      expect(rows).toHaveLength(2);
      const reloadedIndex = { idByNodeId: new Map<string, string>(), idsByLegalRef: new Map<string, string[]>([[`${DOC_1}::9.09`, rows.map((r) => r.id)]]) };
      expect(resolveUniquePersistedNodeByRef(reloadedIndex, DOC_1, "9.09")).toBeUndefined(); // still correctly AMBIGUOUS after a real round-trip, not silently resolved to whichever row query order returned first.
    });
  });

  describe("Independent spot-check: cross-tenant leakage via persistStructuralNodes/persistDefinedTerms (own fixture, per coordination note)", () => {
    it("identical section numbers and identical term names for two DIFFERENT companies never collide on stableKey (companyId is part of every stableKey)", async () => {
      const nodesCo1 = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodesCo2 = parseDocumentStructure({ documentId: DOC_3, label: "CA", text: TEXT_1 }); // identical content, different company via DOC_3
      await persistStructuralNodes(COMPANY, nodesCo1);
      await persistStructuralNodes(COMPANY_2, nodesCo2);
      const co1Rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY } });
      const co2Rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY_2 } });
      expect(new Set(co1Rows.map((r) => r.id)).size).toBe(co1Rows.length);
      expect(co1Rows.every((r) => r.companyId === COMPANY)).toBe(true);
      expect(co2Rows.every((r) => r.companyId === COMPANY_2)).toBe(true);
      expect(new Set([...co1Rows.map((r) => r.id), ...co2Rows.map((r) => r.id)]).size).toBe(co1Rows.length + co2Rows.length); // zero id overlap

      const termA: CandidateDefinedTerm = { termName: "Permitted Liens", sourceSectionRef: "6.02", entityScope: [] } as unknown as CandidateDefinedTerm;
      await persistDefinedTerms(COMPANY, DOC_1, [termA]);
      await persistDefinedTerms(COMPANY_2, DOC_3, [termA]);
      const termRows = await prisma.definedTermNode.findMany({ where: { normalizedName: "permitted liens", companyId: { in: [COMPANY, COMPANY_2] } }, orderBy: { companyId: "asc" } });
      expect(termRows).toHaveLength(2); // NOT collapsed - companyId is (and always was) part of persistDefinedTerms' stableKey, and (post-P0-2 remediation) documentId now is too. Confirms tenant isolation holds here.
      expect(new Set(termRows.map((r) => r.companyId))).toEqual(new Set([COMPANY, COMPANY_2]));
    });
  });

  describe("Phase 3F.1.4 (P1-9 remediation) - persistStructuralReferences idempotency + tombstone lifecycle", () => {
    it("replaying the SAME document's reference-detection pass twice is now idempotent - no duplicate ContractReferenceEdge rows (previously this function used a plain `.create()` with no stableKey at all, so every replay duplicated every edge)", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndex = await persistStructuralNodes(COMPANY, nodes);
      const refs = detectStructuralReferences(DOC_1, TEXT_1, nodes);
      expect(refs.length).toBeGreaterThan(0);

      await persistStructuralReferences(COMPANY, refs, nodeIndex);
      const countAfterFirst = await prisma.contractReferenceEdge.count({ where: { companyId: COMPANY } });
      await persistStructuralReferences(COMPANY, refs, nodeIndex); // identical replay
      const countAfterSecond = await prisma.contractReferenceEdge.count({ where: { companyId: COMPANY } });
      expect(countAfterSecond).toBe(countAfterFirst); // FIXED: no longer doubles on replay.
      expect(countAfterFirst).toBeGreaterThan(0);
    });

    it("a corrected reference-detection pass that stops emitting a spurious reference tombstones the stale edge (P1-9) - the orphan no longer survives", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndex = await persistStructuralNodes(COMPANY, nodes);
      const refs = detectStructuralReferences(DOC_1, TEXT_1, nodes);
      await persistStructuralReferences(COMPANY, refs, nodeIndex);
      const countBefore = await prisma.contractReferenceEdge.count({ where: { companyId: COMPANY } });
      expect(countBefore).toBeGreaterThan(1);

      // "Corrected algorithm": stops emitting the LAST detected reference (simulates a fixed false-positive).
      const correctedRefs = refs.slice(0, -1);
      await persistStructuralReferences(COMPANY, correctedRefs, nodeIndex);
      const countAfter = await prisma.contractReferenceEdge.count({ where: { companyId: COMPANY } });
      expect(countAfter).toBe(correctedRefs.length); // the dropped reference's own edge is gone, not merely un-updated.
    });

    it("negative control: the LLM-candidate reference path (persistReferences), which never sets a stableKey, is never touched by persistStructuralReferences' own tombstone step", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndex = await persistStructuralNodes(COMPANY, nodes);
      const { persistReferences } = await import("../../lib/contract-model/compiler/persistence");
      const candidateRef = { referenceType: "SUBJECT_TO", referenceText: "an LLM-candidate reference, no stableKey", targetSectionRef: null } as unknown as import("../../lib/contract-model/types").CandidateContractReference;
      await persistReferences(COMPANY, DOC_1, [candidateRef], nodeIndex);
      const llmRowBefore = await prisma.contractReferenceEdge.findFirstOrThrow({ where: { companyId: COMPANY, referenceText: "an LLM-candidate reference, no stableKey" } });
      expect(llmRowBefore.stableKey).toBeNull();

      // Now run persistStructuralReferences for the SAME document with an EMPTY detected-reference list - if the tombstone step were not scoped to non-null stableKeys, this could wipe the LLM-candidate row too.
      await persistStructuralReferences(COMPANY, [], nodeIndex);
      const llmRowAfter = await prisma.contractReferenceEdge.findFirst({ where: { id: llmRowBefore.id } });
      expect(llmRowAfter).not.toBeNull(); // untouched.
    });

    it("concurrent-write safety: repeated concurrent persistStructuralReferences calls for the SAME colliding reference resolve to one consistent row, never a duplicate", async () => {
      const nodes = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodeIndex = await persistStructuralNodes(COMPANY, nodes);
      const refs = detectStructuralReferences(DOC_1, TEXT_1, nodes);
      expect(refs.length).toBeGreaterThan(0);
      await Promise.all(Array.from({ length: 6 }, () => persistStructuralReferences(COMPANY, refs, nodeIndex)));
      const count = await prisma.contractReferenceEdge.count({ where: { companyId: COMPANY } });
      expect(count).toBe(refs.length); // 6 concurrent identical replays still converge on exactly one row per real reference.
    });
  });
});
