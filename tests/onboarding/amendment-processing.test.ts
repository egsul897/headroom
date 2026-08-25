/**
 * Amendment processing, end-to-end (Phase B, task §5 - "verify first, extend
 * only if genuinely missing").
 *
 * Uploads a synthetic "Credit Agreement" and a synthetic "Amendment No. 2"
 * referencing it, runs the full extraction/review/promotion pipeline, and
 * checks: is the amendment correctly classified, does a reviewer see a
 * clear proposed link to the base agreement, does approving it correctly
 * set supersedesDocumentId/effectiveFrom/effectiveTo, and does
 * loadCompanyCovenantData's existing effective-dating filter correctly
 * treat the base agreement's now-superseded provisions as no longer active
 * while preserving them as historical data (never deleted)?
 *
 * FINDING (documented per the task's own "report honestly" instruction):
 * this test uncovered ONE genuine, small gap - lib/onboarding/promotion.ts's
 * DOCUMENT_RELATIONSHIP promotion previously set the AMENDMENT document's
 * own effectiveFrom/effectiveTo/supersedesDocumentId, but never propagated
 * the amendment's effectiveFrom onto the BASE document's own effectiveTo -
 * the one column loadCompanyCovenantData's date-range filter actually reads
 * to treat a superseded document as no longer effective (see
 * Document.effectiveTo's own schema comment). Fixed as the smallest correct
 * addition (a second `tx.document.update` in the same promotion block) - see
 * that file's own comment on the fix. A second, smaller gap: the
 * SyntheticExtractionProvider (a test/demo-only fixture provider - the real
 * AnthropicExtractionProvider already prompts for this) never proposed a
 * supersedesDocumentRef/effectiveFrom at all for an amendment; a small,
 * honest regex-based pattern was added there too (same "heuristic over
 * ChunkRefs, not real NLP" discipline the rest of that file already uses).
 * No new reviewer-facing "diff" UI was added: the review workspace's
 * existing generic ValueTable already displays documentType/
 * supersedesDocumentRef/effectiveFrom/effectiveTo directly for a
 * DOCUMENT_RELATIONSHIP candidate, which IS the proposed-link information
 * task §32 asks for - a separate diffing engine was judged unnecessary.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../../lib/onboarding/documents";
import { getCandidatesForReview, reviewCandidate } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { createManualFinancialState } from "../../lib/onboarding/financial";
import { loadCompanyCovenantData } from "../../lib/covenant-engine";

const COMPANY_ID = "fixture-amendment-processing-co";

const BASE_CREDIT_AGREEMENT = `CREDIT AGREEMENT

ARTICLE I DEFINITIONS

SECTION 1.1 Certain Defined Terms.

"Adjusted EBITDA" means, for any period, consolidated net income plus interest expense, taxes, depreciation and amortization.

ARTICLE II NEGATIVE COVENANTS

SECTION 2.1 Indebtedness.

The Borrower may incur Indebtedness under the General Debt Basket in an aggregate principal amount outstanding at any time not to exceed $500 million.
`;

// The quoted reference deliberately matches the base document's own Document.name
// (uploadAndChunkDocument sets `name` to the uploaded filename verbatim, extension
// included) - a synthetic-fixture nuance documented here, not a real-world
// requirement (a real filed amendment's cover page names the base agreement by its
// defined short title, and lib/onboarding/promotion.ts's case-insensitive match
// already tolerates real-world casing differences).
const AMENDMENT_NO_2 = `AMENDMENT NO. 2

This Amendment No. 2 amends the "credit-agreement.txt" dated as of January 1, 2024.

Effective Date: June 1, 2026

SECTION 1. Amendment to Section 2.1. Section 2.1 of the Credit Agreement is hereby amended to increase the General Debt Basket to $600 million.
`;

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("amendment processing - full pipeline", () => {
  let baseDocumentId: string;
  let amendmentDocumentId: string;

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Amendment Processing Co (synthetic, test-only)", onboardingStatus: "ONBOARDING" } });

    const base = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "credit-agreement.txt", data: Buffer.from(BASE_CREDIT_AGREEMENT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    baseDocumentId = base.document.id;
    await runExtractionForDocument({ companyId: COMPANY_ID, documentId: baseDocumentId, provider: new SyntheticExtractionProvider(), providerName: "synthetic", model: "synthetic-v1" });

    const amendment = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "amendment-no-2.txt", data: Buffer.from(AMENDMENT_NO_2, "utf-8"), declaredType: "AMENDMENT" });
    amendmentDocumentId = amendment.document.id;
    await runExtractionForDocument({ companyId: COMPANY_ID, documentId: amendmentDocumentId, provider: new SyntheticExtractionProvider(), providerName: "synthetic", model: "synthetic-v1" });
  });

  afterAll(async () => {
    await teardown();
  });

  it("CLASSIFICATION: the amendment document is correctly identified as AMENDMENT, proposing a clear link (supersedesDocumentRef + effectiveFrom) to the base agreement", async () => {
    const byKind = await getCandidatesForReview(COMPANY_ID);
    const amendmentCandidate = byKind.DOCUMENT_RELATIONSHIP.find((c) => c.sourceDocumentId === amendmentDocumentId)!;
    expect(amendmentCandidate).toBeDefined();
    const value = amendmentCandidate.proposedValue as { documentType: string; supersedesDocumentRef?: string; effectiveFrom?: string };
    expect(value.documentType).toBe("AMENDMENT");
    expect(value.supersedesDocumentRef).toBe("credit-agreement.txt");
    expect(value.effectiveFrom).toBeTruthy();
    expect(new Date(value.effectiveFrom!).toISOString().slice(0, 10)).toBe("2026-06-01");
    // A reviewer sees this proposed link directly in the review workspace's
    // generic ValueTable (app/[companyId]/onboarding/review/page.tsx) - no
    // separate UI code was needed, see this file's own header comment.
  });

  it("PROMOTION: approving the amendment sets supersedesDocumentId/effectiveFrom on the amendment AND propagates effectiveTo onto the BASE document", async () => {
    const byKind = await getCandidatesForReview(COMPANY_ID);
    const baseCandidate = byKind.DOCUMENT_RELATIONSHIP.find((c) => c.sourceDocumentId === baseDocumentId)!;
    const amendmentCandidate = byKind.DOCUMENT_RELATIONSHIP.find((c) => c.sourceDocumentId === amendmentDocumentId)!;
    await reviewCandidate({ candidateId: baseCandidate.id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    await reviewCandidate({ candidateId: amendmentCandidate.id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    // Also approve every other proposal so promotion has nothing left dangling for this test's own assertions below. (This fixture's base document has no Lien section, so byKind.RELATIONSHIP/COLLATERAL_SCOPE are legitimately absent - `?? []` handles any candidate kind this fixture didn't produce.)
    for (const c of [...(byKind.DEFINED_TERM ?? []), ...(byKind.PERMISSION ?? []), ...(byKind.RELATIONSHIP ?? []), ...(byKind.EXTERNAL_INPUT_REQUIREMENT ?? [])]) {
      await reviewCandidate({ candidateId: c.id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    }

    await promoteCompanyCandidates(COMPANY_ID);

    const amendmentDoc = await prisma.document.findUniqueOrThrow({ where: { id: amendmentDocumentId } });
    expect(amendmentDoc.type).toBe("AMENDMENT");
    expect(amendmentDoc.supersedesDocumentId).toBe(baseDocumentId);
    expect(amendmentDoc.effectiveFrom?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(amendmentDoc.typeConfirmedByUser).toBe(true);
    expect(amendmentDoc.amendmentRelationshipConfirmedByUser).toBe(true);

    // The genuine gap this test found and lib/onboarding/promotion.ts now closes:
    const baseDoc = await prisma.document.findUniqueOrThrow({ where: { id: baseDocumentId } });
    expect(baseDoc.effectiveTo?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(baseDoc.effectiveFrom).toBeNull(); // never touched - still "always effective from the start"
  });

  it("EFFECTIVE-DATING: loadCompanyCovenantData treats the base document as active BEFORE the amendment date and inactive ON/AFTER it - never deleted, always queryable historically", async () => {
    // A FinancialSnapshot is required by loadCompanyCovenantData - create one covering both query dates.
    await createManualFinancialState({
      companyId: COMPANY_ID,
      asOfDate: new Date("2025-12-31"),
      ebitda: 100,
      cash: 10,
      totalDebtPrincipal: 400,
      securedDebtPrincipal: 400,
      cumulativeNetIncomeSinceIssue: 5,
      equityProceedsSinceIssue: 0,
      interestExpense: 2,
      assumedNewDebtRatePct: 7,
    });

    const before = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2026-05-01")); // before the amendment's effectiveFrom
    expect(before.documents.some((d) => d.id === baseDocumentId)).toBe(true);
    expect(before.documents.some((d) => d.id === amendmentDocumentId)).toBe(false); // amendment not yet effective

    const after = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2026-07-01")); // on/after the amendment's effectiveFrom
    expect(after.documents.some((d) => d.id === baseDocumentId)).toBe(false); // base document no longer active
    expect(after.documents.some((d) => d.id === amendmentDocumentId)).toBe(true); // amendment now active

    // Never deleted - the base document row still exists and is queryable directly, just excluded from the date-filtered "currently effective" set.
    const baseRowStillExists = await prisma.document.findUnique({ where: { id: baseDocumentId } });
    expect(baseRowStillExists).not.toBeNull();
  });
});
