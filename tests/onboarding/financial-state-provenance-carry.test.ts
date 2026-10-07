/**
 * P3-FFC1b — FinancialState provenance-wrapper carry.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED. A green run is not certification credit.
 *
 * WHEN A SAME-DATE FINANCIALSTATE REWRITE CHANGES ONLY SOME FIELDS, DO
 * UNCHANGED FIELDS KEEP THEIR PRIOR PROVENANCE WRAPPERS?
 *
 * W1 unchanged field carry. W2 changed field refreshes. W3 no prior.
 * W4 FFC1 conflict preserved. W5 corroboration honesty. W6 snapshot honesty.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { CONFLICTING_FINANCIAL_FACTS, createManualFinancialState, upsertFinancialFactsForDate, type BatchFinancialFact } from "../../lib/onboarding/financial";

const IDS = [
  "fixture-p3-ffc1b-w1",
  "fixture-p3-ffc1b-w2",
  "fixture-p3-ffc1b-w3",
  "fixture-p3-ffc1b-w3b",
  "fixture-p3-ffc1b-w4",
  "fixture-p3-ffc1b-w4b",
  "fixture-p3-ffc1b-w4c",
  "fixture-p3-ffc1b-w5",
  "fixture-p3-ffc1b-w6",
  "fixture-p3-ffc1b-w6b",
] as const;

const PRIOR_DATE = new Date("2026-01-31T00:00:00.000Z");
const TARGET_DATE = new Date("2026-06-30T00:00:00.000Z");
const TARGET_ISO = TARGET_DATE.toISOString();

const BASE_ROW = {
  ebitda: 18,
  cash: 4.2,
  interestExpense: 2.1,
  cumulativeNetIncome: 9,
  equityProceedsSinceIssue: 5,
  assumedNewDebtRatePct: 7.5,
  totalDebt: 52,
  securedDebt: 30,
};

function fullBatch(prefix: string, overrides: Record<string, number> = {}): BatchFinancialFact[] {
  const values: Record<string, number> = {
    cash: 4.2,
    total_debt: 52,
    secured_debt: 30,
    covenant_ebitda: 18,
    interest_expense: 2.1,
    cumulative_net_income: 9,
    equity_proceeds: 5,
    assumed_new_debt_rate_pct: 7.5,
    ...overrides,
  };
  return Object.entries(values).map(([metricName, value]) => ({ key: `${prefix}-${metricName}`, metricName, value }));
}

function wrapped(value: number, sourceType: string, reviewStatus: string, notes: string, asOfDate: string, maxAgeDays?: number) {
  return {
    value,
    sourceType,
    reviewStatus,
    notes,
    asOfDate,
    ...(maxAgeDays !== undefined ? { staleness: { maxAgeDays } } : {}),
  };
}

const CASH_PRIOR = wrapped(4.2, "EXTERNAL_CERTIFICATE", "VERIFIED", "cash-kept", "2025-12-31T00:00:00.000Z", 45);
const DEBT_PRIOR = wrapped(52, "RECONSTRUCTED", "DISPUTED", "debt-kept", "2025-11-30T00:00:00.000Z", 60);
const GAAP_PRIOR = wrapped(18, "REPORTED", "VERIFIED", "gaap-kept", "2025-10-31T00:00:00.000Z", 90);
const NI_PRIOR = wrapped(9, "ASSUMED", "UNVERIFIED", "ni-kept", "2025-09-30T00:00:00.000Z");
const EQUITY_PRIOR = wrapped(5, "REPORTED", "VERIFIED", "eq-kept", "2025-08-31T00:00:00.000Z", 10);
const INTEREST_PRIOR = wrapped(2.1, "REPORTED", "VERIFIED", "int-kept", "2025-07-31T00:00:00.000Z");
const RATE_PRIOR = wrapped(7.5, "EXTERNAL_CERTIFICATE", "VERIFIED", "rate-kept", "2025-05-31T00:00:00.000Z", 120);
const REVENUE_PRIOR = wrapped(400, "REPORTED", "VERIFIED", "rev-kept", "2025-04-30T00:00:00.000Z", 15);
const CAPEX_PRIOR = wrapped(12, "RECONSTRUCTED", "DISPUTED", "capex-kept", "2025-03-31T00:00:00.000Z");
const RESTRICTED_PRIOR = wrapped(1.25, "REPORTED", "VERIFIED", "restricted-kept", "2025-01-15T00:00:00.000Z", 7);
const ADD_BACK_PROV = wrapped(1.5, "REPORTED", "VERIFIED", "addback-kept", "2025-02-28T00:00:00.000Z");
const COVENANT_PROV = wrapped(18, "ASSUMED", "VERIFIED", "cov-kept", "2025-01-31T00:00:00.000Z", 30);
const ADD_BACKS = [{ label: "run-rate", amount: 1.5, provenance: ADD_BACK_PROV }];

function richFacts() {
  return {
    balanceSheetFacts: {
      cash: CASH_PRIOR,
      totalDebtPrincipal: DEBT_PRIOR,
      securedDebtPrincipal: { value: 30, marker: "not-a-wrapper" },
      restrictedCash: RESTRICTED_PRIOR,
      marker: "group-marker",
    },
    incomeStatementFacts: {
      revenue: REVENUE_PRIOR,
      gaapEbitda: GAAP_PRIOR,
      cumulativeNetIncomeSinceIssue: NI_PRIOR,
      equityProceedsSinceIssue: EQUITY_PRIOR,
      interestExpense: INTEREST_PRIOR,
      capex: CAPEX_PRIOR,
    },
    covenantMetricFacts: {
      assumedNewDebtRatePct: RATE_PRIOR,
      covenantEbitda: { value: 18, addbacks: ADD_BACKS, provenance: COVENANT_PROV },
    },
  };
}

async function seedRichState(companyId: string) {
  const facts = richFacts();
  return prisma.financialState.create({
    data: {
      companyId,
      asOfDate: TARGET_DATE,
      periodType: "FORECAST",
      scope: "HOLDCO",
      notes: "prior-state-notes",
      liquidityFacts: { revolverFacilityId: "fac-kept" },
      balanceSheetFacts: facts.balanceSheetFacts,
      incomeStatementFacts: facts.incomeStatementFacts,
      covenantMetricFacts: facts.covenantMetricFacts,
    },
  });
}

async function loadState(companyId: string, asOfDate: Date) {
  return prisma.financialState.findFirstOrThrow({ where: { companyId, asOfDate } });
}

function expectFresh(fact: Record<string, unknown>, value: number) {
  const asOf = fact.asOfDate instanceof Date ? fact.asOfDate.toISOString() : fact.asOfDate;
  expect(fact.value).toBe(value);
  expect(fact.sourceType).toBe("REPORTED");
  expect(fact.reviewStatus).toBe("UNVERIFIED");
  expect(asOf).toBe(TARGET_ISO);
  expect(fact.notes).toBeUndefined();
  expect(fact.staleness).toBeUndefined();
}

function assertPlainSnapshot(row: unknown) {
  const dumped = JSON.stringify(row);
  expect(dumped).not.toContain("sourceType");
  expect(dumped).not.toContain("reviewStatus");
  expect(dumped).not.toContain("staleness");
  expect(dumped).not.toContain("provenance");
  expect(dumped).not.toContain("balanceSheetFacts");
}

describe("P3-FFC1b FinancialState provenance-wrapper carry", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
    for (const id of IDS) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
  });

  it("W1 unchanged field carry: a same-date rewrite that changes cash keeps sibling wrappers", async () => {
    const before = await seedRichState(IDS[0]);
    const written = await upsertFinancialFactsForDate(IDS[0], TARGET_DATE, fullBatch("w1", { cash: 9.9 }), "w1-rewrite");
    expect(written.perFact.every((f) => f.applied)).toBe(true);
    expect(written.financialStateId).toBe(before.id);

    const states = await prisma.financialState.findMany({ where: { companyId: IDS[0], asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(1);
    const state = states[0]!;
    expect(state.id).toBe(before.id);
    expect(state.periodType).toBe("FORECAST");
    expect(state.scope).toBe("HOLDCO");
    expect(state.notes).toBe("prior-state-notes");
    expect(state.liquidityFacts).toEqual({ revolverFacilityId: "fac-kept" });

    const balance = state.balanceSheetFacts as Record<string, Record<string, unknown>>;
    expectFresh(balance.cash!, 9.9);
    expect(balance.cash!.notes).toBeUndefined();
    expect(balance.cash!.staleness).toBeUndefined();
    expect(balance.totalDebtPrincipal).toEqual(DEBT_PRIOR);
    expectFresh(balance.securedDebtPrincipal!, 30);
    expect(balance.securedDebtPrincipal!.marker).toBeUndefined();
    expect(balance.restrictedCash).toEqual(RESTRICTED_PRIOR);
    expect(balance.marker).toBeUndefined();

    const income = state.incomeStatementFacts as Record<string, Record<string, unknown>>;
    expect(income.revenue).toEqual(REVENUE_PRIOR);
    expect(income.gaapEbitda).toEqual(GAAP_PRIOR);
    expect(income.gaapNetIncome).toBeUndefined();
    expect(income.cumulativeNetIncomeSinceIssue).toEqual(NI_PRIOR);
    expect(income.equityProceedsSinceIssue).toEqual(EQUITY_PRIOR);
    expect(income.interestExpense).toEqual(INTEREST_PRIOR);
    expect(income.capex).toEqual(CAPEX_PRIOR);

    const covenant = state.covenantMetricFacts as {
      assumedNewDebtRatePct: unknown;
      covenantEbitda: { value: number; addbacks: unknown; provenance: unknown };
    };
    expect(covenant.assumedNewDebtRatePct).toEqual(RATE_PRIOR);
    expect(covenant.covenantEbitda.value).toBe(18);
    expect(covenant.covenantEbitda.addbacks).toEqual(ADD_BACKS);
    expect(covenant.covenantEbitda.provenance).toEqual(COVENANT_PROV);

    const snapshot = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[0], asOfDate: TARGET_DATE } });
    expect(snapshot.cash.toNumber()).toBe(9.9);
    expect(snapshot.ebitda.toNumber()).toBe(18);
    expect(snapshot.totalDebt.toNumber()).toBe(52);
    assertPlainSnapshot(snapshot);
  });

  it("W2 changed field refreshes: a new ebitda does not keep the stale wrapper or its addbacks", async () => {
    await seedRichState(IDS[1]);
    const written = await upsertFinancialFactsForDate(IDS[1], TARGET_DATE, fullBatch("w2", { covenant_ebitda: 21 }), "w2-rewrite");
    expect(written.perFact.find((f) => f.metricName === "covenant_ebitda")!.applied).toBe(true);

    const state = await loadState(IDS[1], TARGET_DATE);
    const balance = state.balanceSheetFacts as Record<string, unknown>;
    expect(balance.cash).toEqual(CASH_PRIOR);

    const income = state.incomeStatementFacts as Record<string, Record<string, unknown>>;
    expectFresh(income.gaapEbitda!, 21);
    expect(income.gaapEbitda!.notes).not.toBe("gaap-kept");
    expect(income.revenue).toEqual(REVENUE_PRIOR);
    expect(income.interestExpense).toEqual(INTEREST_PRIOR);

    const covenant = state.covenantMetricFacts as {
      covenantEbitda: { value: number; addbacks: unknown[]; provenance: Record<string, unknown> };
    };
    expect(covenant.covenantEbitda.value).toBe(21);
    expect(covenant.covenantEbitda.addbacks).toEqual([]);
    expectFresh(covenant.covenantEbitda.provenance, 21);
    expect(covenant.covenantEbitda.provenance.notes).not.toBe("cov-kept");
    expect(covenant.covenantEbitda.provenance.value).not.toBe(18);

    const snapshot = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[1], asOfDate: TARGET_DATE } });
    expect(snapshot.ebitda.toNumber()).toBe(21);
    expect(snapshot.cash.toNumber()).toBe(4.2);
    assertPlainSnapshot(snapshot);
  });

  it("W3 no prior: first-write wrappers are fresh, and a prior date is not a carry source", async () => {
    const created = await createManualFinancialState({
      companyId: IDS[2],
      asOfDate: TARGET_DATE,
      ebitda: 18,
      cash: 4.2,
      totalDebtPrincipal: 52,
      securedDebtPrincipal: 30,
      cumulativeNetIncomeSinceIssue: 9,
      equityProceedsSinceIssue: 5,
      interestExpense: 2.1,
      assumedNewDebtRatePct: 7.5,
      notes: "manual-first",
    });
    const balance = created.balanceSheetFacts as Record<string, Record<string, unknown>>;
    const income = created.incomeStatementFacts as Record<string, unknown>;
    const covenant = created.covenantMetricFacts as { covenantEbitda: { value: number; addbacks: unknown[]; provenance: Record<string, unknown> }; assumedNewDebtRatePct: Record<string, unknown> };
    expectFresh(balance.cash!, 4.2);
    expectFresh(balance.totalDebtPrincipal!, 52);
    expectFresh(balance.securedDebtPrincipal!, 30);
    expectFresh(income.gaapEbitda as Record<string, unknown>, 18);
    expect(income.revenue).toBeUndefined();
    expect(income.gaapNetIncome).toBeUndefined();
    expect(income.capex).toBeUndefined();
    expectFresh(covenant.assumedNewDebtRatePct, 7.5);
    expect(covenant.covenantEbitda.value).toBe(18);
    expect(covenant.covenantEbitda.addbacks).toEqual([]);
    expectFresh(covenant.covenantEbitda.provenance, 18);

    const prior = await prisma.financialState.create({
      data: {
        companyId: IDS[3],
        asOfDate: PRIOR_DATE,
        notes: "prior-date-only",
        balanceSheetFacts: { cash: CASH_PRIOR },
        incomeStatementFacts: { gaapEbitda: GAAP_PRIOR },
        covenantMetricFacts: { assumedNewDebtRatePct: RATE_PRIOR, covenantEbitda: { value: 18, addbacks: ADD_BACKS, provenance: COVENANT_PROV } },
      },
    });
    const firstWrite = await upsertFinancialFactsForDate(IDS[3], TARGET_DATE, fullBatch("w3"), "w3-first");
    expect(firstWrite.perFact.every((f) => f.applied)).toBe(true);
    const target = await loadState(IDS[3], TARGET_DATE);
    expect(target.id).not.toBe(prior.id);
    const targetBalance = target.balanceSheetFacts as Record<string, Record<string, unknown>>;
    expectFresh(targetBalance.cash!, 4.2);
    expect(targetBalance.cash).not.toEqual(CASH_PRIOR);
    const targetIncome = target.incomeStatementFacts as Record<string, unknown>;
    expect(targetIncome.revenue).toBeUndefined();
    const stillPrior = await loadState(IDS[3], PRIOR_DATE);
    expect(stillPrior.updatedAt.toISOString()).toBe(prior.updatedAt.toISOString());
    expect(stillPrior.balanceSheetFacts).toEqual({ cash: CASH_PRIOR });
    expect(stillPrior.notes).toBe("prior-date-only");
  });

  it("W4 FFC1 conflict preserved: V vs W does not overwrite numbers or wrappers", async () => {
    await prisma.financialSnapshot.create({ data: { companyId: IDS[4], asOfDate: TARGET_DATE, notes: "canonical-v", ...BASE_ROW } });
    const seeded = await seedRichState(IDS[4]);
    const beforeJson = JSON.stringify({
      balanceSheetFacts: seeded.balanceSheetFacts,
      incomeStatementFacts: seeded.incomeStatementFacts,
      covenantMetricFacts: seeded.covenantMetricFacts,
      notes: seeded.notes,
      liquidityFacts: seeded.liquidityFacts,
    });
    const against = await upsertFinancialFactsForDate(IDS[4], TARGET_DATE, [{ key: "w4-cash", metricName: "cash", value: 8.8 }], "w4-conflict");
    expect(against.perFact).toHaveLength(1);
    expect(against.perFact[0]!.applied).toBe(false);
    expect(against.perFact[0]!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(against.financialSnapshotId).toBeUndefined();
    const after = await loadState(IDS[4], TARGET_DATE);
    expect(after.updatedAt.toISOString()).toBe(seeded.updatedAt.toISOString());
    expect(JSON.stringify({
      balanceSheetFacts: after.balanceSheetFacts,
      incomeStatementFacts: after.incomeStatementFacts,
      covenantMetricFacts: after.covenantMetricFacts,
      notes: after.notes,
      liquidityFacts: after.liquidityFacts,
    })).toBe(beforeJson);
    const snapshot = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[4], asOfDate: TARGET_DATE } });
    expect(snapshot.cash.toNumber()).toBe(4.2);
    expect(snapshot.notes).toBe("canonical-v");
    expect(await prisma.financialState.count({ where: { companyId: IDS[4] } })).toBe(1);

    const noSnapshot = await seedRichState(IDS[5]);
    const noSnapshotBefore = noSnapshot.updatedAt.toISOString();
    const internal = await upsertFinancialFactsForDate(IDS[5], TARGET_DATE, [
      { key: "cash-a", metricName: "cash", value: 1 },
      { key: "cash-b", metricName: "cash", value: 2 },
      ...fullBatch("w4b").filter((f) => f.metricName !== "cash"),
    ], "w4-internal");
    expect(internal.financialSnapshotId).toBeUndefined();
    expect(await prisma.financialSnapshot.count({ where: { companyId: IDS[5] } })).toBe(0);
    for (const key of ["cash-a", "cash-b"]) {
      const outcome = internal.perFact.find((f) => f.key === key)!;
      expect(outcome.applied).toBe(false);
      expect(outcome.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    }
    const siblings = internal.perFact.filter((f) => f.metricName !== "cash");
    expect(siblings.every((f) => f.applied === false)).toBe(true);
    expect(siblings.every((f) => f.skipReason?.includes("Prior-date snapshots are not used as a seed"))).toBe(true);
    const untouched = await loadState(IDS[5], TARGET_DATE);
    expect(untouched.updatedAt.toISOString()).toBe(noSnapshotBefore);
    expect(untouched.balanceSheetFacts).toEqual(noSnapshot.balanceSheetFacts);

    await prisma.financialSnapshot.create({ data: { companyId: IDS[6], asOfDate: TARGET_DATE, notes: "snapshot-only", ...BASE_ROW } });
    const mixed = await upsertFinancialFactsForDate(IDS[6], TARGET_DATE, [
      { key: "cash-ok", metricName: "cash", value: 4.2 },
      { key: "secured-w", metricName: "secured_debt", value: 99 },
    ], "w4-missing-state");
    expect(mixed.perFact.find((f) => f.key === "cash-ok")).toMatchObject({ applied: true });
    expect(mixed.perFact.find((f) => f.key === "secured-w")!.applied).toBe(false);
    expect(mixed.perFact.find((f) => f.key === "secured-w")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    const kept = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[6], asOfDate: TARGET_DATE } });
    expect(kept.cash.toNumber()).toBe(4.2);
    expect(kept.securedDebt.toNumber()).toBe(30);
    expect(kept.notes).toBe("snapshot-only");
    assertPlainSnapshot(kept);
    const filled = await loadState(IDS[6], TARGET_DATE);
    const filledBalance = filled.balanceSheetFacts as Record<string, Record<string, unknown>>;
    expectFresh(filledBalance.cash!, 4.2);
    expectFresh(filledBalance.securedDebtPrincipal!, 30);
    expect(filledBalance.securedDebtPrincipal!.value).not.toBe(99);
    expect(filled.notes).toBe("snapshot-only");
  });

  it("W5 corroboration honesty: identical values apply and do not rewrite wrappers", async () => {
    await prisma.financialSnapshot.create({ data: { companyId: IDS[7], asOfDate: TARGET_DATE, notes: "base-notes", ...BASE_ROW } });
    const seeded = await seedRichState(IDS[7]);
    const beforeFacts = JSON.stringify({
      balanceSheetFacts: seeded.balanceSheetFacts,
      incomeStatementFacts: seeded.incomeStatementFacts,
      covenantMetricFacts: seeded.covenantMetricFacts,
    });
    const corroborated = await upsertFinancialFactsForDate(IDS[7], TARGET_DATE, [
      { key: "cash-1", metricName: "cash", value: 4.2 },
      { key: "cash-2", metricName: "cash", value: 4.2 },
      { key: "ebitda-w", metricName: "covenant_ebitda", value: 100 },
    ], "w5-must-not-rewrite");
    expect(corroborated.perFact.find((f) => f.key === "cash-1")).toMatchObject({ applied: true, financialSnapshotId: corroborated.financialSnapshotId });
    expect(corroborated.perFact.find((f) => f.key === "cash-2")).toMatchObject({ applied: true });
    expect(corroborated.perFact.find((f) => f.key === "ebitda-w")!.applied).toBe(false);
    expect(corroborated.perFact.find((f) => f.key === "ebitda-w")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    const cashContributors = corroborated.perFact.filter((f) => f.metricName === "cash");
    expect(cashContributors.every((f) => f.applied)).toBe(true);
    expect(corroborated.perFact.find((f) => f.key === "ebitda-w")!.applied).toBe(false);

    const snapshot = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[7], asOfDate: TARGET_DATE } });
    expect(snapshot.cash.toNumber()).toBe(4.2);
    expect(snapshot.ebitda.toNumber()).toBe(18);
    expect(snapshot.notes).toBe("base-notes");
    const after = await loadState(IDS[7], TARGET_DATE);
    expect(after.updatedAt.toISOString()).toBe(seeded.updatedAt.toISOString());
    expect(JSON.stringify({
      balanceSheetFacts: after.balanceSheetFacts,
      incomeStatementFacts: after.incomeStatementFacts,
      covenantMetricFacts: after.covenantMetricFacts,
    })).toBe(beforeFacts);
    expect((after.balanceSheetFacts as { cash: { notes: string } }).cash.notes).toBe("cash-kept");
  });

  it("W6 snapshot honesty: snapshot columns stay plain numbers with no per-field provenance", async () => {
    await seedRichState(IDS[8]);
    await upsertFinancialFactsForDate(IDS[8], TARGET_DATE, fullBatch("w6", { cash: 6 }), "w6-create-snapshot");
    const created = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[8], asOfDate: TARGET_DATE } });
    expect(created.cash.toNumber()).toBe(6);
    expect(created.ebitda.toNumber()).toBe(18);
    expect(created.totalDebt.toNumber()).toBe(52);
    expect(created.securedDebt.toNumber()).toBe(30);
    expect(created.interestExpense.toNumber()).toBe(2.1);
    expect(created.cumulativeNetIncome.toNumber()).toBe(9);
    expect(created.equityProceedsSinceIssue.toNumber()).toBe(5);
    expect(created.assumedNewDebtRatePct.toNumber()).toBe(7.5);
    assertPlainSnapshot(created);
    const state = await loadState(IDS[8], TARGET_DATE);
    expect((state.balanceSheetFacts as { totalDebtPrincipal: unknown }).totalDebtPrincipal).toEqual(DEBT_PRIOR);
    expect((state.balanceSheetFacts as { cash: { value: number } }).cash.value).toBe(6);

    await prisma.financialSnapshot.create({ data: { companyId: IDS[9], asOfDate: TARGET_DATE, notes: "do-not-wrap", ...BASE_ROW } });
    await upsertFinancialFactsForDate(IDS[9], TARGET_DATE, [{ key: "echo", metricName: "cash", value: 4.2 }], "w6-echo");
    const echoed = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[9], asOfDate: TARGET_DATE } });
    expect(echoed.cash.toNumber()).toBe(4.2);
    expect(echoed.ebitda.toNumber()).toBe(18);
    expect(echoed.notes).toBe("do-not-wrap");
    assertPlainSnapshot(echoed);
    const filled = await loadState(IDS[9], TARGET_DATE);
    const filledBalance = filled.balanceSheetFacts as Record<string, Record<string, unknown>>;
    expectFresh(filledBalance.cash!, 4.2);
    expect(filledBalance.cash!.sourceType).toBe("REPORTED");
    expect(Object.keys(echoed).sort()).not.toContain("balanceSheetFacts");
  });

  it("R0 C6 and PERMISSION duplicate-ref skip stay in place", () => {
    const financial = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(financial).not.toMatch(/asOfDate:\s*\{\s*lt:/);
    expect(financial).not.toMatch(/\.\.\.baseFromSameDate,\s*\.\.\.Object\.fromEntries\(resolvedFields\)/);
    expect(financial).toContain(CONFLICTING_FINANCIAL_FACTS);

    const promotion = readFileSync(join(process.cwd(), "lib/onboarding/promotion.ts"), "utf8");
    expect(promotion).toContain('if (refToPermissionId.has(value.permissionRef))');
    expect(promotion).toContain('Duplicate permissionRef "${value.permissionRef}" already promoted in this batch - not re-promoted.');
    const permissionBlock = promotion.slice(promotion.indexOf("// 3. PERMISSION"), promotion.indexOf("// 4."));
    const guardAt = permissionBlock.indexOf("refToPermissionId.has(value.permissionRef)");
    const createAt = permissionBlock.indexOf("tx.permission.create");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });
});
