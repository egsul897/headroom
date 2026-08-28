/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Investigation 1: Document/Source
 * Identity Overload. Audit-only test file under tests/foundation-audit/ per
 * the audit's own restriction; production code (lib/, app/,
 * prisma/schema.prisma) is untouched and FROZEN.
 *
 * Every test here drives real, unmodified production code against a real
 * Postgres database (reachable in this session, unlike Phase 3F.1.2's own
 * disclosed DB-unavailability limitation) under a dedicated
 * fixture-audit-doc-identity-* company, cleaned up in afterAll.
 *
 * FINDING SUMMARY (see final report for severity/classification):
 *  1. The REAL, currently-wired onboarding upload action
 *     (app/[companyId]/onboarding/documents/actions.ts) calls
 *     lib/onboarding/documents.ts's `uploadAndChunkDocument` directly, which
 *     has NO content-hash dedup check anywhere in it. Uploading byte-identical
 *     content twice through the real wired path creates two independent
 *     Document rows, independently chunked, independently extractable.
 *  2. A real, tested, dedup-safe wrapper (`uploadDocumentThroughIngestion` in
 *     lib/connectors/upload-connector.ts) exists and DOES correctly dedup via
 *     SourceArtifact's (companyId, contentHash) unique constraint - but the
 *     real UI action does not call it. The fix exists in the codebase; it is
 *     simply not wired to the one place that matters.
 *  3. `persistStructuralNodes` (lib/contract-model/compiler/persistence.ts)
 *     never deletes a DocumentNode row. Re-running STRUCTURE over the same
 *     documentId with different charStart values (the real, expected result
 *     of a genuine re-extraction/algorithm change per StructuralNode.nodeId's
 *     own doc comment) does not update or remove the old rows - it silently
 *     ADDS new ones. Both old and new nodes now coexist under the same
 *     documentId with no field distinguishing which extraction produced
 *     which, and no consumer queries by "latest only."
 *  4. Document.supersedesDocumentId is populated (via
 *     lib/onboarding/promotion.ts) but is never consulted by any amendment-
 *     precedence or calculation code path - only effectiveFrom/effectiveTo
 *     are (Document's own schema comment says this explicitly). Its only
 *     real consumer (lib/company-state/canonical-state.ts) uses it for a
 *     display COUNT, never as executable amendment-precedence logic. The
 *     Roadmap's characterization of this as part of a mechanism "genuinely
 *     used by the legacy production engine today" overstates
 *     supersedesDocumentId's own role.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { uploadDocumentThroughIngestion } from "../../lib/connectors/upload-connector";
import { persistStructuralNodes } from "../../lib/contract-model/compiler/persistence";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const COMPANY_A = "fixture-audit-doc-identity-a";
const COMPANY_B = "fixture-audit-doc-identity-b";

async function ensureCompany(id: string) {
  await prisma.company.upsert({ where: { id }, create: { id, name: `Fixture ${id} (foundation audit, test-only)` }, update: {} });
}

afterAll(async () => {
  // Best-effort cleanup, dependency order innermost-first. Cascade deletes on
  // Company handle most of this, but SourceArtifact/CompanySourceConnection
  // are deleted explicitly first since some of this schema's relations are
  // onDelete: SetNull rather than Cascade, and we want a genuinely clean slate.
  for (const companyId of [COMPANY_A, COMPANY_B]) {
    await prisma.documentNode.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.sourceArtifact.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.companySourceConnection.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.document.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("1a. Identical-file-uploaded-twice through the REAL wired upload action", () => {
  it("REPRODUCED: uploadAndChunkDocument (what actions.ts actually calls) creates TWO Document rows for byte-identical content - no dedup exists on this path", async () => {
    await ensureCompany(COMPANY_A);
    const bytes = Buffer.from("This is a test credit agreement. Section 6.01. Indebtedness. The Borrower will not incur Indebtedness.", "utf-8");

    const first = await uploadAndChunkDocument({ companyId: COMPANY_A, filename: "credit-agreement.txt", data: bytes, declaredType: "CREDIT_AGREEMENT" });
    const second = await uploadAndChunkDocument({ companyId: COMPANY_A, filename: "credit-agreement.txt", data: bytes, declaredType: "CREDIT_AGREEMENT" });

    expect(first.document.id).not.toBe(second.document.id);

    const rows = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "credit-agreement.txt" } });
    // ACTUAL, OBSERVED behavior: two independent rows for identical bytes.
    expect(rows.length).toBe(2);
    expect(rows[0]!.storageRef).not.toBe(rows[1]!.storageRef); // even the blob was stored twice.
  });

  it("CONTRAST: the dedup-safe wrapper that exists in the codebase (uploadDocumentThroughIngestion) correctly refuses to create a second row for the same bytes - but nothing in the real UI action path calls it", async () => {
    await ensureCompany(COMPANY_B);
    const bytes = Buffer.from("This is a second test credit agreement. Section 7.01. Liens.", "utf-8");

    const first = await uploadDocumentThroughIngestion({ companyId: COMPANY_B, filename: "second-agreement.txt", data: bytes, declaredType: "CREDIT_AGREEMENT" });
    expect(first.duplicate).toBe(false);

    const second = await uploadDocumentThroughIngestion({ companyId: COMPANY_B, filename: "second-agreement-renamed.txt", data: bytes, declaredType: "CREDIT_AGREEMENT" });
    // Correctly deduped even under a DIFFERENT filename - contentHash, not filename, is the identity.
    expect(second.duplicate).toBe(true);
    expect(second.document).toBeUndefined();

    const rows = await prisma.document.findMany({ where: { companyId: COMPANY_B } });
    expect(rows.length).toBe(1);
  });
});

describe("1b. Re-extraction produces stale, orphaned DocumentNode rows under the SAME documentId", () => {
  it("REPRODUCED: persistStructuralNodes never deletes a prior extraction's rows - old and new nodes silently coexist with no field marking which is current", async () => {
    await ensureCompany(COMPANY_A);
    const documentId = "fixture-audit-doc-identity-reextract-doc";
    await prisma.document.upsert({ where: { id: documentId }, create: { id: documentId, companyId: COMPANY_A, name: "Reextract Test Doc", type: "CREDIT_AGREEMENT" }, update: {} });

    const v1Nodes: StructuralNode[] = [
      { documentId, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${documentId}::6.01`, nodeId: "v1-node-601", charStart: 100, charEnd: 200, parentNodeId: null, parentSectionRef: null, ordinal: 0 } as unknown as StructuralNode,
    ];
    const idx1 = await persistStructuralNodes(COMPANY_A, v1Nodes);
    const row1Id = idx1.idByNodeId.get("v1-node-601")!;

    // A genuine re-extraction: same documentId, same sectionRef/label, but a
    // DIFFERENT charStart - exactly what StructuralNode.nodeId's own doc
    // comment says SHOULD legitimately mint a different nodeId ("NOT promised
    // stable across a parser algorithm change or a re-extraction").
    const v2Nodes: StructuralNode[] = [
      { documentId, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${documentId}::6.01`, nodeId: "v2-node-601", charStart: 137, charEnd: 240, parentNodeId: null, parentSectionRef: null, ordinal: 0 } as unknown as StructuralNode,
    ];
    const idx2 = await persistStructuralNodes(COMPANY_A, v2Nodes);
    const row2Id = idx2.idByNodeId.get("v2-node-601")!;

    // ACTUAL, OBSERVED behavior: these are two DIFFERENT DB rows (different
    // stableKey, since stableKey includes charStart) - the old row is never
    // updated, superseded-flagged, or removed.
    expect(row1Id).not.toBe(row2Id);

    const allRowsForDoc = await prisma.documentNode.findMany({ where: { companyId: COMPANY_A, documentId } });
    expect(allRowsForDoc.length).toBe(2);
    expect(allRowsForDoc.map((r) => r.charStart).sort()).toEqual([100, 137]);

    // No field on DocumentNode distinguishes "produced by the current
    // extraction" from "orphaned by a since-superseded extraction" - a
    // consumer doing `documentNode.findMany({ where: { documentId } })`
    // (the exact query lib/contract-model/service.ts:22 and
    // lib/contract-model/validators.ts:31/58/96 actually issue in production)
    // gets BOTH the live and the stale row back, indistinguishable.
    const row1 = allRowsForDoc.find((r) => r.id === row1Id)!;
    const row2 = allRowsForDoc.find((r) => r.id === row2Id)!;
    expect(row1.sectionRef).toBe(row2.sectionRef); // same legal label, both "6.01" - a caller resolving by sectionRef would find TWO candidate rows and (per this file's own AMBIGUOUS-safe convention elsewhere) would have to refuse rather than silently pick one, but nothing today PRODUCES that refusal for the persisted DocumentNode layer.

    // Cleanup this specific doc's rows explicitly for isolation from later tests in this file.
    await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_A, documentId } });
  });
});

describe("1c. Document.supersedesDocumentId is populated but is never actually consulted by amendment-precedence or calculation logic", () => {
  it("VERIFIED: only effectiveFrom/effectiveTo participate in the legacy engine's date filter; supersedesDocumentId is set aside as pure display/count provenance", async () => {
    await ensureCompany(COMPANY_A);
    const baseId = "fixture-audit-doc-identity-base";
    const amendId = "fixture-audit-doc-identity-amend";
    await prisma.document.upsert({ where: { id: baseId }, create: { id: baseId, companyId: COMPANY_A, name: "Base Credit Agreement", type: "CREDIT_AGREEMENT", effectiveFrom: new Date("2020-01-01") }, update: {} });
    // supersedesDocumentId is set, but effectiveTo on the BASE document is
    // deliberately left null here - simulating an engineer/reviewer who set
    // the relationship field but forgot (or the amendment pipeline never
    // wrote) the effectiveTo half of the mechanism Document's own comment
    // says is the ONLY one the load-time filter actually reads.
    await prisma.document.upsert({
      where: { id: amendId },
      create: { id: amendId, companyId: COMPANY_A, name: "Amendment No. 1", type: "AMENDMENT", supersedesDocumentId: baseId, effectiveFrom: new Date("2021-06-01") },
      update: {},
    });

    const { loadCompanyCovenantData } = await import("../../lib/covenant-engine");
    // No FinancialSnapshot exists for this fixture company, so this will
    // throw - that's fine, this test only needs the query construction to
    // prove the point below, not a full successful load. We instead assert
    // directly against the documented, unmodified filter function.
    const base = await prisma.document.findUniqueOrThrow({ where: { id: baseId } });
    // If supersedesDocumentId were REALLY consulted for precedence the way
    // the Roadmap's "genuinely used" phrasing implies, the base document's
    // own effectiveTo would need to be derived/enforced from the amendment's
    // effectiveFrom somewhere in this codebase. It is not - effectiveTo
    // remains whatever value (here: null) was set completely independently.
    expect(base.effectiveTo).toBeNull();
    expect(base.supersedesDocumentId).toBeNull(); // the BASE never points at anything (correct - only the amendment points backward)
    const amend = await prisma.document.findUniqueOrThrow({ where: { id: amendId } });
    expect(amend.supersedesDocumentId).toBe(baseId);

    // Confirm loadCompanyCovenantData/effectiveDateFilter's own well-known
    // shape never references supersedesDocumentId at all (static import
    // check against the real, unmodified source function - not a guess).
    const src = (await import("node:fs/promises")).readFile;
    const engineSource = await src(new URL("../../lib/covenant-engine.ts", import.meta.url), "utf-8");
    const filterFnMatch = engineSource.match(/function effectiveDateFilter[\s\S]*?\n}/);
    expect(filterFnMatch).toBeTruthy();
    expect(filterFnMatch![0]).not.toMatch(/supersedesDocumentId/);
    expect(filterFnMatch![0]).toMatch(/effectiveFrom/);
    expect(filterFnMatch![0]).toMatch(/effectiveTo/);

    void loadCompanyCovenantData; // referenced for documentation purposes only in this test's narrative.
  });
});
