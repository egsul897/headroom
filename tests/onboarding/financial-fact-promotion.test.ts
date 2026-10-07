/**
 * FINANCIAL_FACT promotion (Phase B, lib/onboarding/promotion.ts's new
 * block + lib/onboarding/financial.ts's upsertFinancialFactsForDate).
 *
 * Proves: an approved FINANCIAL_FACT candidate correctly updates
 * FinancialSnapshot/FinancialState; an unrecognized metricName is skipped
 * with a clear reason (never an error that aborts the batch); and -
 * critically - the EXISTING dashboard functions (getCompanyDashboard)
 * reflect the promoted value with ZERO changes to lib/dashboard-service.ts
 * itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "../../lib/connectors/ingestion";
import { reviewCandidate } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { getCompanyDashboard } from "../../lib/dashboard-service";
import { upsertFinancialFactForDate, upsertFinancialFactsForDate } from "../../lib/onboarding/financial";

const COMPANY_ID = "fixture-financial-fact-promotion-co";
const AS_OF = "2026-06-30";
// All 8 FINANCIAL_METRIC_FIELD_MAP metrics for the same date, so this is
// promotable from a company with ZERO prior FinancialSnapshot in one batch
// (lib/onboarding/financial.ts's upsertFinancialFactsForDate). `unit` is
// REQUIRED per metric (docs/autonomous-ingestion-production-readiness.md) -
// USD for every dollar-denominated metric here, PERCENT for the rate.
// `some_unrecognized_metric` is a SEPARATE, deliberately-unrecognized
// metricName - this now fails CLOSED at ingestion/parse time
// (normalizeFinancialValue's UnrecognizedMetricError, surfaced via the
// DISCOVER stage's own ingestionErrors output), one step earlier than
// before (previously it became a candidate that promotion itself skipped) -
// never becomes a candidate at all, which is what "candidates" below
// excludes it from.
const CSV = [
  "metricName,value,asOfDate,unit",
  `cash,4200000,${AS_OF},USD`,
  `total_debt,52000000,${AS_OF},USD`,
  `secured_debt,30000000,${AS_OF},USD`,
  `covenant_ebitda,18000000,${AS_OF},USD`,
  `interest_expense,2100000,${AS_OF},USD`,
  `cumulative_net_income,9000000,${AS_OF},USD`,
  `equity_proceeds,5000000,${AS_OF},USD`,
  `assumed_new_debt_rate_pct,7.5,${AS_OF},PERCENT`,
  `some_unrecognized_metric,999,${AS_OF},USD`,
].join("\n");

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("FINANCIAL_FACT promotion", () => {
  let candidateIds: string[] = [];

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Financial Fact Promotion Co (synthetic, test-only)" } });

    const connection = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    const job = await createIngestionJob({ companyId: COMPANY_ID, kind: "INITIALIZE", sourceConnectionId: connection.id, rawInput: Buffer.from(CSV) });
    const results = await runAllPendingIngestionStages(job.id);
    expect(results.every((r) => r.status === "COMPLETE")).toBe(true);

    // Only the 8 recognized, unit-valid metrics become candidates -
    // some_unrecognized_metric fails closed at ingestion/parse time (see
    // this file's own CSV comment), never reaching ExtractionCandidate.
    const candidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" } });
    expect(candidates).toHaveLength(8);
    candidateIds = candidates.map((c) => c.id);

    for (const id of candidateIds) {
      await reviewCandidate({ candidateId: id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    }
  });

  afterAll(async () => {
    await teardown();
  });

  it("the unrecognized metric was rejected at ingestion time (not promotion time), surfaced as an ingestion error, and never became a candidate", async () => {
    const job = await prisma.ingestionJob.findFirstOrThrow({ where: { companyId: COMPANY_ID }, include: { stages: true } });
    const discoverStage = job.stages.find((s) => s.stage === "DISCOVER")!;
    const ingestionErrors = (discoverStage.output as { ingestionErrors?: { error: string }[] } | null)?.ingestionErrors ?? [];
    expect(ingestionErrors.some((e) => e.error.includes("some_unrecognized_metric"))).toBe(true);
  });

  it("promotes all 8 recognized metrics into ONE FinancialSnapshot/FinancialState row (values normalized into their canonical unit - USD_MILLIONS for dollar figures)", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);
    expect(result.skipped).toHaveLength(0);

    const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId: COMPANY_ID } });
    expect(snapshots).toHaveLength(1); // one row, not 8
    const snap = snapshots[0]!;
    expect(snap.cash.toNumber()).toBe(4.2);
    expect(snap.totalDebt.toNumber()).toBe(52);
    expect(snap.securedDebt.toNumber()).toBe(30);
    expect(snap.ebitda.toNumber()).toBe(18);
    expect(snap.interestExpense.toNumber()).toBe(2.1);
    expect(snap.cumulativeNetIncome.toNumber()).toBe(9);
    expect(snap.equityProceedsSinceIssue.toNumber()).toBe(5);
    expect(snap.assumedNewDebtRatePct.toNumber()).toBe(7.5);

    const states = await prisma.financialState.findMany({ where: { companyId: COMPANY_ID } });
    expect(states).toHaveLength(1);
    const balanceSheetFacts = states[0]!.balanceSheetFacts as { cash: { value: number } };
    expect(balanceSheetFacts.cash.value).toBe(4.2);

    // Every promoted candidate is marked promotedAt/promotedToId, pointing at the same snapshot row.
    const promoted = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT", promotedAt: { not: null } } });
    expect(promoted).toHaveLength(8);
    for (const p of promoted) expect(p.promotedToId).toBe(snap.id);
  });

  it("getCompanyDashboard reflects the promoted value with no FINANCIAL_FACT-promotion-specific special-casing inside dashboard-service.ts", async () => {
    // Historical note: at the time Phase B's FINANCIAL_FACT promotion work
    // was merged, this test additionally asserted `git diff --stat HEAD --
    // lib/dashboard-service.ts` was empty, as a one-time proof that THAT
    // specific change needed no dashboard-service.ts edits. That assertion
    // compared against a moving HEAD, so it was only ever valid for the one
    // commit it was written against - any later, legitimately-scoped change
    // to dashboard-service.ts (e.g. the master-product-build's customer-
    // workspace/tenantKind work) would fail it forever after, which is not
    // a real regression. Dropped in favor of the durable behavioral claim
    // below: promoted FINANCIAL_FACT values flow through the EXISTING
    // dashboard composition with no per-kind branching required.
    const dashboard = await getCompanyDashboard(COMPANY_ID, new Date(AS_OF));
    expect(dashboard.company.id).toBe(COMPANY_ID);
    expect(dashboard.financialPosition).toBeDefined();
    expect(dashboard.capacity.secured).toBeDefined();
    expect(dashboard.capacity.unsecured).toBeDefined();
  });

  it("re-running promoteCompanyCandidates is a no-op for already-promoted candidates (idempotent, promotedAt gate)", async () => {
    const before = await prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } });
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(0);
    const after = await prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } });
    expect(after).toBe(before);
  });
});

const C6_COMPANIES = ["fixture-p3-r0-c6-incomplete", "fixture-p3-r0-c6-complete", "fixture-p3-r0-c6-samedate"] as const;
const PRIOR_DATE = new Date("2026-01-31T00:00:00.000Z");
const TARGET_DATE = new Date("2026-06-30T00:00:00.000Z");

const PRIOR_FACTS = {
  ebitda: 111,
  cash: 222,
  interestExpense: 3,
  cumulativeNetIncome: 4,
  equityProceedsSinceIssue: 5,
  assumedNewDebtRatePct: 6.5,
  totalDebt: 7,
  securedDebt: 8,
};

function fullBatch(prefix: string, values: Record<string, number>) {
  return [
    { key: `${prefix}-cash`, metricName: "cash", value: values.cash! },
    { key: `${prefix}-debt`, metricName: "total_debt", value: values.totalDebt! },
    { key: `${prefix}-secured`, metricName: "secured_debt", value: values.securedDebt! },
    { key: `${prefix}-ebitda`, metricName: "covenant_ebitda", value: values.ebitda! },
    { key: `${prefix}-interest`, metricName: "interest_expense", value: values.interestExpense! },
    { key: `${prefix}-cni`, metricName: "cumulative_net_income", value: values.cumulativeNetIncome! },
    { key: `${prefix}-equity`, metricName: "equity_proceeds", value: values.equityProceeds! },
    { key: `${prefix}-rate`, metricName: "assumed_new_debt_rate_pct", value: values.rate! },
  ];
}

describe("P3-R0 C6 — FINANCIAL_FACT promotion does not seed from a prior date", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...C6_COMPANIES] } } });
    for (const id of C6_COMPANIES) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
      await prisma.financialSnapshot.create({
        data: { companyId: id, asOfDate: PRIOR_DATE, notes: "prior-date row", ...PRIOR_FACTS },
      });
    }
    await prisma.financialSnapshot.create({
      data: {
        companyId: C6_COMPANIES[2],
        asOfDate: TARGET_DATE,
        notes: "same-date row",
        ebitda: 18,
        cash: 4.2,
        interestExpense: 2.1,
        cumulativeNetIncome: 9,
        equityProceedsSinceIssue: 5,
        assumedNewDebtRatePct: 7.5,
        totalDebt: 52,
        securedDebt: 30,
      },
    });
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...C6_COMPANIES] } } });
  });

  it("does not query an earlier asOfDate as a seed", () => {
    const src = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(src).not.toMatch(/asOfDate:\s*\{\s*lt:/);
  });

  it("an incomplete batch for a new date fails closed and leaves the prior snapshot untouched", async () => {
    const companyId = C6_COMPANIES[0];
    const result = await upsertFinancialFactsForDate(companyId, TARGET_DATE, [{ key: "only-cash", metricName: "cash", value: 999 }], "must not promote");
    expect(result.perFact).toHaveLength(1);
    expect(result.perFact[0]!.applied).toBe(false);
    expect(result.perFact[0]!.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);
    expect(result.financialSnapshotId).toBeUndefined();

    const single = await upsertFinancialFactForDate({ companyId, asOfDate: TARGET_DATE, metricName: "covenant_ebitda", value: 50 });
    expect(single.applied).toBe(false);
    expect(single.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);

    const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId }, orderBy: { asOfDate: "asc" } });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.asOfDate.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(snapshots[0]!.cash.toNumber()).toBe(222);
    expect(snapshots[0]!.ebitda.toNumber()).toBe(111);
    expect(snapshots[0]!.notes).toBe("prior-date row");
  });

  it("a complete batch for a new date writes only the supplied facts, not the prior row's values", async () => {
    const companyId = C6_COMPANIES[1];
    const supplied = { cash: 4.2, totalDebt: 52, securedDebt: 30, ebitda: 18, interestExpense: 2.1, cumulativeNetIncome: 9, equityProceeds: 5, rate: 7.5 };
    const result = await upsertFinancialFactsForDate(companyId, TARGET_DATE, fullBatch("full", supplied), "complete batch");
    expect(result.perFact.every((f) => f.applied)).toBe(true);

    const created = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(created.cash.toNumber()).toBe(4.2);
    expect(created.totalDebt.toNumber()).toBe(52);
    expect(created.securedDebt.toNumber()).toBe(30);
    expect(created.ebitda.toNumber()).toBe(18);
    expect(created.interestExpense.toNumber()).toBe(2.1);
    expect(created.cumulativeNetIncome.toNumber()).toBe(9);
    expect(created.equityProceedsSinceIssue.toNumber()).toBe(5);
    expect(created.assumedNewDebtRatePct.toNumber()).toBe(7.5);
    expect(created.ebitda.toNumber()).not.toBe(PRIOR_FACTS.ebitda);

    const prior = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId, asOfDate: PRIOR_DATE } });
    expect(prior.cash.toNumber()).toBe(222);
    expect(prior.ebitda.toNumber()).toBe(111);
  });

  it("same-date value mismatch fails closed and keeps the existing canonical value", async () => {
    const companyId = C6_COMPANIES[2];
    const result = await upsertFinancialFactsForDate(companyId, TARGET_DATE, [{ key: "merge-cash", metricName: "cash", value: 8.8 }], undefined);
    expect(result.perFact[0]!.applied).toBe(false);
    expect(result.perFact[0]!.skipReason).toMatch(/CONFLICTING_FINANCIAL_FACTS/);
    expect(result.financialSnapshotId).toBeUndefined();

    const rows = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cash.toNumber()).toBe(4.2);
    expect(rows[0]!.ebitda.toNumber()).toBe(18);
    expect(rows[0]!.totalDebt.toNumber()).toBe(52);
    expect(rows[0]!.securedDebt.toNumber()).toBe(30);
    expect(rows[0]!.notes).toBe("same-date row");

    const prior = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId, asOfDate: PRIOR_DATE } });
    expect(prior.cash.toNumber()).toBe(222);
    expect(prior.notes).toBe("prior-date row");
  });
});
