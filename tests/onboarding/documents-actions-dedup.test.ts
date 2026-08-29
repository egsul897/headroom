/**
 * P1-3 remediation (FA-DOCID-01, docs/foundation-remediation/08-p1-reconciliation.json
 * and 13-remaining-foundation-risks.json): the real, wired onboarding upload
 * action (app/[companyId]/onboarding/documents/actions.ts's
 * uploadDocumentAction) previously called lib/onboarding/documents.ts's
 * uploadAndChunkDocument directly - with NO content-hash dedup anywhere on
 * that path, byte-identical content uploaded twice through the actual UI
 * action created two independent Document rows (see
 * tests/foundation-audit/document-source-identity-overload.test.ts's own
 * "REPRODUCED" test for the original defect, still true of
 * uploadAndChunkDocument called directly - that function is deliberately
 * left as the low-level primitive it always was).
 *
 * This file drives the REAL, unmodified uploadDocumentAction server action
 * itself (not just the underlying wrapper in isolation, which
 * tests/connectors/upload-connector.test.ts already covers) against real
 * Postgres + real filesystem storage, to prove the actual wired path is now
 * dedup-safe. next/cache and next/navigation are mocked only because
 * `revalidatePath`/`redirect` require a live Next.js request context this
 * test harness does not provide - the dedup logic itself (uploadDocumentAction
 * -> uploadDocumentThroughIngestion -> findDuplicateArtifact) is completely
 * real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { uploadDocumentAction } = await import("../../app/[companyId]/onboarding/documents/actions");
const { prisma } = await import("../../lib/prisma");

const COMPANY_A = "fixture-onboarding-action-dedup-a";
const COMPANY_B = "fixture-onboarding-action-dedup-b";

function formDataFor(filename: string, text: string, declaredType = "CREDIT_AGREEMENT", governs?: string): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", declaredType);
  if (governs) fd.set("governs", governs);
  return fd;
}

async function teardown() {
  for (const companyId of [COMPANY_A, COMPANY_B]) {
    await prisma.sourceArtifact.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.companySourceConnection.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.document.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
  }
}

describe("uploadDocumentAction (the real, wired onboarding upload action) is now dedup-safe", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_A, name: "Fixture Onboarding Action Dedup A (test-only)" } });
    await prisma.company.create({ data: { id: COMPANY_B, name: "Fixture Onboarding Action Dedup B (test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("same bytes, same tenant, same path (onboarding action called twice): the second call is a silent no-op - exactly one Document row", async () => {
    const text = "CREDIT AGREEMENT. Section 6.01. Indebtedness covenant text, identical both times.";
    await uploadDocumentAction(COMPANY_A, formDataFor("agreement.txt", text));
    await uploadDocumentAction(COMPANY_A, formDataFor("agreement.txt", text));

    const rows = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "agreement.txt" } });
    expect(rows).toHaveLength(1);

    const artifacts = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_A, documentId: rows[0]!.id } });
    expect(artifacts).toHaveLength(1);
  });

  it("metadata differences with identical content (different filename, same bytes) still dedup - content, not filename, is identity", async () => {
    const text = "SECOND FIXTURE AGREEMENT. Section 7.01. Liens covenant, byte-for-byte reused below under a new name.";
    await uploadDocumentAction(COMPANY_A, formDataFor("original-name.txt", text));
    await uploadDocumentAction(COMPANY_A, formDataFor("totally-different-name.txt", text));

    const rows = await prisma.document.findMany({
      where: { companyId: COMPANY_A, OR: [{ originalFilename: "original-name.txt" }, { originalFilename: "totally-different-name.txt" }] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.originalFilename).toBe("original-name.txt"); // the renamed re-upload never became its own row
  });

  it("same bytes, DIFFERENT tenants: must NOT dedup across companies - each gets its own Document row", async () => {
    const text = "CROSS-TENANT CONTENT. Section 8.01. Same bytes uploaded by two different companies on purpose.";
    await uploadDocumentAction(COMPANY_A, formDataFor("cross-tenant.txt", text));
    await uploadDocumentAction(COMPANY_B, formDataFor("cross-tenant.txt", text));

    const rowsA = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "cross-tenant.txt" } });
    const rowsB = await prisma.document.findMany({ where: { companyId: COMPANY_B, originalFilename: "cross-tenant.txt" } });
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]!.id).not.toBe(rowsB[0]!.id);

    const hash = (await prisma.sourceArtifact.findFirst({ where: { companyId: COMPANY_A, documentId: rowsA[0]!.id } }))!.contentHash;
    const artifactsA = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_A, contentHash: hash } });
    const artifactsB = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_B, contentHash: hash } });
    expect(artifactsA).toHaveLength(1);
    expect(artifactsB).toHaveLength(1); // same hash, but a SEPARATE row scoped to its own company
  });

  it("a genuinely different amendment (different bytes) is never deduped against its base agreement, and is uploaded through the same action", async () => {
    const base = "BASE CREDIT AGREEMENT TEXT. Section 6.01. Original indebtedness covenant.";
    const amendment = "AMENDMENT NO. 1 TO CREDIT AGREEMENT. Section 6.01 is hereby amended and restated in its entirety.";

    await uploadDocumentAction(COMPANY_A, formDataFor("base-amend-test.txt", base, "CREDIT_AGREEMENT"));
    await uploadDocumentAction(COMPANY_A, formDataFor("amendment-no-1.txt", amendment, "AMENDMENT", "Term Loan B"));

    const baseRows = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "base-amend-test.txt" } });
    const amendRows = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "amendment-no-1.txt" } });
    expect(baseRows).toHaveLength(1);
    expect(amendRows).toHaveLength(1);
    expect(amendRows[0]!.id).not.toBe(baseRows[0]!.id);
    expect(amendRows[0]!.type).toBe("AMENDMENT");
    expect(amendRows[0]!.governs).toBe("Term Loan B");
  });

  it("an intentionally-retained amendment/version relationship is not disturbed by a later duplicate re-upload of the base document's own bytes", async () => {
    const baseText = "VERSION-RELATIONSHIP BASE TEXT. Section 9.01. Original covenant text for the relationship test.";
    await uploadDocumentAction(COMPANY_A, formDataFor("version-rel-base.txt", baseText));
    const base = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_A, originalFilename: "version-rel-base.txt" } });

    // Simulate an amendment relationship already recorded against the base
    // document (lib/onboarding/promotion.ts's real job elsewhere in the
    // pipeline - out of this action's scope, set here directly to isolate
    // what THIS fix must not disturb).
    const amendmentDoc = await prisma.document.create({
      data: { companyId: COMPANY_A, name: "Amendment referencing base", type: "AMENDMENT", supersedesDocumentId: base.id },
    });

    // Someone re-uploads the BASE document's exact bytes again later (e.g.
    // re-confirming it during a later onboarding session) - this must dedup
    // silently against the existing base row, and must not touch the
    // already-recorded amendment relationship in any way.
    await uploadDocumentAction(COMPANY_A, formDataFor("version-rel-base-reupload.txt", baseText));

    const baseRowsAfter = await prisma.document.findMany({ where: { companyId: COMPANY_A, originalFilename: "version-rel-base.txt" } });
    expect(baseRowsAfter).toHaveLength(1);
    expect(baseRowsAfter[0]!.id).toBe(base.id);

    const amendmentAfter = await prisma.document.findUniqueOrThrow({ where: { id: amendmentDoc.id } });
    expect(amendmentAfter.supersedesDocumentId).toBe(base.id); // untouched by the duplicate re-upload

    const rowsMatchingRelationship = await prisma.document.count({ where: { companyId: COMPANY_A, supersedesDocumentId: base.id } });
    expect(rowsMatchingRelationship).toBe(1); // still exactly one amendment pointing at the base, not duplicated or orphaned
  });
});
