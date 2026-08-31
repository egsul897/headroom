/**
 * Phase 3F.1.6.RX-FINAL, Part B (independent recertification, NOT Workstream
 * F). This file is a FRESH, adversarial attempt to falsify FINDING-7 /
 * AUDIT-F6's fix (docs/phase-3f1-6-rx-final-terminal-closure/08-product-flow-gating.json),
 * written independently of tests/onboarding/product-flow-gating.test.ts
 * (Workstream F's own test) and of
 * tests/onboarding/part-b-recert-auditf3-f6-f7-liveflow-bypass.test.ts. This
 * file never re-runs either of those - it exercises different routes, edge
 * states, and manufactured DB rows that Workstream F's own test never tried.
 *
 * Routes/edge cases probed here that Workstream F's own evidence did NOT
 * cover:
 *
 *  1. A company with ZERO Document rows and ZERO AnalysisRun rows at all -
 *     confirms the documented NO_DOCUMENTS carve-out really is inert (no
 *     findings, no candidates, no false "settled" content) rather than an
 *     accidental wildcard.
 *  2. A company whose only AnalysisRun row is FAILED (manufactured directly
 *     in Postgres, never produced through the real orchestrator) - probes
 *     whether the gate is a real status check or something that only
 *     happens to work for the states the orchestrator itself produces.
 *  3. PENDING and RUNNING AnalysisRun rows (also manufactured directly) -
 *     same probe, for the "still running" arm of the gate.
 *  4. A PARTIAL AnalysisRun (AUDIT-F3's own "instrument durably failed"
 *     status) - confirms a partially-failed run is not silently treated as
 *     review-ready.
 *  5. A document inserted directly via prisma.document.create (never through
 *     uploadDocumentAction) after a COMPLETED run - confirms staleness
 *     detection is a genuine query against the current Document table, not
 *     something coupled to the upload action's own bookkeeping.
 *  6. Direct URL navigation to the review sub-route
 *     app/[companyId]/onboarding/review/chunk/[chunkId]/page.tsx for a
 *     NEVER-ANALYZED company - this route does not import or call
 *     getAnalysisReadinessForCompany at all. Documented here as a real,
 *     ungated route, with an explicit assertion about what it does and does
 *     not expose (raw DocumentChunk.text only - no ExtractionCandidate, no
 *     ClaimReviewItem, no "review complete" framing) so a future reader does
 *     not have to re-derive whether this is the same class of bypass AUDIT-F6
 *     described.
 *  7. A same-tick "concurrent tab" simulation: ReviewPage() is called once
 *     while ready, a second document is inserted directly (not via the
 *     upload action), and ReviewPage() is called again in the same test with
 *     no cache in between - confirms force-dynamic + fresh queries, not a
 *     memoized/stale readiness result.
 *  8. The "view findings" link's badge/count vs. actual content once every
 *     ClaimReviewItem for a run has been resolved: AnalysisRun.reviewItemCount
 *     is a denormalized snapshot taken once at run-completion time
 *     (lib/contract-model/analysis/service.ts, `reviewItemCount:
 *     input.openReviewItemCount`) and is never recomputed by
 *     resolveClaimReview. This test resolves every item for a completed run
 *     and shows that the REAL documents page ("Contract analysis" status
 *     card) still advertises the stale count and still renders the "view
 *     findings" link, while the REAL review page it links to now renders
 *     ZERO findings (by design - resolved items are correctly excluded) -
 *     i.e. the link's own destination is honest (no dangling reference to a
 *     resolved item), but the badge that sends the user there is stale. This
 *     is reported as a narrower, DISTINCT residual gap from the original
 *     "destination structurally blind to ClaimReviewItem" defect, not a
 *     reopening of it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const revalidatePath = vi.fn();
const redirect = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

const { prisma } = await import("../../lib/prisma");
const { getAnalysisReadinessForCompany } = await import("../../lib/contract-model/analysis");
const { resolveClaimReview } = await import("../../lib/contract-model/compiler/safe-failure/service");
const ReviewPage = (await import("../../app/[companyId]/onboarding/review/page")).default;
const ChunkContextPage = (await import("../../app/[companyId]/onboarding/review/chunk/[chunkId]/page")).default;
const OnboardingDocumentsPage = (await import("../../app/[companyId]/onboarding/documents/page")).default;

/**
 * react-dom/server's renderToStaticMarkup cannot render an async function
 * component directly (it is a plain client/legacy renderer, not the RSC
 * renderer) - app/[companyId]/onboarding/documents/page.tsx's own
 * `ContractAnalysisStatusCard` is async and is not exported for direct
 * import. This walks the REAL returned element tree from the REAL default
 * export, finds that exact async component node by name, and invokes it
 * itself (exactly what a real RSC render would do) so its real output can be
 * inspected - never reimplementing its logic.
 */
async function resolveAsyncComponentByName(node: unknown, name: string): Promise<React.ReactElement | null> {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = await resolveAsyncComponentByName(child, name);
      if (found) return found;
    }
    return null;
  }
  const el = node as React.ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function" && (el.type as { name?: string }).name === name) {
    const resolved = (el.type as (props: unknown) => Promise<React.ReactElement>)(el.props);
    return resolved;
  }
  if (el.props && "children" in el.props) {
    return resolveAsyncComponentByName(el.props.children, name);
  }
  return null;
}

const COMPANY_ID = "part-b-recert-finding7-independent-test";
const ALGO_VERSION = "part-b-recert-finding7-independent-v1";

function packageKeyFor(documentIds: string[]): string {
  return `part-b-recert-finding7-independent:${[...documentIds].sort().join(",")}`;
}

async function makeDocument(name: string): Promise<string> {
  const doc = await prisma.document.create({
    data: { companyId: COMPANY_ID, name, type: "CREDIT_AGREEMENT" },
  });
  return doc.id;
}

async function makeRun(documentIds: string[], status: "PENDING" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_REVIEW" | "FAILED" | "PARTIAL", opts?: { reviewItemCount?: number }) {
  return prisma.analysisRun.create({
    data: {
      companyId: COMPANY_ID,
      packageKey: packageKeyFor(documentIds),
      documentIds,
      analysisAlgorithmVersion: ALGO_VERSION,
      status,
      startedAt: new Date(),
      completedAt: status === "PENDING" || status === "RUNNING" ? null : new Date(),
      reviewItemCount: opts?.reviewItemCount ?? 0,
    },
  });
}

async function makeClaimReviewItem(documentId: string, claimKey: string) {
  return prisma.claimReviewItem.create({
    data: {
      companyId: COMPANY_ID,
      documentId,
      claimKey,
      materiality: "MATERIAL",
      reasonCode: "SEMANTIC_AMBIGUITY",
      unresolvedDimensions: ["threshold"],
      originStage: "SEMANTIC_COMPILER",
      sourceEvidence: "The Borrower shall not make Investments in excess of $9,999,999 (independent-test fixture).",
      rationale: "Independent Part B recertification fixture claim - intentionally ambiguous for test purposes.",
      algorithmVersion: ALGO_VERSION,
    },
  });
}

async function teardown() {
  await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.documentChunk.deleteMany({ where: { document: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.extractionCandidate.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
}

beforeAll(async () => {
  await teardown();
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B FINDING-7 independent recert co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  redirect.mockClear();
  notFound.mockClear();
  revalidatePath.mockClear();
});

describe("FINDING-7 independent recertification: routes Workstream F's own evidence did not exercise", () => {
  it("case 1: a company with ZERO documents and ZERO AnalysisRuns is trivially ready, and ReviewPage renders no fabricated findings/candidates", async () => {
    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness).toEqual({ ready: true, run: null, reason: "NO_DOCUMENTS" });

    const element = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element).not.toBeNull();
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).not.toContain("Contract analysis findings");
    expect(html).toContain("No extraction candidates yet");
  });

  it("case 2: a manufactured FAILED-only AnalysisRun (never produced by the real orchestrator) still blocks - the gate checks real status, not orchestrator-specific bookkeeping", async () => {
    const docId = await makeDocument("finding7-indep-doc-failed.txt");
    await makeRun([docId], "FAILED");

    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("RUN_NOT_READY");

    const result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();

    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: docId } });
  });

  it("case 3: manufactured PENDING and RUNNING runs both block as RUN_IN_PROGRESS", async () => {
    const docId = await makeDocument("finding7-indep-doc-pending.txt");

    const pendingRun = await makeRun([docId], "PENDING");
    let readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness).toMatchObject({ ready: false, reason: "RUN_IN_PROGRESS" });
    redirect.mockClear();
    let result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();

    await prisma.analysisRun.update({ where: { id: pendingRun.id }, data: { status: "RUNNING" } });
    readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness).toMatchObject({ ready: false, reason: "RUN_IN_PROGRESS" });
    redirect.mockClear();
    result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();

    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: docId } });
  });

  it("case 4: a PARTIAL AnalysisRun (AUDIT-F3's own partial-instrument-failure status) is NOT treated as review-ready", async () => {
    const docId = await makeDocument("finding7-indep-doc-partial.txt");
    await makeRun([docId], "PARTIAL");

    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("RUN_NOT_READY");

    const result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();

    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: docId } });
  });

  it("case 5: a document inserted directly via prisma (not uploadDocumentAction) after a COMPLETED run still trips staleness", async () => {
    const docId = await makeDocument("finding7-indep-doc-a.txt");
    await makeRun([docId], "COMPLETED");

    let readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(true);
    redirect.mockClear();
    let result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(result).not.toBeNull();

    // Simulate a document arriving through some OTHER path than
    // uploadDocumentAction entirely (e.g. a connector/autonomous-retrieval
    // write, or direct admin insert) - the gate must not be coupled to the
    // upload action's own side effects, only to the real Document table.
    const secondDocId = await makeDocument("finding7-indep-doc-b-direct-insert.txt");

    readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("STALE_DOCUMENTS_SINCE_LAST_RUN");

    redirect.mockClear();
    result = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(result).toBeNull();

    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: { in: [docId, secondDocId] } } });
  });

  it("case 6: direct navigation to the review/chunk/[chunkId] sub-route for a NEVER-ANALYZED company is genuinely ungated - documented, and confirmed to expose only raw chunk text, never analysis-derived content", async () => {
    const docId = await makeDocument("finding7-indep-doc-chunk.txt");
    const chunk = await prisma.documentChunk.create({
      data: { documentId: docId, chunkIndex: 0, text: "RAW SOURCE TEXT - independent-test fixture, never analyzed.", sectionRef: "7.01" },
    });

    // Sanity: this company is NOT analysis-ready (no AnalysisRun at all).
    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("NEVER_ANALYZED");

    // The sub-route does not consult getAnalysisReadinessForCompany at all
    // (confirmed by static import inspection above and by this dynamic
    // proof): it renders successfully with no redirect, for a company that
    // /onboarding/review itself would refuse to serve.
    const element = await ChunkContextPage({ params: Promise.resolve({ companyId: COMPANY_ID, chunkId: chunk.id }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
    expect(element).not.toBeNull();

    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("RAW SOURCE TEXT - independent-test fixture, never analyzed.");
    // What it must NOT do: present anything that could be mistaken for a
    // settled/reviewed/analysis-complete verdict. It has no access to
    // ExtractionCandidate or ClaimReviewItem data at all (getChunkContext is
    // a bare prisma.documentChunk.findUniqueOrThrow), so this is a real but
    // narrow gap - a raw-text viewer, not a findings-consuming page - and is
    // reported as such rather than silently waved through.
    expect(html).not.toContain("Contract analysis findings");
    expect(html).not.toContain("Review extraction candidates");

    await prisma.documentChunk.deleteMany({ where: { documentId: docId } });
    await prisma.document.deleteMany({ where: { id: docId } });
  });

  it("case 7: same-tick 'concurrent tab' simulation - readiness flips between two ReviewPage() calls with no caching in between", async () => {
    const docId = await makeDocument("finding7-indep-doc-race-a.txt");
    await makeRun([docId], "COMPLETED_WITH_REVIEW");

    redirect.mockClear();
    const first = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(first).not.toBeNull();

    // A second "browser tab" inserts a document directly, with no action run
    // in between and no page reload of any kind performed by this test other
    // than calling the same server component function again.
    const raceDocId = await prisma.document.create({ data: { companyId: COMPANY_ID, name: "finding7-indep-doc-race-b.txt", type: "AMENDMENT" } });

    redirect.mockClear();
    const second = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).toHaveBeenCalledWith(`/${COMPANY_ID}/onboarding/documents`);
    expect(second).toBeNull();

    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: { in: [docId, raceDocId.id] } } });
  });

  it("case 8: after every ClaimReviewItem for a completed run is resolved, the documents page still advertises a stale reviewItemCount + 'view findings' link, but the real review page it links to now shows zero findings", async () => {
    const docId = await makeDocument("finding7-indep-doc-resolved.txt");
    const item = await makeClaimReviewItem(docId, "part-b-recert-finding7-independent::claim-1");
    await makeRun([docId], "COMPLETED_WITH_REVIEW", { reviewItemCount: 1 });

    // Golden-path sanity: the item is genuinely visible before resolution.
    redirect.mockClear();
    let reviewElement = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    let reviewHtml = renderToStaticMarkup(reviewElement as React.ReactElement);
    expect(reviewHtml).toContain("Contract analysis findings");
    expect(reviewHtml).toContain("9,999,999");

    // Resolve the only open item - the real domain function, not a raw
    // prisma.update, so this matches exactly what a human reviewer's action
    // would do.
    await resolveClaimReview({ reviewItemId: item.id, action: "ACCEPT", decidedBy: "part-b-recert-finding7-independent-reviewer", note: "independent-test resolution" });

    // AnalysisRun.reviewItemCount is a denormalized snapshot from
    // completion time (lib/contract-model/analysis/service.ts) and is never
    // recomputed by resolveClaimReview - confirm that directly.
    const runAfter = await prisma.analysisRun.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    expect(runAfter.reviewItemCount).toBe(1);

    // The real documents-page status card still shows the stale count and
    // still renders the "view findings" link pointing at /onboarding/review.
    const documentsElement = await OnboardingDocumentsPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    const statusCardElement = await resolveAsyncComponentByName(documentsElement, "ContractAnalysisStatusCard");
    expect(statusCardElement).not.toBeNull();
    const documentsHtml = renderToStaticMarkup(statusCardElement as React.ReactElement);
    expect(documentsHtml).toContain("1 open review item(s)");
    expect(documentsHtml).toContain("view findings");
    expect(documentsHtml).toContain(`/${COMPANY_ID}/onboarding/review`);

    // But the real destination that link leads to now shows ZERO findings -
    // correct with respect to the resolved item (getClaimReviewItemsForCompany
    // defaults to OPEN_REVIEW only, matching the domain's own status
    // vocabulary), yet inconsistent with the badge that told the user to
    // come here. This is reported as a distinct, narrower residual gap from
    // the original "destination structurally blind to ClaimReviewItem"
    // defect - the destination is no longer blind, but the badge that
    // advertises it can go stale.
    redirect.mockClear();
    reviewElement = await ReviewPage({ params: Promise.resolve({ companyId: COMPANY_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    reviewHtml = renderToStaticMarkup(reviewElement as React.ReactElement);
    expect(reviewHtml).not.toContain("Contract analysis findings");

    const openItems = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID, status: "OPEN_REVIEW" } });
    expect(openItems.length).toBe(0);

    await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId: COMPANY_ID } } });
    await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.document.deleteMany({ where: { id: docId } });
  });
});
