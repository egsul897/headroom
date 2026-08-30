/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - the golden proof
 * that a REAL, unmodified application service boundary
 * (app/[companyId]/onboarding/documents/actions.ts's runExtractionAction)
 * now reaches lib/contract-model/compiler/** at all - the exact gap
 * docs/phase-3f1-6-final-foundation-certification/17-safe-failure-wiring-certification.json
 * found: "the live application... has ZERO import relationship, direct or
 * transitive, with lib/contract-model/compiler/** at all."
 *
 * This test calls the literal exported server action functions
 * (uploadDocumentAction, runExtractionAction) - not runContractAnalysis in
 * isolation (see live-contract-analysis-orchestrator.test.ts for that
 * broader, caller-injectable coverage) - and asserts on real persisted
 * AnalysisRun/ClaimReviewItem state. next/cache and next/navigation are
 * mocked only because revalidatePath/redirect require a live Next.js
 * request context this test harness does not provide (the exact same,
 * pre-existing convention tests/onboarding/documents-actions-dedup.test.ts
 * already established for this same action file) - every other line this
 * test exercises is real, unmodified production code: real Postgres, real
 * local-filesystem document storage, real structural parsing, real
 * discovery/compile/verify/coverage/safe-failure.
 *
 * No LLM callers are injected here (the action itself exposes no such
 * override, by design - production never should either): getStageCaller()/
 * getSemanticCaller() fall back to their own real, zero-cost SYNTHETIC
 * implementations in this credential-free sandbox, so discovery/compilation
 * genuinely find/compile nothing - proving the actual, most conservative
 * real-world case: independent semantic-coverage's own deterministic
 * Layer A/B detection is what catches a real material covenant, with
 * nothing else in the pipeline crediting it, and that reaches a real
 * persisted ClaimReviewItem via the ONE wired safe-failure emission point.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { uploadDocumentAction, runExtractionAction } = await import("../../app/[companyId]/onboarding/documents/actions");
const { prisma } = await import("../../lib/prisma");

const COMPANY_ID = "live-analysis-app-action-test";

const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Liens. The Borrower shall not create or suffer to exist any Lien on any property in an aggregate amount in excess of $3,000,000.
`;

function formDataFor(filename: string, text: string): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", "CREDIT_AGREEMENT");
  return fd;
}

async function teardown() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.sourceArtifact.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.companySourceConnection.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
}

describe("runExtractionAction (the real, wired document-onboarding server action) now reaches lib/contract-model/compiler/** (BLOCKER-10)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Live analysis app-action test co (test-only)", onboardingStatus: "ONBOARDING" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("uploading a real document and running the real Extraction-stage action produces a real, persisted AnalysisRun and a real ClaimReviewItem for the undiscovered material covenant", async () => {
    await uploadDocumentAction(COMPANY_ID, formDataFor("live-action-agreement.txt", DOCUMENT_TEXT));
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "live-action-agreement.txt" } });

    await runExtractionAction(COMPANY_ID, document.id);

    // The real AnalysisRun boundary this workstream added actually ran, via
    // the literal application action - this is the direct answer to
    // BLOCKER-10's own question ("does app/ ever reach the compiler at all").
    const run = await prisma.analysisRun.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW"]).toContain(run.status);
    expect(run.documentIds).toContain(document.id);
    expect(run.completedAt).not.toBeNull();

    // Real structural persistence happened (structural analysis -> persistence).
    const nodeCount = await prisma.documentNode.count({ where: { companyId: COMPANY_ID, documentId: document.id } });
    expect(nodeCount).toBeGreaterThan(0);

    // The real, undiscovered $3,000,000 Liens covenant reached a real
    // persisted, OPEN_REVIEW ClaimReviewItem - proving the safe-failure
    // path this workstream wires actually fires from THIS literal action,
    // not a separate/parallel emission point.
    const reviewItems = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID, documentId: document.id } });
    expect(reviewItems.length).toBeGreaterThan(0);
    expect(reviewItems.some((r) => r.status === "OPEN_REVIEW")).toBe(true);
    expect(reviewItems.some((r) => r.sourceEvidence.includes("3,000,000"))).toBe(true);
    expect(run.status).toBe("COMPLETED_WITH_REVIEW");
    expect(run.reviewItemCount).toBeGreaterThan(0);
  });

  it("re-running the same action for the same document again is idempotent - same AnalysisRun row, no duplicate ClaimReviewItem rows", async () => {
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "live-action-agreement.txt" } });
    const before = await prisma.analysisRun.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    const reviewIdsBefore = (await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } })).map((r) => r.id).sort();

    await runExtractionAction(COMPANY_ID, document.id);

    const after = await prisma.analysisRun.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    const reviewIdsAfter = (await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } })).map((r) => r.id).sort();
    expect(after.id).toBe(before.id);
    expect(reviewIdsAfter).toEqual(reviewIdsBefore);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(1);
  });
});
