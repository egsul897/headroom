/**
 * P3-FFC2b — write-side same-date financial identity.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED. A green run is not certification credit.
 *
 * W1 0 → UNKNOWN / absent. W2 1 → UNIQUE. W3 >1 Snapshot → AMBIGUOUS.
 * W4 >1 State → AMBIGUOUS. W5 FFC1 preserved under UNIQUE.
 * W6 FFC1b wrapper carry preserved under UNIQUE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { CONFLICTING_FINANCIAL_FACTS, upsertFinancialFactsForDate, type BatchFinancialFact } from "../../lib/onboarding/financial";
import { FINANCIAL_IDENTITY_AMBIGUOUS, FINANCIAL_IDENTITY_UNKNOWN, resolveCanonicalFinancialIdentity } from "../../lib/financial-identity";

const IDS = [
  "fixture-p3-ffc2b-w1-skip",
  "fixture-p3-ffc2b-w1-prior",
  "fixture-p3-ffc2b-w1-create",
  "fixture-p3-ffc2b-w2-both",
  "fixture-p3-ffc2b-w2-snap",
  "fixture-p3-ffc2b-w3",
  "fixture-p3-ffc2b-w3-only",
  "fixture-p3-ffc2b-w4",
  "fixture-p3-ffc2b-w4-snap",
  "fixture-p3-ffc2b-w5",
  "fixture-p3-ffc2b-w6",
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

const CASH_PRIOR = {
  value: 4.2,
  sourceType: "EXTERNAL_CERTIFICATE",
  reviewStatus: "VERIFIED",
  notes: "cash-kept",
  asOfDate: "2025-12-31T00:00:00.000Z",
  staleness: { maxAgeDays: 45 },
};
const DEBT_PRIOR = {
  value: 52,
  sourceType: "RECONSTRUCTED",
  reviewStatus: "DISPUTED",
  notes: "debt-kept",
  asOfDate: "2025-11-30T00:00:00.000Z",
};
const GAAP_PRIOR = {
  value: 18,
  sourceType: "REPORTED",
  reviewStatus: "VERIFIED",
  notes: "gaap-kept",
  asOfDate: "2025-10-31T00:00:00.000Z",
};
const NI_PRIOR = {
  value: 9,
  sourceType: "ASSUMED",
  reviewStatus: "UNVERIFIED",
  notes: "ni-kept",
  asOfDate: "2025-09-30T00:00:00.000Z",
};
const EQUITY_PRIOR = {
  value: 5,
  sourceType: "REPORTED",
  reviewStatus: "VERIFIED",
  notes: "eq-kept",
  asOfDate: "2025-08-31T00:00:00.000Z",
};
const INTEREST_PRIOR = {
  value: 2.1,
  sourceType: "REPORTED",
  reviewStatus: "VERIFIED",
  notes: "int-kept",
  asOfDate: "2025-07-31T00:00:00.000Z",
};
const RATE_PRIOR = {
  value: 7.5,
  sourceType: "EXTERNAL_CERTIFICATE",
  reviewStatus: "VERIFIED",
  notes: "rate-kept",
  asOfDate: "2025-05-31T00:00:00.000Z",
  staleness: { maxAgeDays: 120 },
};
const COVENANT_PROV = {
  value: 18,
  sourceType: "ASSUMED",
  reviewStatus: "VERIFIED",
  notes: "cov-kept",
  asOfDate: "2025-01-31T00:00:00.000Z",
  staleness: { maxAgeDays: 30 },
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

function bareStateData(companyId: string, marker: string) {
  return {
    companyId,
    asOfDate: TARGET_DATE,
    notes: marker,
    balanceSheetFacts: { marker },
    incomeStatementFacts: { marker },
    covenantMetricFacts: { marker },
  };
}

function richStateData(companyId: string) {
  return {
    companyId,
    asOfDate: TARGET_DATE,
    periodType: "FORECAST" as const,
    scope: "HOLDCO",
    notes: "prior-state-notes",
    liquidityFacts: { revolverFacilityId: "fac-kept" },
    balanceSheetFacts: {
      cash: CASH_PRIOR,
      totalDebtPrincipal: DEBT_PRIOR,
      securedDebtPrincipal: { value: 30, marker: "not-a-wrapper" },
    },
    incomeStatementFacts: {
      gaapEbitda: GAAP_PRIOR,
      cumulativeNetIncomeSinceIssue: NI_PRIOR,
      equityProceedsSinceIssue: EQUITY_PRIOR,
      interestExpense: INTEREST_PRIOR,
    },
    covenantMetricFacts: {
      assumedNewDebtRatePct: RATE_PRIOR,
      covenantEbitda: { value: 18, addbacks: [{ label: "run-rate", amount: 1.5 }], provenance: COVENANT_PROV },
    },
  };
}

function stateBody(row: { balanceSheetFacts: unknown; incomeStatementFacts: unknown; covenantMetricFacts: unknown; notes: string | null; liquidityFacts: unknown; periodType: string; scope: string }) {
  return JSON.stringify({
    balanceSheetFacts: row.balanceSheetFacts,
    incomeStatementFacts: row.incomeStatementFacts,
    covenantMetricFacts: row.covenantMetricFacts,
    notes: row.notes,
    liquidityFacts: row.liquidityFacts,
    periodType: row.periodType,
    scope: row.scope,
  });
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

describe("P3-FFC2b write-side same-date financial identity", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
    for (const id of IDS) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
  });

  it("W1 0 rows is UNKNOWN and stays on the absent path: skip when uncovered, create only when the batch covers every required field", async () => {
    const skipId = IDS[0];
    const none = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId: skipId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    expect(none).toEqual({ status: "UNKNOWN", code: FINANCIAL_IDENTITY_UNKNOWN, matchCount: 0 });

    const skipped = await upsertFinancialFactsForDate(skipId, TARGET_DATE, [{ key: "only-cash", metricName: "cash", value: 999 }], "w1-skip");
    expect(skipped.perFact).toHaveLength(1);
    expect(skipped.perFact[0]!.applied).toBe(false);
    expect(skipped.perFact[0]!.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);
    expect(skipped.perFact[0]!.skipReason).not.toContain(FINANCIAL_IDENTITY_AMBIGUOUS);
    expect(skipped.financialSnapshotId).toBeUndefined();
    expect(await prisma.financialSnapshot.count({ where: { companyId: skipId } })).toBe(0);
    expect(await prisma.financialState.count({ where: { companyId: skipId } })).toBe(0);

    const priorId = IDS[1];
    await prisma.financialSnapshot.create({
      data: { companyId: priorId, asOfDate: PRIOR_DATE, notes: "prior-date row", ...BASE_ROW, cash: 222, ebitda: 111 },
    });
    const priorSeed = await upsertFinancialFactsForDate(priorId, TARGET_DATE, [{ key: "target-cash", metricName: "cash", value: 999 }], "w1-prior");
    expect(priorSeed.perFact[0]!.applied).toBe(false);
    expect(priorSeed.perFact[0]!.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);
    expect(priorSeed.perFact[0]!.skipReason).not.toMatch(/222/);
    const priorRows = await prisma.financialSnapshot.findMany({ where: { companyId: priorId }, orderBy: { asOfDate: "asc" } });
    expect(priorRows).toHaveLength(1);
    expect(priorRows[0]!.asOfDate.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(priorRows[0]!.cash.toNumber()).toBe(222);
    expect(priorRows[0]!.ebitda.toNumber()).toBe(111);
    expect(priorRows[0]!.notes).toBe("prior-date row");
    expect(await prisma.financialState.count({ where: { companyId: priorId } })).toBe(0);

    const createId = IDS[2];
    const created = await upsertFinancialFactsForDate(createId, TARGET_DATE, fullBatch("w1"), "w1-create");
    expect(created.perFact.every((f) => f.applied)).toBe(true);
    expect(created.financialSnapshotId).toBeDefined();
    const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId: createId } });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.id).toBe(created.financialSnapshotId);
    expect(snapshots[0]!.cash.toNumber()).toBe(4.2);
    expect(snapshots[0]!.ebitda.toNumber()).toBe(18);
    expect(snapshots[0]!.totalDebt.toNumber()).toBe(52);
    expect(snapshots[0]!.securedDebt.toNumber()).toBe(30);
    expect(snapshots[0]!.cash.toNumber()).not.toBe(0);
    const states = await prisma.financialState.findMany({ where: { companyId: createId, asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(1);
    expect(states[0]!.id).toBe(created.financialStateId);
  });

  it("W2 one Snapshot and one State is UNIQUE and keeps the single-row corroboration and missing-state outcomes", async () => {
    const bothId = IDS[3];
    const snapshot = await prisma.financialSnapshot.create({ data: { companyId: bothId, asOfDate: TARGET_DATE, notes: "canonical-v", ...BASE_ROW } });
    const state = await prisma.financialState.create({ data: { ...richStateData(bothId), notes: "state-kept" } });
    const uniqueSnap = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId: bothId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    const uniqueState = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialState.findMany(args),
      { where: { companyId: bothId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    expect(uniqueSnap.status).toBe("UNIQUE");
    expect(uniqueState.status).toBe("UNIQUE");
    if (uniqueSnap.status === "UNIQUE") expect(uniqueSnap.row.id).toBe(snapshot.id);
    if (uniqueState.status === "UNIQUE") expect(uniqueState.row.id).toBe(state.id);

    const before = stateBody(state);
    const echoed = await upsertFinancialFactsForDate(bothId, TARGET_DATE, [
      { key: "cash-echo", metricName: "cash", value: 4.2 },
      { key: "ebitda-echo", metricName: "covenant_ebitda", value: 18 },
    ], "w2-must-not-rewrite");
    expect(echoed.perFact.every((f) => f.applied)).toBe(true);
    expect(echoed.financialSnapshotId).toBe(snapshot.id);
    expect(echoed.financialStateId).toBe(state.id);
    const keptSnap = await prisma.financialSnapshot.findMany({ where: { companyId: bothId, asOfDate: TARGET_DATE } });
    expect(keptSnap).toHaveLength(1);
    expect(keptSnap[0]!.cash.toNumber()).toBe(4.2);
    expect(keptSnap[0]!.notes).toBe("canonical-v");
    const keptState = await prisma.financialState.findMany({ where: { companyId: bothId, asOfDate: TARGET_DATE } });
    expect(keptState).toHaveLength(1);
    expect(keptState[0]!.id).toBe(state.id);
    expect(keptState[0]!.updatedAt.toISOString()).toBe(state.updatedAt.toISOString());
    expect(stateBody(keptState[0]!)).toBe(before);

    const snapOnlyId = IDS[4];
    const snapOnly = await prisma.financialSnapshot.create({ data: { companyId: snapOnlyId, asOfDate: TARGET_DATE, notes: "snapshot-only", ...BASE_ROW } });
    const filled = await upsertFinancialFactsForDate(snapOnlyId, TARGET_DATE, [{ key: "cash-ok", metricName: "cash", value: 4.2 }], "w2-missing-state");
    expect(filled.perFact[0]).toMatchObject({ applied: true, financialSnapshotId: snapOnly.id });
    expect(filled.financialStateId).toBeDefined();
    const snaps = await prisma.financialSnapshot.findMany({ where: { companyId: snapOnlyId, asOfDate: TARGET_DATE } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.cash.toNumber()).toBe(4.2);
    expect(snaps[0]!.notes).toBe("snapshot-only");
    const filledStates = await prisma.financialState.findMany({ where: { companyId: snapOnlyId, asOfDate: TARGET_DATE } });
    expect(filledStates).toHaveLength(1);
    expect(filledStates[0]!.id).toBe(filled.financialStateId);
    const balance = filledStates[0]!.balanceSheetFacts as { cash: Record<string, unknown> };
    expectFresh(balance.cash, 4.2);
  });

  it("W3 duplicate same-date Snapshots fail closed as AMBIGUOUS with no winner and no rewrite", async () => {
    const companyId = IDS[5];
    const snapA = await prisma.financialSnapshot.create({ data: { companyId, asOfDate: TARGET_DATE, notes: "snap-a", ...BASE_ROW, cash: 1 } });
    const snapB = await prisma.financialSnapshot.create({ data: { companyId, asOfDate: TARGET_DATE, notes: "snap-b", ...BASE_ROW, cash: 2 } });
    const state = await prisma.financialState.create({ data: bareStateData(companyId, "state-kept") });
    const resolution = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    expect(resolution).toMatchObject({ status: "AMBIGUOUS", code: FINANCIAL_IDENTITY_AMBIGUOUS, matchCount: 2 });

    const written = await upsertFinancialFactsForDate(companyId, TARGET_DATE, [
      ...fullBatch("w3", { cash: 2 }),
      { key: "unknown", metricName: "some_unrecognized_metric", value: 999 },
    ], "w3-must-not-pick");
    expect(written.financialSnapshotId).toBeUndefined();
    expect(written.financialStateId).toBeUndefined();
    expect(written.perFact.length).toBeGreaterThan(1);
    expect(written.perFact.every((f) => f.applied === false)).toBe(true);
    expect(written.perFact.every((f) => f.skipReason?.includes(FINANCIAL_IDENTITY_AMBIGUOUS))).toBe(true);
    expect(written.perFact.every((f) => !f.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    expect(written.perFact.find((f) => f.key === "unknown")!.skipReason).toContain(FINANCIAL_IDENTITY_AMBIGUOUS);
    expect(written.perFact.find((f) => f.key === "unknown")!.skipReason).not.toMatch(/Unrecognized metricName/);

    const snaps = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: TARGET_DATE }, orderBy: { notes: "asc" } });
    expect(snaps.map((row) => row.id).sort()).toEqual([snapA.id, snapB.id].sort());
    expect(snaps.map((row) => ({ notes: row.notes, cash: row.cash.toNumber() }))).toEqual([
      { notes: "snap-a", cash: 1 },
      { notes: "snap-b", cash: 2 },
    ]);
    const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(1);
    expect(states[0]!.id).toBe(state.id);
    expect(states[0]!.updatedAt.toISOString()).toBe(state.updatedAt.toISOString());
    expect(states[0]!.notes).toBe("state-kept");
    expect(states[0]!.balanceSheetFacts).toEqual({ marker: "state-kept" });

    const onlyId = IDS[6];
    await prisma.financialSnapshot.create({ data: { companyId: onlyId, asOfDate: TARGET_DATE, notes: "only-a", ...BASE_ROW, cash: 10 } });
    await prisma.financialSnapshot.create({ data: { companyId: onlyId, asOfDate: TARGET_DATE, notes: "only-b", ...BASE_ROW, cash: 20 } });
    const noState = await upsertFinancialFactsForDate(onlyId, TARGET_DATE, fullBatch("w3b", { cash: 20 }), "w3-no-state");
    expect(noState.perFact.every((f) => f.applied === false && f.skipReason?.includes(FINANCIAL_IDENTITY_AMBIGUOUS))).toBe(true);
    expect(await prisma.financialSnapshot.count({ where: { companyId: onlyId } })).toBe(2);
    expect(await prisma.financialState.count({ where: { companyId: onlyId } })).toBe(0);
    const onlySnaps = await prisma.financialSnapshot.findMany({ where: { companyId: onlyId }, orderBy: { notes: "asc" } });
    expect(onlySnaps.map((row) => row.cash.toNumber())).toEqual([10, 20]);
  });

  it("W4 duplicate same-date States fail closed as AMBIGUOUS with no silent state pick or update", async () => {
    const companyId = IDS[7];
    const stateA = await prisma.financialState.create({ data: { ...richStateData(companyId), notes: "state-a" } });
    const stateB = await prisma.financialState.create({ data: bareStateData(companyId, "state-b") });
    const resolution = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialState.findMany(args),
      { where: { companyId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    expect(resolution).toMatchObject({ status: "AMBIGUOUS", code: FINANCIAL_IDENTITY_AMBIGUOUS, matchCount: 2 });
    const beforeA = stateBody(stateA);
    const beforeB = stateBody(stateB);

    const written = await upsertFinancialFactsForDate(companyId, TARGET_DATE, fullBatch("w4", { cash: 9.9 }), "w4-must-not-update");
    expect(written.financialSnapshotId).toBeUndefined();
    expect(written.financialStateId).toBeUndefined();
    expect(written.perFact.every((f) => f.applied === false)).toBe(true);
    expect(written.perFact.every((f) => f.skipReason?.includes(FINANCIAL_IDENTITY_AMBIGUOUS))).toBe(true);
    expect(await prisma.financialSnapshot.count({ where: { companyId } })).toBe(0);
    const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(2);
    const afterA = states.find((row) => row.id === stateA.id)!;
    const afterB = states.find((row) => row.id === stateB.id)!;
    expect(afterA.updatedAt.toISOString()).toBe(stateA.updatedAt.toISOString());
    expect(afterB.updatedAt.toISOString()).toBe(stateB.updatedAt.toISOString());
    expect(stateBody(afterA)).toBe(beforeA);
    expect(stateBody(afterB)).toBe(beforeB);

    const withSnap = IDS[8];
    const snapshot = await prisma.financialSnapshot.create({ data: { companyId: withSnap, asOfDate: TARGET_DATE, notes: "unique-snap", ...BASE_ROW } });
    const keptA = await prisma.financialState.create({ data: bareStateData(withSnap, "kept-a") });
    const keptB = await prisma.financialState.create({ data: bareStateData(withSnap, "kept-b") });
    const alongside = await upsertFinancialFactsForDate(withSnap, TARGET_DATE, [
      { key: "cash-echo", metricName: "cash", value: 4.2 },
      { key: "cash-other", metricName: "cash", value: 8.8 },
    ], "w4-unique-snap");
    expect(alongside.perFact.every((f) => f.applied === false)).toBe(true);
    expect(alongside.perFact.every((f) => f.skipReason?.includes(FINANCIAL_IDENTITY_AMBIGUOUS))).toBe(true);
    expect(alongside.perFact.every((f) => !f.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    const snapAfter = await prisma.financialSnapshot.findMany({ where: { companyId: withSnap, asOfDate: TARGET_DATE } });
    expect(snapAfter).toHaveLength(1);
    expect(snapAfter[0]!.id).toBe(snapshot.id);
    expect(snapAfter[0]!.cash.toNumber()).toBe(4.2);
    expect(snapAfter[0]!.notes).toBe("unique-snap");
    const stateAfter = await prisma.financialState.findMany({ where: { companyId: withSnap, asOfDate: TARGET_DATE } });
    expect(stateAfter).toHaveLength(2);
    expect(stateAfter.find((row) => row.id === keptA.id)!.updatedAt.toISOString()).toBe(keptA.updatedAt.toISOString());
    expect(stateAfter.find((row) => row.id === keptB.id)!.updatedAt.toISOString()).toBe(keptB.updatedAt.toISOString());
    expect(stateAfter.find((row) => row.id === keptA.id)!.notes).toBe("kept-a");
    expect(stateAfter.find((row) => row.id === keptB.id)!.notes).toBe("kept-b");
  });

  it("W5 under UNIQUE, W ≠ V stays CONFLICTING_FINANCIAL_FACTS and does not overwrite the canonical row", async () => {
    const companyId = IDS[9];
    const snapshot = await prisma.financialSnapshot.create({ data: { companyId, asOfDate: TARGET_DATE, notes: "canonical-v", ...BASE_ROW } });
    const state = await prisma.financialState.create({ data: richStateData(companyId) });
    const before = stateBody(state);
    const written = await upsertFinancialFactsForDate(companyId, TARGET_DATE, [
      { key: "w-cash", metricName: "cash", value: 8.8 },
      { key: "same-ebitda", metricName: "covenant_ebitda", value: 18 },
    ], "w5");
    expect(written.perFact.find((f) => f.key === "w-cash")).toMatchObject({ applied: false });
    expect(written.perFact.find((f) => f.key === "w-cash")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(written.perFact.find((f) => f.key === "w-cash")!.skipReason).not.toContain(FINANCIAL_IDENTITY_AMBIGUOUS);
    expect(written.perFact.find((f) => f.key === "same-ebitda")).toMatchObject({ applied: true, financialSnapshotId: snapshot.id, financialStateId: state.id });
    const snaps = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.cash.toNumber()).toBe(4.2);
    expect(snaps[0]!.ebitda.toNumber()).toBe(18);
    expect(snaps[0]!.notes).toBe("canonical-v");
    const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(1);
    expect(states[0]!.updatedAt.toISOString()).toBe(state.updatedAt.toISOString());
    expect(stateBody(states[0]!)).toBe(before);
  });

  it("W6 under UNIQUE, a same-date State rewrite carries unchanged wrappers and refreshes the changed field", async () => {
    const companyId = IDS[10];
    const seeded = await prisma.financialState.create({ data: richStateData(companyId) });
    const unique = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialState.findMany(args),
      { where: { companyId, asOfDate: TARGET_DATE }, selection: "exact" },
    );
    expect(unique.status).toBe("UNIQUE");
    if (unique.status === "UNIQUE") expect(unique.row.id).toBe(seeded.id);

    const written = await upsertFinancialFactsForDate(companyId, TARGET_DATE, fullBatch("w6", { cash: 9.9 }), "w6-rewrite");
    expect(written.perFact.every((f) => f.applied)).toBe(true);
    expect(written.financialStateId).toBe(seeded.id);
    const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(states).toHaveLength(1);
    const state = states[0]!;
    expect(state.id).toBe(seeded.id);
    expect(state.periodType).toBe("FORECAST");
    expect(state.scope).toBe("HOLDCO");
    expect(state.notes).toBe("prior-state-notes");
    expect(state.liquidityFacts).toEqual({ revolverFacilityId: "fac-kept" });
    const balance = state.balanceSheetFacts as Record<string, Record<string, unknown>>;
    expectFresh(balance.cash!, 9.9);
    expect(balance.totalDebtPrincipal).toEqual(DEBT_PRIOR);
    expectFresh(balance.securedDebtPrincipal!, 30);
    const income = state.incomeStatementFacts as Record<string, unknown>;
    expect(income.gaapEbitda).toEqual(GAAP_PRIOR);
    expect(income.cumulativeNetIncomeSinceIssue).toEqual(NI_PRIOR);
    expect(income.equityProceedsSinceIssue).toEqual(EQUITY_PRIOR);
    expect(income.interestExpense).toEqual(INTEREST_PRIOR);
    const covenant = state.covenantMetricFacts as {
      assumedNewDebtRatePct: unknown;
      covenantEbitda: { value: number; addbacks: unknown; provenance: unknown };
    };
    expect(covenant.assumedNewDebtRatePct).toEqual(RATE_PRIOR);
    expect(covenant.covenantEbitda.value).toBe(18);
    expect(covenant.covenantEbitda.addbacks).toEqual([{ label: "run-rate", amount: 1.5 }]);
    expect(covenant.covenantEbitda.provenance).toEqual(COVENANT_PROV);
    const snapshot = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: TARGET_DATE } });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]!.cash.toNumber()).toBe(9.9);
    expect(snapshot[0]!.ebitda.toNumber()).toBe(18);
    expect(JSON.stringify(snapshot[0])).not.toContain("sourceType");
  });

  it("pins exact identity, FFC1, FFC1b, R0 C6, and the PERMISSION duplicate-ref skip", () => {
    const financial = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(financial).toContain("resolveCanonicalFinancialIdentity");
    expect(financial).toContain('selection: "exact"');
    expect(financial).toContain("FINANCIAL_IDENTITY_AMBIGUOUS");
    expect(financial).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(financial).not.toMatch(/financialSnapshot\.findFirst\s*\(/);
    expect(financial).not.toMatch(/financialState\.findFirst\s*\(/);
    expect(financial).not.toContain('selection: "latest-cohort"');
    expect(financial).not.toMatch(/asOfDate:\s*\{\s*lt:/);

    const identity = readFileSync(join(process.cwd(), "lib/financial-identity.ts"), "utf8");
    expect(identity).toContain('status: "UNKNOWN"');
    expect(identity).toContain('status: "UNIQUE"');
    expect(identity).toContain('status: "AMBIGUOUS"');
    expect(identity).toContain('if (rows.length === 0)');
    expect(identity).toContain('if (query.selection === "exact")');
    expect(identity).toContain('if (rows.length === 1)');

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
