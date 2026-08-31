/**
 * Phase 3F.1.6.R (Workstream E) - BLOCKER-7 remediation.
 *
 * Exercises the REAL scripts/backfill-contract-rule-source-trace.ts against
 * the real live Postgres (DATABASE_URL set, schema migrated) - never a mock
 * of the backfill logic. Uses a uniquely-prefixed, synthetic fixture company
 * (`fixture-blocker7-backfill-co`) and tears down in afterAll - never
 * touches the real fixture-fwrg-2021-credit-agreement-co/
 * fixture-lsb-2023-abl-credit-agreement-co rows this backfill was written
 * to repair in production, nor coherent/matthews.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { runBackfill, analyzeCompany } from "../../scripts/backfill-contract-rule-source-trace";

const COMPANY_ID = "fixture-blocker7-backfill-co";
const OTHER_COMPANY_ID = "fixture-blocker7-backfill-other-co";
const DOCUMENT_ID = "fixture-blocker7-backfill-ca";

// The real, current stableKey format for a defined-term row -
// `defined-term:<sha256 slice>` - used below only to construct a
// deliberately OLD/incorrect value (a bare raw term name, matching the
// pre-3F.1.5.R defect S11-F1 describes) and to assert on the corrected one;
// never as a second, parallel computation the backfill itself is tested
// against (that would test the test's own logic, not the real backfill's).
const CORRECT_STABLE_KEY = computeStableKey("defined-term", COMPANY_ID, DOCUMENT_ID, "consolidated ebitda".toLowerCase());

async function teardown() {
  await prisma.contractRule.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  await prisma.document.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
}

describe("scripts/backfill-contract-rule-source-trace.ts (BLOCKER-7, real DB)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Blocker-7 Backfill Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: OTHER_COMPANY_ID, name: "Fixture Blocker-7 Backfill OTHER Co (tenant-isolation control, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Blocker-7 Backfill Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.contractRule.deleteMany({ where: { companyId: { in: [COMPANY_ID, OTHER_COMPANY_ID] } } });
  });

  it("dry run reports the affected row without writing anything", async () => {
    const rule = await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("contract-rule", COMPANY_ID, DOCUMENT_ID, "6.10", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.10",
        // Deliberately the OLD, pre-3F.1.5.R format: the raw term name
        // string, never a real stableKey - exactly what S11-F1 found live.
        definedTermRefs: ["Consolidated EBITDA"],
      },
    });

    const result = await runBackfill({ write: false, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.affectedRows).toBe(1);
    expect(result.totals.affectedEntries).toBe(1);
    expect(result.totals.correctedRows).toBe(1);
    expect(result.totals.unrecoverableRows).toBe(0);

    // Dry run must not have written anything.
    const unchanged = await prisma.contractRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(unchanged.definedTermRefs).toEqual(["Consolidated EBITDA"]);
  });

  it("write mode corrects a deliberately old/incorrect stableKey to the current canonical format", async () => {
    const rule = await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("contract-rule", COMPANY_ID, DOCUMENT_ID, "6.11", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.11",
        definedTermRefs: ["Consolidated EBITDA"],
      },
    });

    const result = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.correctedRows).toBe(1);
    expect(result.stillAffectedUnexplained).toBe(0);

    const after = await prisma.contractRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(after.definedTermRefs).toEqual([CORRECT_STABLE_KEY]);
    // Confirms the backfill used the SAME canonical logic persistContractRules
    // itself uses today, not a parallel re-derivation - the exact formula
    // (computeStableKey("defined-term", companyId, documentId, name.toLowerCase()))
    // is asserted independently above via CORRECT_STABLE_KEY.
  });

  it("a second run is a no-op (idempotent) - no rows reported affected, nothing rewritten", async () => {
    const rule = await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("contract-rule", COMPANY_ID, DOCUMENT_ID, "6.12", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.12",
        definedTermRefs: ["Consolidated EBITDA"],
      },
    });

    const first = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(first.totals.correctedRows).toBe(1);
    const afterFirst = await prisma.contractRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(afterFirst.definedTermRefs).toEqual([CORRECT_STABLE_KEY]);
    const updatedAtAfterFirst = afterFirst.updatedAt.getTime();

    // Second run against the now-corrected data.
    const second = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(second.totals.affectedRows).toBe(0);
    expect(second.totals.correctedRows).toBe(0);
    expect(second.totals.unrecoverableRows).toBe(0);

    const afterSecond = await prisma.contractRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(afterSecond.definedTermRefs).toEqual([CORRECT_STABLE_KEY]);
    // Row was never touched again on the second run - not merely "ended up
    // the same value", genuinely never rewritten.
    expect(afterSecond.updatedAt.getTime()).toBe(updatedAtAfterFirst);
  });

  it("an already-correct-format entry already matching the current stableKey formula is left untouched and not reported as affected", async () => {
    await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("contract-rule", COMPANY_ID, DOCUMENT_ID, "6.13", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.13",
        // Already the current, correct format (as a freshly-compiled row
        // via the fixed persistContractRules would produce it today).
        definedTermRefs: [CORRECT_STABLE_KEY],
      },
    });

    const report = await analyzeCompany(COMPANY_ID);
    expect(report.affectedRows).toBe(0);
  });

  it("a row with an empty-string definedTermRefs entry is logged unrecoverable, never guessed at", async () => {
    const rule = await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("contract-rule", COMPANY_ID, DOCUMENT_ID, "6.14", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.14",
        definedTermRefs: [""],
      },
    });

    const result = await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });
    expect(result.totals.affectedRows).toBe(1);
    expect(result.totals.unrecoverableRows).toBe(1);
    expect(result.totals.correctedRows).toBe(0);
    const finding = result.reports[0]?.findings.find((f) => f.id === rule.id);
    expect(finding?.unrecoverableReason).toBeTruthy();

    // Left completely untouched - no partial/guessed write.
    const unchanged = await prisma.contractRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(unchanged.definedTermRefs).toEqual([""]);

    // A follow-up write run for THIS company must not report success as
    // "nothing left" - the unrecoverable row must not silently vanish from
    // view (stillAffectedUnexplained only counts rows the script did NOT
    // already explain via unrecoverableReason).
    expect(result.stillAffectedUnexplained).toBe(0); // explained (logged unrecoverable), not "still mysteriously affected"
  });

  it("tenant isolation: backfilling COMPANY_ID never touches or reads OTHER_COMPANY_ID's rows", async () => {
    const otherRule = await prisma.contractRule.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID, // reusing the id string is fine - FK is scoped by the real Document row, and this row belongs to a different company than that document, so it exercises the same-name-different-tenant shape deliberately.
        stableKey: computeStableKey("contract-rule", OTHER_COMPANY_ID, DOCUMENT_ID, "6.20", "SATISFY_RATIO"),
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        sourceSectionRef: "6.20",
        definedTermRefs: ["Consolidated EBITDA"],
      },
    });

    // Only scope this run to COMPANY_ID - OTHER_COMPANY_ID's affected row must remain untouched.
    await runBackfill({ write: true, companyIds: [COMPANY_ID], log: () => {} });

    const stillOld = await prisma.contractRule.findUniqueOrThrow({ where: { id: otherRule.id } });
    expect(stillOld.definedTermRefs).toEqual(["Consolidated EBITDA"]);

    // Now backfill OTHER_COMPANY_ID specifically, and confirm the computed
    // key is scoped to ITS OWN companyId (never COMPANY_ID's), matching the
    // canonical formula's own company-scoping - the exact discipline this
    // check exists to prove.
    const expectedOtherKey = computeStableKey("defined-term", OTHER_COMPANY_ID, DOCUMENT_ID, "consolidated ebitda");
    expect(expectedOtherKey).not.toBe(CORRECT_STABLE_KEY); // sanity: cross-tenant keys for the identical term name must differ.

    const result = await runBackfill({ write: true, companyIds: [OTHER_COMPANY_ID], log: () => {} });
    expect(result.totals.correctedRows).toBe(1);
    const corrected = await prisma.contractRule.findUniqueOrThrow({ where: { id: otherRule.id } });
    expect(corrected.definedTermRefs).toEqual([expectedOtherKey]);
  });
});
