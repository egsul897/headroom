/**
 * NS-4 customer vertical slice:
 * certificate evidence → FCE propose → attributable approve → cutoff-bound
 * NS-4 snapshot → Phase 4A IR Total Net Leverage → Dashboard band.
 *
 * Matthews: AUTHENTIC_SOURCE_DERIVED (EDGAR 0000063296-25-000006)
 * Coherent: SEED_ALIGNED_MODELED (same code path, no issuer-specific logic)
 *
 * Never auto-approves. IMPLEMENTED ≠ CERTIFIED.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient } from "@/components/DashboardClient";
import {
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  approveWorkspaceCertificate,
  loadNs4DashboardFinancialState,
  MATTHEWS_FIXTURE_AUTHORITY,
  COHERENT_FIXTURE_AUTHORITY,
} from "@/lib/product/north-star-workflow";
import type { SolverNativeCompanyContext } from "@/lib/covenant-engine";
import { getFinancialPosition } from "@/lib/financial-core/position-service";
import { fact, type FinancialState } from "@/lib/financial-core/types";

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

function ratioToNumber(actual: string): number {
  if (actual.includes("/")) {
    const [num, den] = actual.split("/");
    return Number(num) / Number(den);
  }
  return Number(actual);
}

function approxRatio(actual: string, expected: number, tol = 0.02) {
  const n = ratioToNumber(actual);
  expect(Number.isFinite(n)).toBe(true);
  expect(Math.abs(n - expected)).toBeLessThanOrEqual(tol);
}

function renderDash(companyId: string, ns4: Awaited<ReturnType<typeof loadNs4DashboardFinancialState>>) {
  const asOf = new Date("2027-03-31T00:00:00.000Z");
  const financialState: FinancialState = {
    id: `${companyId}-state`,
    companyId,
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
    covenantMetricFacts: { assumedNewDebtRatePct: fact(5, "ASSUMED", asOf) },
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
    incurringEntity: { id: `${companyId}-b`, name: companyId },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  };
  const { unknownKeys, ...activationRest } = solverContext.activationState;
  return renderToStaticMarkup(
    <DashboardClient
      companyId={companyId}
      companyName={companyId}
      asOfDate={asOf.toISOString()}
      covenantData={{
        companyId,
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
      maturitiesQuery={{ outcome: "empty", dueWithin12: 0, dueWithin24: 0, dueWithin36: 0 }}
      ns4Financial={ns4}
    />,
  );
}

async function runIssuerSlice(args: {
  companyId: string;
  issuer: "matthews_q1_fy2025" | "coherent_fy2026";
  evaluationDate: string;
  expectedRatio: number;
  expectedEbitda: string;
  expectedDebt: string;
  expectedCash: string;
  authorityKind: string;
}) {
  const proposed = await proposeAuthenticCertificateFixtureForCompany(args.companyId, args.issuer);
  expect(proposed.ok).toBe(true);
  expect(proposed.authoritative).toBe(false);
  expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(proposed.status);
  expect(proposed.fixtureAuthority?.kind).toBe(args.authorityKind);
  expect(proposed.factKeys).toEqual(expect.arrayContaining(["Consolidated EBITDA"]));
  expect(proposed.snapshotId).toBeTruthy();

  // Fail-closed: before approve, dashboard cannot bind IR leverage as APPROVED_BOUND EXECUTABLE
  const before = await loadNs4DashboardFinancialState({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });
  expect(before.status).not.toBe("APPROVED_BOUND");

  // reviewedAt must be on/before evaluationDate so delivery evidence is visible to cutoff.
  const reviewedAt = `${args.evaluationDate}T12:00:00Z`;
  const approved = await approveFceProposedCertificate({
    companyId: args.companyId,
    snapshotId: proposed.snapshotId!,
    reviewedBy: `counsel-${args.issuer}@test.local`,
    approvalRef: `apr-${args.issuer}`,
    reviewedAt,
  });
  if (!approved.ok) {
    const ws = await approveWorkspaceCertificate({
      companyId: args.companyId,
      snapshotId: proposed.snapshotId!,
      reviewedBy: `counsel-${args.issuer}@test.local`,
      approvalRef: `apr-${args.issuer}`,
      reviewedAt,
    });
    expect(ws.ok).toBe(true);
  } else {
    expect(approved.authoritative).toBe(true);
  }

  const dash = await loadNs4DashboardFinancialState({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });
  expect(dash.status).toBe("APPROVED_BOUND");
  expect(dash.cutoff.state).toBe("RESOLVED");
  expect(dash.boundSnapshot?.approvalRef).toBeTruthy();
  expect(dash.leverageIr.status).toBe("EXECUTABLE");
  expect(dash.leverageIr.computedRatio).toBeTruthy();
  approxRatio(dash.leverageIr.computedRatio!, args.expectedRatio);
  expect(dash.leverageIr.components.ebitdaDisplay).toContain(args.expectedEbitda);
  expect(dash.leverageIr.components.debtDisplay).toContain(args.expectedDebt);
  expect(dash.leverageIr.components.cashDisplay).toContain(args.expectedCash);
  expect(dash.leverageIr.capacitySeparationNote).toMatch(/not verified remaining/i);

  const html = renderDash(args.companyId, dash);
  expect(html).toContain('data-slot="ns4-financial"');
  expect(html).toContain('data-slot="ns4-leverage-ir"');
  expect(html).toContain("EXECUTABLE");
  expect(html).toContain(dash.leverageIr.computedRatio!);
  expect(html).toContain("not verified remaining");

  return { proposed, dash };
}

describeDb("NS-4 vertical slice — FCE certificate → IR leverage → Dashboard", () => {
  const prisma = new PrismaClient();
  const MAT = "ns4-slice-matthews-co";
  const COH = "ns4-slice-coherent-co";

  beforeAll(async () => {
    await teardown(prisma, MAT);
    await teardown(prisma, COH);
    await prisma.company.create({
      data: { id: MAT, name: "NS4 Slice Matthews", tenantKind: "EVALUATION" },
    });
    await prisma.company.create({
      data: { id: COH, name: "NS4 Slice Coherent", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, MAT);
    await teardown(prisma, COH);
    await prisma.$disconnect();
  }, 60_000);

  it("refuses auto-approve: empty reviewedBy", async () => {
    const proposed = await proposeAuthenticCertificateFixtureForCompany(MAT, "matthews_q1_fy2025");
    expect(proposed.ok).toBe(true);
    const refused = await approveFceProposedCertificate({
      companyId: MAT,
      snapshotId: proposed.snapshotId!,
      reviewedBy: "   ",
      approvalRef: "apr-empty",
    });
    expect(refused.ok).toBe(false);
    expect(refused.issues.join(" ")).toMatch(/reviewedBy/i);
  });

  it("Matthews authentic certificate → APPROVED → IR TNL ≈ 6.05", async () => {
    expect(MATTHEWS_FIXTURE_AUTHORITY.kind).toBe("AUTHENTIC_SOURCE_DERIVED");
    // (809.211 − 33.513) / 128.313 ≈ 6.045
    await runIssuerSlice({
      companyId: MAT,
      issuer: "matthews_q1_fy2025",
      evaluationDate: "2025-02-01",
      expectedRatio: 6.045,
      expectedEbitda: "128313000",
      expectedDebt: "809211000",
      expectedCash: "33513000",
      authorityKind: "AUTHENTIC_SOURCE_DERIVED",
    });
  });

  it("Coherent seed-aligned certificate → same path → IR TNL ≈ 1.233", async () => {
    expect(COHERENT_FIXTURE_AUTHORITY.kind).toBe("SEED_ALIGNED_MODELED");
    // (3258 − 1162) / 1700 = 1.23294…
    await runIssuerSlice({
      companyId: COH,
      issuer: "coherent_fy2026",
      evaluationDate: "2026-08-01",
      expectedRatio: 1.233,
      expectedEbitda: "1700000000",
      expectedDebt: "3258000000",
      expectedCash: "1162000000",
      authorityKind: "SEED_ALIGNED_MODELED",
    });
  });
});
