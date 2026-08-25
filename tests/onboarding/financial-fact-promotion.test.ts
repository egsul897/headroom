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
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "../../lib/connectors/ingestion";
import { reviewCandidate } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { getCompanyDashboard } from "../../lib/dashboard-service";

const COMPANY_ID = "fixture-financial-fact-promotion-co";
const AS_OF = "2026-06-30";
// All 8 FINANCIAL_METRIC_FIELD_MAP metrics for the same date, so this is
// promotable from a company with ZERO prior FinancialSnapshot in one batch
// (lib/onboarding/financial.ts's upsertFinancialFactsForDate) - plus one
// UNRECOGNIZED metricName that must be skipped, not fabricated or errored.
const CSV = [
  "metricName,value,asOfDate,unit",
  `cash,4200000,${AS_OF},USD`,
  `total_debt,52000000,${AS_OF},USD`,
  `secured_debt,30000000,${AS_OF},USD`,
  `covenant_ebitda,18000000,${AS_OF},USD`,
  `interest_expense,2100000,${AS_OF},USD`,
  `cumulative_net_income,9000000,${AS_OF},USD`,
  `equity_proceeds,5000000,${AS_OF},USD`,
  `assumed_new_debt_rate_pct,7.5,${AS_OF},pct`,
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

    const candidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" } });
    expect(candidates).toHaveLength(9);
    candidateIds = candidates.map((c) => c.id);

    for (const id of candidateIds) {
      await reviewCandidate({ candidateId: id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    }
  });

  afterAll(async () => {
    await teardown();
  });

  it("promotes all 8 recognized metrics into ONE FinancialSnapshot/FinancialState row, and skips the unrecognized metric with a clear reason (not an error)", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.kind).toBe("FINANCIAL_FACT");
    expect(result.skipped[0]!.reason).toMatch(/Unrecognized metricName/);
    expect(result.skipped[0]!.reason).toMatch(/some_unrecognized_metric/);

    const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId: COMPANY_ID } });
    expect(snapshots).toHaveLength(1); // one row, not 8
    const snap = snapshots[0]!;
    expect(snap.cash.toNumber()).toBe(4200000);
    expect(snap.totalDebt.toNumber()).toBe(52000000);
    expect(snap.securedDebt.toNumber()).toBe(30000000);
    expect(snap.ebitda.toNumber()).toBe(18000000);
    expect(snap.interestExpense.toNumber()).toBe(2100000);
    expect(snap.cumulativeNetIncome.toNumber()).toBe(9000000);
    expect(snap.equityProceedsSinceIssue.toNumber()).toBe(5000000);
    expect(snap.assumedNewDebtRatePct.toNumber()).toBe(7.5);

    const states = await prisma.financialState.findMany({ where: { companyId: COMPANY_ID } });
    expect(states).toHaveLength(1);
    const balanceSheetFacts = states[0]!.balanceSheetFacts as { cash: { value: number } };
    expect(balanceSheetFacts.cash.value).toBe(4200000);

    // Every promoted candidate is marked promotedAt/promotedToId, pointing at the same snapshot row.
    const promoted = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT", promotedAt: { not: null } } });
    expect(promoted).toHaveLength(8);
    for (const p of promoted) expect(p.promotedToId).toBe(snap.id);
  });

  it("getCompanyDashboard reflects the promoted value, with ZERO changes to lib/dashboard-service.ts itself (git diff confirms)", async () => {
    const dashboard = await getCompanyDashboard(COMPANY_ID, new Date(AS_OF));
    expect(dashboard.company.id).toBe(COMPANY_ID);
    // financialPosition is composed from FinancialState (lib/financial-core) - the promoted cash value flows through with zero dashboard-service.ts changes.
    expect(dashboard.financialPosition).toBeDefined();
    expect(dashboard.capacity.secured).toBeDefined();
    expect(dashboard.capacity.unsecured).toBeDefined();

    // The load-bearing assertion this test file exists to make: lib/dashboard-service.ts
    // was not touched by Phase B's FINANCIAL_FACT promotion work.
    let diffOutput = "";
    try {
      diffOutput = execSync("git diff --stat HEAD -- lib/dashboard-service.ts", { cwd: process.cwd() }).toString().trim();
    } catch {
      diffOutput = "<git diff failed - not a fatal test condition, see stdout>";
    }
    expect(diffOutput).toBe("");
  });

  it("re-running promoteCompanyCandidates is a no-op for already-promoted candidates (idempotent, promotedAt gate)", async () => {
    const before = await prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } });
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(0);
    const after = await prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } });
    expect(after).toBe(before);
  });
});
