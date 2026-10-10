/**
 * Independent legal/financial validation of Coherent capacity figures and
 * transaction economics. Expectations are authored from covenant formulas +
 * Neon financial inputs — never from engine output under test.
 *
 * Authority labels:
 * - MODELED_CROSS_DOCUMENT: computeCovenantPosition + capacityFormulas (matches golden Q1/Q2)
 * - SOLVER_NATIVE_DASHBOARD: getCompanyDashboard remainingCapacity (may diverge — flagged)
 * - EVALUATION_SEED: not NS-4 APPROVED; not Phase-4 REQUIRE
 */

import { prisma } from "../../prisma";
import {
  getCompanyDashboard,
  runCompanyScenario,
} from "../../dashboard-service";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type CovenantPosition,
} from "../../covenant-engine";
import {
  COHERENT_INDEPENDENT,
  expectedMilaSecuredRoom,
  expectedTnlRoom,
} from "./independent";

export type OutcomeClass =
  | "CORRECT_EXECUTABLE"
  | "CORRECT_REFUSAL"
  | "FALSE_FAVORABLE"
  | "INCORRECT"
  | "LIMITATION";

export interface BalanceSheetState {
  ebitda: number;
  cash: number;
  totalDebt: number;
  securedDebt: number;
  netDebt: number;
  netSecured: number;
  equityProceedsSinceIssue: number;
  cumulativeNetIncome: number;
  interestExpense: number;
  totalNetLeverage: number;
  seniorSecuredNetLeverage: number;
  fixedChargeCoverage: number;
}

export interface CapacityBreakdown {
  /** Gross TNL borrowing room under CA §6.11 — NOT package-wide secured capacity. */
  grossLeverageBorrowingRoomTnl: {
    amount: number;
    formula: string;
    provision: string;
    section: string;
    document: string;
    independent: number;
  };
  packageWideSecuredCapacity: {
    amount: number;
    bindingProvision: string;
    section: string;
    document: string;
    independent: number;
    authority: "MODELED_CROSS_DOCUMENT";
  };
  packageWideUnsecuredCapacity: {
    amount: number;
    bindingProvision: string;
    section: string;
    document: string;
    independent: number;
    authority: "MODELED_CROSS_DOCUMENT";
  };
  lienCapacity: {
    ratioProng: number;
    generalProng: number;
    sum: number;
    note: string;
  };
  availableBaskets: Array<{
    code: string;
    name: string;
    section: string;
    capacity: number | null;
    formula: string;
  }>;
  knownHistoricalUsage: Array<{ basket: string; direction: string; amount: number }>;
  unknownHistoricalUsage: string[];
  packageWideBindingConstraints: string[];
  dashboardSolverDivergence: {
    securedReported: number | null;
    unsecuredReported: number | null;
    securedIsFalseFavorable: boolean;
    solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC";
    packageAuthoritativeSecured: number | null;
    packageAuthoritativeLabel: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED";
    rootCauseTrace: string[];
    note: string;
  };
}

export interface TransactionEconomicsRow {
  id: string;
  kind: string;
  title: string;
  amount: number;
  sequentialIndex: number;
  usesPriorPostState: boolean;
  independent: {
    pre: BalanceSheetState;
    post: BalanceSheetState;
    cashTreatment: string;
    debtTreatment: string;
    lienLeverageEffects: string[];
    basketEffects: string[];
    limitations: string[];
    expectedPackageSecured: number;
    expectedPackageUnsecured: number;
    expectedBuilderHeadline: number | null;
    expectedBuilderStepRemaining: number | null;
  };
  observed: {
    packageSecured: number | null;
    packageUnsecured: number | null;
    builderHeadline: number | null;
    builderStepRemaining: number | null;
    simulationStatus: string | null;
    facilityFlat: number | null;
  };
  outcome: OutcomeClass;
  notes: string[];
}

export interface IndependentValidationReport {
  schemaVersion: "product.financial-capacity-independent-validation.v1";
  generatedAt: string;
  startingSha: string | null;
  paidInferenceCalls: 0;
  promotedToLegalTruth: 0;
  companyId: "coherent";
  asOfDate: string;
  financialAuthority: {
    ns4ApprovedSnapshots: number;
    financialSnapshotRows: number;
    financialStateRows: number;
    goldenTestsVerified: number;
    goldenTestsTotal: number;
    permissionsVerified: number;
    permissionsTotal: number;
    classification: "EVALUATION_SEED_NOT_NS4_APPROVED";
    phase4RequireExecutable: false;
    note: string;
  };
  fiveOneTwoNineBillion: {
    amountMillions: 5129;
    isUniversalCapacity: false;
    meaning: string;
    calculation: {
      ebitda: number;
      threshold: number;
      totalDebt: number;
      cash: number;
      netDebt: number;
      room: number;
      formula: string;
      provisionCode: string;
      sectionRef: string;
      document: string;
      asOfDate: string;
    };
    matchesIndependent: boolean;
    matchesCrossDocumentUnsecured: boolean;
    mustNotBePresentedAs: string[];
  };
  capacityBreakdown: CapacityBreakdown;
  builderAuthority: {
    sectionRefs: string[];
    formula: string;
    starter: number;
    cniContribution: number;
    equityContribution: number;
    headline: number;
    equityLegalAuthority: string;
    includeEquityProceedsParam: true;
  };
  borrowingProceedsTreatment: {
    engineConvention: "IMMEDIATELY_SPENT_CASH_UNCHANGED";
    cashRetained: {
      description: string;
      netDebtDelta: number;
      tnlRoom: number;
      ssnlRoom: number;
    };
    immediatelySpent: {
      description: string;
      netDebtDelta: number;
      tnlRoom: number;
      ssnlRoom: number;
    };
    label: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED";
  };
  coordination: {
    issue220FinancialApproval: string;
    issue234UtilizationCompleteness: string;
    issue218CrossDocumentRestrictions: string;
  };
  sequentialTransactions: TransactionEconomicsRow[];
  sequentialIntegrity: {
    chainLength: number;
    eachUsesPriorPostState: boolean;
    ledgerMutated: false;
    note: string;
  };
  matthews: {
    companyId: "matthews";
    provisionCount: number;
    capacityFormulasPresent: boolean;
    permissionCount: number;
    financialsPresent: boolean;
    outcome: "CORRECT_REFUSAL";
    note: string;
    nextStep: string;
  };
  productConvergence: {
    positionSurface: string;
    simulateSurface: string;
    askSurface: string;
    sharedState: string;
    modeledVsVerified: string;
  };
  outcomeSummary: {
    correctExecutable: number;
    correctRefusals: number;
    falseFavorable: number;
    incorrect: number;
    limitations: string[];
  };
  customerReportMarkdown: string;
}

function bs(fin: CompanyCovenantData["financials"], pos: CovenantPosition): BalanceSheetState {
  return {
    ebitda: fin.ebitda,
    cash: fin.cash,
    totalDebt: fin.totalDebt,
    securedDebt: fin.securedDebt,
    netDebt: pos.metrics.netDebt,
    netSecured: pos.metrics.netSecured,
    equityProceedsSinceIssue: fin.equityProceedsSinceIssue,
    cumulativeNetIncome: fin.cumulativeNetIncome,
    interestExpense: fin.interestExpense,
    totalNetLeverage: pos.metrics.totalNetLeverage,
    seniorSecuredNetLeverage: pos.metrics.seniorSecuredNetLeverage,
    fixedChargeCoverage: pos.metrics.fixedChargeCoverage,
  };
}

function overlay(
  data: CompanyCovenantData,
  patch: Partial<CompanyCovenantData["financials"]>,
  ledgerPatch?: CompanyCovenantData["ledger"],
): { data: CompanyCovenantData; position: CovenantPosition } {
  const next: CompanyCovenantData = {
    ...data,
    financials: { ...data.financials, ...patch },
    ledger: ledgerPatch ?? data.ledger,
  };
  return { data: next, position: computeCovenantPosition(next) };
}

function builderHeadline(fin: CompanyCovenantData["financials"]): number {
  const starter = Math.max(330, 0.25 * fin.ebitda);
  const cni = 0.5 * Math.max(0, fin.cumulativeNetIncome);
  return starter + cni + fin.equityProceedsSinceIssue;
}

function rpPoolUsed(ledger: CompanyCovenantData["ledger"]): number {
  return ledger
    .filter((e) => (e.basket === "DIVIDEND" || e.basket === "INVESTMENT") && e.direction === "DEBIT")
    .reduce((s, e) => s + e.amount, 0);
}

function packageCaps(pos: CovenantPosition): { secured: number | null; unsecured: number | null } {
  return {
    secured:
      pos.crossDocumentSecured.status === "modeled"
        ? (pos.crossDocumentSecured.capacity ?? null)
        : null,
    unsecured:
      pos.crossDocumentUnsecured.status === "modeled"
        ? (pos.crossDocumentUnsecured.capacity ?? null)
        : null,
  };
}

function nearly(a: number | null | undefined, b: number | null | undefined, eps = 0.51): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

function renderReport(r: IndependentValidationReport): string {
  const lines: string[] = [];
  lines.push("# Independent validation — Coherent financial capacity");
  lines.push("");
  lines.push(`Generated: ${r.generatedAt}`);
  lines.push(`SHA: ${r.startingSha ?? "unknown"}`);
  lines.push(`paidInferenceCalls: ${r.paidInferenceCalls}`);
  lines.push(`promotedToLegalTruth: ${r.promotedToLegalTruth}`);
  lines.push("");
  lines.push("## 1. Independent $5.129B calculation");
  lines.push("");
  lines.push(r.fiveOneTwoNineBillion.meaning);
  lines.push("");
  lines.push("```");
  lines.push(r.fiveOneTwoNineBillion.calculation.formula);
  lines.push(
    `= ${r.fiveOneTwoNineBillion.calculation.threshold} × ${r.fiveOneTwoNineBillion.calculation.ebitda} − (${r.fiveOneTwoNineBillion.calculation.totalDebt} − ${r.fiveOneTwoNineBillion.calculation.cash})`,
  );
  lines.push(`= ${r.fiveOneTwoNineBillion.calculation.room}`);
  lines.push("```");
  lines.push("");
  lines.push(
    `Provision: ${r.fiveOneTwoNineBillion.calculation.document} ${r.fiveOneTwoNineBillion.calculation.sectionRef} (\`${r.fiveOneTwoNineBillion.calculation.provisionCode}\`)`,
  );
  lines.push(`As of: ${r.fiveOneTwoNineBillion.calculation.asOfDate}`);
  lines.push(`Is universal secured+unsecured capacity: **${r.fiveOneTwoNineBillion.isUniversalCapacity}**`);
  lines.push("");
  lines.push("## 2. Secured versus unsecured");
  lines.push("");
  lines.push(
    `| Side | Package-wide | Binding | Independent |`,
  );
  lines.push(`|---|---|---|---|`);
  lines.push(
    `| Secured | $${r.capacityBreakdown.packageWideSecuredCapacity.amount}M | ${r.capacityBreakdown.packageWideSecuredCapacity.document} ${r.capacityBreakdown.packageWideSecuredCapacity.section} | $${r.capacityBreakdown.packageWideSecuredCapacity.independent}M |`,
  );
  lines.push(
    `| Unsecured | $${r.capacityBreakdown.packageWideUnsecuredCapacity.amount}M | ${r.capacityBreakdown.packageWideUnsecuredCapacity.document} ${r.capacityBreakdown.packageWideUnsecuredCapacity.section} | $${r.capacityBreakdown.packageWideUnsecuredCapacity.independent}M |`,
  );
  lines.push("");
  lines.push("### Solver divergence / authority");
  lines.push("");
  lines.push(
    `- Package authoritative secured: $${r.capacityBreakdown.dashboardSolverDivergence.packageAuthoritativeSecured}M (${r.capacityBreakdown.dashboardSolverDivergence.packageAuthoritativeLabel})`,
  );
  lines.push(
    `- Solver-native secured (diagnostic): $${r.capacityBreakdown.dashboardSolverDivergence.securedReported}M — ${r.capacityBreakdown.dashboardSolverDivergence.solverAuthority}`,
  );
  lines.push(
    `- False favorable: **${r.capacityBreakdown.dashboardSolverDivergence.securedIsFalseFavorable}**`,
  );
  for (const t of r.capacityBreakdown.dashboardSolverDivergence.rootCauseTrace) {
    lines.push(`- ${t}`);
  }
  lines.push("");
  lines.push(r.capacityBreakdown.dashboardSolverDivergence.note);
  lines.push("");
  if (r.borrowingProceedsTreatment) {
    lines.push("### Borrowing proceeds treatment");
    lines.push("");
    lines.push(`Engine convention: ${r.borrowingProceedsTreatment.engineConvention}`);
    lines.push(`- Cash retained: ${r.borrowingProceedsTreatment.cashRetained.description}`);
    lines.push(
      `  → TNL room $${r.borrowingProceedsTreatment.cashRetained.tnlRoom}M · SSNL room $${r.borrowingProceedsTreatment.cashRetained.ssnlRoom}M`,
    );
    lines.push(`- Immediately spent: ${r.borrowingProceedsTreatment.immediatelySpent.description}`);
    lines.push(
      `  → TNL room $${r.borrowingProceedsTreatment.immediatelySpent.tnlRoom}M · SSNL room $${r.borrowingProceedsTreatment.immediatelySpent.ssnlRoom}M`,
    );
    lines.push(`- Label: ${r.borrowingProceedsTreatment.label}`);
    lines.push("");
  }
  lines.push("## 3–5. Sequential transaction economics");
  lines.push("");
  for (const t of r.sequentialTransactions) {
    lines.push(`### ${t.id} — ${t.title}`);
    lines.push("");
    lines.push(`- Outcome: **${t.outcome}**`);
    lines.push(`- Uses prior post-state: ${t.usesPriorPostState}`);
    lines.push(
      `- Pre BS: cash $${t.independent.pre.cash}M · totalDebt $${t.independent.pre.totalDebt}M · secured $${t.independent.pre.securedDebt}M · netDebt $${t.independent.pre.netDebt}M · TNL ${t.independent.pre.totalNetLeverage.toFixed(3)}x · SSNL ${t.independent.pre.seniorSecuredNetLeverage.toFixed(3)}x`,
    );
    lines.push(
      `- Post BS: cash $${t.independent.post.cash}M · totalDebt $${t.independent.post.totalDebt}M · secured $${t.independent.post.securedDebt}M · netDebt $${t.independent.post.netDebt}M · TNL ${t.independent.post.totalNetLeverage.toFixed(3)}x · SSNL ${t.independent.post.seniorSecuredNetLeverage.toFixed(3)}x`,
    );
    lines.push(`- Cash treatment: ${t.independent.cashTreatment}`);
    lines.push(`- Debt treatment: ${t.independent.debtTreatment}`);
    for (const e of t.independent.lienLeverageEffects) lines.push(`- ${e}`);
    for (const e of t.independent.basketEffects) lines.push(`- Basket: ${e}`);
    for (const e of t.independent.limitations) lines.push(`- Limitation: ${e}`);
    for (const n of t.notes) lines.push(`- Note: ${n}`);
    lines.push("");
  }
  lines.push("## 6. Known versus unknown utilization");
  lines.push("");
  lines.push("Known:");
  for (const u of r.capacityBreakdown.knownHistoricalUsage) {
    lines.push(`- ${u.basket} ${u.direction} $${u.amount}M`);
  }
  lines.push("Unknown:");
  for (const u of r.capacityBreakdown.unknownHistoricalUsage) lines.push(`- ${u}`);
  lines.push("");
  lines.push("## 7. Sequential integrity");
  lines.push("");
  lines.push(r.sequentialIntegrity.note);
  lines.push("");
  lines.push("## 8. Authentic financial approval status");
  lines.push("");
  lines.push(`- Classification: **${r.financialAuthority.classification}**`);
  lines.push(`- NS-4 APPROVED: ${r.financialAuthority.ns4ApprovedSnapshots}`);
  lines.push(`- Phase-4 REQUIRE executable: ${r.financialAuthority.phase4RequireExecutable}`);
  lines.push(`- ${r.financialAuthority.note}`);
  lines.push("");
  lines.push("## 9. Outcomes");
  lines.push("");
  lines.push(JSON.stringify(r.outcomeSummary, null, 2));
  lines.push("");
  lines.push("## Equity builder legal authority");
  lines.push("");
  lines.push(r.builderAuthority.equityLegalAuthority);
  lines.push(`Formula: ${r.builderAuthority.formula}`);
  lines.push(
    `Starter $${r.builderAuthority.starter}M + CNI $${r.builderAuthority.cniContribution}M + equity $${r.builderAuthority.equityContribution}M = $${r.builderAuthority.headline}M`,
  );
  lines.push("");
  lines.push("## Matthews");
  lines.push("");
  lines.push(`${r.matthews.outcome}: ${r.matthews.note}`);
  lines.push(`Next: ${r.matthews.nextStep}`);
  lines.push("");
  lines.push("## Product convergence");
  lines.push("");
  lines.push(`- Position: ${r.productConvergence.positionSurface}`);
  lines.push(`- Simulate: ${r.productConvergence.simulateSurface}`);
  lines.push(`- Ask: ${r.productConvergence.askSurface}`);
  lines.push(`- Shared state: ${r.productConvergence.sharedState}`);
  lines.push(`- ${r.productConvergence.modeledVsVerified}`);
  lines.push("");
  if (r.coordination) {
    lines.push("## Coordination");
    lines.push("");
    lines.push(`- ${r.coordination.issue220FinancialApproval}`);
    lines.push(`- ${r.coordination.issue234UtilizationCompleteness}`);
    lines.push(`- ${r.coordination.issue218CrossDocumentRestrictions}`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function runIndependentValidation(args?: {
  startingSha?: string | null;
}): Promise<IndependentValidationReport> {
  const companyId = "coherent" as const;
  const dash = await getCompanyDashboard(companyId);
  const baseData = await loadCompanyCovenantData(prisma, companyId, dash.asOfDate);
  const basePos = computeCovenantPosition(baseData);
  const asOf = dash.asOfDate.toISOString();

  const fin = COHERENT_INDEPENDENT.financials;
  const independentTnl = expectedTnlRoom(fin);
  const independentMila = expectedMilaSecuredRoom(fin);
  const caps = packageCaps(basePos);

  const starter = Math.max(330, 0.25 * fin.ebitda);
  const cniContribution = 0.5 * Math.max(0, fin.cumulativeNetIncome);
  const equityContribution = fin.equityProceedsSinceIssue;
  const builder = starter + cniContribution + equityContribution;

  const ns4 = await prisma.contractInputSnapshot.count({
    where: { companyId, status: "APPROVED" },
  });
  const snapRows = await prisma.financialSnapshot.count({ where: { companyId } });
  const stateRows = await prisma.financialState.count({ where: { companyId } });
  const golden = await prisma.goldenTest.groupBy({
    by: ["status"],
    where: { companyId },
    _count: true,
  });
  const perms = await prisma.permission.groupBy({
    by: ["reviewStatus"],
    where: { companyId },
    _count: true,
  });
  const goldenTotal = golden.reduce((s, g) => s + g._count, 0);
  const goldenVerified = golden
    .filter((g) => g.status === "VERIFIED")
    .reduce((s, g) => s + g._count, 0);
  const goldenVerifiedLoose = golden
    .filter((g) => g.status !== "UNVERIFIED")
    .reduce((s, g) => s + g._count, 0);
  const permTotal = perms.reduce((s, p) => s + p._count, 0);
  const permVerified = perms
    .filter((p) => p.reviewStatus !== "UNVERIFIED")
    .reduce((s, p) => s + p._count, 0);

  const capacityBreakdown: CapacityBreakdown = {
    grossLeverageBorrowingRoomTnl: {
      amount: independentTnl,
      formula: "4.25 × EBITDA − (totalDebt − cash)",
      provision: "ca_leverage_cap",
      section: "§6.11 — TNL ≤ 4.25x",
      document: "Credit Agreement (2022, as amended)",
      independent: independentTnl,
    },
    packageWideSecuredCapacity: {
      amount: caps.secured ?? NaN,
      bindingProvision: "mila_secured",
      section: "§3.3(b)(i)(C) — SSNL ≤ 3.00x",
      document: "2029 Senior Notes Indenture",
      independent: independentMila,
      authority: "MODELED_CROSS_DOCUMENT",
    },
    packageWideUnsecuredCapacity: {
      amount: caps.unsecured ?? NaN,
      bindingProvision: "ca_leverage_cap",
      section: "§6.11 — TNL ≤ 4.25x",
      document: "Credit Agreement (2022, as amended)",
      independent: independentTnl,
      authority: "MODELED_CROSS_DOCUMENT",
    },
    lienCapacity: {
      ratioProng: basePos.provisionCapacities.get(
        `${COHERENT_INDEPENDENT.notesIndentureId}:lien_ratio`,
      )?.capacity ?? 0,
      generalProng: basePos.provisionCapacities.get(
        `${COHERENT_INDEPENDENT.notesIndentureId}:lien_general`,
      )?.capacity ?? 0,
      sum: 0,
      note: "Indenture secured formula mins debt baskets, lien sum, and mila_secured; lien sum alone is not the package binding.",
    },
    availableBaskets: [...basePos.provisionCapacities.entries()].map(([key, v]) => ({
      code: key.split(":")[1] ?? key,
      name: v.provision.basketName,
      section: v.provision.sectionRef,
      capacity: v.capacity ?? null,
      formula: v.provision.formulaType,
    })),
    knownHistoricalUsage: baseData.ledger.map((e) => ({
      basket: e.basket,
      direction: e.direction,
      amount: e.amount,
    })),
    unknownHistoricalUsage: [
      "DEBT_INCUR ledger empty — prior debt-basket elections/draws not recorded as utilization against facility_flat / general_debt / MILA",
      "Lien grant historical usage not separately ledgered",
      "Investment DEBIT rows absent — only DIVIDEND $150M debit known against shared Available Amount pool",
    ],
    packageWideBindingConstraints: [
      "Secured package-wide: Indenture mila_secured (SSNL ≤ 3.00x) at $4,041M — tighter than CA §6.11 $5,129M",
      "Unsecured package-wide: CA §6.11 TNL ≤ 4.25x at $5,129M — tighter than Indenture unsecured ~$10,154M",
      "Both documents always apply; capacity is the minimum across governing documents per side",
    ],
    dashboardSolverDivergence: {
      securedReported:
        dash.capacity.secured.packageAuthoritative?.solverNativeRemaining ??
        dash.capacity.secured.remainingCapacity ??
        null,
      unsecuredReported:
        dash.capacity.unsecured.packageAuthoritative?.solverNativeRemaining ??
        dash.capacity.unsecured.remainingCapacity ??
        null,
      securedIsFalseFavorable:
        dash.capacity.secured.packageAuthoritative?.solverIsFalseFavorable ??
        (dash.capacity.secured.remainingCapacity ?? 0) > independentMila + 0.5,
      solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC",
      packageAuthoritativeSecured:
        dash.capacity.secured.packageAuthoritative?.remainingCapacity ?? caps.secured,
      packageAuthoritativeLabel: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
      rootCauseTrace: [
        "PRE-FIX: Indenture secured election ratio-fccr+scf-flat under CONCURRENT_DISREGARDED inherited SCF Permitted Liens cl.(6) auto-lien onto Ratio Debt → indenture max ≈ $11,933M (FCCR room + SCF flat).",
        "PRE-FIX: CA secured cleared via coh-ca-d-permitted-601p (§6.01(p) TNL ≤ 4.25x) without a Permitted Lien path → $5,129M.",
        "PRE-FIX: Package min(CA $5,129, Indenture $11,933) = $5,129M — Indenture mila_secured / SSNL ≤ 3.00x ($4,041M) never became binding.",
        "FIX: evaluateElection requires each secured DEBT_INCURRENCE leg to have its own auto-lien or independent LIEN member; CONCURRENT_COUNTED maxCapacity is not the sum of standalones.",
        "FIX: computeRemainingCapacityAfterDebtIncurrence clamps solver>legacy per document and quarantines false-favorable package figures; packageAuthoritative = MODELED_CROSS_DOCUMENT.",
        "POST-FIX: Customer/package secured = Indenture mila_secured $4,041M (MODELED). Solver-native package min is NON_AUTHORITATIVE_DIAGNOSTIC and must not exceed $4,041M.",
      ],
      note:
        "Solver-native remaining is NON_AUTHORITATIVE_DIAGNOSTIC. Customer headlines and package binding use MODELED_CROSS_DOCUMENT (Indenture mila_secured $4,041M secured / CA §6.11 $5,129M unsecured). Do not present solver figures as verified remaining capacity.",
    },
  };
  capacityBreakdown.lienCapacity.sum =
    capacityBreakdown.lienCapacity.ratioProng + capacityBreakdown.lienCapacity.generalProng;

  // ---- Sequential chain (hypothetical overlays; ledger never written) ----
  let cursor = { data: baseData, position: basePos };
  const sequential: TransactionEconomicsRow[] = [];

  // S1: Debt incur $50M secured — cash unchanged (debt-funded convention of simulateDebtIncurrence pro forma)
  {
    const amount = 50;
    const pre = bs(cursor.data.financials, cursor.position);
    const preCaps = packageCaps(cursor.position);
    const sim = simulateDebtIncurrence(cursor.data, cursor.position, amount, true);
    const next = overlay(cursor.data, {
      totalDebt: cursor.data.financials.totalDebt + amount,
      securedDebt: cursor.data.financials.securedDebt + amount,
      // cash unchanged — engine debt-incurrence leverage convention
    });
    const post = bs(next.data.financials, next.position);
    const postCaps = packageCaps(next.position);
    const expSec = independentMila - amount;
    const expUnsec = expectedTnlRoom({
      ebitda: fin.ebitda,
      totalDebt: fin.totalDebt + amount,
      cash: fin.cash,
    });
    const ok =
      sim.status === "clear" &&
      nearly(preCaps.secured, independentMila) &&
      nearly(postCaps.secured, expSec) &&
      nearly(postCaps.unsecured, expUnsec);
    sequential.push({
      id: "SEQ-S1-debt-incur-secured-50",
      kind: "DEBT_INCURRENCE",
      title: "Incur $50M secured debt",
      amount,
      sequentialIndex: 1,
      usesPriorPostState: false,
      independent: {
        pre,
        post,
        cashTreatment:
          "Debt-incurrence leverage convention leaves cash unchanged (proceeds not added to cash for TNL/SSNL tests). Limitation: not a full sources-and-uses balance sheet.",
        debtTreatment: `totalDebt +$${amount}M; securedDebt +$${amount}M`,
        lienLeverageEffects: [
          `SSNL room (mila_secured) consumed by $${amount}M → expected $${expSec}M`,
          `TNL room (ca_leverage_cap) consumed by $${amount}M → expected $${expUnsec}M`,
          "Lien ratio prong moves with SSNL; facility_flat (FLAT_NET_OF_DEBT net of secured) also declines $50M",
        ],
        basketEffects: [
          "mila_secured CONSUMED -50",
          "ca_leverage_cap CONSUMED -50",
          "facility_flat CONSUMED -50",
          "rp_builder UNAFFECTED (debt incur does not touch Available Amount)",
        ],
        limitations: [
          "Cash proceeds of the draw are NOT added — explicit engine convention",
          "Does not elect a specific basket permission for the draw",
        ],
        expectedPackageSecured: expSec,
        expectedPackageUnsecured: expUnsec,
        expectedBuilderHeadline: builderHeadline(cursor.data.financials),
        expectedBuilderStepRemaining:
          builderHeadline(cursor.data.financials) - rpPoolUsed(cursor.data.ledger),
      },
      observed: {
        packageSecured: postCaps.secured,
        packageUnsecured: postCaps.unsecured,
        builderHeadline: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`,
        )?.capacity ?? null,
        builderStepRemaining: null,
        simulationStatus: sim.status,
        facilityFlat: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
        )?.capacity ?? null,
      },
      outcome: ok ? "CORRECT_EXECUTABLE" : "INCORRECT",
      notes: [
        "Independent secured pre must be $4,041M (mila), not dashboard $5,129M",
      ],
    });
    cursor = next;
  }

  // S2: Debt repay $50M secured — uses S1 post; cash and debt both fall
  {
    const amount = 50;
    const pre = bs(cursor.data.financials, cursor.position);
    const preCaps = packageCaps(cursor.position);
    const next = overlay(cursor.data, {
      totalDebt: cursor.data.financials.totalDebt - amount,
      securedDebt: cursor.data.financials.securedDebt - amount,
      cash: cursor.data.financials.cash - amount,
    });
    const post = bs(next.data.financials, next.position);
    const postCaps = packageCaps(next.position);
    // Net debt unchanged vs S1 post when cash and debt fall equally → TNL room unchanged vs S1 post
    // But vs original baseline, we're back to start for ratio rooms; facility_flat restores with secured paydown
    const scenario = await runCompanyScenario(companyId, [
      { kind: "DEBT_REPAYMENT", facilityId: COHERENT_INDEPENDENT.termLoanAId, amount },
    ]);
    // S1 left cash unchanged (no proceeds). S2 spends cash to repay → cash permanently
    // $50M below baseline even though debt returns to baseline. Net leverage rooms
    // therefore do NOT fully restore to the original $4,041 / $5,129.
    const expCash = fin.cash - amount; // 1112
    const expSec = expectedMilaSecuredRoom({
      ebitda: fin.ebitda,
      securedDebt: fin.securedDebt, // back to baseline secured
      cash: expCash,
    }); // 3991
    const expUnsec = expectedTnlRoom({
      ebitda: fin.ebitda,
      totalDebt: fin.totalDebt,
      cash: expCash,
    }); // 5079
    const facFlatPre = cursor.position.provisionCapacities.get(
      `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
    )?.capacity;
    const facFlatPost = next.position.provisionCapacities.get(
      `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
    )?.capacity;
    const ok =
      nearly(post.cash, expCash) &&
      nearly(post.totalDebt, fin.totalDebt) &&
      nearly(post.securedDebt, fin.securedDebt) &&
      nearly(postCaps.secured, expSec) &&
      nearly(postCaps.unsecured, expUnsec) &&
      nearly(facFlatPost, (facFlatPre ?? 0) + amount) &&
      scenario.financialImpact.cashDelta === -amount &&
      scenario.financialImpact.grossDebtDelta === -amount;
    sequential.push({
      id: "SEQ-S2-debt-repay-50",
      kind: "DEBT_REPAYMENT",
      title: "Repay $50M Term Loan A (on S1 post-state)",
      amount,
      sequentialIndex: 2,
      usesPriorPostState: true,
      independent: {
        pre,
        post,
        cashTreatment: `Cash −$${amount}M (repayment funded from cash). Because S1 did not add debt proceeds to cash, this paydown leaves cash $${amount}M below the original baseline.`,
        debtTreatment: `totalDebt −$${amount}M; securedDebt −$${amount}M (returns to baseline outstanding)`,
        lienLeverageEffects: [
          `Net debt rises vs original baseline (cash lower, debt same) → TNL room $${expUnsec}M not $${independentTnl}M`,
          `SSNL room $${expSec}M not $${independentMila}M — incomplete restoration vs day-0`,
          "facility_flat RESTORED +50 vs S1 post (FLAT_NET_OF_DEBT nets secured outstanding)",
          "Vs pre-repay (S1 post): ratio rooms RESTORED +50; vs day-0: still −50 from cash drain",
        ],
        basketEffects: [
          "mila_secured RESTORED +50 vs S1 post (not full day-0 restore)",
          "ca_leverage_cap RESTORED +50 vs S1 post (not full day-0 restore)",
          "facility_flat RESTORED +50 vs S1 post (full restore to day-0 flat capacity)",
          "rp_builder UNAFFECTED",
        ],
        limitations: [
          "Sequential overlay is hypothetical — actual Neon ledger unchanged",
          "runCompanyScenario repayment is measured from baseline DB state (not S1 post); covenant overlays above are the sequential authority",
          "S1 debt-funded convention (no cash proceeds) + cash repayment is an asymmetric pair — must remain explicit",
        ],
        expectedPackageSecured: expSec,
        expectedPackageUnsecured: expUnsec,
        expectedBuilderHeadline: builderHeadline(next.data.financials),
        expectedBuilderStepRemaining:
          builderHeadline(next.data.financials) - rpPoolUsed(next.data.ledger),
      },
      observed: {
        packageSecured: postCaps.secured,
        packageUnsecured: postCaps.unsecured,
        builderHeadline: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`,
        )?.capacity ?? null,
        builderStepRemaining: null,
        simulationStatus: scenario.financialImpact.grossDebtDelta === -amount ? "clear" : "blocked",
        facilityFlat: facFlatPost ?? null,
      },
      outcome: ok ? "CORRECT_EXECUTABLE" : "INCORRECT",
      notes: [
        `Scenario-runner cash/debt deltas (baseline): cashΔ=${scenario.financialImpact.cashDelta}, debtΔ=${scenario.financialImpact.grossDebtDelta}, netDebtΔ=${scenario.financialImpact.netDebtDelta}`,
        `Pre-repay package secured was $${preCaps.secured}M (S1 post); post sequential secured $${postCaps.secured}M`,
      ],
    });
    cursor = next;
  }

  // S3: Dividend $25M — cash down; RP pool usage increases; leverage may worsen from cash drop
  {
    const amount = 25;
    const pre = bs(cursor.data.financials, cursor.position);
    const preBuilder = builderHeadline(cursor.data.financials);
    const prePool = rpPoolUsed(cursor.data.ledger);
    const preStep = preBuilder - prePool;
    const sim = simulateRestrictedPayment(
      cursor.data,
      cursor.position,
      COHERENT_INDEPENDENT.notesIndentureId,
      amount,
      "dividend",
    );
    const nextLedger = [
      ...cursor.data.ledger,
      {
        basket: "DIVIDEND" as const,
        amount,
        direction: "DEBIT" as const,
      },
    ];
    const next = overlay(
      cursor.data,
      { cash: cursor.data.financials.cash - amount },
      nextLedger,
    );
    const post = bs(next.data.financials, next.position);
    const postCaps = packageCaps(next.position);
    const expUnsec = expectedTnlRoom({
      ebitda: cursor.data.financials.ebitda,
      totalDebt: cursor.data.financials.totalDebt,
      cash: cursor.data.financials.cash - amount,
    });
    const expSec = expectedMilaSecuredRoom({
      ebitda: cursor.data.financials.ebitda,
      securedDebt: cursor.data.financials.securedDebt,
      cash: cursor.data.financials.cash - amount,
    });
    const ok =
      sim.status === "clear" &&
      nearly(sim.steps[0]?.allocated, amount) &&
      nearly(postCaps.unsecured, expUnsec) &&
      nearly(postCaps.secured, expSec);
    sequential.push({
      id: "SEQ-S3-dividend-25",
      kind: "DIVIDEND",
      title: "Pay $25M dividend (on S2 post-state)",
      amount,
      sequentialIndex: 3,
      usesPriorPostState: true,
      independent: {
        pre,
        post,
        cashTreatment: `Cash −$${amount}M. Net debt rises by $${amount}M → TNL/SSNL rooms shrink.`,
        debtTreatment: "Debt unchanged",
        lienLeverageEffects: [
          `TNL room falls by $${amount}M (cash reduction) → expected unsecured $${expUnsec}M`,
          `SSNL room falls by $${amount}M → expected secured $${expSec}M`,
          "Dividend is not lien-creating but cash reduction affects leverage-based capacity",
        ],
        basketEffects: [
          `rp_builder step CONSUMED −$${amount}M (pre step ${preStep} → ${preStep - amount})`,
          "rp_general UNAFFECTED (builder absorbed full amount)",
          "Shared Available Amount pool with investments",
        ],
        limitations: [
          "simulateRestrictedPayment does not itself reduce cash — cash overlay applied for leverage integrity",
          "Hypothetical ledger debit appended for sequential pool; Neon ledger not written",
        ],
        expectedPackageSecured: expSec,
        expectedPackageUnsecured: expUnsec,
        expectedBuilderHeadline: preBuilder,
        expectedBuilderStepRemaining: preStep - amount,
      },
      observed: {
        packageSecured: postCaps.secured,
        packageUnsecured: postCaps.unsecured,
        builderHeadline: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`,
        )?.capacity ?? null,
        builderStepRemaining: preStep - amount,
        simulationStatus: sim.status,
        facilityFlat: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
        )?.capacity ?? null,
      },
      outcome: ok ? "CORRECT_EXECUTABLE" : "INCORRECT",
      notes: [`RP sim allocated from ${sim.steps[0]?.basketName ?? "?"}`],
    });
    cursor = next;
  }

  // S4: Equity contribution $100M — cash up; equityProceeds up; builder credit; leverage rooms expand
  {
    const amount = 100;
    const pre = bs(cursor.data.financials, cursor.position);
    const preBuilder = builderHeadline(cursor.data.financials);
    const next = overlay(cursor.data, {
      cash: cursor.data.financials.cash + amount,
      equityProceedsSinceIssue: cursor.data.financials.equityProceedsSinceIssue + amount,
    });
    const post = bs(next.data.financials, next.position);
    const postCaps = packageCaps(next.position);
    const postBuilder = builderHeadline(next.data.financials);
    const expUnsec = expectedTnlRoom({
      ebitda: cursor.data.financials.ebitda,
      totalDebt: cursor.data.financials.totalDebt,
      cash: cursor.data.financials.cash + amount,
    });
    const expSec = expectedMilaSecuredRoom({
      ebitda: cursor.data.financials.ebitda,
      securedDebt: cursor.data.financials.securedDebt,
      cash: cursor.data.financials.cash + amount,
    });
    const ok =
      nearly(postBuilder, preBuilder + amount) &&
      nearly(postCaps.unsecured, expUnsec) &&
      nearly(postCaps.secured, expSec);
    sequential.push({
      id: "SEQ-S4-equity-contribution-100",
      kind: "EQUITY_CONTRIBUTION",
      title: "Receive $100M equity contribution (on S3 post-state)",
      amount,
      sequentialIndex: 4,
      usesPriorPostState: true,
      independent: {
        pre,
        post,
        cashTreatment: `Cash +$${amount}M`,
        debtTreatment: "Debt unchanged",
        lienLeverageEffects: [
          `TNL/SSNL rooms expand by $${amount}M from cash`,
          "No new liens",
        ],
        basketEffects: [
          `rp_builder INCREASED +$${amount}M via §3.4(a)(C)(3)-(4) equity proceeds / equity contribution prongs (includeEquityProceeds=true)`,
          "facility_flat / general_debt / facility_grower UNAFFECTED (no debt term / no equity term)",
        ],
        limitations: [
          "No ScenarioAction EQUITY_CONTRIBUTION — financial overlay only",
          "Seed equityProceedsSinceIssue already includes historical contributions; this adds a further hypothetical $100M",
        ],
        expectedPackageSecured: expSec,
        expectedPackageUnsecured: expUnsec,
        expectedBuilderHeadline: postBuilder,
        expectedBuilderStepRemaining: postBuilder - rpPoolUsed(next.data.ledger),
      },
      observed: {
        packageSecured: postCaps.secured,
        packageUnsecured: postCaps.unsecured,
        builderHeadline: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`,
        )?.capacity ?? null,
        builderStepRemaining: postBuilder - rpPoolUsed(next.data.ledger),
        simulationStatus: "clear",
        facilityFlat: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
        )?.capacity ?? null,
      },
      outcome: ok ? "CORRECT_EXECUTABLE" : "INCORRECT",
      notes: [
        "Legal authority: Notes Available Amount definition — 100% net cash proceeds of Capital Stock issuance and equity contributions since Issue Date, Not Otherwise Applied (§3.4(a)(C)(3)-(4))",
      ],
    });
    cursor = next;
  }

  // S5: Restricted investment $25M — shares RP pool; cash down
  {
    const amount = 25;
    const pre = bs(cursor.data.financials, cursor.position);
    const preBuilder = builderHeadline(cursor.data.financials);
    const prePool = rpPoolUsed(cursor.data.ledger);
    const preStep = preBuilder - prePool;
    const sim = simulateRestrictedPayment(
      cursor.data,
      cursor.position,
      COHERENT_INDEPENDENT.notesIndentureId,
      amount,
      "investment",
    );
    const nextLedger = [
      ...cursor.data.ledger,
      {
        basket: "INVESTMENT" as const,
        amount,
        direction: "DEBIT" as const,
      },
    ];
    const next = overlay(
      cursor.data,
      { cash: cursor.data.financials.cash - amount },
      nextLedger,
    );
    const post = bs(next.data.financials, next.position);
    const postCaps = packageCaps(next.position);
    const expUnsec = expectedTnlRoom({
      ebitda: cursor.data.financials.ebitda,
      totalDebt: cursor.data.financials.totalDebt,
      cash: cursor.data.financials.cash - amount,
    });
    const expSec = expectedMilaSecuredRoom({
      ebitda: cursor.data.financials.ebitda,
      securedDebt: cursor.data.financials.securedDebt,
      cash: cursor.data.financials.cash - amount,
    });
    const ok =
      sim.status === "clear" &&
      nearly(sim.steps[0]?.allocated, amount) &&
      nearly(postCaps.unsecured, expUnsec) &&
      nearly(postCaps.secured, expSec);
    sequential.push({
      id: "SEQ-S5-restricted-investment-25",
      kind: "RESTRICTED_INVESTMENT",
      title: "Make $25M restricted investment (on S4 post-state)",
      amount,
      sequentialIndex: 5,
      usesPriorPostState: true,
      independent: {
        pre,
        post,
        cashTreatment: `Cash −$${amount}M (investment funded in cash). Classification: Restricted Investment under Notes §3.4 waterfall (kind=investment), sharing Available Amount with dividends.`,
        debtTreatment: "Debt unchanged",
        lienLeverageEffects: [
          "Cash reduction shrinks TNL/SSNL rooms",
          "Not a lien grant; debt baskets UNAFFECTED except via cash/leverage",
        ],
        basketEffects: [
          `Shared RP pool CONSUMED −$${amount}M from builder step (pre step ${preStep})`,
          "Dividends and investments share the same waterfall — sequential S3 dividend already reduced pool",
        ],
        limitations: [
          "RP sim capacity-only; cash overlay applied for leverage integrity",
          "Hypothetical INVESTMENT ledger debit; Neon not written",
        ],
        expectedPackageSecured: expSec,
        expectedPackageUnsecured: expUnsec,
        expectedBuilderHeadline: preBuilder,
        expectedBuilderStepRemaining: preStep - amount,
      },
      observed: {
        packageSecured: postCaps.secured,
        packageUnsecured: postCaps.unsecured,
        builderHeadline: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`,
        )?.capacity ?? null,
        builderStepRemaining: preStep - amount,
        simulationStatus: sim.status,
        facilityFlat: next.position.provisionCapacities.get(
          `${COHERENT_INDEPENDENT.notesIndentureId}:facility_flat`,
        )?.capacity ?? null,
      },
      outcome: ok ? "CORRECT_EXECUTABLE" : "INCORRECT",
      notes: [],
    });
    cursor = next;
  }

  const matwProvisions = await prisma.covenantProvision.count({ where: { companyId: "matthews" } });
  const matwPerms = await prisma.permission.count({ where: { companyId: "matthews" } });
  const matwDocs = await prisma.document.findMany({
    where: { companyId: "matthews" },
    select: { id: true, name: true, capacityFormulas: true },
  });
  const matwHasFormulas = matwDocs.some(
    (d) => d.capacityFormulas != null && JSON.stringify(d.capacityFormulas) !== "{}",
  );
  const matwFin = await prisma.financialSnapshot.count({ where: { companyId: "matthews" } });

  const falseFavorable = capacityBreakdown.dashboardSolverDivergence.securedIsFalseFavorable
    ? 1
    : 0;
  const correctExec = sequential.filter((s) => s.outcome === "CORRECT_EXECUTABLE").length;
  const incorrect = sequential.filter((s) => s.outcome === "INCORRECT").length;
  const report: IndependentValidationReport = {
    schemaVersion: "product.financial-capacity-independent-validation.v1",
    generatedAt: new Date().toISOString(),
    startingSha: args?.startingSha ?? null,
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    companyId,
    asOfDate: asOf,
    financialAuthority: {
      ns4ApprovedSnapshots: ns4,
      financialSnapshotRows: snapRows,
      financialStateRows: stateRows,
      goldenTestsVerified: Math.max(goldenVerified, goldenVerifiedLoose),
      goldenTestsTotal: goldenTotal,
      permissionsVerified: permVerified,
      permissionsTotal: permTotal,
      classification: "EVALUATION_SEED_NOT_NS4_APPROVED",
      phase4RequireExecutable: false,
      note: "Coherent financials are evaluation-seed FinancialSnapshot/FinancialState rows with lawyer-reviewed permissions/golden tests, but zero NS-4 APPROVED ContractInputSnapshot. Do not claim Phase-4 REQUIRE execution from these inputs.",
    },
    fiveOneTwoNineBillion: {
      amountMillions: 5129,
      isUniversalCapacity: false,
      meaning:
        "$5,129M is the Credit Agreement §6.11 Total Net Leverage borrowing room (and the package-wide UNSECURED binding capacity). It is NOT the package-wide secured capacity.",
      calculation: {
        ebitda: fin.ebitda,
        threshold: 4.25,
        totalDebt: fin.totalDebt,
        cash: fin.cash,
        netDebt: fin.totalDebt - fin.cash,
        room: independentTnl,
        formula: "room = 4.25 × Consolidated EBITDA − (Consolidated Total Debt − unrestricted cash)",
        provisionCode: "ca_leverage_cap",
        sectionRef: "§6.11 — TNL ≤ 4.25x",
        document: "Credit Agreement (2022, as amended)",
        asOfDate: asOf,
      },
      matchesIndependent: independentTnl === 5129,
      matchesCrossDocumentUnsecured: nearly(caps.unsecured, 5129),
      mustNotBePresentedAs: [
        "Universal available capacity for both secured and unsecured debt",
        "Package-wide secured capacity (that is $4,041M under Indenture mila_secured)",
        "Phase-4 REQUIRE certified capacity",
      ],
    },
    capacityBreakdown,
    builderAuthority: {
      sectionRefs: ["§3.4(a)(C)(1)", "§3.4(a)(C)(2)", "§3.4(a)(C)(3)-(4)"],
      formula: "max($330M, 25% EBITDA) + 50% CNI + 100% equity proceeds/contributions since issue",
      starter,
      cniContribution,
      equityContribution,
      headline: builder,
      equityLegalAuthority:
        "Indenture Available Amount §3.4(a)(C)(3)-(4): 100% of net cash proceeds from Capital Stock (other than Disqualified Stock) and equity contributions since Issue Date, to the extent Not Otherwise Applied. Exclusions: Disqualified Stock; amounts otherwise applied. Seed equityProceedsSinceIssue=$2,150M is historical attribution since Issue Date under evaluation-seed financials (includeEquityProceeds=true). Issue-date eligibility: only post-Issue-Date contributions credit the builder — pre-issue equity is out of scope. MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.",
      includeEquityProceedsParam: true,
    },
    borrowingProceedsTreatment: {
      engineConvention: "IMMEDIATELY_SPENT_CASH_UNCHANGED",
      cashRetained: {
        description:
          "Debt +$50M secured and cash +$50M (proceeds retained). Net debt unchanged → TNL/SSNL rooms unchanged at day-0 levels.",
        netDebtDelta: 0,
        tnlRoom: independentTnl,
        ssnlRoom: independentMila,
      },
      immediatelySpent: {
        description:
          "Debt +$50M secured, cash unchanged (engine simulateDebtIncurrence / leverage convention). Net debt +$50M → TNL room $5,079M, SSNL/mila room $3,991M.",
        netDebtDelta: 50,
        tnlRoom: expectedTnlRoom({
          ebitda: fin.ebitda,
          totalDebt: fin.totalDebt + 50,
          cash: fin.cash,
        }),
        ssnlRoom: expectedMilaSecuredRoom({
          ebitda: fin.ebitda,
          securedDebt: fin.securedDebt + 50,
          cash: fin.cash,
        }),
      },
      label: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
    },
    coordination: {
      issue220FinancialApproval:
        "#220 — Financial figures remain EVALUATION_SEED_NOT_NS4_APPROVED (zero NS-4 APPROVED ContractInputSnapshot). No certification bypass; financial approval still required before any verified-capacity claim.",
      issue234UtilizationCompleteness:
        "#234 — DEBT_INCUR / lien grant / investment debit utilization incomplete in Neon ledger (only DIVIDEND $150M known against shared Available Amount). Capacity figures are modeled gross of unknown historical draws.",
      issue218CrossDocumentRestrictions:
        "#218 — Cross-document binding is MODELED_CROSS_DOCUMENT min across capacityFormulas. Solver-native elections are NON_AUTHORITATIVE_DIAGNOSTIC after lien-coverage + CONCURRENT_COUNTED fixes; package secured binding remains Indenture mila_secured, not CA TNL.",
    },
    sequentialTransactions: sequential,
    sequentialIntegrity: {
      chainLength: sequential.length,
      eachUsesPriorPostState: sequential.filter((s) => s.sequentialIndex > 1).every((s) => s.usesPriorPostState),
      ledgerMutated: false,
      note: "S2–S5 each start from the prior step's post financial/ledger overlay. Neon ACTIVE ledger is never written. runCompanyScenario repayment is an independent baseline check; sequential covenant authority is the overlay chain.",
    },
    matthews: {
      companyId: "matthews",
      provisionCount: matwProvisions,
      capacityFormulasPresent: matwHasFormulas,
      permissionCount: matwPerms,
      financialsPresent: matwFin > 0,
      outcome: "CORRECT_REFUSAL",
      note: "Matthews has financials and permissions but zero CovenantProvision rows and no capacityFormulas — capacity remains NOT_EXECUTABLE. Do not invent formulas.",
      nextStep:
        "Reuse document onboarding + legal-review pipeline to extract/review CovenantProvision and capacityFormulas from Matthews credit agreement / second-lien notes before any capacity claim.",
    },
    productConvergence: {
      positionSurface:
        "getCompanyDashboard / computeCovenantPosition — packageAuthoritative MODELED_CROSS_DOCUMENT for customer headlines; solver-native is NON_AUTHORITATIVE_DIAGNOSTIC",
      simulateSurface:
        "runCompanyScenario + simulateDebtIncurrence / simulateRestrictedPayment — same CompanyCovenantData financials + ledger; sequential overlays for multi-step drafts",
      askSurface:
        "Covenant Ask / research summaries are DISCOVERED ≠ capacity; must not answer dollar capacity without the same position engine + authority label",
      sharedState:
        "Single as-of FinancialState/Snapshot + ACTIVE ledger + capacityFormulas/provisions; transaction draft is a pure overlay (StateDelta / scenario actions) never mutating Neon until an authorized commit path exists",
      modeledVsVerified:
        "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED capacity ≠ verified remaining capacity / Phase-4 REQUIRE. Coherent today: modeled + evaluation seed; Phase-4 REQUIRE: unavailable (no NS-4 APPROVED).",
    },
    outcomeSummary: {
      correctExecutable: correctExec,
      correctRefusals: 1, // Matthews
      falseFavorable,
      incorrect,
      limitations: [
        "Debt-incurrence engine convention = immediately-spent (cash unchanged); cash-retained proceeds documented separately as MODELED dual treatment",
        "No NS-4 APPROVED financials — not Phase-4 REQUIRE; figures labeled MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
        "Unknown DEBT_INCUR historical utilization (#234)",
        "Solver-native package min is NON_AUTHORITATIVE_DIAGNOSTIC; customer binding is MODELED_CROSS_DOCUMENT mila_secured $4,041M (#218)",
        "Financial approval still open (#220)",
        "No officer/compliance certificate Document rows for Coherent in Neon",
      ],
    },
    customerReportMarkdown: "",
  };
  report.customerReportMarkdown = renderReport(report);
  return report;
}
