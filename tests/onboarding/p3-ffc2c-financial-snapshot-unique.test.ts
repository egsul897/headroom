/**
 * P3-FFC2c — FinancialSnapshot @@unique([companyId, asOfDate]).
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED. A green run is not certification credit.
 *
 * U1 one Snapshot row inserts.
 * U2 a second row for the same pair is a unique violation and is not stored.
 * U3 the same company with a different asOfDate inserts.
 * U4 the same asOfDate with a different companyId inserts.
 * U5 FinancialState still has no @@unique. Two same-date State rows insert.
 * U6 pre-migration duplicate Snapshots still fail closed as AMBIGUOUS.
 *    The migration precheck aborts on those pairs. FFC1 and FFC1b stay
 *    fail-closed under the unique baseline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { CONFLICTING_FINANCIAL_FACTS, upsertFinancialFactsForDate } from "../../lib/onboarding/financial";
import { FINANCIAL_IDENTITY_AMBIGUOUS, resolveCanonicalFinancialIdentity } from "../../lib/financial-identity";
import { SNAPSHOT_UNIQUE_INDEX, withPreMigrationSnapshotDuplicates, withSnapshotUniqueEnforced } from "./p3-ffc2c-snapshot-unique-guard";

const MIGRATION_SQL = join(
  process.cwd(),
  "prisma/migrations/20261007161500_financial_snapshot_company_asof_unique/migration.sql",
);

const IDS = [
  "fixture-p3-ffc2c-u1",
  "fixture-p3-ffc2c-u2",
  "fixture-p3-ffc2c-u3",
  "fixture-p3-ffc2c-u4a",
  "fixture-p3-ffc2c-u4b",
  "fixture-p3-ffc2c-u5",
  "fixture-p3-ffc2c-u6-amb",
  "fixture-p3-ffc2c-u6-ffc1",
  "fixture-p3-ffc2c-u6-ffc1b",
] as const;

const AS_OF = new Date("2026-06-30T00:00:00.000Z");
const OTHER_DATE = new Date("2026-09-30T00:00:00.000Z");
const TARGET_ISO = AS_OF.toISOString();
const LOCK_WAIT_MS = 60_000;

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

function prismaModel(schema: string, name: string): string {
  const marker = `model ${name} {`;
  const start = schema.indexOf(marker);
  if (start < 0) throw new Error(`missing model ${name}`);
  const end = schema.indexOf("\n}", start);
  if (end < 0) throw new Error(`unterminated model ${name}`);
  return schema.slice(start, end + 2);
}

function migrationPrecheckSql(): string {
  const sql = readFileSync(MIGRATION_SQL, "utf8");
  const match = sql.match(/DO \$\$[\s\S]*?\$\$;/);
  if (!match) throw new Error("migration is missing the fail-closed DO block");
  return match[0];
}

function fullBatch(prefix: string, overrides: Record<string, number> = {}) {
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

function richStateData(companyId: string) {
  return {
    companyId,
    asOfDate: AS_OF,
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

function expectFresh(fact: Record<string, unknown>, value: number) {
  const asOf = fact.asOfDate instanceof Date ? fact.asOfDate.toISOString() : fact.asOfDate;
  expect(fact.value).toBe(value);
  expect(fact.sourceType).toBe("REPORTED");
  expect(fact.reviewStatus).toBe("UNVERIFIED");
  expect(asOf).toBe(TARGET_ISO);
  expect(fact.notes).toBeUndefined();
  expect(fact.staleness).toBeUndefined();
}

describe("P3-FFC2c FinancialSnapshot companyId + asOfDate unique", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
    for (const id of IDS) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
  });

  it("U1 a single Snapshot insert for (companyId, asOfDate) succeeds", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[0];
      const created = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "only", ...BASE_ROW },
      });
      const rows = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: AS_OF } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(created.id);
      expect(rows[0]!.cash.toNumber()).toBe(4.2);
      expect(rows[0]!.notes).toBe("only");
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${SNAPSHOT_UNIQUE_INDEX}
      `;
      expect(indexes.map((row) => row.indexname)).toEqual([SNAPSHOT_UNIQUE_INDEX]);
    });
  }, LOCK_WAIT_MS);

  it("U2 a second Snapshot for the same pair is a unique violation and stores no second row", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[1];
      const first = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "first", ...BASE_ROW, cash: 1 },
      });
      await expect(
        prisma.financialSnapshot.create({
          data: { companyId, asOfDate: AS_OF, notes: "second", ...BASE_ROW, cash: 2 },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      const rows = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: AS_OF } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(first.id);
      expect(rows[0]!.notes).toBe("first");
      expect(rows[0]!.cash.toNumber()).toBe(1);
    });
  }, LOCK_WAIT_MS);

  it("U3 the same company with a different asOfDate still inserts", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[2];
      const june = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "june", ...BASE_ROW, cash: 1 },
      });
      const september = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: OTHER_DATE, notes: "september", ...BASE_ROW, cash: 2 },
      });
      const rows = await prisma.financialSnapshot.findMany({ where: { companyId }, orderBy: { asOfDate: "asc" } });
      expect(rows.map((row) => row.id)).toEqual([june.id, september.id]);
      expect(rows.map((row) => row.notes)).toEqual(["june", "september"]);
    });
  }, LOCK_WAIT_MS);

  it("U4 the same asOfDate with a different companyId still inserts", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const left = await prisma.financialSnapshot.create({
        data: { companyId: IDS[3], asOfDate: AS_OF, notes: "company-a", ...BASE_ROW, cash: 1 },
      });
      const right = await prisma.financialSnapshot.create({
        data: { companyId: IDS[4], asOfDate: AS_OF, notes: "company-b", ...BASE_ROW, cash: 2 },
      });
      const rows = await prisma.financialSnapshot.findMany({
        where: { companyId: { in: [IDS[3], IDS[4]] }, asOfDate: AS_OF },
        orderBy: { companyId: "asc" },
      });
      expect(rows.map((row) => row.id)).toEqual([left.id, right.id]);
      expect(rows.map((row) => row.cash.toNumber())).toEqual([1, 2]);
    });
  }, LOCK_WAIT_MS);

  it("U5 FinancialState has no @@unique and still accepts two rows for the same (companyId, asOfDate)", async () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const snapshot = prismaModel(schema, "FinancialSnapshot");
    const state = prismaModel(schema, "FinancialState");
    expect(snapshot).toContain("@@unique([companyId, asOfDate])");
    expect(state).toContain("periodType");
    expect(state).toContain("scope");
    expect(state).not.toContain("@@unique");

    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[5];
      const first = await prisma.financialState.create({
        data: {
          companyId,
          asOfDate: AS_OF,
          notes: "state-a",
          balanceSheetFacts: { marker: "state-a" },
          incomeStatementFacts: { marker: "state-a" },
          covenantMetricFacts: { marker: "state-a" },
        },
      });
      const second = await prisma.financialState.create({
        data: {
          companyId,
          asOfDate: AS_OF,
          notes: "state-b",
          periodType: "FORECAST",
          scope: "HOLDCO",
          balanceSheetFacts: { marker: "state-b" },
          incomeStatementFacts: { marker: "state-b" },
          covenantMetricFacts: { marker: "state-b" },
        },
      });
      const rows = await prisma.financialState.findMany({ where: { companyId, asOfDate: AS_OF }, orderBy: { notes: "asc" } });
      expect(rows.map((row) => row.id)).toEqual([first.id, second.id]);
      expect(rows.map((row) => row.notes)).toEqual(["state-a", "state-b"]);
      expect(await prisma.financialSnapshot.count({ where: { companyId } })).toBe(0);
    });
  }, LOCK_WAIT_MS);

  it("U6 pre-migration duplicate Snapshots stay AMBIGUOUS and the migration precheck aborts", async () => {
    const sql = readFileSync(MIGRATION_SQL, "utf8");
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(/HAVING COUNT\(\*\) > 1/);
    expect(sql).toContain('"financial_snapshots"');
    expect(sql).toContain('CREATE UNIQUE INDEX "financial_snapshots_companyId_asOfDate_key"');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|INDEX|SCHEMA)\b/);
    expect(sql).not.toMatch(/majority/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);

    const companyId = IDS[6];
    await withPreMigrationSnapshotDuplicates(async () => {
      const snapA = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "snap-a", ...BASE_ROW, cash: 1 },
      });
      const snapB = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "snap-b", ...BASE_ROW, cash: 2 },
      });
      const state = await prisma.financialState.create({
        data: {
          companyId,
          asOfDate: AS_OF,
          notes: "state-kept",
          balanceSheetFacts: { marker: "state-kept" },
          incomeStatementFacts: { marker: "state-kept" },
          covenantMetricFacts: { marker: "state-kept" },
        },
      });
      try {
        await expect(prisma.$executeRawUnsafe(migrationPrecheckSql())).rejects.toThrow(/P3-FFC2c fail-closed/);

        const resolution = await resolveCanonicalFinancialIdentity(
          (args) => prisma.financialSnapshot.findMany(args),
          { where: { companyId, asOfDate: AS_OF }, selection: "exact" },
        );
        expect(resolution).toMatchObject({ status: "AMBIGUOUS", code: FINANCIAL_IDENTITY_AMBIGUOUS, matchCount: 2 });

        const written = await upsertFinancialFactsForDate(
          companyId,
          AS_OF,
          fullBatch("u6-amb", { cash: 2 }),
          "u6-must-not-pick",
        );
        expect(written.financialSnapshotId).toBeUndefined();
        expect(written.financialStateId).toBeUndefined();
        expect(written.perFact.length).toBeGreaterThan(1);
        expect(written.perFact.every((fact) => fact.applied === false)).toBe(true);
        expect(written.perFact.every((fact) => fact.skipReason?.includes(FINANCIAL_IDENTITY_AMBIGUOUS))).toBe(true);
        expect(written.perFact.every((fact) => !fact.skipReason?.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);

        const snaps = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: AS_OF }, orderBy: { notes: "asc" } });
        expect(snaps.map((row) => row.id)).toEqual([snapA.id, snapB.id]);
        expect(snaps.map((row) => ({ notes: row.notes, cash: row.cash.toNumber() }))).toEqual([
          { notes: "snap-a", cash: 1 },
          { notes: "snap-b", cash: 2 },
        ]);
        const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: AS_OF } });
        expect(states).toHaveLength(1);
        expect(states[0]!.id).toBe(state.id);
        expect(states[0]!.notes).toBe("state-kept");
        expect(states[0]!.updatedAt.toISOString()).toBe(state.updatedAt.toISOString());
      } finally {
        await prisma.financialSnapshot.deleteMany({ where: { companyId } });
      }
    });

    await withSnapshotUniqueEnforced(async () => {
      await expect(prisma.$executeRawUnsafe(migrationPrecheckSql())).resolves.toBeDefined();
      expect(await prisma.financialSnapshot.count({ where: { companyId } })).toBe(0);
    });
  }, LOCK_WAIT_MS);

  it("U6 FFC1 CONFLICTING_FINANCIAL_FACTS stays fail-closed under the unique baseline", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[7];
      const snapshot = await prisma.financialSnapshot.create({
        data: { companyId, asOfDate: AS_OF, notes: "canonical-v", ...BASE_ROW },
      });
      const state = await prisma.financialState.create({ data: richStateData(companyId) });
      const before = JSON.stringify({
        balanceSheetFacts: state.balanceSheetFacts,
        incomeStatementFacts: state.incomeStatementFacts,
        covenantMetricFacts: state.covenantMetricFacts,
        notes: state.notes,
        liquidityFacts: state.liquidityFacts,
        periodType: state.periodType,
        scope: state.scope,
      });
      const written = await upsertFinancialFactsForDate(companyId, AS_OF, [
        { key: "w-cash", metricName: "cash", value: 8.8 },
        { key: "same-ebitda", metricName: "covenant_ebitda", value: 18 },
      ], "u6-ffc1");
      expect(written.perFact.find((fact) => fact.key === "w-cash")!.applied).toBe(false);
      expect(written.perFact.find((fact) => fact.key === "w-cash")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
      expect(written.perFact.find((fact) => fact.key === "w-cash")!.skipReason).not.toContain(FINANCIAL_IDENTITY_AMBIGUOUS);
      expect(written.perFact.find((fact) => fact.key === "same-ebitda")).toMatchObject({
        applied: true,
        financialSnapshotId: snapshot.id,
        financialStateId: state.id,
      });
      const snaps = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: AS_OF } });
      expect(snaps).toHaveLength(1);
      expect(snaps[0]!.id).toBe(snapshot.id);
      expect(snaps[0]!.cash.toNumber()).toBe(4.2);
      expect(snaps[0]!.notes).toBe("canonical-v");
      const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: AS_OF } });
      expect(states).toHaveLength(1);
      expect(states[0]!.updatedAt.toISOString()).toBe(state.updatedAt.toISOString());
      expect(JSON.stringify({
        balanceSheetFacts: states[0]!.balanceSheetFacts,
        incomeStatementFacts: states[0]!.incomeStatementFacts,
        covenantMetricFacts: states[0]!.covenantMetricFacts,
        notes: states[0]!.notes,
        liquidityFacts: states[0]!.liquidityFacts,
        periodType: states[0]!.periodType,
        scope: states[0]!.scope,
      })).toBe(before);
    });
  }, LOCK_WAIT_MS);

  it("U6 FFC1b unchanged provenance wrappers stay carried under the unique baseline", async () => {
    await withSnapshotUniqueEnforced(async () => {
      const companyId = IDS[8];
      const seeded = await prisma.financialState.create({ data: richStateData(companyId) });
      const written = await upsertFinancialFactsForDate(companyId, AS_OF, fullBatch("u6-ffc1b", { cash: 9.9 }), "u6-carry");
      expect(written.perFact.every((fact) => fact.applied)).toBe(true);
      expect(written.financialStateId).toBe(seeded.id);
      const states = await prisma.financialState.findMany({ where: { companyId, asOfDate: AS_OF } });
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
      const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId, asOfDate: AS_OF } });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.cash.toNumber()).toBe(9.9);
      expect(snapshots[0]!.ebitda.toNumber()).toBe(18);
      expect(JSON.stringify(snapshots[0])).not.toContain("sourceType");
    });
  }, LOCK_WAIT_MS);

  it("U6 keeps exact resolve, FFC1 conflict text, and the PERMISSION duplicate-ref skip", () => {
    const financial = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(financial).toContain("resolveCanonicalFinancialIdentity");
    expect(financial).toContain('selection: "exact"');
    expect(financial).toContain("FINANCIAL_IDENTITY_AMBIGUOUS");
    expect(financial).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(financial).not.toMatch(/financialSnapshot\.findFirst\s*\(/);
    expect(financial).not.toMatch(/financialState\.findFirst\s*\(/);

    const identity = readFileSync(join(process.cwd(), "lib/financial-identity.ts"), "utf8");
    expect(identity).toContain('if (rows.length === 0)');
    expect(identity).toContain('if (query.selection === "exact")');
    expect(identity).toContain('if (rows.length === 1)');
    expect(identity).toContain('status: "AMBIGUOUS"');

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
