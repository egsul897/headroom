/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F6 - live product-flow inevitability).
 *
 * INDEPENDENT TRACE FINDING (documented in full in
 * docs/phase-3f1-6-rx-final-blocker-closure/15-live-product-flow.json): a
 * user CAN upload a document (uploadDocumentAction) and navigate straight to
 * `/onboarding/review` (a plain Link, reachable at any time - see
 * app/[companyId]/onboarding/documents/page.tsx's own "Continue to Review"
 * button) WITHOUT ever clicking "Run extraction" - contract analysis
 * (runContractAnalysis) never fires in that path. This is a deliberate,
 * legitimate two-step design (upload vs. analyze are separate actions,
 * matching this codebase's own pre-existing extraction-stage precedent) -
 * this workstream's charter explicitly permits that design "AS LONG AS the
 * product's own status model makes the uploaded-vs-analyzed distinction
 * real and visible, not silently ambiguous."
 *
 * Before this workstream's fix, the documents page had ZERO visibility into
 * AnalysisRun/ClaimReviewItem state at all (only the SEPARATE, older
 * ExtractionRun/ExtractionStage chips) - a company with uploaded-but-never-
 * analyzed documents was visually indistinguishable from one that was
 * analyzed and found clean. This test proves the data functions the fixed
 * documents page now reads (getLatestAnalysisRunForCompany,
 * getAnalysisRunIssues, getAnalysisFailureLogsForCompany) genuinely
 * distinguish these states.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { uploadDocumentAction, runExtractionAction } = await import("../../app/[companyId]/onboarding/documents/actions");
const { prisma } = await import("../../lib/prisma");
const { getLatestAnalysisRunForCompany, getAnalysisRunIssues, getAnalysisFailureLogsForCompany } = await import("../../lib/contract-model/analysis");

const COMPANY_ID = "live-product-flow-visibility-test";

const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Liens. The Borrower shall not create or suffer to exist any Lien on any property in an aggregate amount in excess of $1,500,000.
`;

function formDataFor(filename: string, text: string): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", "CREDIT_AGREEMENT");
  return fd;
}

async function teardown() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
}

beforeAll(async () => {
  await teardown();
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Live product flow visibility test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await teardown();
});

describe("uploaded-vs-analyzed visibility (AUDIT-F6)", () => {
  it("BYPASS CONFIRMED: uploadDocumentAction alone never triggers contract analysis - a company can have real documents with NO AnalysisRun at all", async () => {
    await uploadDocumentAction(COMPANY_ID, formDataFor("bypass-check.txt", DOCUMENT_TEXT));
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "bypass-check.txt" } });
    expect(document).toBeDefined();

    // The real bypass this audit found: upload alone produces zero AnalysisRun rows.
    expect(await getLatestAnalysisRunForCompany(COMPANY_ID)).toBeNull();
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  });

  it("VISIBILITY FIX: once 'Run extraction' is clicked, the same data functions the documents page reads now show real, distinguishable analysis state", async () => {
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "bypass-check.txt" } });

    // "not yet analyzed" is a real, queryable state (asserted above) -
    // distinct from what follows once the SAME document is actually
    // analyzed via the real, unmodified runExtractionAction (the SAME
    // action this codebase's own live-contract-analysis-app-action.test.ts
    // already proves reaches the real compiler pipeline).
    await runExtractionAction(COMPANY_ID, document.id);

    const run = await getLatestAnalysisRunForCompany(COMPANY_ID);
    expect(run).not.toBeNull();
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW", "PARTIAL", "FAILED"]).toContain(run!.status);
    expect(run!.documentIds).toContain(document.id);

    // The visibility surfaces genuinely reflect what happened - the review
    // count on the run matches the real persisted ClaimReviewItem count,
    // and issue/failure-log lookups are real, empty-by-default queries
    // (never fabricated placeholders) for this healthy run.
    const claimCount = await prisma.claimReviewItem.count({ where: { companyId: COMPANY_ID, status: "OPEN_REVIEW" } });
    expect(run!.reviewItemCount).toBe(claimCount);
    expect(await getAnalysisRunIssues(run!.id)).toEqual([]);
    expect(await getAnalysisFailureLogsForCompany(COMPANY_ID)).toEqual([]);
  });
});
