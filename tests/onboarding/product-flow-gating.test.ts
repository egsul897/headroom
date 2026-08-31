/**
 * Phase 3F.1.6.RX-FINAL Workstream F (FINDING-7 - live product-flow gating).
 *
 * Proves the actual, real gate this workstream added: the prior bypass
 * (docs/phase-3f1-6-rx-final-blocker-closure/15-live-product-flow.json,
 * reconfirmed STILL_OPEN by
 * docs/phase-3f1-6-rx-final-blocker-closure/29-part-b-auditf3-f6-f7-recertification.json's
 * AUDIT-F6) - uploading a document and reaching `/onboarding/review` without
 * contract-model analysis ever having run - no longer succeeds. This test
 * exercises the REAL route (the literal default-exported ReviewPage server
 * component from app/[companyId]/onboarding/review/page.tsx) and the REAL
 * server actions (uploadDocumentAction/runExtractionAction), never an
 * isolated helper called out of context.
 *
 * Four cases:
 *  1. BLOCKED - upload only, never analyzed: ReviewPage redirects back to
 *     the documents page instead of rendering review content.
 *  2. BLOCKED - stale: a company with one already-analyzed document that
 *     then gets a SECOND document uploaded (without re-running analysis)
 *     must also redirect - the completed run no longer covers the current
 *     document set, which is the same bypass shape in a subtler form.
 *  3. GOLDEN PATH - real analysis completes (via the real, unmodified
 *     runExtractionAction, exactly as a user's own "Run extraction" click
 *     would) and ReviewPage now renders normally (no redirect).
 *  4. VIEW FINDINGS FIXED - the real, persisted ClaimReviewItem the golden
 *     path's own analysis produced (a genuine, undiscovered material
 *     covenant deliberately left for the deterministic layer-B/coverage
 *     stage to catch, no LLM callers injected - matching this codebase's
 *     own live-contract-analysis-app-action.test.ts convention) is rendered
 *     by the real ReviewPage output - not merely present in the database
 *     but literally in the rendered HTML the "view findings" link now
 *     leads to.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const revalidatePath = vi.fn();
const redirect = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

const { uploadDocumentAction, runExtractionAction } = await import("../../app/[companyId]/onboarding/documents/actions");
const { prisma } = await import("../../lib/prisma");
const { getAnalysisReadinessForCompany } = await import("../../lib/contract-model/analysis");
const ReviewPage = (await import("../../app/[companyId]/onboarding/review/page")).default;

const COMPANY_ID = "part-b-finding7-product-flow-gating-test";

function formDataFor(filename: string, text: string): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", "CREDIT_AGREEMENT");
  return fd;
}

// Deliberately a real, undiscovered material covenant (no LLM callers
// injected in this sandbox - the deterministic semantic-coverage layer is
// what must catch it), same convention as
// tests/onboarding/live-contract-analysis-app-action.test.ts.
const DOCUMENT_TEXT_A = `CREDIT AGREEMENT

ARTICLE VII. NEGATIVE COVENANTS

Section 7.01 Investments. The Borrower shall not make Investments in excess of $6,750,000.
`;

const DOCUMENT_TEXT_B = `AMENDMENT NO. 1 TO CREDIT AGREEMENT

Section 2.01 Additional covenant. The Borrower shall not incur additional Indebtedness in excess of $2,000,000.
`;

async function teardown() {
  await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
}

beforeAll(async () => {
  await teardown();
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B FINDING-7 product-flow gating test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  redirect.mockClear();
  revalidatePath.mockClear();
});

describe("FINDING-7 - the real /onboarding/review route now gates on real AnalysisRun state", () => {
  it("BLOCKED: a fresh upload-only company (never analyzed) is redirected back to /documents by the real ReviewPage - the prior bypass no longer succeeds", async () => {
    await uploadDocumentAction(COMPANY_ID, formDataFor("finding7-doc-a.txt", DOCUMENT_TEXT_A));
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "finding7-doc-a.txt" } });
    expect(document).toBeDefined();

    // Confirm the readiness predicate itself agrees: not ready.
    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("NEVER_ANALYZED");

    const result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    // No review content was constructed - the gate returns before ever
    // calling getCandidatesForReview/getReviewProgress/etc.
    expect(result).toBeNull();
  });

  it("GOLDEN PATH: after a real analysis run completes, ReviewPage renders normally (no redirect) and the real ClaimReviewItem it produced is genuinely visible in the rendered output", async () => {
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "finding7-doc-a.txt" } });

    // The exact same action a user's own "Run extraction" click invokes -
    // runs the real extraction pipeline AND the real contract-model
    // orchestrator (runContractAnalysis) together, as documented in
    // app/[companyId]/onboarding/documents/actions.ts.
    await runExtractionAction(COMPANY_ID, document.id);

    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(true);
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW"]).toContain(readiness.run?.status);

    redirect.mockClear();
    const element = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element).not.toBeNull();

    // The real, persisted ClaimReviewItem for the undiscovered $6,750,000
    // Investments covenant genuinely reaches the rendered page - the
    // compounding "view findings" defect (a broken destination blind to
    // ClaimReviewItem) is fixed, not merely relabeled.
    const reviewItems = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID, documentId: document.id, status: "OPEN_REVIEW" } });
    expect(reviewItems.length).toBeGreaterThan(0);
    expect(reviewItems.some((r) => r.sourceEvidence.includes("6,750,000"))).toBe(true);

    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("Contract analysis findings");
    expect(html).toContain("6,750,000");
    for (const item of reviewItems) {
      expect(html).toContain(item.rationale);
    }
  });

  it("BLOCKED (stale): uploading a SECOND document without re-running analysis reopens the gate even though a prior run for this company completed", async () => {
    // Sanity: the company from the previous test is currently ready.
    expect((await getAnalysisReadinessForCompany(COMPANY_ID)).ready).toBe(true);

    await uploadDocumentAction(COMPANY_ID, formDataFor("finding7-doc-b.txt", DOCUMENT_TEXT_B));
    const newDocument = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "finding7-doc-b.txt" } });
    expect(newDocument).toBeDefined();

    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("STALE_DOCUMENTS_SINCE_LAST_RUN");

    redirect.mockClear();
    const result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();
  });

  it("un-blocked again once the second document is also covered by a fresh completed run", async () => {
    const newDocument = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "finding7-doc-b.txt" } });
    await runExtractionAction(COMPANY_ID, newDocument.id);

    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(true);

    redirect.mockClear();
    const element = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element).not.toBeNull();
  });
});
