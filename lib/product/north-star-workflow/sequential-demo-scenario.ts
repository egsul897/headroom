/**
 * Canonical multi-step demos — compose recipes into sequential-execution steps.
 * World construction lives in the sequential-execution boundary.
 */
import {
  buildFlatSequentialWorld,
  buildRatioGatedSequentialWorld,
  RATIO_DEMO_AS_OF,
  RATIO_DEMO_FACILITY,
  RATIO_DEMO_ORG,
  runSequentialTransactions,
  type SequentialStepSpec,
  type SequentialWorld,
} from "@/lib/contract-model/sequential-execution";
import {
  recipeDebtIncurrence,
  recipeDebtRepayment,
  recipeDividendPayment,
  recipeEquityContribution,
  recipeRestrictedInvestment,
  type RecipeBuildResult,
  type RecipeIdentity,
} from "./transaction-effect-recipes";

export const DEMO_ORG = RATIO_DEMO_ORG;
export const DEMO_FACILITY = RATIO_DEMO_FACILITY;
export const DEMO_AS_OF = RATIO_DEMO_AS_OF;

export function buildSequentialDemoWorld(_opts?: { utilizationAffirmedComplete?: boolean }): {
  world: SequentialWorld;
  utilizationAffirmedComplete: boolean;
} {
  return {
    world: buildFlatSequentialWorld(),
    utilizationAffirmedComplete: _opts?.utilizationAffirmedComplete ?? true,
  };
}

function cash(amount: string) {
  return { type: "MONEY" as const, amount, currency: "USD" };
}

function identity(transactionId: string, over: Partial<RecipeIdentity> = {}): RecipeIdentity {
  return {
    transactionId,
    companyId: RATIO_DEMO_ORG,
    instrumentKey: RATIO_DEMO_FACILITY,
    effectiveAsOf: RATIO_DEMO_AS_OF,
    provenance: {
      source: "sequential-demo-scenario",
      sourceVersion: "v1",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL",
    ...over,
  };
}

function toStep(stepId: string, businessType: RecipeBuildResult["businessType"], recipe: RecipeBuildResult): SequentialStepSpec {
  if (!recipe.transaction) {
    return {
      stepId,
      businessType,
      transaction: {
        transactionId: stepId,
        companyId: RATIO_DEMO_ORG,
        instrumentKey: RATIO_DEMO_FACILITY,
        effectiveAsOf: RATIO_DEMO_AS_OF,
        effects: [],
        provenance: recipe.provenance,
      },
      selectedPath: recipe.selectedPath,
      recipeOk: false,
      recipeLimitations: recipe.limitations,
      recipeNotes: recipe.notes,
    };
  }
  return {
    stepId,
    businessType,
    transaction: recipe.transaction,
    selectedPath: recipe.selectedPath,
    recipeOk: recipe.ok,
    recipeLimitations: recipe.limitations,
    recipeNotes: recipe.notes,
  };
}

export function buildCanonicalSequentialSteps(): SequentialStepSpec[] {
  const debtNode = "capacity:rule:debt-basket";
  const rpNode = "capacity:rule:rp-basket";
  const invNode = "capacity:rule:invest-basket";

  const incur = recipeDebtIncurrence(identity("tx-1-incur"), {
    draws: [{ effectId: "e-incur", capacityNodeId: debtNode, amount: cash("100"), ruleId: "debt-basket" }],
    debtMetric: {
      effectId: "m-debt-up",
      metricKey: "total-debt",
      asOf: RATIO_DEMO_AS_OF,
      adjustment: { kind: "DELTA", value: cash("100") },
    },
    label: "Incur $100 debt",
  });

  const dividend = recipeDividendPayment(identity("tx-2-dividend"), {
    draws: [{ effectId: "e-div", capacityNodeId: rpNode, amount: cash("40"), ruleId: "rp-basket" }],
    builderMetrics: [{
      effectId: "m-builder-down",
      metricKey: "builder-available",
      asOf: RATIO_DEMO_AS_OF,
      adjustment: { kind: "DELTA", value: cash("-40") },
    }],
    label: "Pay $40 dividend",
  });

  const equity = recipeEquityContribution(identity("tx-3-equity"), {
    metrics: [
      {
        effectId: "m-equity",
        metricKey: "equity-proceeds",
        asOf: RATIO_DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("75") },
      },
      {
        effectId: "m-builder-up",
        metricKey: "builder-available",
        asOf: RATIO_DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("75") },
      },
    ],
    label: "Receive $75 equity contribution",
  });

  const invest = recipeRestrictedInvestment(identity("tx-4-invest"), {
    draws: [{ effectId: "e-invest", capacityNodeId: invNode, amount: cash("50"), ruleId: "invest-basket" }],
    label: "Make $50 restricted investment",
  });

  const repay = recipeDebtRepayment(identity("tx-5-repay"), {
    restores: [{
      effectId: "e-repay",
      usageId: "tx-1-incur::e-incur",
      reason: "principal repaid",
      contractualAuthorityRef: "§debt-basket repayment / reduction of outstanding Indebtedness",
    }],
    debtMetric: {
      effectId: "m-debt-down",
      metricKey: "total-debt",
      asOf: RATIO_DEMO_AS_OF,
      adjustment: { kind: "DELTA", value: cash("-100") },
    },
    label: "Repay $100 debt",
  });

  return [
    toStep("1-debt-incurrence", "DEBT_INCURRENCE", incur),
    toStep("2-dividend", "DIVIDEND_PAYMENT", dividend),
    toStep("3-equity-contribution", "EQUITY_CONTRIBUTION", equity),
    toStep("4-restricted-investment", "RESTRICTED_INVESTMENT", invest),
    toStep("5-debt-repayment", "DEBT_REPAYMENT", repay),
  ];
}

/** Ratio-gated sequence: incur debt then attempt dividend (expected refusal). */
export function buildRatioGatedSequenceSteps(): {
  incur: SequentialStepSpec;
  dividend: SequentialStepSpec;
  world: SequentialWorld;
} {
  const world = buildRatioGatedSequentialWorld({ utilizationAffirmedComplete: true });
  const incur = toStep(
    "1-debt-incurrence",
    "DEBT_INCURRENCE",
    recipeDebtIncurrence(identity("tx-ratio-incur"), {
      draws: [{
        effectId: "e-incur",
        capacityNodeId: "capacity:rule:debt-basket",
        amount: cash("100"),
        ruleId: "debt-basket",
      }],
      debtMetric: {
        effectId: "m-debt-up",
        metricKey: "total-debt",
        asOf: RATIO_DEMO_AS_OF,
        adjustment: { kind: "DELTA", value: cash("100") },
      },
      label: "Incur $100 — raises TNL from 3.0x to 4.0x",
    }),
  );
  const dividend = toStep(
    "2-dividend-blocked",
    "DIVIDEND_PAYMENT",
    recipeDividendPayment(identity("tx-ratio-div"), {
      draws: [{
        effectId: "e-div",
        capacityNodeId: "capacity:rule:rp-basket",
        amount: cash("40"),
        ruleId: "rp-basket",
      }],
      label: "Dividend $40 — independent expectation: refused (TNL 4.0 > 3.5)",
    }),
  );
  return { world, incur, dividend };
}

export function runCanonicalSequentialDemo(opts?: { utilizationAffirmedComplete?: boolean }) {
  const { world, utilizationAffirmedComplete } = buildSequentialDemoWorld(opts);
  return runSequentialTransactions({
    world,
    steps: buildCanonicalSequentialSteps(),
    mode: "HYPOTHETICAL",
    utilizationAffirmedComplete,
  });
}

export type { SequentialWorld };
