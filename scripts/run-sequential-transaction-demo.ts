/**
 * Emit canonical sequential transaction demo artifacts (hypothetical, $0).
 * Run: npx tsx scripts/run-sequential-transaction-demo.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runCanonicalSequentialDemo, buildRatioGatedSequenceSteps } from "../lib/product/north-star-workflow/sequential-demo-scenario";
import { ALL_BUSINESS_TRANSACTION_TYPES } from "../lib/product/north-star-workflow/transaction-effect-recipes";
import {
  RATIO_DEMO_INDEPENDENT_EXPECTATION,
  runSequentialTransactions,
} from "../lib/contract-model/sequential-execution";

const outDir = join("docs", "product", "transaction-effects");
mkdirSync(outDir, { recursive: true });

const run = runCanonicalSequentialDemo({ utilizationAffirmedComplete: true });
const { world, incur, dividend } = buildRatioGatedSequenceSteps();
const ratioRun = runSequentialTransactions({
  world,
  steps: [incur, dividend],
  mode: "HYPOTHETICAL",
  utilizationAffirmedComplete: true,
});

const summary = {
  artifact: "AGENT-4 sequential transaction demonstration",
  at: new Date().toISOString(),
  costUsd: 0,
  paidCalls: 0,
  mode: run.mode,
  abortedAtStepId: run.abortedAtStepId,
  originalLedgerUntouched: run.originalLedgerUntouched,
  utilizationStatus: run.utilizationStatus,
  businessTypesCoveredByRecipes: ALL_BUSINESS_TRANSACTION_TYPES,
  steps: run.steps.map((s) => ({
    stepId: s.stepId,
    businessType: s.businessType,
    recipeOk: s.recipeOk,
    simulationStatus: s.simulation?.simulationStatus ?? null,
    selectedPathResult: s.simulation?.selectedPathResult ?? null,
    preStateHash: s.preStateHash,
    postStateHash: s.postStateHash,
    independentPostMatchesSimulation: s.independentPostMatchesSimulation,
    financialViewChained: s.financialViewChained,
    chainedMetricKeysAfter: s.chainedMetricKeysAfter,
    proposedLedgerUsageIds: s.proposedLedgerUsageIds,
    preState: s.preState,
    postState: s.postState,
    capacityEffects: s.simulation?.capacityEffects.map((c) => ({
      capacityNodeId: c.capacityNodeId,
      outcome: c.outcome,
      attempted: c.attemptedAmount,
      available: c.availableAmount,
      shortfall: c.shortfallAmount,
    })) ?? [],
    financialEffects: s.simulation?.financialEffects.map((f) => ({
      effectId: f.effectId,
      metricKey: f.metricKey,
      state: f.state,
      base: f.baseValue,
      result: f.result,
    })) ?? [],
    ledgerProposed: s.simulation?.ledgerEffects.proposed.map((p) => ({
      usageId: p.record.usageId,
      amount: p.record.amount,
      kind: p.kind,
      supersedes: p.supersedesUsageId,
    })) ?? [],
    ledgerSuperseded: s.simulation?.ledgerEffects.superseded.map((x) => ({
      originalUsageId: x.originalUsageId,
      proposedStatus: x.proposed.status,
      supersededBy: x.proposed.supersededByUsageId,
    })) ?? [],
    provenance: s.simulation?.provenance ?? null,
    commitPlanExecuted: s.simulation?.commitPlan.executed ?? null,
  })),
  finalStateHash: run.finalStateHash,
  notes: run.notes,
  ratioGatedIndependentDemo: {
    independentExpectation: RATIO_DEMO_INDEPENDENT_EXPECTATION,
    steps: ratioRun.steps.map((s) => ({
      stepId: s.stepId,
      simulationStatus: s.simulation?.simulationStatus ?? null,
      selectedPathResult: s.simulation?.selectedPathResult ?? null,
      financialViewChained: s.financialViewChained,
      chainedMetricKeysAfter: s.chainedMetricKeysAfter,
      limitations: s.simulation?.limitations.map((l) => l.code) ?? s.recipeLimitations.map((l) => l.code),
      postStatePublished: s.postState !== null,
    })),
    abortedAtStepId: ratioRun.abortedAtStepId,
  },
};

writeFileSync(join(outDir, "02-sequential-demo-run.json"), JSON.stringify(summary, null, 2) + "\n");
writeFileSync(join(outDir, "04-ratio-gated-sequence.json"), JSON.stringify(summary.ratioGatedIndependentDemo, null, 2) + "\n");
console.log(JSON.stringify({
  wrote: [join(outDir, "02-sequential-demo-run.json"), join(outDir, "04-ratio-gated-sequence.json")],
  flatSteps: summary.steps.length,
  flatAborted: summary.abortedAtStepId,
  ratioAborted: ratioRun.abortedAtStepId,
  ratioPath1: ratioRun.steps[0]?.simulation?.selectedPathResult,
  ratioPath2: ratioRun.steps[1]?.simulation?.selectedPathResult,
}, null, 2));
