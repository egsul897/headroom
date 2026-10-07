/**
 * P3-FFC1 — same-date financial fact conflict fail-closed.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED. A green run is not certification credit.
 *
 * CONFLICTING EVIDENCE MUST NEVER COLLAPSE INTO CANONICAL FACT BY ITERATION ORDER.
 * APPLIED = the candidate actually contributed to the canonical result.
 *
 * T1 order-permutation. T2 three-source, no majority. T3 mixed batch.
 * T4 identical corroboration. T5 unrecognized metricName. T6 R0 C6.
 * T7 provenance / false applied, including promotion promotedAt.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { ensureFinancialFactContainer } from "../../lib/connectors/ingestion";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { CONFLICTING_FINANCIAL_FACTS, upsertFinancialFactForDate, upsertFinancialFactsForDate, type BatchFinancialFact } from "../../lib/onboarding/financial";

const IDS = [
  "fixture-p3-ffc1-t1-fwd",
  "fixture-p3-ffc1-t1-rev",
  "fixture-p3-ffc1-t1-order",
  "fixture-p3-ffc1-t2",
  "fixture-p3-ffc1-t2-majority",
  "fixture-p3-ffc1-t3",
  "fixture-p3-ffc1-t3-nobase",
  "fixture-p3-ffc1-t4",
  "fixture-p3-ffc1-t4-base",
  "fixture-p3-ffc1-t5",
  "fixture-p3-ffc1-t5-mix",
  "fixture-p3-ffc1-t6",
  "fixture-p3-ffc1-t7",
] as const;

const PRIOR_DATE = new Date("2026-01-31T00:00:00.000Z");
const TARGET_DATE = new Date("2026-06-30T00:00:00.000Z");
const OTHER_DATE = new Date("2026-09-30T00:00:00.000Z");
const AS_OF = "2026-06-30";
const OTHER_AS_OF = "2026-09-30";

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

function signature(perFact: { key: string; applied: boolean; skipReason?: string }[]) {
  return [...perFact].map((p) => `${p.key}\t${p.applied ? "applied" : "skipped"}\t${p.skipReason ?? ""}`).sort();
}

async function snapshotNumbers(companyId: string, asOfDate: Date) {
  const row = await prisma.financialSnapshot.findFirst({ where: { companyId, asOfDate } });
  if (!row) return null;
  return {
    cash: row.cash.toNumber(),
    ebitda: row.ebitda.toNumber(),
    totalDebt: row.totalDebt.toNumber(),
    securedDebt: row.securedDebt.toNumber(),
    interestExpense: row.interestExpense.toNumber(),
    cumulativeNetIncome: row.cumulativeNetIncome.toNumber(),
    equityProceedsSinceIssue: row.equityProceedsSinceIssue.toNumber(),
    assumedNewDebtRatePct: row.assumedNewDebtRatePct.toNumber(),
    notes: row.notes,
  };
}

describe("P3-FFC1 financial fact conflict fail-closed", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
    for (const id of IDS) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
  });

  it("T1 order-permutation: the same claims in two orders share one outcome", async () => {
    const forward = fullBatch("t1");
    const reverse = [...forward].reverse();
    const writtenFwd = await upsertFinancialFactsForDate(IDS[0], TARGET_DATE, forward, "t1-fwd");
    const writtenRev = await upsertFinancialFactsForDate(IDS[1], TARGET_DATE, reverse, "t1-rev");
    expect(writtenFwd.perFact.every((f) => f.applied)).toBe(true);
    expect(writtenRev.perFact.every((f) => f.applied)).toBe(true);
    expect(signature(writtenFwd.perFact.map((f, i) => ({ ...f, key: forward[i]!.metricName })))).toEqual(
      signature(writtenRev.perFact.map((f) => ({ ...f, key: f.metricName }))),
    );
    const fwdNumbers = await snapshotNumbers(IDS[0], TARGET_DATE);
    const revNumbers = await snapshotNumbers(IDS[1], TARGET_DATE);
    expect(fwdNumbers).not.toBeNull();
    const { notes: _fwdNotes, ...fwdFields } = fwdNumbers!;
    const { notes: _revNotes, ...revFields } = revNumbers!;
    expect(fwdFields).toEqual(revFields);

    const conflictFacts: BatchFinancialFact[] = [
      { key: "c1", metricName: "cash", value: 1 },
      { key: "c2", metricName: "cash", value: 2 },
      { key: "e1", metricName: "covenant_ebitda", value: 18 },
    ];
    const orderA = await upsertFinancialFactsForDate(IDS[2], TARGET_DATE, conflictFacts, "order-a");
    const orderB = await upsertFinancialFactsForDate(IDS[2], TARGET_DATE, [...conflictFacts].reverse(), "order-b");
    expect(signature(orderA.perFact)).toEqual(signature(orderB.perFact));
    expect(orderA.perFact.find((f) => f.key === "c1")!.applied).toBe(false);
    expect(orderA.perFact.find((f) => f.key === "c2")!.applied).toBe(false);
    expect(orderA.perFact.find((f) => f.key === "c1")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(orderA.perFact.find((f) => f.key === "c1")!.skipReason).toBe(orderA.perFact.find((f) => f.key === "c2")!.skipReason);
    expect(await snapshotNumbers(IDS[2], TARGET_DATE)).toBeNull();
  });

  it("T2 three distinct values, and a 2-vs-1 majority, both fail closed with no winner", async () => {
    const three = await upsertFinancialFactsForDate(IDS[3], TARGET_DATE, [
      { key: "a", metricName: "cash", value: 10 },
      { key: "b", metricName: "cash", value: 20 },
      { key: "c", metricName: "cash", value: 30 },
    ], "t2");
    expect(three.perFact).toHaveLength(3);
    expect(three.perFact.every((f) => f.applied === false)).toBe(true);
    expect(three.perFact.every((f) => f.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    expect(three.financialSnapshotId).toBeUndefined();
    expect(await prisma.financialSnapshot.count({ where: { companyId: IDS[3] } })).toBe(0);

    const majority = await upsertFinancialFactsForDate(IDS[4], TARGET_DATE, [
      { key: "m1", metricName: "cash", value: 5 },
      { key: "m2", metricName: "cash", value: 5 },
      { key: "m3", metricName: "cash", value: 9 },
    ], "t2-majority");
    expect(majority.perFact.every((f) => f.applied === false)).toBe(true);
    expect(majority.perFact.every((f) => f.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    expect(await prisma.financialSnapshot.count({ where: { companyId: IDS[4] } })).toBe(0);
    const landed = await prisma.financialSnapshot.findMany({ where: { companyId: { in: [IDS[3], IDS[4]] } } });
    expect(landed.some((row) => [5, 9, 10, 20, 30].includes(row.cash.toNumber()))).toBe(false);
  });

  it("T3 mixed batch: corroborating fields apply, the conflicting field group does not, and a conflict does not invent a partial first snapshot", async () => {
    await prisma.financialSnapshot.create({ data: { companyId: IDS[5], asOfDate: TARGET_DATE, notes: "same-date row", ...BASE_ROW } });
    await prisma.financialState.create({
      data: {
        companyId: IDS[5],
        asOfDate: TARGET_DATE,
        notes: "prior-state-wrapper",
        balanceSheetFacts: { cash: { value: 4.2, marker: "prior-wrapper" } },
        incomeStatementFacts: { gaapEbitda: { value: 18, marker: "prior-wrapper" } },
        covenantMetricFacts: { marker: "prior-wrapper" },
      },
    });

    const mixed = await upsertFinancialFactsForDate(IDS[5], TARGET_DATE, [
      { key: "cash-ok", metricName: "cash", value: 4.2 },
      { key: "ebitda-a", metricName: "covenant_ebitda", value: 100 },
      { key: "ebitda-b", metricName: "covenant_ebitda", value: 200 },
      { key: "debt-ok", metricName: "total_debt", value: 52 },
    ], "t3");
    expect(mixed.perFact.find((f) => f.key === "cash-ok")).toMatchObject({ applied: true });
    expect(mixed.perFact.find((f) => f.key === "debt-ok")).toMatchObject({ applied: true });
    for (const key of ["ebitda-a", "ebitda-b"]) {
      const outcome = mixed.perFact.find((f) => f.key === key)!;
      expect(outcome.applied).toBe(false);
      expect(outcome.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    }

    const row = await snapshotNumbers(IDS[5], TARGET_DATE);
    expect(row).toMatchObject({ cash: 4.2, ebitda: 18, totalDebt: 52, notes: "same-date row" });
    expect(row!.ebitda).not.toBe(100);
    expect(row!.ebitda).not.toBe(200);

    const state = await prisma.financialState.findFirstOrThrow({ where: { companyId: IDS[5], asOfDate: TARGET_DATE } });
    expect(state.notes).toBe("prior-state-wrapper");
    expect(state.balanceSheetFacts).toMatchObject({ cash: { value: 4.2, marker: "prior-wrapper" } });

    const noBase = await upsertFinancialFactsForDate(IDS[6], TARGET_DATE, [
      ...fullBatch("nb"),
      { key: "nb-ebitda-other", metricName: "covenant_ebitda", value: 99 },
    ], "t3-nobase");
    expect(noBase.financialSnapshotId).toBeUndefined();
    expect(await prisma.financialSnapshot.count({ where: { companyId: IDS[6] } })).toBe(0);
    const conflicted = noBase.perFact.filter((f) => f.metricName === "covenant_ebitda");
    expect(conflicted).toHaveLength(2);
    expect(conflicted.every((f) => f.applied === false && f.skipReason?.startsWith(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    const siblings = noBase.perFact.filter((f) => f.metricName !== "covenant_ebitda");
    expect(siblings.every((f) => f.applied === false)).toBe(true);
    expect(siblings.every((f) => f.skipReason?.includes("Prior-date snapshots are not used as a seed"))).toBe(true);
    expect(siblings.every((f) => !f.skipReason?.startsWith(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
  });

  it("T4 identical-value corroboration applies every contributor of the landing value", async () => {
    const batch = [
      ...fullBatch("t4", { cash: 6 }),
      { key: "t4-cash-again", metricName: "cash", value: 6 },
    ];
    const created = await upsertFinancialFactsForDate(IDS[7], TARGET_DATE, batch, "t4");
    expect(created.perFact.every((f) => f.applied)).toBe(true);
    const cashContributors = created.perFact.filter((f) => f.metricName === "cash");
    expect(cashContributors).toHaveLength(2);
    expect(cashContributors.every((f) => f.applied && f.financialSnapshotId === created.financialSnapshotId)).toBe(true);
    expect((await snapshotNumbers(IDS[7], TARGET_DATE))!.cash).toBe(6);

    await prisma.financialSnapshot.create({ data: { companyId: IDS[8], asOfDate: TARGET_DATE, notes: "base-notes", ...BASE_ROW } });
    const corroborated = await upsertFinancialFactsForDate(IDS[8], TARGET_DATE, [
      { key: "base-cash-1", metricName: "cash", value: 4.2 },
      { key: "base-cash-2", metricName: "cash", value: 4.2 },
    ], "should-not-rewrite-notes");
    expect(corroborated.perFact.every((f) => f.applied)).toBe(true);
    const kept = await snapshotNumbers(IDS[8], TARGET_DATE);
    expect(kept).toMatchObject({ cash: 4.2, ebitda: 18, notes: "base-notes" });
  });

  it("T5 unrecognized metricName stays fail-closed and does not poison recognized siblings", async () => {
    const withUnknown = await upsertFinancialFactsForDate(IDS[9], TARGET_DATE, [
      ...fullBatch("t5"),
      { key: "unknown", metricName: "some_unrecognized_metric", value: 999 },
    ], "t5");
    const unknown = withUnknown.perFact.find((f) => f.key === "unknown")!;
    expect(unknown.applied).toBe(false);
    expect(unknown.skipReason).toMatch(/Unrecognized metricName/);
    expect(withUnknown.perFact.filter((f) => f.key !== "unknown").every((f) => f.applied)).toBe(true);
    expect((await snapshotNumbers(IDS[9], TARGET_DATE))!.cash).toBe(4.2);

    const mixed = await upsertFinancialFactsForDate(IDS[10], TARGET_DATE, [
      { key: "bad-name", metricName: "not_a_metric", value: 1 },
      { key: "cash-a", metricName: "cash", value: 3 },
      { key: "cash-b", metricName: "cash", value: 4 },
    ], "t5-mix");
    expect(mixed.perFact.find((f) => f.key === "bad-name")!.skipReason).toMatch(/Unrecognized metricName/);
    expect(mixed.perFact.find((f) => f.key === "bad-name")!.skipReason).not.toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(mixed.perFact.find((f) => f.key === "cash-a")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(mixed.perFact.find((f) => f.key === "cash-a")!.skipReason).not.toMatch(/Unrecognized metricName/);
    expect(await prisma.financialSnapshot.count({ where: { companyId: IDS[10] } })).toBe(0);
  });

  it("T6 R0 C6: no same-date base and incomplete cover fails closed, and a prior date is not a seed", async () => {
    await prisma.financialSnapshot.create({
      data: { companyId: IDS[11], asOfDate: PRIOR_DATE, notes: "prior-date row", ...BASE_ROW, cash: 222, ebitda: 111 },
    });
    const incomplete = await upsertFinancialFactsForDate(IDS[11], TARGET_DATE, [{ key: "only-cash", metricName: "cash", value: 999 }], "t6");
    expect(incomplete.perFact[0]!.applied).toBe(false);
    expect(incomplete.perFact[0]!.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);
    expect(incomplete.financialSnapshotId).toBeUndefined();

    const single = await upsertFinancialFactForDate({ companyId: IDS[11], asOfDate: TARGET_DATE, metricName: "covenant_ebitda", value: 50 });
    expect(single.applied).toBe(false);
    expect(single.skipReason).toMatch(/Prior-date snapshots are not used as a seed/);

    const rows = await prisma.financialSnapshot.findMany({ where: { companyId: IDS[11] }, orderBy: { asOfDate: "asc" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asOfDate.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(rows[0]!.cash.toNumber()).toBe(222);
    expect(rows[0]!.ebitda.toNumber()).toBe(111);
    expect(rows[0]!.notes).toBe("prior-date row");

    const src = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(src).not.toMatch(/asOfDate:\s*\{\s*lt:/);
    expect(src).not.toMatch(/\.\.\.baseFromSameDate,\s*\.\.\.Object\.fromEntries\(resolvedFields\)/);
  });

  it("T7 overwritten and conflicting candidates are not applied, and promotion does not dual-mark promotedAt", async () => {
    const laterWouldHaveWon = await upsertFinancialFactsForDate("fixture-p3-ffc1-t2", OTHER_DATE, [
      { key: "early", metricName: "cash", value: 1 },
      { key: "later", metricName: "cash", value: 2 },
    ], "lww");
    expect(laterWouldHaveWon.perFact.every((f) => f.applied === false)).toBe(true);
    expect(laterWouldHaveWon.perFact.every((f) => f.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    expect(await snapshotNumbers("fixture-p3-ffc1-t2", OTHER_DATE)).toBeNull();

    await prisma.financialSnapshot.create({ data: { companyId: IDS[12], asOfDate: TARGET_DATE, notes: "canonical", ...BASE_ROW } });
    const againstBase = await upsertFinancialFactsForDate(IDS[12], TARGET_DATE, [{ key: "w", metricName: "cash", value: 8.8 }], "t7-direct");
    expect(againstBase.perFact[0]!.applied).toBe(false);
    expect(againstBase.perFact[0]!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect((await snapshotNumbers(IDS[12], TARGET_DATE))!.cash).toBe(4.2);

    const connection = await connectSource({ companyId: IDS[12], connectorType: "CSV_FINANCIAL" });
    const container = await ensureFinancialFactContainer(IDS[12], connection);
    const proposed = (metricName: string, value: number, asOfDate: string) => ({
      metricName,
      value,
      asOfDate,
      canonicalUnit: metricName === "assumed_new_debt_rate_pct" ? "PERCENT" : "USD_MILLIONS",
      originalValue: value,
      originalUnit: metricName === "assumed_new_debt_rate_pct" ? "PERCENT" : "USD_MILLIONS",
    });
    const cashEarly = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId: IDS[12],
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: proposed("cash", 1.1, AS_OF),
        reviewStatus: "APPROVED",
      },
    });
    const cashLater = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId: IDS[12],
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: proposed("cash", 9.9, AS_OF),
        reviewStatus: "APPROVED",
      },
    });
    const ebitda = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId: IDS[12],
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: proposed("covenant_ebitda", 18, AS_OF),
        reviewStatus: "APPROVED",
      },
    });
    const otherDateFacts = fullBatch("other", {
      cash: 3,
      total_debt: 4,
      secured_debt: 5,
      covenant_ebitda: 6,
      interest_expense: 7,
      cumulative_net_income: 8,
      equity_proceeds: 9,
      assumed_new_debt_rate_pct: 1.5,
    });
    const otherCandidates = [];
    for (const fact of otherDateFacts) {
      otherCandidates.push(await prisma.extractionCandidate.create({
        data: {
          extractionRunId: container.extractionRunId,
          extractionStageId: container.extractionStageId,
          companyId: IDS[12],
          kind: "FINANCIAL_FACT",
          sourceDocumentId: container.documentId,
          sourceChunkIds: [],
          proposedValue: proposed(fact.metricName, fact.value, OTHER_AS_OF),
          reviewStatus: "APPROVED",
        },
      }));
    }

    const promotion = await promoteCompanyCandidates(IDS[12], TARGET_DATE);
    expect(promotion.promotedCount).toBe(1 + otherCandidates.length);
    expect(promotion.skipped.map((s) => s.candidateId).sort()).toEqual([cashEarly.id, cashLater.id].sort());
    expect(promotion.skipped.every((s) => s.reason.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);

    const earlyAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: cashEarly.id } });
    const laterAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: cashLater.id } });
    expect(earlyAfter.promotedAt).toBeNull();
    expect(laterAfter.promotedAt).toBeNull();
    expect(earlyAfter.promotedToId).toBeNull();
    expect(laterAfter.promotedToId).toBeNull();
    expect(earlyAfter.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(laterAfter.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(earlyAfter.rationale).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(earlyAfter.reviewedBy).toBeNull();

    const ebitdaAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: ebitda.id } });
    expect(ebitdaAfter.promotedAt).not.toBeNull();
    expect(ebitdaAfter.reviewStatus).toBe("APPROVED");
    const canonical = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId: IDS[12], asOfDate: TARGET_DATE } });
    expect(ebitdaAfter.promotedToId).toBe(canonical.id);
    expect(canonical.cash.toNumber()).toBe(4.2);
    expect(canonical.ebitda.toNumber()).toBe(18);
    expect(canonical.notes).toBe("canonical");

    const otherRow = await snapshotNumbers(IDS[12], OTHER_DATE);
    expect(otherRow).toMatchObject({ cash: 3, ebitda: 6, totalDebt: 4, securedDebt: 5 });
    for (const candidate of otherCandidates) {
      const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(after.promotedAt).not.toBeNull();
      expect(after.reviewStatus).toBe("APPROVED");
    }
  });

  it("PERMISSION duplicate-ref skip is still present and still skips before create", () => {
    const src = readFileSync(join(process.cwd(), "lib/onboarding/promotion.ts"), "utf8");
    expect(src).toContain('if (refToPermissionId.has(value.permissionRef))');
    expect(src).toContain('Duplicate permissionRef "${value.permissionRef}" already promoted in this batch - not re-promoted.');
    const permissionBlock = src.slice(src.indexOf("// 3. PERMISSION"), src.indexOf("// 4."));
    const guardAt = permissionBlock.indexOf("refToPermissionId.has(value.permissionRef)");
    const createAt = permissionBlock.indexOf("tx.permission.create");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });
});
