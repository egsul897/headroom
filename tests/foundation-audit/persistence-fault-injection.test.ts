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

  describe("Cross-document definition leakage at the PERSISTENCE layer - persistStructuralDefinitions (dead code, never called by orchestrator.ts)", () => {
    it("stableKey = computeStableKey('defined-term', companyId, def.normalizedTerm) has NO documentId component - two documents' own DIFFERENT definitions of the identically-named term collide onto ONE row", async () => {
      const nodesA = parseDocumentStructure({ documentId: DOC_1, label: "CA", text: TEXT_1 });
      const nodesB = parseDocumentStructure({ documentId: DOC_2, label: "Indenture", text: TEXT_1.replace("Schedule 6.02", "Schedule 9.02 of the Indenture") });
      const nodeIndexA = await persistStructuralNodes(COMPANY, nodesA);
      const nodeIndexB = await persistStructuralNodes(COMPANY, nodesB);
      const defsA = detectStructuralDefinitions(DOC_1, TEXT_1, nodesA); // declares "Permitted Liens"
      const defsB = detectStructuralDefinitions(DOC_2, TEXT_1.replace("Schedule 6.02", "Schedule 9.02 of the Indenture"), nodesB); // ALSO declares "Permitted Liens" - a different document, a legitimately different definition in real drafting

      await persistStructuralDefinitions(COMPANY, defsA, nodeIndexA);
      const afterA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, normalizedName: "permitted liens" } });
      expect(afterA.documentId).toBe(DOC_1);

      await persistStructuralDefinitions(COMPANY, defsB, nodeIndexB);
      const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, normalizedName: "permitted liens" } });
      expect(rows).toHaveLength(1); // CONFIRMED BUG: two distinct documents' own definitions of "Permitted Liens" collapse to ONE persisted row, not two.
      const afterB = rows[0]!;
      expect(afterB.id).toBe(afterA.id); // same row silently reused across documents
      expect(afterB.documentId).toBe(DOC_1); // `documentId` column is never updated on the upsert's update branch - it stays pinned to whichever document created the row first...
      const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: afterB.sourceNodeId! } });
      expect(sourceNode.documentId).toBe(DOC_2); // ...while sourceNodeId now points into DOC_2's own structural tree. The row is now internally inconsistent: documentId says DOC_1, sourceNodeId's real node says DOC_2.
    });
  });

  describe("Cross-document definition leakage - persistDefinedTerms (the LLM-candidate path actually wired into orchestrator.ts)", () => {
    it("same stableKey shape (companyId + lowercased term only) reproduces the identical collision for the function real production code calls", async () => {
      const termA: CandidateDefinedTerm = { termName: "Applicable Margin", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm;
      const termB: CandidateDefinedTerm = { termName: "Applicable Margin", sourceSectionRef: "1.01", entityScope: [] } as unknown as CandidateDefinedTerm;
      await persistDefinedTerms(COMPANY, DOC_1, [termA]);
      const afterA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, normalizedName: "applicable margin" } });
      expect(afterA.documentId).toBe(DOC_1);

      await persistDefinedTerms(COMPANY, DOC_2, [termB]); // a SECOND, unrelated document in the SAME company that also defines "Applicable Margin" (an extremely common term name across multiple credit facilities for one borrower)
      const rows = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY, normalizedName: "applicable margin" } });
      expect(rows).toHaveLength(1); // CONFIRMED: identical collision in the production-wired function.
      expect(rows[0]!.documentId).toBe(DOC_1); // DOC_2's own term silently vanishes into DOC_1's row identity - DOC_2's "Applicable Margin" is now unreachable by (companyId, DOC_2, "applicable margin").
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
      expect(termRows).toHaveLength(2); // NOT collapsed - companyId IS part of persistDefinedTerms' stableKey (unlike documentId, which is not). Confirms tenant isolation holds here even though document isolation for this same function does not.
      expect(new Set(termRows.map((r) => r.companyId))).toEqual(new Set([COMPANY, COMPANY_2]));
    });
  });
});
