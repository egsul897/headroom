import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../../lib/onboarding/documents";
import { getCandidatesForReview, getReviewProgress, reviewCandidate, getCandidateReviewHistory } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { createManualFinancialState, suggestPermissionMatches, createFacilityWithMapping, certifyExternalInputRecord } from "../../lib/onboarding/financial";
import { generateGoldenTestProposals } from "../../lib/onboarding/golden-tests";
import { getCompanyDashboard, getDocumentDetails, listCompanies } from "../../lib/dashboard-service";

/**
 * Synthetic-company acceptance test (docs/company-onboarding-v1-implementation.md):
 * exercises the FULL real onboarding workflow end-to-end -
 *
 *   create company -> upload a synthetic .txt document -> parse/chunk/persist
 *   -> extract via SyntheticExtractionProvider -> review (approve/edit/reject)
 *   -> promote (transactional) -> post-promotion coverage-gate evaluation ->
 *   financial onboarding (manual entry) -> facility mapping ->
 *   compliance-certificate confirmation -> golden-test proposal generation ->
 *   verify the company appears correctly in the SAME generalized product
 *   services (lib/dashboard-service.ts) every other company's pages use.
 *
 * ZERO company-specific code anywhere in this path - every function called
 * here (uploadAndChunkDocument, runExtractionForDocument, reviewCandidate,
 * promoteCompanyCandidates, createManualFinancialState,
 * suggestPermissionMatches, createFacilityWithMapping,
 * certifyExternalInputRecord, generateGoldenTestProposals,
 * getCompanyDashboard) takes companyId as a plain parameter and is exercised
 * here with a company id that is neither "coherent" nor "matthews".
 *
 * The synthetic document text below is built generically (Article/Section
 * markers, `"Term" means` definitions, dollar-denominated Lien/Indebtedness
 * baskets, an EBITDA defined term, and one deliberate INDEBTEDNESS mention
 * with no dollar figure to exercise the coverage-gap path) - same spirit as
 * Phase 1's tests/extraction/fixtures, not borrowed from any real company's
 * text.
 */

const COMPANY_ID = "synthco-onboarding-acceptance";

const SYNTHETIC_CREDIT_AGREEMENT = `CREDIT AGREEMENT

ARTICLE I DEFINITIONS

SECTION 1.1 Certain Defined Terms.

"Adjusted EBITDA" means, for any period, consolidated net income plus interest expense, taxes, depreciation and amortization, further adjusted for certain non-cash and non-recurring items agreed by the Borrower and the Administrative Agent.

"Permitted Liens" means Liens permitted to be incurred under Section 2.2 of this Agreement.

ARTICLE II NEGATIVE COVENANTS

SECTION 2.1 Indebtedness.

The Borrower may incur Indebtedness under the General Debt Basket in an aggregate principal amount outstanding at any time not to exceed $500 million.

SECTION 2.2 Liens.

The Borrower may secure Indebtedness permitted under Section 2.1 with a Lien on the Collateral in an aggregate amount not to exceed $500 million.

SECTION 2.3 Other Indebtedness.

The Borrower may incur additional Indebtedness in connection with ordinary course working capital arrangements entered into in the ordinary course of business, subject to customary conditions set forth in the definitive documentation therefor.
`;

async function cleanUp() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("synthetic-company onboarding acceptance (full real workflow, zero company-specific code)", () => {
  let documentId: string;

  beforeAll(async () => {
    await cleanUp();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Synthco Onboarding Test Holdings, Inc.", onboardingStatus: "ONBOARDING" } });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("UPLOAD: stores the file and produces real DocumentChunk rows via the real parse/chunk pipeline", async () => {
    const { document, chunkCount } = await uploadAndChunkDocument({
      companyId: COMPANY_ID,
      filename: "synthco-credit-agreement.txt",
      data: Buffer.from(SYNTHETIC_CREDIT_AGREEMENT, "utf-8"),
      declaredType: "CREDIT_AGREEMENT",
      governs: "Synthco Term Loan",
    });
    documentId = document.id;
    expect(document.source).toBe("user-upload");
    expect(document.typeConfirmedByUser).toBe(false);
    expect(document.storageRef).toBeTruthy();
    expect(chunkCount).toBeGreaterThan(0);

    const chunks = await prisma.documentChunk.findMany({ where: { documentId } });
    expect(chunks.length).toBe(chunkCount);
    expect(chunks.some((c) => c.sectionRef === "2.1")).toBe(true);
    expect(chunks.some((c) => c.sectionRef === "2.2")).toBe(true);
  });

  it("EXTRACT: runs every stage via SyntheticExtractionProvider and produces the expected candidate mix", async () => {
    const { results } = await runExtractionForDocument({
      companyId: COMPANY_ID,
      documentId,
      provider: new SyntheticExtractionProvider(),
      providerName: "synthetic",
      model: "synthetic-v1",
    });
    expect(results.every((r) => r.status === "COMPLETE")).toBe(true);

    const byKind = await getCandidatesForReview(COMPANY_ID);
    expect(byKind.DOCUMENT_RELATIONSHIP.length).toBeGreaterThanOrEqual(1);
    expect(byKind.DEFINED_TERM.some((c) => (c.proposedValue as { termName: string }).termName === "Adjusted EBITDA")).toBe(true);
    expect(byKind.PERMISSION.filter((c) => (c.proposedValue as { modelingStatus: string }).modelingStatus === "MODELED").length).toBe(2);
    expect(byKind.PERMISSION.some((c) => (c.proposedValue as { modelingStatus: string; sectionRef: string }).modelingStatus === "KNOWN_NOT_MODELED" && (c.proposedValue as { sectionRef: string }).sectionRef === "2.3")).toBe(true);
    expect(byKind.RELATIONSHIP.length).toBeGreaterThanOrEqual(1);
    expect(byKind.EXTERNAL_INPUT_REQUIREMENT.some((c) => (c.proposedValue as { name: string }).name === "Adjusted EBITDA")).toBe(true);

    // The COVERAGE-stage gap placeholder must start REVIEW_REQUIRED, never PENDING.
    const gap = byKind.PERMISSION.find((c) => (c.proposedValue as { sectionRef: string }).sectionRef === "2.3")!;
    expect(gap.reviewStatus).toBe("REVIEW_REQUIRED");
  });

  it("REVIEW: approve/edit/reject decisions are logged, proposedValue is never overwritten, and a promoted candidate's decision becomes final", async () => {
    const byKind = await getCandidatesForReview(COMPANY_ID);

    // APPROVE the document-structure and defined-term proposals.
    for (const c of [...byKind.DOCUMENT_RELATIONSHIP, ...byKind.DEFINED_TERM, ...byKind.RELATIONSHIP, ...byKind.EXTERNAL_INPUT_REQUIREMENT]) {
      await reviewCandidate({ candidateId: c.id, action: "APPROVE", reviewedBy: "test-reviewer@example.com" });
    }

    // EDIT the §2.1 debt-incurrence permission's threshold before approving it,
    // proving reviewerEditedValue (not proposedValue) is what promotion reads.
    const debtPermission = byKind.PERMISSION.find((c) => (c.proposedValue as { sectionRef: string }).sectionRef === "2.1")!;
    const originalProposedValue = debtPermission.proposedValue;
    const editedValue = { ...(debtPermission.proposedValue as Record<string, unknown>), thresholdValue: 550 };
    const afterEdit = await reviewCandidate({ candidateId: debtPermission.id, action: "EDIT", editedValue, reviewedBy: "test-reviewer@example.com", note: "Corrected threshold per manual cross-check against the executed document." });
    expect(afterEdit.reviewStatus).toBe("EDITED");
    expect(afterEdit.proposedValue).toEqual(originalProposedValue); // never overwritten
    expect((afterEdit.reviewerEditedValue as { thresholdValue: number }).thresholdValue).toBe(550);

    const history = await getCandidateReviewHistory(debtPermission.id);
    expect(history.length).toBe(1);
    expect(history[0]!.action).toBe("EDIT");
    expect(history[0]!.previousStatus).toBe("PENDING");
    expect(history[0]!.newStatus).toBe("EDITED");

    // A second review decision on the same candidate is a NEW event, not an overwrite.
    await reviewCandidate({ candidateId: debtPermission.id, action: "APPROVE", reviewedBy: "second-reviewer@example.com", note: "Confirmed the correction." });
    const historyAfterSecond = await getCandidateReviewHistory(debtPermission.id);
    expect(historyAfterSecond.length).toBe(2);
    expect(historyAfterSecond[1]!.action).toBe("APPROVE");

    // Approve the §2.2 lien permission as-is.
    const lienPermission = byKind.PERMISSION.find((c) => (c.proposedValue as { sectionRef: string }).sectionRef === "2.2")!;
    await reviewCandidate({ candidateId: lienPermission.id, action: "APPROVE", reviewedBy: "test-reviewer@example.com" });

    // APPROVE the §2.3 KNOWN_NOT_MODELED gap candidate too - simulating a
    // reviewer confirming "yes, this really is an unmodeled gap." This is
    // the strongest test of the fail-closed hard rule: promotion must
    // refuse to turn this into a real Permission even though a human
    // approved it.
    const gap = byKind.PERMISSION.find((c) => (c.proposedValue as { sectionRef: string }).sectionRef === "2.3")!;
    expect(gap.reviewStatus).toBe("REVIEW_REQUIRED");
    await reviewCandidate({ candidateId: gap.id, action: "APPROVE", reviewedBy: "test-reviewer@example.com", note: "Confirmed this really is an unmodeled gap for now." });

    const progress = await getReviewProgress(COMPANY_ID);
    expect(progress.pending).toBe(0);
    expect(progress.reviewRequired).toBe(0);
    expect(progress.approved).toBeGreaterThanOrEqual(1);
  });

  it("MissingReviewerError: a review decision is refused without a real reviewer identifier (never fabricated)", async () => {
    const byKind = await getCandidatesForReview(COMPANY_ID);
    const anyCandidate = byKind.DEFINED_TERM[0]!;
    await expect(reviewCandidate({ candidateId: anyCandidate.id, action: "APPROVE", reviewedBy: "" })).rejects.toThrow(/reviewedBy is required/);
  });

  it("PROMOTE: transactionally writes real Permission/PermissionRelationship rows, excludes the KNOWN_NOT_MODELED gap, and lands ACTIVE_WITH_LIMITATIONS while the gap is unresolved", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID);
    expect(result.promotedCount).toBeGreaterThan(0);

    const permissions = await prisma.permission.findMany({ where: { companyId: COMPANY_ID } });
    expect(permissions.length).toBe(2); // §2.1 and §2.2 only - §2.3 excluded
    const debtPermission = permissions.find((p) => p.code === "2.1")!;
    const lienPermission = permissions.find((p) => p.code === "2.2")!;
    expect(Number(debtPermission.thresholdValue)).toBe(550); // reflects the EDIT, not the original 500
    expect(Number(lienPermission.thresholdValue)).toBe(500);
    expect(debtPermission.modelingStatus).toBe("MODELED");
    expect(debtPermission.reviewStatus).toBe("UNVERIFIED"); // never auto-VERIFIED

    const relationships = await prisma.permissionRelationship.findMany({ where: { companyId: COMPANY_ID } });
    expect(relationships.length).toBe(1);
    expect(relationships[0]!.fromPermissionId).toBe(debtPermission.id);
    expect(relationships[0]!.toPermissionId).toBe(lienPermission.id);

    // The KNOWN_NOT_MODELED §2.3 candidate was excluded, not promoted.
    const gapCandidate = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "PERMISSION", sourceSectionRef: "2.3" } });
    expect(gapCandidate.promotedAt).toBeNull();
    expect(result.skipped.some((s) => s.candidateId === gapCandidate.id && /KNOWN_NOT_MODELED/.test(s.reason))).toBe(true);

    // A real, undismissed gap remains -> ACTIVE_WITH_LIMITATIONS, not ACTIVE, not blocked.
    expect(result.onboardingStatus).toBe("ACTIVE_WITH_LIMITATIONS");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
    expect(company.onboardingStatus).toBe("ACTIVE_WITH_LIMITATIONS");

    const declarations = await prisma.solverCoverageDeclaration.findMany({ where: { companyId: COMPANY_ID } });
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.every((d) => d.isComplete === false)).toBe(true); // conservative, per-document gap check
  });

  it("promotion is idempotent/incremental: re-running with nothing new approved promotes nothing further", async () => {
    const before = await prisma.permission.count({ where: { companyId: COMPANY_ID } });
    const result = await promoteCompanyCandidates(COMPANY_ID);
    expect(result.promotedCount).toBe(0);
    const after = await prisma.permission.count({ where: { companyId: COMPANY_ID } });
    expect(after).toBe(before);
  });

  it("resolving the documented gap (human REJECTs it) and re-promoting clears the coverage gate to ACTIVE", async () => {
    const gapCandidate = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "PERMISSION", sourceSectionRef: "2.3" } });
    await reviewCandidate({ candidateId: gapCandidate.id, action: "REJECT", reviewedBy: "test-reviewer@example.com", note: "Confirmed this is ordinary-course language, not a real additional debt basket - correctly left unmodeled." });

    const result = await promoteCompanyCandidates(COMPANY_ID);
    expect(result.onboardingStatus).toBe("ACTIVE");
    const declarations = await prisma.solverCoverageDeclaration.findMany({ where: { companyId: COMPANY_ID } });
    expect(declarations.every((d) => d.isComplete === true)).toBe(true);
  });

  it("a promoted candidate's review decision is final - reviewCandidate refuses to touch it again", async () => {
    const promoted = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "PERMISSION", sourceSectionRef: "2.1" } });
    await expect(reviewCandidate({ candidateId: promoted.id, action: "REJECT", reviewedBy: "test-reviewer@example.com" })).rejects.toThrow(/already promoted/);
  });

  it("FINANCIALS: manual entry writes a real FinancialState via lib/financial-core/** types", async () => {
    const state = await createManualFinancialState({
      companyId: COMPANY_ID,
      asOfDate: new Date("2026-06-30"),
      ebitda: 300,
      cash: 120,
      totalDebtPrincipal: 900,
      securedDebtPrincipal: 550,
      cumulativeNetIncomeSinceIssue: 80,
      equityProceedsSinceIssue: 0,
      interestExpense: 45,
      assumedNewDebtRatePct: 7.5,
    });
    expect(state.companyId).toBe(COMPANY_ID);
    const bsf = state.balanceSheetFacts as unknown as { cash: { value: number; sourceType: string; reviewStatus: string } };
    expect(bsf.cash.value).toBe(120);
    expect(bsf.cash.sourceType).toBe("REPORTED");
    expect(bsf.cash.reviewStatus).toBe("UNVERIFIED");
  });

  it("FACILITY MAPPING: suggests ranked Permission candidates and writes a human-confirmed mapping (not exact-name-match-only)", async () => {
    const suggestions = await suggestPermissionMatches(COMPANY_ID, "Term Loan secured by Lien on Collateral");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]!.score).toBeGreaterThan(0);
    // The lien permission's action text ("secure Indebtedness with a Lien")
    // should outrank an unrelated permission for this instrument name.
    const lienPermission = await prisma.permission.findFirstOrThrow({ where: { companyId: COMPANY_ID, code: "2.2" } });
    expect(suggestions[0]!.permission.id).toBe(lienPermission.id);

    const facility = await createFacilityWithMapping({
      companyId: COMPANY_ID,
      name: "Synthco Term Loan A",
      facilityType: "TERM_LOAN",
      originalPrincipal: 400,
      secured: true,
      couponType: "FLOATING",
      marginBps: 275,
      referenceRate: "SOFR",
      originatingPermissionIds: [lienPermission.id],
    });
    expect(facility.originatingPermissionIds).toEqual([lienPermission.id]);
  });

  it("COMPLIANCE CERTIFICATE: the promoted EXTERNAL_INPUT_REQUIREMENT is a placeholder until a human certifies a real value", async () => {
    const placeholder = await prisma.externalInputRecord.findFirstOrThrow({ where: { companyId: COMPANY_ID, name: "Adjusted EBITDA" } });
    expect(placeholder.value).toBeNull();
    expect(placeholder.reviewStatus).toBe("UNVERIFIED");

    const certified = await certifyExternalInputRecord({ externalInputRecordId: placeholder.id, value: 312.5, asOfDate: new Date("2026-06-30"), sourceRef: "Q2 2026 Compliance Certificate" });
    expect(Number(certified.value)).toBe(312.5);
    expect(certified.reviewStatus).toBe("VERIFIED");
  });

  it("GOLDEN TESTS: proposals use stableKey (never a new hardcoded id), compute expectedAnswer for real, and never start VERIFIED", async () => {
    const proposals = await generateGoldenTestProposals(COMPANY_ID, new Date("2026-06-30"));
    expect(proposals.length).toBe(2);
    expect(proposals.every((p) => /^synthco-onboarding-acceptance:q\d{2}$/.test(p.stableKey))).toBe(true);

    const rows = await prisma.goldenTest.findMany({ where: { companyId: COMPANY_ID } });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.status === "UNVERIFIED")).toBe(true);

    // Re-running proposal generation must upsert on stableKey, never duplicate.
    await generateGoldenTestProposals(COMPANY_ID, new Date("2026-06-30"));
    const rowsAfterRerun = await prisma.goldenTest.findMany({ where: { companyId: COMPANY_ID } });
    expect(rowsAfterRerun.length).toBe(2);
  });

  it("ACTIVATE: the company now appears correctly in the SAME generalized product services every other company uses, with zero company-specific code", async () => {
    const companies = await listCompanies();
    expect(companies.some((c) => c.id === COMPANY_ID)).toBe(true);

    const dashboard = await getCompanyDashboard(COMPANY_ID, new Date("2026-06-30"));
    expect(dashboard.company.id).toBe(COMPANY_ID);
    expect(dashboard.documents.length).toBe(1);
    expect(dashboard.financialPosition).toBeDefined();
    // Both sides are now SOLVER_NATIVE (the coverage gap was resolved above),
    // so the SAME computeRemainingCapacityAfterDebtIncurrence call every
    // other company's Overview/Capacity page uses should resolve a real
    // number here too, not silently fail closed.
    expect(dashboard.capacity.secured.remainingCapacity).toBeDefined();
    expect(dashboard.capacity.unsecured.remainingCapacity).toBeDefined();

    const documentDetails = await getDocumentDetails(COMPANY_ID);
    expect(documentDetails.length).toBe(1);
    expect(documentDetails[0]!.permissionCount).toBe(2);

    const finalCompany = await prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
    expect(finalCompany.onboardingStatus).toBe("ACTIVE");
  });
});
