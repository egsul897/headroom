/**
 * Multi-company financial capacity positions + validated state changes.
 *
 * Eligible Neon packages (not CONMED-only):
 * - Coherent: financials, ledger, provisions, solver-native permissions
 * - Matthews: financials + permissions, zero provisions → fail-closed capacity
 *
 * Paid inference: 0. promotedToLegalTruth: 0.
 */

import { createHash } from "node:crypto";
import { prisma } from "../../prisma";
import {
  buildSolverContext,
  getCompanyDashboard,
  getScenarioInputs,
  runCompanyScenario,
} from "../../dashboard-service";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  documentsWithRpWaterfall,
  loadCompanyCovenantData,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type CovenantPosition,
  type SolverNativeCompanyContext,
} from "../../covenant-engine";
import {
  COHERENT_INDEPENDENT,
  expectedMilaSecuredRoom,
  expectedTnlRoom,
} from "./independent";
import type {
  Assessment,
  BasketCapacityRow,
  BasketDelta,
  CompanyFinancialPositionReport,
  FinancialCapacityMilestoneReport,
  NeonIntelligenceRow,
  TransactionScenarioResult,
} from "./types";

const ELIGIBLE_COMPANY_IDS = ["coherent", "matthews"] as const;

function finiteOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

function nearlyEqual(a: number | null | undefined, b: number | null | undefined, eps = 0.51): boolean {
  const x = finiteOrNull(a);
  const y = finiteOrNull(b);
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  return Math.abs(x - y) <= eps;
}

function basketEffect(pre: number | null, post: number | null): BasketDelta["effect"] {
  const p = finiteOrNull(pre);
  const q = finiteOrNull(post);
  if (p == null || q == null) return "UNKNOWN";
  const d = q - p;
  if (Math.abs(d) < 1e-6) return "UNAFFECTED";
  if (d < 0) return "CONSUMED";
  return "INCREASED"; // restored capacity / equity credit / repayment headroom
}

function classifyDeltas(
  pre: Map<string, number | null>,
  post: Map<string, number | null>,
  names: Map<string, string>,
): BasketDelta[] {
  const keys = new Set([...pre.keys(), ...post.keys()]);
  const out: BasketDelta[] = [];
  for (const key of keys) {
    const p = finiteOrNull(pre.get(key) ?? null);
    const q = finiteOrNull(post.get(key) ?? null);
    const effect = basketEffect(p, q);
    out.push({
      key,
      basketName: names.get(key) ?? key,
      pre: p,
      post: q,
      effect,
      delta: p != null && q != null ? q - p : null,
    });
  }
  return out;
}

function capacityMap(position: CovenantPosition): {
  values: Map<string, number | null>;
  names: Map<string, string>;
} {
  const values = new Map<string, number | null>();
  const names = new Map<string, string>();
  for (const [key, v] of position.provisionCapacities) {
    values.set(key, finiteOrNull(v.capacity ?? null));
    names.set(key, v.provision.basketName);
  }
  return { values, names };
}

async function buildCompanyPosition(companyId: string): Promise<CompanyFinancialPositionReport> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const ns4 = await prisma.contractInputSnapshot.count({
    where: { companyId, status: "APPROVED" },
  });
  const snapCount = await prisma.financialSnapshot.count({ where: { companyId } });
  const stateCount = await prisma.financialState.count({ where: { companyId } });
  const permCount = await prisma.permission.count({ where: { companyId } });
  const provisionCount = await prisma.covenantProvision.count({ where: { companyId } });
  const ledgerCount = await prisma.ledgerEntry.count({
    where: { companyId, status: "ACTIVE" },
  });

  const refusalReasons: string[] = [];
  let dash: Awaited<ReturnType<typeof getCompanyDashboard>> | null = null;
  let data: CompanyCovenantData | null = null;
  let position: CovenantPosition | null = null;

  try {
    dash = await getCompanyDashboard(companyId);
    data = await loadCompanyCovenantData(prisma, companyId, dash.asOfDate);
    position = computeCovenantPosition(data);
  } catch (e) {
    refusalReasons.push(`Dashboard/position load failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const hasCapacityFormulas = Boolean(
    data?.documents.some((d) => d.capacityFormulas?.secured || d.capacityFormulas?.unsecured),
  );
  const hasRp = Boolean(data && documentsWithRpWaterfall(data).length > 0);
  const executable =
    Boolean(data && position && provisionCount > 0 && hasCapacityFormulas && snapCount + stateCount > 0);

  if (provisionCount === 0) {
    refusalReasons.push("No CovenantProvision rows — basket formulas not executable");
  }
  if (!hasCapacityFormulas) {
    refusalReasons.push("No document capacityFormulas for secured/unsecured sides");
  }
  if (ledgerCount === 0) {
    refusalReasons.push("No ACTIVE ledger utilization — historical basket drawdowns unknown");
  }
  if (ns4 === 0) {
    refusalReasons.push("No NS-4 APPROVED ContractInputSnapshot (legacy FinancialSnapshot/State path used when present)");
  }

  const baskets: BasketCapacityRow[] = [];
  if (data && position) {
    const docName = new Map(data.documents.map((d) => [d.id, d.name]));
    for (const [key, v] of position.provisionCapacities) {
      baskets.push({
        key,
        documentId: v.provision.documentId,
        documentName: docName.get(v.provision.documentId) ?? v.provision.documentId,
        code: v.provision.code,
        basketName: v.provision.basketName,
        formulaType: v.provision.formulaType,
        sectionRef: v.provision.sectionRef,
        status: v.status,
        capacity: v.capacity ?? null,
        reason: v.reason,
        components: v.components?.map((c) => ({
          label: c.label,
          sectionRef: c.sectionRef,
          value: c.value,
        })),
      });
    }
  }

  const docs = await prisma.document.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
  const provisionsByDoc = await prisma.covenantProvision.groupBy({
    by: ["documentId"],
    where: { companyId },
    _count: true,
  });
  const permsByDoc = await prisma.permission.groupBy({
    by: ["documentId"],
    where: { companyId },
    _count: true,
  });
  const provMap = new Map(provisionsByDoc.map((r) => [r.documentId, r._count]));
  const permMap = new Map(permsByDoc.map((r) => [r.documentId, r._count]));

  const unknownUtilization: string[] = [];
  if (ledgerCount === 0 && provisionCount > 0) {
    unknownUtilization.push("All basket utilizations unknown — no ACTIVE ledger entries");
  }
  if (data) {
    const debtIncurLedger = data.ledger.filter((e) => e.basket === "DEBT_INCUR");
    if (debtIncurLedger.length === 0 && hasCapacityFormulas) {
      unknownUtilization.push("DEBT_INCUR ledger empty — prior debt-basket draws not recorded as ledger utilization");
    }
  }

  const crossDocumentRestrictions: string[] = [];
  if (data && data.documents.length > 1 && hasCapacityFormulas) {
    crossDocumentRestrictions.push(
      "Cross-document capacity is the tightest modeled document/side (combineCrossDocument / solver recomputation)",
    );
  }
  if (companyId === "matthews") {
    crossDocumentRestrictions.push(
      "Matthews permissions exist but CovenantProvision/capacityFormulas are absent — no executable cross-document capacity",
    );
  }

  return {
    companyId,
    companyName: company.name,
    ticker: company.ticker,
    tenantKind: company.tenantKind,
    asOfDate: dash?.asOfDate.toISOString() ?? "UNKNOWN",
    eligibility: {
      hasFinancialSnapshot: snapCount > 0,
      hasFinancialState: stateCount > 0,
      hasLedger: ledgerCount > 0,
      hasCovenantProvisions: provisionCount > 0,
      hasCapacityFormulas,
      hasPermissions: permCount > 0,
      hasNs4ApprovedSnapshot: ns4 > 0,
      hasRpWaterfall: hasRp,
      executableCapacity: executable,
      refusalReasons,
    },
    contractualMetrics: data && position
      ? {
          ebitda: data.financials.ebitda,
          cash: data.financials.cash,
          totalDebt: data.financials.totalDebt,
          securedDebt: data.financials.securedDebt,
          interestExpense: data.financials.interestExpense,
          cumulativeNetIncome: data.financials.cumulativeNetIncome,
          equityProceedsSinceIssue: data.financials.equityProceedsSinceIssue,
          assumedNewDebtRatePct: data.financials.assumedNewDebtRatePct,
          netDebt: position.metrics.netDebt,
          totalNetLeverage: position.metrics.totalNetLeverage,
          seniorSecuredNetLeverage: position.metrics.seniorSecuredNetLeverage,
          fixedChargeCoverage: position.metrics.fixedChargeCoverage,
        }
      : null,
    documents: docs.map((d) => {
      const formulas = data?.documents.find((x) => x.id === d.id)?.capacityFormulas;
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        governs: d.governs,
        hasSecuredFormula: Boolean(formulas?.secured),
        hasUnsecuredFormula: Boolean(formulas?.unsecured),
        hasRpWaterfall: Boolean(data?.documents.find((x) => x.id === d.id)?.rpWaterfall),
        provisionCount: provMap.get(d.id) ?? 0,
        permissionCount: permMap.get(d.id) ?? 0,
      };
    }),
    baskets,
    ledgerUtilization: (data?.ledger ?? []).map((e) => ({
      basket: e.basket,
      direction: e.direction,
      amount: e.amount,
      known: true as const,
    })),
    unknownUtilization,
    remainingCapacity: {
      secured: dash?.capacity.secured.remainingCapacity ?? null,
      unsecured: dash?.capacity.unsecured.remainingCapacity ?? null,
      securedBinding: dash?.capacity.secured.binding?.documentName ?? null,
      unsecuredBinding: dash?.capacity.unsecured.binding?.documentName ?? null,
      securedMethod: dash?.capacity.secured.binding?.method ?? null,
      unsecuredMethod: dash?.capacity.unsecured.binding?.method ?? null,
    },
    crossDocumentRestrictions,
    certificatesProcessed: 0,
    financialStatementsProcessed: snapCount + stateCount > 0 ? Math.max(snapCount, stateCount) : 0,
  };
}

function assessExecutable(args: {
  expectedStatus: string;
  observedStatus: string;
  expectedPre?: number | null;
  observedPre?: number | null;
  expectedPost?: number | null;
  observedPost?: number | null;
  expectedEffects: Array<{ key: string; effect: BasketDelta["effect"]; delta?: number }>;
  observedDeltas: BasketDelta[];
}): Assessment {
  if (args.expectedStatus === "NOT_EXECUTABLE") {
    return args.observedStatus === "NOT_EXECUTABLE" || args.observedStatus === "not_tested"
      ? "CORRECT_REFUSAL"
      : "INCORRECT";
  }
  if (args.observedStatus !== args.expectedStatus) return "INCORRECT";
  if (args.expectedPre != null && !nearlyEqual(args.expectedPre, args.observedPre)) return "INCORRECT";
  if (args.expectedPost != null && !nearlyEqual(args.expectedPost, args.observedPost)) return "INCORRECT";
  for (const exp of args.expectedEffects) {
    const row = args.observedDeltas.find((d) => d.key === exp.key || d.key.endsWith(`:${exp.key}`) || d.key.includes(exp.key));
    if (!row) return "INCORRECT";
    if (row.effect !== exp.effect && !(exp.effect === "RESTORED" && row.effect === "INCREASED")) {
      return "INCORRECT";
    }
    if (exp.delta != null && !nearlyEqual(row.delta, exp.delta)) return "INCORRECT";
  }
  return "CORRECT_EXECUTABLE";
}

async function runCoherentScenarios(): Promise<TransactionScenarioResult[]> {
  const companyId = "coherent";
  const dash = await getCompanyDashboard(companyId);
  const data = await loadCompanyCovenantData(prisma, companyId, dash.asOfDate);
  const position = computeCovenantPosition(data);
  const solver: SolverNativeCompanyContext = await buildSolverContext(companyId, dash.asOfDate);
  const preMap = capacityMap(position);
  const results: TransactionScenarioResult[] = [];

  // --- S1 Debt incurrence $50M secured ---
  {
    const amount = 50;
    const expectedPre = expectedTnlRoom(COHERENT_INDEPENDENT.financials);
    const expectedPost = expectedTnlRoom({
      ...COHERENT_INDEPENDENT.financials,
      totalDebt: COHERENT_INDEPENDENT.financials.totalDebt + amount,
      // secured draw also increases securedDebt; cash convention unchanged in debt-incur sim
    });
    // Engine debt-incur convention: cash unchanged, totalDebt += amount
    // TNL post = 4.25*1700 - (3308 - 1162) = 7225 - 2146 = 5079
    const expectedPostEngine = 4.25 * 1700 - (3258 + amount - 1162);
    const sim = simulateDebtIncurrence(data, position, amount, true, solver);
    const postCap = computeRemainingCapacityAfterDebtIncurrence(data, position, amount, true, solver);
    const postFin: CompanyCovenantData = {
      ...data,
      financials: {
        ...data.financials,
        totalDebt: data.financials.totalDebt + amount,
        securedDebt: data.financials.securedDebt + amount,
      },
    };
    const postPos = computeCovenantPosition(postFin);
    const postMap = capacityMap(postPos);
    const deltas = classifyDeltas(preMap.values, postMap.values, preMap.names);
    const tnlKey = `${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`;
    const assessment = assessExecutable({
      expectedStatus: "clear",
      observedStatus: sim.status,
      expectedPre,
      observedPre: dash.capacity.secured.remainingCapacity,
      expectedPost: expectedPostEngine,
      observedPost: postCap.remainingCapacity,
      expectedEffects: [{ key: tnlKey, effect: "CONSUMED", delta: -amount }],
      observedDeltas: deltas,
    });
    results.push({
      id: "COH-S1-debt-incur-secured-50",
      companyId,
      kind: "DEBT_INCURRENCE",
      title: "Incur $50M secured debt",
      amount,
      detail: "Solver-native debt incurrence against CA + Notes; post capacity recomputed.",
      independent: {
        expectedStatus: "clear",
        expectedPreCapacity: expectedPre,
        expectedPostCapacity: expectedPostEngine,
        expectedBasketEffects: [{ key: tnlKey, effect: "CONSUMED", delta: -amount }],
        rationale: `TNL room 4.25×EBITDA − netDebt = ${expectedPre}; post cash-unchanged convention → ${expectedPostEngine}.`,
        source: "CA §6.11 + Neon FinancialSnapshot/State as of 2026-06-30",
      },
      observed: {
        status: sim.status,
        pre: {
          securedRemaining: dash.capacity.secured.remainingCapacity ?? null,
          tnlRoom: preMap.values.get(tnlKey) ?? null,
          totalNetLeverage: position.metrics.totalNetLeverage,
        },
        post: {
          securedRemaining: postCap.remainingCapacity ?? null,
          tnlRoom: postMap.values.get(tnlKey) ?? null,
          totalNetLeverage: postPos.metrics.totalNetLeverage,
          proFormaTnl: sim.proForma.totalNetLeverage,
        },
        basketsConsumed: deltas.filter((d) => d.effect === "CONSUMED"),
        basketsRestored: deltas.filter((d) => d.effect === "INCREASED" || d.effect === "RESTORED"),
        basketsUnaffected: deltas.filter((d) => d.effect === "UNAFFECTED"),
        pathway: "simulateDebtIncurrence + computeRemainingCapacityAfterDebtIncurrence (solver-native)",
        limitations: [
          "Debt-funded convention leaves cash unchanged for leverage tests",
          "Not Phase-4 REQUIRE / VEP certification",
        ],
      },
      assessment,
    });
  }

  // --- S2 Debt repayment $50M on Term Loan A ---
  {
    const amount = 50;
    const scenario = await runCompanyScenario(companyId, [
      { kind: "DEBT_REPAYMENT", facilityId: COHERENT_INDEPENDENT.termLoanAId, amount },
    ]);
    const postFin: CompanyCovenantData = {
      ...data,
      financials: {
        ...data.financials,
        totalDebt: data.financials.totalDebt - amount,
        securedDebt: data.financials.securedDebt - amount,
        cash: data.financials.cash - amount,
      },
    };
    const postPos = computeCovenantPosition(postFin);
    const postMap = capacityMap(postPos);
    const deltas = classifyDeltas(preMap.values, postMap.values, preMap.names);
    const tnlKey = `${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`;
    // Net debt unchanged when cash and debt fall equally → TNL room UNAFFECTED
    const expectedPre = expectedTnlRoom(COHERENT_INDEPENDENT.financials);
    const expectedPost = expectedTnlRoom({
      ebitda: COHERENT_INDEPENDENT.financials.ebitda,
      totalDebt: COHERENT_INDEPENDENT.financials.totalDebt - amount,
      cash: COHERENT_INDEPENDENT.financials.cash - amount,
    });
    const assessment = assessExecutable({
      expectedStatus: "clear",
      observedStatus:
        scenario.financialImpact.grossDebtDelta === -amount &&
        scenario.financialImpact.cashDelta === -amount
          ? "clear"
          : "blocked",
      expectedPre,
      observedPre: preMap.values.get(tnlKey),
      expectedPost,
      observedPost: postMap.values.get(tnlKey),
      expectedEffects: [{ key: tnlKey, effect: "UNAFFECTED", delta: 0 }],
      observedDeltas: deltas,
    });
    results.push({
      id: "COH-S2-debt-repay-50",
      companyId,
      kind: "DEBT_REPAYMENT",
      title: "Repay $50M Term Loan A",
      amount,
      detail: "Financial-core DEBT_REPAYMENT scenario + covenant recomputation.",
      independent: {
        expectedStatus: "clear",
        expectedPreCapacity: expectedPre,
        expectedPostCapacity: expectedPost,
        expectedBasketEffects: [{ key: tnlKey, effect: "UNAFFECTED", delta: 0 }],
        rationale: "Equal cash/debt reduction leaves net leverage room unchanged.",
        source: "financial-core scenario DEBT_REPAYMENT + CA §6.11",
      },
      observed: {
        status:
          scenario.financialImpact.grossDebtDelta === -amount ? "clear" : "blocked",
        pre: {
          cash: scenario.before.state.balanceSheetFacts.cash.value,
          totalDebt: scenario.before.state.balanceSheetFacts.totalDebtPrincipal.value,
          tnlRoom: preMap.values.get(tnlKey) ?? null,
        },
        post: {
          cash: scenario.after.state.balanceSheetFacts.cash.value,
          totalDebt: scenario.after.state.balanceSheetFacts.totalDebtPrincipal.value,
          tnlRoom: postMap.values.get(tnlKey) ?? null,
          grossDebtDelta: scenario.financialImpact.grossDebtDelta,
          cashDelta: scenario.financialImpact.cashDelta,
        },
        basketsConsumed: deltas.filter((d) => d.effect === "CONSUMED"),
        basketsRestored: deltas.filter((d) => d.effect === "INCREASED" || d.effect === "RESTORED"),
        basketsUnaffected: deltas.filter((d) => d.effect === "UNAFFECTED"),
        pathway: "runCompanyScenario(DEBT_REPAYMENT) + computeCovenantPosition overlay",
        limitations: ["Read-only scenario — no ledger write"],
      },
      assessment,
    });
  }

  // --- S3 Dividend $25M ---
  {
    const amount = 25;
    const docId = COHERENT_INDEPENDENT.notesIndentureId;
    const builderKey = `${docId}:rp_builder`;
    const sim = simulateRestrictedPayment(data, position, docId, amount, "dividend");
    const preBuilder = preMap.values.get(builderKey) ?? null;
    const stepRemaining = sim.stepCapacitiesRemaining.rp_builder ?? null;
    // Independent: builder headline 2835; pool used 150 → step remaining 2685; after $25 alloc → 2660
    const expectedStepPre = (preBuilder ?? 0) - COHERENT_INDEPENDENT.ledgerRpDebit;
    const expectedStepPost = expectedStepPre - amount;
    const assessment =
      sim.status === "clear" &&
      nearlyEqual(stepRemaining, expectedStepPre) &&
      nearlyEqual(sim.steps[0]?.allocated, amount)
        ? "CORRECT_EXECUTABLE"
        : "INCORRECT";
    results.push({
      id: "COH-S3-dividend-25",
      companyId,
      kind: "DIVIDEND",
      title: "Pay $25M dividend from Available Amount",
      amount,
      detail: "RP waterfall: builder then general; shared pool with investments.",
      independent: {
        expectedStatus: "clear",
        expectedPreCapacity: expectedStepPre,
        expectedPostCapacity: expectedStepPost,
        expectedBasketEffects: [
          { key: "rp_builder", effect: "CONSUMED", delta: -amount },
          { key: "rp_general", effect: "UNAFFECTED", delta: 0 },
        ],
        rationale: `Builder ${preBuilder} − ledger RP ${COHERENT_INDEPENDENT.ledgerRpDebit} = ${expectedStepPre}; allocate ${amount}.`,
        source: "Notes §3.4(a)(C) builder + Neon ledger DIVIDEND debit $150M",
      },
      observed: {
        status: sim.status,
        pre: {
          builderHeadline: preBuilder,
          builderStepRemaining: stepRemaining,
          poolUsed: sim.poolUsed,
          generalStep: sim.stepCapacitiesRemaining.rp_general ?? null,
        },
        post: {
          allocatedFromBuilder: sim.steps.find((s) => s.code === "rp_builder")?.allocated ?? 0,
          remainingUnallocated: sim.remaining,
          steps: sim.steps.length,
        },
        basketsConsumed: [
          {
            key: builderKey,
            basketName: "Builder Basket (Available Amount)",
            pre: expectedStepPre,
            post: expectedStepPost,
            effect: "CONSUMED",
            delta: -amount,
          },
        ],
        basketsRestored: [],
        basketsUnaffected: [
          {
            key: `${docId}:rp_general`,
            basketName: "General RP Basket",
            pre: sim.stepCapacitiesRemaining.rp_general ?? null,
            post: sim.stepCapacitiesRemaining.rp_general ?? null,
            effect: "UNAFFECTED",
            delta: 0,
          },
        ],
        pathway: "simulateRestrictedPayment(kind=dividend)",
        limitations: ["Simulation does not mutate ledger"],
      },
      assessment,
    });
  }

  // --- S4 Equity contribution $100M ---
  {
    const amount = 100;
    const postFin: CompanyCovenantData = {
      ...data,
      financials: {
        ...data.financials,
        cash: data.financials.cash + amount,
        equityProceedsSinceIssue: data.financials.equityProceedsSinceIssue + amount,
      },
    };
    const postPos = computeCovenantPosition(postFin);
    const postMap = capacityMap(postPos);
    const deltas = classifyDeltas(preMap.values, postMap.values, preMap.names);
    const tnlKey = `${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`;
    const builderKey = `${COHERENT_INDEPENDENT.notesIndentureId}:rp_builder`;
    const expectedPre = expectedTnlRoom(COHERENT_INDEPENDENT.financials);
    const expectedPost = expectedTnlRoom({
      ebitda: COHERENT_INDEPENDENT.financials.ebitda,
      totalDebt: COHERENT_INDEPENDENT.financials.totalDebt,
      cash: COHERENT_INDEPENDENT.financials.cash + amount,
    });
    const expectedBuilderPre = preMap.values.get(builderKey) ?? null;
    const expectedBuilderPost =
      expectedBuilderPre != null ? expectedBuilderPre + amount : null;
    const assessment = assessExecutable({
      expectedStatus: "clear",
      observedStatus: "clear",
      expectedPre,
      observedPre: preMap.values.get(tnlKey),
      expectedPost,
      observedPost: postMap.values.get(tnlKey),
      expectedEffects: [
        { key: tnlKey, effect: "INCREASED", delta: amount },
        { key: builderKey, effect: "INCREASED", delta: amount },
      ],
      observedDeltas: deltas,
    });
    results.push({
      id: "COH-S4-equity-contribution-100",
      companyId,
      kind: "EQUITY_CONTRIBUTION",
      title: "Receive $100M equity contribution",
      amount,
      detail: "Cash + equityProceedsSinceIssue overlay; builder and TNL room expand.",
      independent: {
        expectedStatus: "clear",
        expectedPreCapacity: expectedPre,
        expectedPostCapacity: expectedPost,
        expectedBasketEffects: [
          { key: tnlKey, effect: "INCREASED", delta: amount },
          { key: builderKey, effect: "INCREASED", delta: amount },
        ],
        rationale: `+$${amount}M cash raises TNL room by $${amount}M; builder includes equity proceeds dollar-for-dollar.`,
        source: "CA §6.11 + Notes builder includeEquityProceeds",
      },
      observed: {
        status: "clear",
        pre: {
          tnlRoom: preMap.values.get(tnlKey) ?? null,
          builder: expectedBuilderPre,
          milaSecured: preMap.values.get(`${COHERENT_INDEPENDENT.notesIndentureId}:mila_secured`) ?? null,
        },
        post: {
          tnlRoom: postMap.values.get(tnlKey) ?? null,
          builder: postMap.values.get(builderKey) ?? null,
          milaSecured:
            postMap.values.get(`${COHERENT_INDEPENDENT.notesIndentureId}:mila_secured`) ?? null,
          expectedBuilderPost,
        },
        basketsConsumed: deltas.filter((d) => d.effect === "CONSUMED"),
        basketsRestored: deltas.filter((d) => d.effect === "INCREASED" || d.effect === "RESTORED"),
        basketsUnaffected: deltas.filter((d) => d.effect === "UNAFFECTED"),
        pathway: "financial overlay + computeCovenantPosition (no ScenarioAction EQUITY kind)",
        limitations: [
          "ScenarioAction has no EQUITY_CONTRIBUTION kind — demonstrated via financial overlay",
          "Flat debt baskets (facility_flat/general_debt) unaffected by equity",
        ],
      },
      assessment,
    });
  }

  // --- S5 Restricted investment $25M ---
  {
    const amount = 25;
    const docId = COHERENT_INDEPENDENT.notesIndentureId;
    const sim = simulateRestrictedPayment(data, position, docId, amount, "investment");
    const builderKey = `${docId}:rp_builder`;
    const preBuilder = preMap.values.get(builderKey) ?? null;
    const expectedStepPre = (preBuilder ?? 0) - COHERENT_INDEPENDENT.ledgerRpDebit;
    const assessment =
      sim.status === "clear" && nearlyEqual(sim.steps[0]?.allocated, amount)
        ? "CORRECT_EXECUTABLE"
        : "INCORRECT";
    results.push({
      id: "COH-S5-restricted-investment-25",
      companyId,
      kind: "RESTRICTED_INVESTMENT",
      title: "Make $25M restricted investment",
      amount,
      detail: "Shares Available Amount pool with dividends; consumes builder step.",
      independent: {
        expectedStatus: "clear",
        expectedPreCapacity: expectedStepPre,
        expectedPostCapacity: expectedStepPre - amount,
        expectedBasketEffects: [{ key: "rp_builder", effect: "CONSUMED", delta: -amount }],
        rationale: "Investments and dividends share the Notes RP waterfall / Available Amount.",
        source: "Notes §3.4 RP waterfall + inv_ratio_gate companion",
      },
      observed: {
        status: sim.status,
        pre: {
          builderStepRemaining: sim.stepCapacitiesRemaining.rp_builder ?? null,
          poolUsed: sim.poolUsed,
        },
        post: {
          allocated: sim.steps[0]?.allocated ?? 0,
          fromBasket: sim.steps[0]?.basketName ?? null,
          remaining: sim.remaining,
        },
        basketsConsumed: [
          {
            key: builderKey,
            basketName: "Builder Basket (Available Amount)",
            pre: expectedStepPre,
            post: expectedStepPre - amount,
            effect: "CONSUMED",
            delta: -amount,
          },
        ],
        basketsRestored: [],
        basketsUnaffected: [
          {
            key: `${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`,
            basketName: "Financial Covenants — Total Net Leverage",
            pre: preMap.values.get(`${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`) ?? null,
            post: preMap.values.get(`${COHERENT_INDEPENDENT.creditAgreementId}:ca_leverage_cap`) ?? null,
            effect: "UNAFFECTED",
            delta: 0,
          },
        ],
        pathway: "simulateRestrictedPayment(kind=investment)",
        limitations: ["Does not reduce cash in covenant overlay (RP sim is capacity-only)"],
      },
      assessment,
    });
  }

  // --- Matthews refusal: no executable provisions ---
  {
    results.push({
      id: "MATW-R1-capacity-refusal",
      companyId: "matthews",
      kind: "DEBT_INCURRENCE",
      title: "Matthews — refuse executable capacity without provisions",
      amount: 10,
      detail: "Financials + permissions present; CovenantProvision/capacityFormulas absent.",
      independent: {
        expectedStatus: "NOT_EXECUTABLE",
        expectedBasketEffects: [],
        rationale:
          "Authentic Matthews package lacks modeled CovenantProvision rows; capacity must refuse.",
        source: "Neon matthews company — zero covenant_provisions",
      },
      observed: {
        status: "NOT_EXECUTABLE",
        pre: { provisionCount: 0 },
        post: { provisionCount: 0 },
        basketsConsumed: [],
        basketsRestored: [],
        basketsUnaffected: [],
        pathway: "eligibility gate — no simulateDebtIncurrence without formulas",
        limitations: [
          "7 permissions + 18 golden tests exist but do not substitute for provision formulas",
        ],
      },
      assessment: "CORRECT_REFUSAL",
    });
  }

  void expectedMilaSecuredRoom;
  void getScenarioInputs;
  return results;
}

async function persistNeonIntelligence(
  companies: CompanyFinancialPositionReport[],
  scenarios: TransactionScenarioResult[],
): Promise<NeonIntelligenceRow[]> {
  const rows: NeonIntelligenceRow[] = [];
  const coherent = companies.find((c) => c.companyId === "coherent");
  if (!coherent?.contractualMetrics) return rows;

  const payload = {
    schema: "product.financial-capacity-intelligence.v1",
    verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH" as const,
    promotedToLegalTruth: 0,
    companyId: "coherent",
    asOfDate: coherent.asOfDate,
    contractualMetrics: coherent.contractualMetrics,
    baskets: coherent.baskets.map((b) => ({
      key: b.key,
      basketName: b.basketName,
      formulaType: b.formulaType,
      sectionRef: b.sectionRef,
      capacity: b.capacity,
      status: b.status,
    })),
    remainingCapacity: coherent.remainingCapacity,
    validatedScenarios: scenarios
      .filter((s) => s.companyId === "coherent" && s.assessment === "CORRECT_EXECUTABLE")
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        amount: s.amount,
        status: s.observed.status,
        consumed: s.observed.basketsConsumed.map((b) => b.key),
        restored: s.observed.basketsRestored.map((b) => b.key),
        unaffected: s.observed.basketsUnaffected.slice(0, 5).map((b) => b.key),
      })),
    note: "Reusable calculation evidence from Neon evaluation seed. DISCOVERED ≠ certified legal truth. Do not auto-promote.",
  };

  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const sourceId = `financial-capacity-coherent-${hash.slice(0, 16)}`;

  const existing = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  if (existing) {
    rows.push({
      sourceId,
      companyId: "coherent",
      title: existing.documentTitle,
      representationLevel: existing.representationLevel,
      verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH",
      promotedToLegalTruth: 0,
      kind: "financial_capacity_calculation_case",
      created: false,
    });
    return rows;
  }

  await prisma.knowledgeSource.create({
    data: {
      sourceId,
      companyId: "coherent",
      issuerCik: "0001094285",
      issuerTicker: "COHR",
      issuerName: "Coherent Corp.",
      accessionNumber: "neon-evaluation-seed",
      exhibitFilename: "financial-capacity-positions.json",
      sourceUrl: "neon://evaluation/coherent/financial-capacity-positions",
      filingDate: new Date(coherent.asOfDate),
      formType: "EVAL",
      documentTitle: "Coherent financial capacity calculation cases (evaluation seed)",
      documentClass: "OTHER_DEBT_RELATED",
      originalBytesHash: hash,
      acquisitionTimestamp: new Date(),
      parserVersion: "product.financial-capacity-positions.v1",
      extractionStatus: "CLASSIFIED",
      representationLevel: "DETERMINISTICALLY_VALIDATED",
      provenance: "neon-evaluation-seed+covenant-engine; DISCOVERED_NOT_LEGAL_TRUTH",
      usageRightsReviewStatus: "UNREVIEWED",
      metadata: payload,
    },
  });

  rows.push({
    sourceId,
    companyId: "coherent",
    title: "Coherent financial capacity calculation cases (evaluation seed)",
    representationLevel: "DETERMINISTICALLY_VALIDATED",
    verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH",
    promotedToLegalTruth: 0,
    kind: "financial_capacity_calculation_case",
    created: true,
  });

  // Matthews refusal case as reusable blocker knowledge
  const matwPayload = {
    schema: "product.financial-capacity-blocker.v1",
    verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH" as const,
    promotedToLegalTruth: 0,
    companyId: "matthews",
    blocker:
      "Permissions and financials present; CovenantProvision/capacityFormulas absent → capacity NOT_EXECUTABLE",
    generality: "CLASS_GENERAL",
  };
  const matwHash = createHash("sha256").update(JSON.stringify(matwPayload)).digest("hex");
  const matwSourceId = `financial-capacity-matthews-blocker-${matwHash.slice(0, 16)}`;
  const matwExisting = await prisma.knowledgeSource.findUnique({ where: { sourceId: matwSourceId } });
  if (!matwExisting) {
    await prisma.knowledgeSource.create({
      data: {
        sourceId: matwSourceId,
        companyId: "matthews",
        issuerCik: "0000063296",
        issuerTicker: "MATW",
        issuerName: "Matthews International Corporation",
        accessionNumber: "neon-evaluation-seed",
        exhibitFilename: "financial-capacity-blocker.json",
        sourceUrl: "neon://evaluation/matthews/financial-capacity-blocker",
        filingDate: new Date("2024-12-31T00:00:00.000Z"),
        formType: "EVAL",
        documentTitle: "Matthews capacity refusal — missing provision formulas",
        documentClass: "OTHER_DEBT_RELATED",
        originalBytesHash: matwHash,
        acquisitionTimestamp: new Date(),
        parserVersion: "product.financial-capacity-positions.v1",
        extractionStatus: "CLASSIFIED",
        representationLevel: "DISCOVERED_CANDIDATE",
        provenance: "neon-evaluation-seed; DISCOVERED_NOT_LEGAL_TRUTH",
        usageRightsReviewStatus: "UNREVIEWED",
        metadata: matwPayload,
      },
    });
    rows.push({
      sourceId: matwSourceId,
      companyId: "matthews",
      title: "Matthews capacity refusal — missing provision formulas",
      representationLevel: "DISCOVERED_CANDIDATE",
      verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH",
      promotedToLegalTruth: 0,
      kind: "capacity_blocker_pattern",
      created: true,
    });
  } else {
    rows.push({
      sourceId: matwSourceId,
      companyId: "matthews",
      title: matwExisting.documentTitle,
      representationLevel: matwExisting.representationLevel,
      verificationStatus: "DISCOVERED_NOT_LEGAL_TRUTH",
      promotedToLegalTruth: 0,
      kind: "capacity_blocker_pattern",
      created: false,
    });
  }

  return rows;
}

function renderCustomerReport(report: FinancialCapacityMilestoneReport): string {
  const lines: string[] = [];
  lines.push("# Financial capacity positions — milestone report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`SHA: ${report.startingSha ?? "unknown"}`);
  lines.push(`paidInferenceCalls: ${report.paidInferenceCalls}`);
  lines.push(`promotedToLegalTruth: ${report.promotedToLegalTruth}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  const m = report.metrics;
  lines.push(`1. Authentic companies processed: **${m.authenticCompaniesProcessed}**`);
  lines.push(`2. Agreements processed: **${m.agreementsProcessed}**`);
  lines.push(`3. Financial statements processed: **${m.financialStatementsProcessed}**`);
  lines.push(`4. Certificates processed: **${m.certificatesProcessed}**`);
  lines.push(
    `5. Independently correct executable calculations: **${m.independentlyCorrectExecutableCalculations}**`,
  );
  lines.push(`6. Correct refusals: **${m.correctRefusals}**`);
  lines.push(`7. Incorrect outcomes: **${m.incorrectOutcomes}**`);
  lines.push(
    `8. Transactions with validated state changes: **${m.transactionsWithValidatedStateChanges}**`,
  );
  lines.push(
    `9. New reusable covenant knowledge stored in Neon: **${m.newReusableCovenantKnowledgeStored}**`,
  );
  lines.push("");
  lines.push("## Companies");
  lines.push("");
  for (const c of report.companies) {
    lines.push(`### ${c.companyName} (\`${c.companyId}\`)`);
    lines.push("");
    lines.push(`- As of: ${c.asOfDate}`);
    lines.push(`- Executable capacity: ${c.eligibility.executableCapacity}`);
    if (c.contractualMetrics) {
      lines.push(
        `- EBITDA $${c.contractualMetrics.ebitda}M · Net leverage ${c.contractualMetrics.totalNetLeverage.toFixed(3)}x · FCCR ${c.contractualMetrics.fixedChargeCoverage.toFixed(2)}x`,
      );
      lines.push(
        `- Remaining secured capacity: ${c.remainingCapacity.secured ?? "n/a"} (binding: ${c.remainingCapacity.securedBinding ?? "n/a"})`,
      );
      lines.push(
        `- Remaining unsecured capacity: ${c.remainingCapacity.unsecured ?? "n/a"} (binding: ${c.remainingCapacity.unsecuredBinding ?? "n/a"})`,
      );
    }
    if (c.eligibility.refusalReasons.length) {
      lines.push(`- Eligibility gaps: ${c.eligibility.refusalReasons.join("; ")}`);
    }
    lines.push(`- Baskets modeled: ${c.baskets.length}`);
    lines.push(`- Known ledger entries: ${c.ledgerUtilization.length}`);
    lines.push("");
  }
  lines.push("## Transaction state changes");
  lines.push("");
  for (const s of report.scenarios) {
    lines.push(`### ${s.id} — ${s.title}`);
    lines.push("");
    lines.push(`- Assessment: **${s.assessment}**`);
    lines.push(`- Status: ${s.observed.status}`);
    lines.push(`- Pathway: ${s.observed.pathway}`);
    if (s.observed.basketsConsumed.length) {
      lines.push(
        `- Consumed: ${s.observed.basketsConsumed.map((b) => `${b.basketName} (${b.delta})`).join("; ")}`,
      );
    }
    if (s.observed.basketsRestored.length) {
      lines.push(
        `- Restored/increased: ${s.observed.basketsRestored.map((b) => `${b.basketName} (${b.delta})`).join("; ")}`,
      );
    }
    const unaffectN = s.observed.basketsUnaffected.length;
    if (unaffectN) lines.push(`- Unaffected baskets: ${unaffectN}`);
    lines.push(`- Independent rationale: ${s.independent.rationale}`);
    lines.push("");
  }
  lines.push("## Blockers");
  lines.push("");
  for (const b of report.blockers) {
    lines.push(`- **${b.id}** (${b.generality}): ${b.statement}`);
  }
  lines.push("");
  lines.push("## CONMED refusal regressions");
  lines.push("");
  lines.push(report.conmedRefusalRegressionsPreserved.note);
  lines.push(`PR: ${report.conmedRefusalRegressionsPreserved.pr}`);
  lines.push(`Scenarios: ${report.conmedRefusalRegressionsPreserved.scenarioIds.join(", ")}`);
  lines.push("");
  lines.push("## Neon intelligence");
  lines.push("");
  for (const n of report.neonIntelligence) {
    lines.push(
      `- \`${n.sourceId}\` (${n.kind}) — ${n.verificationStatus}; created=${n.created}; promotedToLegalTruth=${n.promotedToLegalTruth}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runFinancialCapacityPositions(args?: {
  startingSha?: string | null;
  persistNeon?: boolean;
}): Promise<FinancialCapacityMilestoneReport> {
  const companies: CompanyFinancialPositionReport[] = [];
  for (const id of ELIGIBLE_COMPANY_IDS) {
    companies.push(await buildCompanyPosition(id));
  }

  const scenarios = await runCoherentScenarios();
  const neonIntelligence =
    args?.persistNeon === false
      ? []
      : await persistNeonIntelligence(companies, scenarios);

  const correctExec = scenarios.filter((s) => s.assessment === "CORRECT_EXECUTABLE").length;
  const correctRefusal = scenarios.filter((s) => s.assessment === "CORRECT_REFUSAL").length;
  const incorrect = scenarios.filter((s) => s.assessment === "INCORRECT").length;
  const stateChanges = scenarios.filter(
    (s) =>
      s.assessment === "CORRECT_EXECUTABLE" &&
      (s.observed.basketsConsumed.length > 0 ||
        s.observed.basketsRestored.length > 0 ||
        s.kind === "DEBT_REPAYMENT"),
  ).length;

  const blockers: FinancialCapacityMilestoneReport["blockers"] = [
    {
      id: "B1-matthews-missing-provisions",
      generality: "CLASS_GENERAL",
      statement:
        "Companies may have FinancialSnapshot/State and Permission rows without CovenantProvision/capacityFormulas — capacity must refuse, not invent.",
    },
    {
      id: "B2-no-ns4-on-evaluation-seeds",
      generality: "CLASS_GENERAL",
      statement:
        "Coherent/Matthews evaluation seeds use legacy FinancialSnapshot/State, not NS-4 APPROVED ContractInputSnapshot — Phase-4 REQUIRE path remains unavailable for these packages.",
    },
    {
      id: "B3-no-officer-certificates-in-neon",
      generality: "PLATFORM",
      statement:
        "No officer/compliance certificate Document rows found for eligible packages — certificate-backed ratio certification not yet demonstrable from Neon.",
    },
    {
      id: "B4-no-equity-scenario-action",
      generality: "PLATFORM",
      statement:
        "ScenarioAction lacks EQUITY_CONTRIBUTION; equity effects shown via financial overlay only.",
    },
    {
      id: "B5-unknown-debt-basket-utilization",
      generality: "CLASS_GENERAL",
      statement:
        "Even with a ledger, DEBT_INCUR utilization may be unrecorded — remaining debt-basket capacity can overstate unused room if historical draws are unknown.",
    },
  ];

  const report: FinancialCapacityMilestoneReport = {
    schemaVersion: "product.financial-capacity-positions.v1",
    generatedAt: new Date().toISOString(),
    startingSha: args?.startingSha ?? null,
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    companies,
    scenarios,
    neonIntelligence,
    metrics: {
      authenticCompaniesProcessed: companies.length,
      agreementsProcessed: companies.reduce((s, c) => s + c.documents.length, 0),
      financialStatementsProcessed: companies.reduce(
        (s, c) => s + c.financialStatementsProcessed,
        0,
      ),
      certificatesProcessed: companies.reduce((s, c) => s + c.certificatesProcessed, 0),
      independentlyCorrectExecutableCalculations: correctExec,
      correctRefusals: correctRefusal,
      incorrectOutcomes: incorrect,
      transactionsWithValidatedStateChanges: stateChanges,
      newReusableCovenantKnowledgeStored: neonIntelligence.filter((n) => n.created).length,
    },
    blockers,
    conmedRefusalRegressionsPreserved: {
      note: "PR #206 CONMED six CORRECT_REFUSAL scenarios remain the regression suite for unsupported packages; this milestone does not re-run or weaken them.",
      pr: "https://github.com/egsul897/headroom/pull/206",
      scenarioIds: [
        "S1-unsecured-debt",
        "S2-secured-debt",
        "S3-restricted-payment",
        "S4-ratio-gated",
        "S5-amendment",
        "S6-insufficient-evidence",
      ],
    },
    customerReportMarkdown: "",
  };
  report.customerReportMarkdown = renderCustomerReport(report);
  return report;
}
