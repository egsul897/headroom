/**
 * Phase 3F.1.6.RX Part B (independent, PRODUCTION-FROZEN recertification) -
 * AUDIT-F6 (live product-flow inevitability).
 *
 * Independently re-traces the REAL, current click path (not merely
 * re-running Workstream H's own tests/onboarding/live-product-flow-
 * visibility.test.ts) with a fresh document/company fixture, and goes
 * FURTHER than that suite in two respects that directly bear on whether
 * this finding is honestly CERTIFIED_CLOSED or still open:
 *
 * 1. Statically confirms, by reading the REAL, current source of
 *    app/[companyId]/onboarding/documents/page.tsx, that the "Continue to
 *    Review" link the report itself calls a "confirmed bypass" remains a
 *    plain, unconditional <Link> with NO conditional guard referencing
 *    AnalysisRun/analysis status anywhere in the file - i.e. the bypass
 *    15-live-product-flow.json found was NOT eliminated, only made
 *    visible. A user can still click straight through to /onboarding/review
 *    (and, from there, /onboarding/activate) without contract-model
 *    analysis ever having run, exactly as before this workstream's fix.
 *
 * 2. Functionally proves that the ONE piece of downstream visibility the
 *    fixed documents page offers for a review-item count (a "view findings"
 *    link to /onboarding/review) is ITSELF broken: lib/onboarding/review.ts
 *    (the real data layer the review page reads) has zero awareness of
 *    ClaimReviewItem - a real, persisted ClaimReviewItem row for this
 *    company does not change getReviewProgress's totals or appear in
 *    getCandidatesForReview at all. A user who clicks "N open review
 *    item(s) · view findings" lands on a page that cannot show them any of
 *    those N items - the visibility fix's own "view findings" affordance is
 *    misleading, not merely incomplete.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "../../lib/prisma";
import { uploadDocumentAction } from "../../app/[companyId]/onboarding/documents/actions";
import { getLatestAnalysisRunForCompany } from "../../lib/contract-model/analysis";
import { getReviewProgress, getCandidatesForReview } from "../../lib/onboarding/review";

const COMPANY_ID = "part-b-recert-auditf6-liveflow-test";

function formDataFor(filename: string, text: string): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", "CREDIT_AGREEMENT");
  return fd;
}

const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE VII. NEGATIVE COVENANTS

Section 7.01 Investments. The Borrower shall not make Investments in excess of $4,250,000.
`;

async function teardown() {
  await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
}

beforeAll(async () => {
  await teardown();
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B recert AUDIT-F6 live-flow test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await teardown();
});

beforeEach(async () => {
  await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
});

describe("Part B recertification - AUDIT-F6 live product-flow inevitability (independent re-trace)", () => {
  it("BYPASS STILL REACHABLE: a fresh upload-only company has zero AnalysisRun rows and nothing blocks it from being treated as ready to proceed", async () => {
    await uploadDocumentAction(COMPANY_ID, formDataFor("partb-f6-doc.txt", DOCUMENT_TEXT));
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "partb-f6-doc.txt" } });
    expect(document).toBeDefined();

    // Never clicked "Run extraction" -> runContractAnalysis never fired.
    expect(await getLatestAnalysisRunForCompany(COMPANY_ID)).toBeNull();
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  });

  it("STATIC TRACE: the real, current documents page source has NO conditional gate on the 'Continue to Review' link tied to analysis/AnalysisRun state - the confirmed bypass was not eliminated, only made visible", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/[companyId]/onboarding/documents/page.tsx"), "utf-8");

    // The exact link the prior workstream's own report calls a "confirmed
    // bypass" is still present, still unconditional.
    expect(pageSource).toContain("Continue to Review");
    const continueLinkMatch = pageSource.match(/<Link href=\{`\/\$\{companyId\}\/onboarding\/review`\}[\s\S]{0,200}Continue to Review/);
    expect(continueLinkMatch).not.toBeNull();

    // Confirm this Link is NOT inside any conditional block referencing
    // AnalysisRun/analysis status/run (e.g. `{run && ...}` or `{run?.status
    // === ... && ...}`) by checking the immediately preceding ~400 chars of
    // source for any such guard token. A real gate would need to reference
    // one of these identifiers in a conditional expression wrapping the
    // Link; none does today.
    const idx = pageSource.indexOf('href={`/${companyId}/onboarding/review`}');
    expect(idx).toBeGreaterThan(-1);
    const preceding = pageSource.slice(Math.max(0, idx - 400), idx);
    expect(preceding).not.toMatch(/\brun\.status\b/);
    expect(preceding).not.toMatch(/\brun\s*&&/);
    expect(preceding).not.toMatch(/AnalysisRunStatus/);
    expect(preceding).not.toMatch(/disabled=\{/);
  });

  it("BROKEN DOWNSTREAM VISIBILITY: a real, persisted ClaimReviewItem for this company is invisible to lib/onboarding/review.ts - the fixed documents page's own 'view findings' link points to a page blind to what it claims to show", async () => {
    const document = await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, originalFilename: "partb-f6-doc.txt" } });

    const before = await getReviewProgress(COMPANY_ID);
    const beforeCandidates = await getCandidatesForReview(COMPANY_ID);
    const beforeTotal = Object.values(beforeCandidates).reduce((n, list) => n + list.length, 0);

    // Insert a REAL ClaimReviewItem row - the exact model AUDIT-F3/F6's own
    // "reviewItemCount" and "view findings" link are about - directly via
    // Prisma (the same durable model the real orchestrator writes through
    // safe-failure/service.ts; inserted here directly only because
    // constructing a full scripted pipeline run to the coverage-audit stage
    // is unnecessary to test THIS specific claim - whether the REVIEW PAGE's
    // OWN data layer can see it at all once it exists).
    await prisma.claimReviewItem.create({
      data: {
        companyId: COMPANY_ID,
        documentId: document.id,
        claimKey: "part-b-recert-auditf6-claim-key-1",
        materiality: "MATERIAL",
        status: "OPEN_REVIEW",
        reasonCode: "SEMANTIC_AMBIGUITY",
        unresolvedDimensions: ["threshold"],
        originStage: "SEMANTIC_COMPILER",
        sourceEvidence: "Investments in excess of $4,250,000",
        rationale: "Part B recert: synthetic real review item to test cross-visibility.",
        algorithmVersion: "part-b-recert-test-v1",
      },
    });
    expect(await prisma.claimReviewItem.count({ where: { companyId: COMPANY_ID, status: "OPEN_REVIEW" } })).toBe(1);

    // The real review-page data layer is completely blind to it.
    const after = await getReviewProgress(COMPANY_ID);
    const afterCandidates = await getCandidatesForReview(COMPANY_ID);
    const afterTotal = Object.values(afterCandidates).reduce((n, list) => n + list.length, 0);

    expect(after.total).toBe(before.total);
    expect(afterTotal).toBe(beforeTotal);

    // Confirm by direct source trace that lib/onboarding/review.ts contains
    // no reference to ClaimReviewItem at all (the review page's ENTIRE data
    // source), so this is not a corner case this test happened to miss.
    const reviewLibSource = readFileSync(join(process.cwd(), "lib/onboarding/review.ts"), "utf-8");
    expect(reviewLibSource).not.toContain("ClaimReviewItem");
  });
});
