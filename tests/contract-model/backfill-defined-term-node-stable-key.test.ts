/**
 * Phase 3F.1.6.RX (Part A, Workstream C) - BLOCKER-7 + AUDIT-F5 remediation.
 *
 * Exercises the REAL scripts/backfill-defined-term-node-stable-key.ts against
 * the real live Postgres (DATABASE_URL set, schema migrated) - never a mock
 * of the backfill logic. Uses uniquely-prefixed, synthetic fixture companies
 * and tears down in afterAll - never touches the real
 * fixture-fwrg-2021-credit-agreement-co/fixture-lsb-2023-abl-credit-
 * agreement-co rows this backfill was written to repair in production, nor
 * coherent/matthews.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { runBackfill, analyzeCompany } from "../../scripts/backfill-defined-term-node-stable-key";

const COMPANY_ID = "fixture-blocker7-f5-backfill-co";
const OTHER_COMPANY_ID = "fixture-blocker7-f5-backfill-other-co";
const DOCUMENT_ID = "fixture-blocker7-f5-backfill-ca";
const OTHER_DOCUMENT_ID = "fixture-blocker7-f5-backfill-ca-2";

const NORMALIZED_TERM = "consolidated ebitda";
// The real, current stableKey formula for a defined-term row -
// computeStableKey("defined-term", companyId, documentId, normalizedName) -
// used below only to construct the CORRECT target value to assert against;
// never as a second, parallel computation the backfill itself is tested
// against (that would test the test's own logic, not the real backfill's).
const CORRECT_KEY = computeStableKey("defined-term", COMPANY_ID, DOCUMENT_ID, NORMALIZED_TERM);
// A deliberately OLD/incorrect value: the pre-P0-2 formula, missing
// documentId - exactly the real staleness this backfill targets.
const OLD_KEY = computeStableKey("defined-term", COMPANY_ID, NORMALIZED_TERM);

async function teardown() {
  await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  await prisma.document.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
}

describe("scripts/backfill-defined-term-node-stable-key.ts (BLOCKER-7 + AUDIT-F5, real DB)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Blocker-7/F5 Backfill Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: OTHER_COMPANY_ID, name: "Fixture Blocker-7/F5 Backfill OTHER Co (tenant-isolation control, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Blocker-7/F5 Backfill Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: OTHER_DOCUMENT_ID, companyId: OTHER_COMPANY_ID, name: "Fixture Blocker-7/F5 Backfill OTHER Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  });

  it("dry run reports the affected row (stale, pre-P0-2 stableKey) without writing anything", async () => {
    const row = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    const result = await runBackfill({ write: false, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.affectedRows).toBe(1);
    expect(result.totals.correctedRows).toBe(1);
    expect(result.totals.unrecoverableRows).toBe(0);

    const unchanged = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: row.id } });
    expect(unchanged.stableKey).toBe(OLD_KEY);
  });

  it("write mode corrects a deliberately old/pre-P0-2 stableKey to the current, document-scoped canonical format", async () => {
    const row = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    const result = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.correctedRows).toBe(1);
    expect(result.stillAffectedUnexplained).toBe(0);

    const after = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.stableKey).toBe(CORRECT_KEY);
    // id (primary key, and every dependent FK's join column) is untouched.
    expect(after.id).toBe(row.id);
  });

  it("a second run is a no-op (idempotent) - no rows reported affected, nothing rewritten", async () => {
    const row = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    const first = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(first.totals.correctedRows).toBe(1);
    const afterFirst = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: row.id } });
    expect(afterFirst.stableKey).toBe(CORRECT_KEY);
    const updatedAtAfterFirst = afterFirst.updatedAt.getTime();

    const second = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(second.totals.affectedRows).toBe(0);
    expect(second.totals.correctedRows).toBe(0);
    expect(second.totals.unrecoverableRows).toBe(0);

    const afterSecond = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: row.id } });
    expect(afterSecond.stableKey).toBe(CORRECT_KEY);
    // Row was never touched again on the second run.
    expect(afterSecond.updatedAt.getTime()).toBe(updatedAtAfterFirst);
  });

  it("an already-correct-format row is left untouched and not reported as affected", async () => {
    await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: CORRECT_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    const report = await analyzeCompany(COMPANY_ID);
    expect(report.affectedRows).toBe(0);
  });

  it("REFERENTIAL-INTEGRITY: after the backfill, a ContractRule's definedTermRefs entry actually resolves to the corrected DefinedTermNode row via the same lookup getRuleSourceTrace uses", async () => {
    const row = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    // Before the backfill: the exact-match lookup getRuleSourceTrace performs finds nothing.
    const before = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY_ID, stableKey: { in: [CORRECT_KEY] } } });
    expect(before).toHaveLength(0);

    await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });

    // After: the same lookup shape now resolves to the SAME row (id unchanged).
    const after = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY_ID, stableKey: { in: [CORRECT_KEY] } } });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(row.id);
    expect(after[0]?.normalizedName).toBe(NORMALIZED_TERM);
  });

  it("COLLISION (unrecoverable, never guessed): a stale row whose correct target key is already owned by a DIFFERENT row is left untouched and reported unrecoverable", async () => {
    const staleRow = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });
    // Simulates a forward re-run since the P0-2 fix shipped already having
    // created the correct-format row for the SAME real definition -
    // deliberately a distinct row id, same tenant, same target key.
    const freshRow = await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: CORRECT_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    const result = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.affectedRows).toBe(1);
    expect(result.totals.correctedRows).toBe(0);
    expect(result.totals.unrecoverableRows).toBe(1);
    const finding = result.reports[0]?.findings.find((f) => f.id === staleRow.id);
    expect(finding?.unrecoverableReason).toBeTruthy();
    expect(finding?.collisionRowId).toBe(freshRow.id);

    // Neither row was touched.
    const staleAfter = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: staleRow.id } });
    expect(staleAfter.stableKey).toBe(OLD_KEY);
    const freshAfter = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: freshRow.id } });
    expect(freshAfter.stableKey).toBe(CORRECT_KEY);

    // A follow-up write run must not report success as "nothing left" - the
    // unrecoverable row must not silently vanish from view.
    expect(result.stillAffectedUnexplained).toBe(0); // explained (logged unrecoverable), not "still mysteriously affected"
  });

  it("tenant isolation: backfilling COMPANY_ID never touches or reads OTHER_COMPANY_ID's rows", async () => {
    const otherOldKey = computeStableKey("defined-term", OTHER_COMPANY_ID, NORMALIZED_TERM);
    const otherRow = await prisma.definedTermNode.create({
      data: { companyId: OTHER_COMPANY_ID, documentId: OTHER_DOCUMENT_ID, stableKey: otherOldKey, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    // Only scope this run to COMPANY_ID - OTHER_COMPANY_ID's affected row must remain untouched.
    await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });

    const stillOld = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: otherRow.id } });
    expect(stillOld.stableKey).toBe(otherOldKey);

    // Now backfill OTHER_COMPANY_ID specifically, and confirm the computed
    // key is scoped to ITS OWN companyId/documentId (never COMPANY_ID's).
    const expectedOtherKey = computeStableKey("defined-term", OTHER_COMPANY_ID, OTHER_DOCUMENT_ID, NORMALIZED_TERM);
    expect(expectedOtherKey).not.toBe(CORRECT_KEY); // sanity: cross-tenant keys for the identical term+doc-shape must differ.

    const result = await runBackfill({ write: true, companyIds: [OTHER_COMPANY_ID], log: () => {} });
    expect(result.totals.correctedRows).toBe(1);
    const corrected = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: otherRow.id } });
    expect(corrected.stableKey).toBe(expectedOtherKey);
  });

  it("CROSS-TENANT SAFETY: a stableKey computed for one company's document never accidentally matches a DefinedTermNode row in a different company", async () => {
    // Two tenants, identical documentId string and identical term name -
    // the adversarial case the stableKey formula must not collide on.
    await prisma.definedTermNode.create({
      data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: OLD_KEY, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });
    const sameShapeOtherKey = computeStableKey("defined-term", OTHER_COMPANY_ID, DOCUMENT_ID, NORMALIZED_TERM);
    await prisma.definedTermNode.create({
      data: { companyId: OTHER_COMPANY_ID, documentId: OTHER_DOCUMENT_ID, stableKey: sameShapeOtherKey, termName: "Consolidated EBITDA", normalizedName: NORMALIZED_TERM },
    });

    // Scoped explicitly to both synthetic fixture tenants (never an
    // unscoped/full run in a test - that would also touch every real
    // company's rows in this environment's shared Postgres instance).
    await runBackfill({ write: true, companyIds: [COMPANY_ID, OTHER_COMPANY_ID], log: () => {} });

    // Company A's row must resolve to Company A's stableKey scope, never company B's.
    const resolvedForA = await prisma.definedTermNode.findMany({ where: { companyId: COMPANY_ID, stableKey: { in: [sameShapeOtherKey] } } });
    expect(resolvedForA).toHaveLength(0); // B's key must never resolve under A's companyId scope.

    const rowA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    expect(rowA.stableKey).toBe(CORRECT_KEY);
    expect(rowA.stableKey).not.toBe(sameShapeOtherKey);
  });
});
