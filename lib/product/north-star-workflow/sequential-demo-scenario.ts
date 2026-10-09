/**
 * Canonical multi-step demonstration:
 * incur debt → dividend → equity contribution → investment → repay debt.
 *
 * Built only from Phase 4D compositional effects via recipes. Synthetic world.
 */
import type { IRRule } from "@/lib/contract-model/ir/types";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type { FinancialInput, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import {
  recipeDebtIncurrence,
  recipeDebtRepayment,
  recipeDividendPayment,
  recipeEquityContribution,
  recipeRestrictedInvestment,
  type RecipeIdentity,
} from "./transaction-effect-recipes";
import {
  runSequentialTransactions,
  type SequentialStepInput,
  type SequentialWorld,
} from "./sequential-transaction-runner";

export const DEMO_ORG = "seq-demo-org";
export const DEMO_FACILITY = "seq-demo-facility";
export const DEMO_AS_OF = "2026-06-30";

const L = { exprId: null, inputKeys: [] as string[] };
const money = (amount: string): RuntimeValue => ({
  type: "MONEY",
  amount: rationalFromString(amount),
  currency: "USD",
  lineage: L,
});

function flatRule(
  ruleId: string,
  amount: number,
  family: IRRule["covenantFamily"],
  action: NonNullable<IRRule["action"]>,
): IRRule {
  return {
    ruleId,
    irSchemaVersion: "seq-demo",
    companyId: DEMO_ORG,
    instrumentKey: DEMO_FACILITY,
    sourceDocumentId: "seq-demo-doc",
    sourceSectionRef: `§${ruleId}`,
    covenantFamily: family,
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action,
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: {
      kind: "MONEY",
      type: "MONEY",
      amount,
      currency: "USD",
      exprId: `expr-${ruleId}`,
    } as IRRule["capacityExpression"],
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "seq-demo-doc",
      sourceNodeKey: null,
      sourceCitation: `cite-${ruleId}`,
      excerpt: null,
    },
    compilerVersion: null,
    sourceContentVersion: null,
  };
}

function figure(key: string, amount: string): FinancialInput {
  return {
    identity: {
      companyId: DEMO_ORG,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: DEMO_FACILITY },
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "EXACT_DATE", isoDate: DEMO_AS_OF },
      valueType: "MONEY",
      currency: "USD",
    },
    value: money(amount),
    sourceVersion: "seq-demo-v1",
  };
}

function cash(amount: string) {
  return { type: "MONEY" as const, amount, currency: "USD" };
}

function identity(transactionId: string, over: Partial<RecipeIdentity> = {}): RecipeIdentity {
  return {
    transactionId,
    companyId: DEMO_ORG,
    instrumentKey: DEMO_FACILITY,
    effectiveAsOf: DEMO_AS_OF,
    provenance: {
      source: "sequential-demo-scenario",
      sourceVersion: "v1",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL",
    ...over,
  };
}

export function buildSequentialDemoWorld(opts?: {
  /** When true, empty starting ledger is treated as confirmed-zero utilization. */
  utilizationAffirmedComplete?: boolean;
}): { world: SequentialWorld; rules: IRRule[]; utilizationAffirmedComplete: boolean } {
  const rules: IRRule[] = [
    flatRule("debt-basket", 500, "INDEBTEDNESS", "INCUR_DEBT"),
    flatRule("rp-basket", 200, "RESTRICTED_PAYMENTS", "PAY_DIVIDEND"),
    flatRule("invest-basket", 150, "INVESTMENTS", "MAKE_INVESTMENT"),
  ];
  const facts = [figure("total-debt", "1000"), figure("equity-proceeds", "0"), figure("builder-available", "50")];
  const snapshot: FinancialSnapshot = {
    snapshotId: "seq-demo-snap",
    version: "1",
    companyId: DEMO_ORG,
    asOf: DEMO_AS_OF,
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source: "sequential demo pack", sourceVersion: "v1" },
    review: {
      reviewedBy: "demo-reviewer",
      reviewedAt: "2026-07-01T00:00:00Z",
      approvalRef: "seq-demo-approval",
    },
    inputs: facts,
  };
  const inputs = snapshotInputResolver({
    snapshots: [snapshot],
    definitions: [],
    rules,
    companyId: DEMO_ORG,
    instrumentKey: DEMO_FACILITY,
  });
  const graph = buildCapacityGraph({
    rules,
    sharedCapacities: [],
    definitions: [],
    companyId: DEMO_ORG,
    instrumentKey: DEMO_FACILITY,
    asOf: DEMO_AS_OF,
  });
  const ledger: never[] = [];
  const state = evaluateCapacityState({
    graph,
    rules,
    sharedCapacities: [],
    definitions: [],
    inputs,
    ledger,
    asOf: DEMO_AS_OF,
  });
  return {
    world: {
      graph,
      state,
      inputs,
      context: { rules, sharedCapacities: [], definitions: [], ledger, asOf: DEMO_AS_OF },
    },
    rules,
    utilizationAffirmedComplete: opts?.utilizationAffirmedComplete ?? true,
  };
}

export function buildCanonicalSequentialSteps(): SequentialStepInput[] {
  const debtNode = "capacity:rule:debt-basket";
  const rpNode = "capacity:rule:rp-basket";
  const invNode = "capacity:rule:invest-basket";

  const incur = recipeDebtIncurrence(identity("tx-1-incur"), {
    draws: [
      {
        effectId: "e-incur",
        capacityNodeId: debtNode,
        amount: cash("100"),
        ruleId: "debt-basket",
      },
    ],
    debtMetric: {
      effectId: "m-debt-up",
      metricKey: "total-debt",
      asOf: DEMO_AS_OF,
      adjustment: { kind: "DELTA", value: cash("100") },
    },
    label: "Incur $100 debt",
  });

  const dividend = recipeDividendPayment(identity("tx-2-dividend"), {
    draws: [
      {
        effectId: "e-div",
        capacityNodeId: rpNode,
        amount: cash("40"),
        ruleId: "rp-basket",
      },
    ],
    builderMetrics: [
      {
        effectId: "m-builder-down",
        metricKey: "builder-available",
        asOf: DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("-40") },
      },
    ],
    label: "Pay $40 dividend",
  });

  const equity = recipeEquityContribution(identity("tx-3-equity"), {
    metrics: [
      {
        effectId: "m-equity",
        metricKey: "equity-proceeds",
        asOf: DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("75") },
      },
      {
        effectId: "m-builder-up",
        metricKey: "builder-available",
        asOf: DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("75") },
      },
    ],
    label: "Receive $75 equity contribution",
  });

  const invest = recipeRestrictedInvestment(identity("tx-4-invest"), {
    draws: [
      {
        effectId: "e-invest",
        capacityNodeId: invNode,
        amount: cash("50"),
        ruleId: "invest-basket",
      },
    ],
    label: "Make $50 restricted investment",
  });

  const repay = recipeDebtRepayment(identity("tx-5-repay"), {
    restores: [
      {
        effectId: "e-repay",
        usageId: "tx-1-incur::e-incur",
        reason: "principal repaid",
        contractualAuthorityRef: "§debt-basket repayment / reduction of outstanding Indebtedness",
      },
    ],
    debtMetric: {
      effectId: "m-debt-down",
      metricKey: "total-debt",
      asOf: DEMO_AS_OF,
      adjustment: { kind: "DELTA", value: cash("-100") },
    },
    label: "Repay $100 debt",
  });

  return [
    { stepId: "1-debt-incurrence", businessType: "DEBT_INCURRENCE", recipe: incur },
    { stepId: "2-dividend", businessType: "DIVIDEND_PAYMENT", recipe: dividend },
    { stepId: "3-equity-contribution", businessType: "EQUITY_CONTRIBUTION", recipe: equity },
    { stepId: "4-restricted-investment", businessType: "RESTRICTED_INVESTMENT", recipe: invest },
    { stepId: "5-debt-repayment", businessType: "DEBT_REPAYMENT", recipe: repay },
  ];
}

export function runCanonicalSequentialDemo(opts?: {
  utilizationAffirmedComplete?: boolean;
}) {
  const { world, utilizationAffirmedComplete } = buildSequentialDemoWorld(opts);
  const steps = buildCanonicalSequentialSteps();
  return runSequentialTransactions({
    world,
    steps,
    mode: "HYPOTHETICAL",
    utilizationAffirmedComplete,
  });
}
