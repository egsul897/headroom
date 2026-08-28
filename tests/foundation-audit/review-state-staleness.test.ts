/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Investigation 4: Review/Approval
 * State Staleness. Audit-only, DB-backed (real Postgres, fixture-audit-*
 * company, cleaned up in afterAll). Drives real, unmodified production code:
 * prisma/schema.prisma's Document/ExtractionCandidate models,
 * lib/onboarding/review.ts's reviewCandidate,
 * lib/contract-model/compiler/package-graph/persistence.ts.
 *
 * FINDING SUMMARY (see final report for severity/classification):
 *  1. REAL LATENT LANDMINE (not yet a demonstrated production defect):
 *     Document.typeConfirmedByUser/amendmentRelationshipConfirmedByUser
 *     default to `true` at the DATABASE-COLUMN level
 *     (prisma/schema.prisma:241-242, migration
 *     20260825190617_.../migration.sql:65-66). This default exists ONLY to
 *     backfill pre-existing engineer-authored rows as "already confirmed."
 *     Every REAL, currently-wired code path that creates a Document from an
 *     unreviewed AI/upload proposal (lib/onboarding/documents.ts,
 *     lib/connectors/ingestion.ts's DOCUMENT branch) correctly overrides
 *     this default to `false` explicitly - so there is NO currently
 *     reachable defect today. But nothing in the type system or a runtime
 *     assertion enforces "a document created with source !=
 *     'engineer-authored' must set these flags explicitly" - a future
 *     document-creation code path (a new connector, a bulk-import script, a
 *     new API route) that omits these fields will silently produce rows
 *     that read as human-confirmed even though no human ever looked at them.
 *     package-graph/persistence.ts's own classification-write path
 *     (`if (!doc.typeConfirmedByUser) continue`) TRUSTS this flag completely
 *     - a silently-defaulted `true` row would never receive a real
 *     AI-proposed correction at all, and would look "reviewed" everywhere
 *     the flag is read (app/[companyId]/onboarding/documents/page.tsx's own
 *     UI literally hides the "(unconfirmed...)" annotation for such a row).
 *  2. reviewCandidate() correctly refuses to change a review decision once
 *     ExtractionCandidate.promotedAt is set ("a promoted candidate's review
 *     decision is final") - a genuine, verified positive finding.
 *  3. No code path anywhere checked in this investigation re-validates a
 *     review/approval flag against "is the underlying document/extraction
 *     still the current, non-superseded version" before trusting it - grep
 *     confirms package-graph/persistence.ts's typeConfirmedByUser check and
 *     lib/onboarding/review.ts's reviewStatus reads never join back to
 *     Document.supersedesDocumentId or any extraction-version identity.
 *     Given Investigation 1's own finding that there is no real "re-extract
 *     this same document" concept (a correction always becomes a NEW
 *     Document row, never an update to the old one), this specific
 *     staleness path is currently more theoretical than reachable - but it
 *     is unguarded by any code-level check, only by convention.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "../../lib/prisma";
import { reviewCandidate } from "../../lib/onboarding/review";

const COMPANY_ID = "fixture-audit-review-state-co";

afterAll(async () => {
  await prisma.candidateReviewEvent.deleteMany({ where: { candidate: { companyId: COMPANY_ID } } }).catch(() => {});
  await prisma.extractionCandidate.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("4a. Document.typeConfirmedByUser DB-column default is a landmine for a future, unaware code path", () => {
  it("VERIFIED: creating a Document via a bare prisma.document.create with no explicit confirmation flags defaults to CONFIRMED=true, indistinguishable from a real human review", async () => {
    await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Fixture review-state audit co" }, update: {} });

    // Deliberately mimics a hypothetical FUTURE code path that creates a
    // Document from an AI-proposed classification (source left at its own
    // default, "engineer-authored", is itself part of the landmine - a
    // careless future caller gets a doubly-wrong-looking-safe row) without
    // knowing it must explicitly pass typeConfirmedByUser: false.
    const doc = await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "Unreviewed AI-classified doc", type: "CREDIT_AGREEMENT" },
    });

    expect(doc.typeConfirmedByUser).toBe(true); // ACTUAL, OBSERVED: silently "confirmed" despite zero human review.
    expect(doc.amendmentRelationshipConfirmedByUser).toBe(true);

    // package-graph/persistence.ts's real, unmodified classification-write
    // guard (`if (!doc.typeConfirmedByUser) continue`) would SKIP this row
    // forever - a genuine AI-proposed correction to a wrong `type` value
    // would never be written, because the row already looks "confirmed."
    const guardSrc = readFileSync(new URL("../../lib/contract-model/compiler/package-graph/persistence.ts", import.meta.url), "utf-8");
    expect(guardSrc).toMatch(/doc\.typeConfirmedByUser\) continue/);
  });

  it("CONTRAST: the real, currently-wired upload path DOES override the default correctly", async () => {
    const uploadSrc = readFileSync(new URL("../../lib/onboarding/documents.ts", import.meta.url), "utf-8");
    expect(uploadSrc).toMatch(/typeConfirmedByUser:\s*false/);
    expect(uploadSrc).toMatch(/amendmentRelationshipConfirmedByUser:\s*false/);
  });
});

describe("4b. A promoted ExtractionCandidate's review decision is genuinely final - verified positive finding", () => {
  it("reviewCandidate throws when the candidate is already promoted, rather than silently accepting a new decision", async () => {
    await prisma.company.upsert({ where: { id: COMPANY_ID }, create: { id: COMPANY_ID, name: "Fixture review-state audit co" }, update: {} });
    const doc = await prisma.document.create({ data: { companyId: COMPANY_ID, name: "Doc for promoted-candidate test", type: "CREDIT_AGREEMENT" } });
    const run = await prisma.extractionRun.create({ data: { companyId: COMPANY_ID, documentId: doc.id, provider: "fixture-audit", model: "fixture-audit-model", promptVersion: "v1", schemaVersion: "v1" } });
    const stage = await prisma.extractionStage.create({ data: { extractionRunId: run.id, stage: "DEFINITIONS", status: "COMPLETE" } });
    const candidate = await prisma.extractionCandidate.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: doc.id,
        extractionRunId: run.id,
        extractionStageId: stage.id,
        kind: "DEFINED_TERM",
        proposedValue: { termName: "EBITDA", definitionExcerpt: "test" },
        confidence: 0.95,
        reviewStatus: "APPROVED",
        promotedAt: new Date(),
      },
    });

    await expect(reviewCandidate({ candidateId: candidate.id, action: "REJECT", reviewedBy: "test-reviewer@example.com" })).rejects.toThrow(/already promoted/);

    // Confirm the row's reviewStatus genuinely never changed.
    const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(after.reviewStatus).toBe("APPROVED");
  });
});

describe("4c. No review/approval consumer re-validates against document supersession or extraction-version identity", () => {
  it("VERIFIED by source inspection: package-graph/persistence.ts's typeConfirmedByUser gate and lib/onboarding/review.ts never reference supersedesDocumentId or any extraction-version field", async () => {
    const persistenceSrc = readFileSync(new URL("../../lib/contract-model/compiler/package-graph/persistence.ts", import.meta.url), "utf-8");
    expect(persistenceSrc).not.toMatch(/supersedesDocumentId/);

    const reviewSrc = readFileSync(new URL("../../lib/onboarding/review.ts", import.meta.url), "utf-8");
    expect(reviewSrc).not.toMatch(/supersedesDocumentId/);
    expect(reviewSrc).not.toMatch(/extractionRunVersion|discoveryRunVersion|retrievalAlgorithmVersion/);
  });
});
