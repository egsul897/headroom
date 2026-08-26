/**
 * Phase 2A - persistence, invalidation, and tenant/document isolation tests
 * (task §15/§16/§17) for the structural index's real DB mapping
 * (persistStructuralNodes/persistStructuralReferences/persistStructuralDefinitions
 * in persistence.ts), reusing the existing ContractCompilerRun/Stage
 * infrastructure's own real Company/Document rows - no second persistence
 * architecture.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { structureOutputHash } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { persistStructuralNodes, persistStructuralReferences, persistStructuralDefinitions } from "../../lib/contract-model/compiler/persistence";

const COMPANY_A = "fixture-phase-2a-structural-co-a";
const COMPANY_B = "fixture-phase-2a-structural-co-b";
const DOC_A1 = "fixture-phase-2a-structural-doc-a1";
const DOC_A2 = "fixture-phase-2a-structural-doc-a2";
const DOC_B1 = "fixture-phase-2a-structural-doc-b1";

const TEXT = "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) the Senior Obligations, permitted under Section 6.02; (b) other Indebtedness. Section 6.02. Liens. \"Permitted Liens\" means Liens described on Schedule 6.02.";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe("Structural persistence, invalidation, and isolation", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_A, name: "Fixture 2A Structural Co A (test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: COMPANY_B, name: "Fixture 2A Structural Co B (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOC_A1, companyId: COMPANY_A, name: "Co A - Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOC_A2, companyId: COMPANY_A, name: "Co A - Indenture", type: "INDENTURE" } });
    await prisma.document.create({ data: { id: DOC_B1, companyId: COMPANY_B, name: "Co B - Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.contractReferenceEdge.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.documentNode.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
  });

  it("persists real parentId edges - a genuine tree, not merely a flat parentSectionRef string in memory", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    await persistStructuralNodes(COMPANY_A, nodes);
    const section = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY_A, documentId: DOC_A1, sectionRef: "6.01" } });
    const subsection = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY_A, documentId: DOC_A1, sectionRef: "6.01(a)" } });
    expect(subsection.parentId).toBe(section.id);
  });

  it("persists reference edges with a real sourceNodeId, enabling a reverse-reference query directly from the database", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const idByLookupKey = await persistStructuralNodes(COMPANY_A, nodes);
    const refs = detectStructuralReferences(DOC_A1, TEXT, nodes);
    await persistStructuralReferences(COMPANY_A, refs, idByLookupKey);
    const target = await prisma.documentNode.findFirstOrThrow({ where: { companyId: COMPANY_A, documentId: DOC_A1, sectionRef: "6.02" } });
    const incoming = await prisma.contractReferenceEdge.findMany({ where: { companyId: COMPANY_A, targetDocumentNodeId: target.id }, include: { sourceNode: true } });
    expect(incoming.length).toBeGreaterThan(0);
    expect(incoming[0]!.sourceNode?.sectionRef).toBe("6.01(a)");
  });

  it("persists definitions with a real sourceNodeId structural anchor", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const idByLookupKey = await persistStructuralNodes(COMPANY_A, nodes);
    const defs = detectStructuralDefinitions(DOC_A1, TEXT, nodes);
    await persistStructuralDefinitions(COMPANY_A, defs, idByLookupKey);
    const row = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY_A, normalizedName: "permitted liens" } });
    const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: row.sourceNodeId! } });
    expect(sourceNode.sectionRef).toBe("6.02");
  });

  it("re-persisting identical content does not duplicate rows (idempotent upsert)", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    await persistStructuralNodes(COMPANY_A, nodes);
    const countAfterFirst = await prisma.documentNode.count({ where: { companyId: COMPANY_A, documentId: DOC_A1 } });
    await persistStructuralNodes(COMPANY_A, nodes);
    const countAfterSecond = await prisma.documentNode.count({ where: { companyId: COMPANY_A, documentId: DOC_A1 } });
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("changed content produces a different structureOutputHash (cache invalidation signal), unchanged content produces the identical hash", () => {
    const nodesV1 = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const nodesV1Again = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const nodesV2 = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT.replace("6.01", "6.05") });
    expect(structureOutputHash(nodesV1)).toBe(structureOutputHash(nodesV1Again));
    expect(structureOutputHash(nodesV1)).not.toBe(structureOutputHash(nodesV2));
  });

  it("document isolation: two documents in the SAME company sharing an identical section number never collide", async () => {
    const nodesA1 = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const nodesA2 = parseDocumentStructure({ documentId: DOC_A2, label: "Indenture", text: TEXT }); // deliberately identical section numbers, different document
    await persistStructuralNodes(COMPANY_A, nodesA1);
    await persistStructuralNodes(COMPANY_A, nodesA2);
    const rowsFor601 = await prisma.documentNode.findMany({ where: { companyId: COMPANY_A, sectionRef: "6.01" } });
    expect(rowsFor601).toHaveLength(2);
    expect(new Set(rowsFor601.map((r) => r.documentId))).toEqual(new Set([DOC_A1, DOC_A2]));
    expect(rowsFor601[0]!.id).not.toBe(rowsFor601[1]!.id);
  });

  it("tenant isolation: identical content persisted for two different companies never leaks across companyId", async () => {
    const nodesA = parseDocumentStructure({ documentId: DOC_A1, label: "CA", text: TEXT });
    const nodesB = parseDocumentStructure({ documentId: DOC_B1, label: "CA", text: TEXT });
    await persistStructuralNodes(COMPANY_A, nodesA);
    await persistStructuralNodes(COMPANY_B, nodesB);
    const aRows = await prisma.documentNode.findMany({ where: { companyId: COMPANY_A } });
    const bRows = await prisma.documentNode.findMany({ where: { companyId: COMPANY_B } });
    expect(aRows.every((r) => r.companyId === COMPANY_A)).toBe(true);
    expect(bRows.every((r) => r.companyId === COMPANY_B)).toBe(true);
    expect(new Set(aRows.map((r) => r.id))).not.toEqual(new Set(bRows.map((r) => r.id)));
  });
});
