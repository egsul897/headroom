/**
 * Dashboard North-Star financial band — Neon NS-4 read path.
 *
 * Fail-closed: empty store → NEEDS_INPUT (no invented metrics).
 * After propose + attributable approve → facts loaded from Prisma reopen.
 * Without evaluationDate → APPROVED_INVENTORY (no silent LATEST_QUARTER bind).
 *
 * SYNTHETIC certificate fixtures only. IMPLEMENTED ≠ CERTIFIED.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient } from "@/components/DashboardClient";
import { loadNs4DashboardFinancialState } from "@/lib/dashboard/ns4-financial-panel";
import {
  proposeSyntheticCertificateForCompany,
  approveWorkspaceCertificate,
} from "@/lib/product/north-star-workflow";
import { loadApprovedSnapshotsFromPrisma } from "@/lib/contract-model/north-star-bridge";
import type { SolverNativeCompanyContext } from "@/lib/covenant-engine";
import { getFinancialPosition } from "@/lib/financial-core/position-service";
import { fact, type FinancialState } from "@/lib/financial-core/types";

const CO = "dash-ns4-read-co";
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function teardown(prisma: PrismaClient, companyId: string) {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

describeDb("Dashboard NS-4 Neon financial band", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma, CO);
    await prisma.company.create({
      data: { id: CO, name: "Dashboard NS-4 Read Co (synthetic)", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, CO);
    await prisma.$disconnect();
  }, 60_000);

  it("empty store → NEEDS_INPUT with no invented financial facts", async () => {
    const state = await loadNs4DashboardFinancialState({ companyId: CO });
    expect(state.status).toBe("NEEDS_INPUT");
    expect(state.authority).toBe("NONE");
    expect(state.approvedSnapshotCount).toBe(0);
    expect(state.boundSnapshot).toBeNull();
    expect(state.missingInputs).toContain("APPROVED_NorthStar_snapshot");
    expect(state.evidence.some((e) => /No APPROVED NS-4/i.test(e))).toBe(true);
  });

  it("propose + approve → APPROVED_INVENTORY without evaluationDate (no silent latest-quarter)", async () => {
    const proposed = await proposeSyntheticCertificateForCompany(CO, {
      snapshotId: `snap-${CO}-q2`,
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
    });
    expect(proposed.ok).toBe(true);

    const approved = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: proposed.snapshotId,
      reviewedBy: "dash-ns4-counsel",
      approvalRef: "apr-dash-ns4-1",
      reviewedAt: "2026-07-20T18:00:00Z",
      deliveredAsOfDate: "2026-07-10",
    });
    expect(approved.ok).toBe(true);

    // Durability: fresh Prisma client
    const prisma2 = new PrismaClient();
    const snaps = await loadApprovedSnapshotsFromPrisma(prisma2, CO);
    await prisma2.$disconnect();
    expect(snaps.some((s) => s.snapshotId === proposed.snapshotId)).toBe(true);

    const unbound = await loadNs4DashboardFinancialState({ companyId: CO });
    expect(unbound.status).toBe("APPROVED_INVENTORY");
    expect(unbound.authority).toBe("NS4_APPROVED");
    expect(unbound.approvedSnapshotCount).toBeGreaterThanOrEqual(1);
    expect(unbound.boundSnapshot).toBeNull();
    expect(unbound.missingInputs).toContain("evaluationDate");
    expect(unbound.inventory.some((s) => s.snapshotId === proposed.snapshotId)).toBe(true);
  });

  it("with evaluationDate → APPROVED_BOUND facts from Neon (EBITDA / debt / ratio)", async () => {
    const bound = await loadNs4DashboardFinancialState({
      companyId: CO,
      evaluationDate: "2026-08-01",
    });
    expect(bound.status).toBe("APPROVED_BOUND");
    expect(bound.authority).toBe("NS4_APPROVED");
    expect(bound.cutoff.state).toBe("RESOLVED");
    expect(bound.boundSnapshot).not.toBeNull();
    expect(bound.boundSnapshot!.snapshotId).toContain(CO);
    expect(bound.boundSnapshot!.reportingPeriod).toBe("FY2026-Q2");
    expect(bound.boundSnapshot!.asOf).toBe("2026-06-30");
    expect(bound.boundSnapshot!.approvalRef).toMatch(/^apr-dash-ns4-1/);

    const keys = bound.boundSnapshot!.facts.map((f) => f.key);
    expect(keys).toContain("Consolidated EBITDA");
    expect(keys).toContain("Consolidated Total Net Debt");
    expect(keys).toContain("Total Net Leverage Ratio");

    const ebitda = bound.boundSnapshot!.facts.find((f) => f.key === "Consolidated EBITDA");
    expect(ebitda?.displayValue).toBe("125000000");
    expect(ebitda?.currency).toBe("USD");

    const debt = bound.boundSnapshot!.facts.find((f) => f.key === "Consolidated Total Net Debt");
    expect(debt?.displayValue).toBe("412500000");

    const ratio = bound.boundSnapshot!.facts.find((f) => f.key === "Total Net Leverage Ratio");
    expect(ratio?.displayValue).toBe("3.3");

    // Facts must not come from a fabricated zero / legacy path
    expect(bound.legacyNote).toMatch(/LEGACY_ENGINE/);
  });

  it("DashboardClient renders NS-4 band from Neon state (bound facts visible)", async () => {
    const ns4 = await loadNs4DashboardFinancialState({
      companyId: CO,
      evaluationDate: "2026-08-01",
    });
    expect(ns4.status).toBe("APPROVED_BOUND");

    const asOf = new Date("2027-03-31T00:00:00.000Z");
    const financialState: FinancialState = {
      id: "dash-ns4-state",
      companyId: CO,
      asOfDate: asOf,
      periodType: "ACTUAL",
      scope: { kind: "CONSOLIDATED" },
      effectiveFrom: null,
      effectiveTo: null,
      balanceSheetFacts: {
        cash: fact(1, "REPORTED", asOf),
        totalDebtPrincipal: fact(1, "REPORTED", asOf),
        securedDebtPrincipal: fact(1, "REPORTED", asOf),
      },
      incomeStatementFacts: {
        gaapEbitda: fact(1, "REPORTED", asOf),
        cumulativeNetIncomeSinceIssue: fact(1, "REPORTED", asOf),
        equityProceedsSinceIssue: fact(1, "REPORTED", asOf),
        interestExpense: fact(1, "REPORTED", asOf),
      },
      covenantMetricFacts: {
        assumedNewDebtRatePct: fact(5, "ASSUMED", asOf),
      },
    };
    const financialPosition = getFinancialPosition(financialState, [], [], asOf, []);
    const solverContext: SolverNativeCompanyContext = {
      permissions: [],
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      coverageDeclarations: [],
      activationState: {
        asOfDate: asOf,
        series: {},
        events: [],
        usageCounts: {},
        unknownKeys: new Set(),
      },
      asOfDate: asOf,
      entityClasses: ["BORROWER"],
      incurringEntity: { id: "dash-ns4-borrower", name: "Dashboard NS-4 Read Co" },
      guarantorStatus: "GUARANTOR",
      collateralPools: [],
      requestedLienPriority: [],
    };
    const { unknownKeys, ...activationRest } = solverContext.activationState;

    const html = renderToStaticMarkup(
      <DashboardClient
        companyId={CO}
        companyName="Dashboard NS-4 Read Co"
        asOfDate={asOf.toISOString()}
        covenantData={{
          companyId: CO,
          documents: [],
          provisions: [],
          financials: {
            ebitda: 1,
            cash: 1,
            interestExpense: 1,
            cumulativeNetIncome: 1,
            equityProceedsSinceIssue: 1,
            assumedNewDebtRatePct: 5,
            totalDebt: 1,
            securedDebt: 1,
          },
          ledger: [],
        }}
        financialPosition={financialPosition}
        solverContext={{
          ...solverContext,
          activationState: { ...activationRest, unknownKeysArray: [...unknownKeys] },
        }}
        permissionRows={[]}
        coverageDeclarations={[]}
        documentNameEntries={[]}
        facilitiesQuery={{ outcome: "empty" }}
        maturitiesQuery={{
          outcome: "empty",
          dueWithin12: 0,
          dueWithin24: 0,
          dueWithin36: 0,
        }}
        ns4Financial={ns4}
      />,
    );

    expect(html).toContain('data-slot="ns4-financial"');
    expect(html).toContain("APPROVED_BOUND");
    expect(html).toContain("125000000");
    expect(html).toContain("412500000");
    expect(html).toContain("Consolidated EBITDA");
    expect(html).toContain("LEGACY_ENGINE");
    expect(html).toContain("not NS-4 APPROVED");
  });

  it("DashboardClient without ns4Financial prop does not invent an NS-4 band", () => {
    const asOf = new Date("2027-03-31T00:00:00.000Z");
    const financialState: FinancialState = {
      id: "dash-ns4-empty-ui",
      companyId: "no-ns4-prop",
      asOfDate: asOf,
      periodType: "ACTUAL",
      scope: { kind: "CONSOLIDATED" },
      effectiveFrom: null,
      effectiveTo: null,
      balanceSheetFacts: {
        cash: fact(1, "REPORTED", asOf),
        totalDebtPrincipal: fact(1, "REPORTED", asOf),
        securedDebtPrincipal: fact(1, "REPORTED", asOf),
      },
      incomeStatementFacts: {
        gaapEbitda: fact(1, "REPORTED", asOf),
        cumulativeNetIncomeSinceIssue: fact(1, "REPORTED", asOf),
        equityProceedsSinceIssue: fact(1, "REPORTED", asOf),
        interestExpense: fact(1, "REPORTED", asOf),
      },
      covenantMetricFacts: {
        assumedNewDebtRatePct: fact(5, "ASSUMED", asOf),
      },
    };
    const financialPosition = getFinancialPosition(financialState, [], [], asOf, []);
    const solverContext: SolverNativeCompanyContext = {
      permissions: [],
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      coverageDeclarations: [],
      activationState: {
        asOfDate: asOf,
        series: {},
        events: [],
        usageCounts: {},
        unknownKeys: new Set(),
      },
      asOfDate: asOf,
      entityClasses: ["BORROWER"],
      incurringEntity: { id: "x", name: "X" },
      guarantorStatus: "GUARANTOR",
      collateralPools: [],
      requestedLienPriority: [],
    };
    const { unknownKeys, ...activationRest } = solverContext.activationState;
    const html = renderToStaticMarkup(
      <DashboardClient
        companyName="No NS4 Prop"
        asOfDate={asOf.toISOString()}
        covenantData={{
          companyId: "no-ns4-prop",
          documents: [],
          provisions: [],
          financials: {
            ebitda: 1,
            cash: 1,
            interestExpense: 1,
            cumulativeNetIncome: 1,
            equityProceedsSinceIssue: 1,
            assumedNewDebtRatePct: 5,
            totalDebt: 1,
            securedDebt: 1,
          },
          ledger: [],
        }}
        financialPosition={financialPosition}
        solverContext={{
          ...solverContext,
          activationState: { ...activationRest, unknownKeysArray: [...unknownKeys] },
        }}
        permissionRows={[]}
        coverageDeclarations={[]}
        documentNameEntries={[]}
        facilitiesQuery={{ outcome: "empty" }}
        maturitiesQuery={{
          outcome: "empty",
          dueWithin12: 0,
          dueWithin24: 0,
          dueWithin36: 0,
        }}
      />,
    );
    expect(html).not.toContain('data-slot="ns4-financial"');
  });
});
