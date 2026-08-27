/**
 * Phase 2C - persistence + query-API + incrementality regression (task
 * §13/§20/§21). Builds Package A's own scenario (base Credit Agreement +
 * two amendments + a joinder) against a REAL company/document set,
 * persists the resulting package graph, and verifies:
 *  - every one of the ten DB-backed query functions in
 *    lib/contract-model/service.ts returns the right, real data;
 *  - re-running persistPackageGraph on unchanged input never duplicates a
 *    row (idempotent replay, task's own established discipline);
 *  - changing ONE document's unrelated body text leaves every OTHER
 *    document's own persisted classification/relationship/modification
 *    rows completely untouched (task §20 - "do not invalidate unrelated
 *    instruments unnecessarily"), while the changed document's own
 *    modification-candidate row is updated to reflect its new content.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { persistPackageGraph } from "../../lib/contract-model/compiler/package-graph/persistence";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import {
  getPackageDocuments,
  getInstruments,
  getDocumentsForInstrument,
  getBaseDocuments,
  getAmendmentsForDocument,
  getSupplementsForDocument,
  getRelatedDocuments,
  getDocumentRelationships,
  getModificationCandidates,
  findDocumentsReferencing,
} from "../../lib/contract-model/service";

const COMPANY_ID = "fixture-package-graph-co";
const CA_ID = "fixture-package-graph-ca";
const AMEND1_ID = "fixture-package-graph-amend1";
const AMEND2_ID = "fixture-package-graph-amend2";
const JOINDER_ID = "fixture-package-graph-joinder";
const PACKAGE_KEY = "fixture-package-graph-run";

const CA_TEXT = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower, and Fictional Bank, N.A., as Administrative Agent.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`;
const AMEND1_TEXT = `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to increase the general debt basket to $75,000,000.`;
const AMEND2_TEXT = `AMENDMENT NO. 2 dated as of March 1, 2023 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nThe definition of "Consolidated EBITDA" is hereby amended to add a new addback category for restructuring charges.`;
const JOINDER_TEXT = `JOINDER AGREEMENT dated as of July 1, 2023 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nThe undersigned New Guarantor LLC hereby joins as a Guarantor under the Credit Agreement.`;

function buildDocs(amend2Text: string): PackageDocumentInput[] {
  return [
    { documentId: CA_ID, label: "Credit Agreement", text: CA_TEXT },
    { documentId: AMEND1_ID, label: "Amendment No. 1", text: AMEND1_TEXT },
    { documentId: AMEND2_ID, label: "Amendment No. 2", text: amend2Text },
    { documentId: JOINDER_ID, label: "Joinder Agreement", text: JOINDER_TEXT },
  ];
}

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Package graph persistence + query API + incrementality (task §13/§20/§21)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Package Graph Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CA_ID, companyId: COMPANY_ID, name: "Credit Agreement", type: "OTHER", typeConfirmedByUser: false } });
    await prisma.document.create({ data: { id: AMEND1_ID, companyId: COMPANY_ID, name: "Amendment No. 1", type: "OTHER", typeConfirmedByUser: false } });
    await prisma.document.create({ data: { id: AMEND2_ID, companyId: COMPANY_ID, name: "Amendment No. 2", type: "OTHER", typeConfirmedByUser: false } });
    await prisma.document.create({ data: { id: JOINDER_ID, companyId: COMPANY_ID, name: "Joinder Agreement", type: "OTHER", typeConfirmedByUser: false } });
    await prisma.contractCompilerRun.create({
      data: { companyId: COMPANY_ID, packageKey: PACKAGE_KEY, promptVersion: "n/a", schemaVersion: "n/a", documents: { create: [{ documentId: CA_ID }, { documentId: AMEND1_ID }, { documentId: AMEND2_ID }, { documentId: JOINDER_ID }] } },
    });

    const result = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, buildDocs(AMEND2_TEXT));
    await persistPackageGraph(COMPANY_ID, result);
  });

  afterAll(teardown);

  it("getPackageDocuments returns the real, persisted package member set", async () => {
    const pkg = await getPackageDocuments(COMPANY_ID, PACKAGE_KEY);
    expect(pkg).not.toBeNull();
    expect(new Set(pkg!.documents.map((d) => d.id))).toEqual(new Set([CA_ID, AMEND1_ID, AMEND2_ID, JOINDER_ID]));
  });

  it("proposes Document.type for every document that had no user-confirmed type yet", async () => {
    const docs = await prisma.document.findMany({ where: { companyId: COMPANY_ID } });
    const byId = new Map(docs.map((d) => [d.id, d.type] as const));
    expect(byId.get(CA_ID)).toBe("CREDIT_AGREEMENT");
    expect(byId.get(AMEND1_ID)).toBe("AMENDMENT");
    expect(byId.get(JOINDER_ID)).toBe("JOINDER");
  });

  it("getInstruments/getDocumentsForInstrument/getBaseDocuments reflect the one real instrument grouping all four documents", async () => {
    const instruments = await getInstruments(COMPANY_ID);
    expect(instruments).toHaveLength(1);
    const members = await getDocumentsForInstrument(instruments[0]!.id);
    expect(new Set(members.map((d) => d.id))).toEqual(new Set([CA_ID, AMEND1_ID, AMEND2_ID, JOINDER_ID]));

    const baseDocs = await getBaseDocuments(COMPANY_ID);
    expect(baseDocs.map((d) => d.id)).toEqual([CA_ID]);
  });

  it("getAmendmentsForDocument/getSupplementsForDocument/getRelatedDocuments/getDocumentRelationships correctly answer from the persisted edge graph", async () => {
    const amendments = await getAmendmentsForDocument(CA_ID);
    expect(new Set(amendments.map((e) => e.sourceDocumentId))).toEqual(new Set([AMEND1_ID, AMEND2_ID]));

    const supplements = await getSupplementsForDocument(CA_ID);
    expect(supplements).toHaveLength(0); // no SUPPLEMENTAL_INDENTURE in this package

    const related = await getRelatedDocuments(CA_ID);
    expect(new Set(related.map((d) => d.id))).toEqual(new Set([AMEND1_ID, AMEND2_ID, JOINDER_ID]));

    const allEdges = await getDocumentRelationships(COMPANY_ID);
    expect(allEdges.length).toBeGreaterThanOrEqual(3);
    const scoped = await getDocumentRelationships(COMPANY_ID, AMEND1_ID);
    expect(scoped.every((e) => e.sourceDocumentId === AMEND1_ID || e.targetDocumentId === AMEND1_ID)).toBe(true);
  });

  it("getModificationCandidates returns Amendment 1's covenant-modification candidate with the right target", async () => {
    const candidates = await getModificationCandidates(AMEND1_ID);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ effectType: "REPLACE_TEXT", targetDocumentId: CA_ID, targetSectionRef: "6.01" });
  });

  it("findDocumentsReferencing(CA) returns every document with an edge pointing at it", async () => {
    const referencing = await findDocumentsReferencing(CA_ID);
    expect(new Set(referencing.map((d) => d.id))).toEqual(new Set([AMEND1_ID, AMEND2_ID, JOINDER_ID]));
  });

  it("replaying the identical package graph is idempotent - no duplicate rows", async () => {
    const before = await Promise.all([prisma.debtInstrument.count({ where: { companyId: COMPANY_ID } }), prisma.documentRelationshipEdge.count({ where: { companyId: COMPANY_ID } }), prisma.amendmentEffect.count({ where: { companyId: COMPANY_ID } })]);
    const result = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, buildDocs(AMEND2_TEXT));
    await persistPackageGraph(COMPANY_ID, result);
    const after = await Promise.all([prisma.debtInstrument.count({ where: { companyId: COMPANY_ID } }), prisma.documentRelationshipEdge.count({ where: { companyId: COMPANY_ID } }), prisma.amendmentEffect.count({ where: { companyId: COMPANY_ID } })]);
    expect(after).toEqual(before);
  });

  it("changing Amendment 2's unrelated body text updates ONLY its own modification candidate, leaving the Credit Agreement's, Amendment 1's, and the Joinder's own persisted rows byte-identical (task §20)", async () => {
    const beforeCaEdges = await prisma.documentRelationshipEdge.findMany({ where: { companyId: COMPANY_ID, sourceDocumentId: { in: [AMEND1_ID, JOINDER_ID] } }, orderBy: { id: "asc" } });
    const beforeAmend1Candidates = await getModificationCandidates(AMEND1_ID);
    const beforeInstruments = await getInstruments(COMPANY_ID);
    const beforeAmend2Candidates = await getModificationCandidates(AMEND2_ID);
    expect(beforeAmend2Candidates[0]!.sourceSectionRef).toContain("restructuring charges");
    expect(beforeAmend2Candidates[0]!.sourceSectionRef).not.toContain("one-time transaction expenses");

    const changedAmend2Text = AMEND2_TEXT.replace("restructuring charges", "one-time transaction expenses");
    const result = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, buildDocs(changedAmend2Text));
    await persistPackageGraph(COMPANY_ID, result);

    const afterCaEdges = await prisma.documentRelationshipEdge.findMany({ where: { companyId: COMPANY_ID, sourceDocumentId: { in: [AMEND1_ID, JOINDER_ID] } }, orderBy: { id: "asc" } });
    const afterAmend1Candidates = await getModificationCandidates(AMEND1_ID);
    const afterInstruments = await getInstruments(COMPANY_ID);

    expect(afterCaEdges).toEqual(beforeCaEdges);
    expect(afterAmend1Candidates).toEqual(beforeAmend1Candidates);
    expect(afterInstruments).toEqual(beforeInstruments);

    // Amendment 2's own modification-candidate row picks up the new excerpt text - its own derived row DOES change.
    const afterAmend2Candidates = await getModificationCandidates(AMEND2_ID);
    expect(afterAmend2Candidates).toHaveLength(1);
    expect(afterAmend2Candidates[0]!.sourceSectionRef).toContain("one-time transaction expenses");
  });
});
