/**
 * Adapter: sequential hypothetical state — reuses Agent 5 × Agent 4 composition.
 */

import { AUTHENTIC_PACKAGE_SCENARIOS } from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import { buildConmedSequentialDemo } from "@/lib/product/covenant-intelligence/cross-document-sequential-state";
import type { AdapterExecutionResult } from "../types";

const SEQUENTIAL_CASE_IDS = new Set([
  "seq-conmed-debt-rp-overflow",
  "def-stale-financial-sequential",
]);

export function runSequentialConmedAdapter(caseId: string): AdapterExecutionResult {
  if (!SEQUENTIAL_CASE_IDS.has(caseId)) {
    return {
      adapter: "sequential-conmed",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      notes: [`Unknown sequential caseId: ${caseId}`],
    };
  }
  const base = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket");
  if (!base) {
    return {
      adapter: "sequential-conmed",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      notes: ["Missing CONMED authentic scenario"],
    };
  }
  const seq = buildConmedSequentialDemo({
    provisions: base.provisions,
    financials: base.financials,
  });
  const t1 = seq.steps[0]!;
  const t3 = seq.steps[2]!;
  const overflowNotPermitted = t3.verdict.overallResult !== "PERMITTED";
  const isolated = seq.postsToLedger === false && seq.honestRemainingUnknown === true;
  const ok = t1.verdict.overallResult === "PERMITTED" && overflowNotPermitted && isolated;
  return {
    adapter: "sequential-conmed",
    actualLegalOutcome: overflowNotPermitted ? "PROHIBITED" : "PERMITTED",
    falseFavorable: !overflowNotPermitted,
    materialOmissions: [],
    notes: [
      `t1=${t1.verdict.overallResult}`,
      `t3=${t3.verdict.overallResult}`,
      `postsToLedger=${seq.postsToLedger}`,
      `utilizationUnknown=${seq.honestRemainingUnknown}`,
      `ok=${ok}`,
    ],
    details: {
      basketRemainingAfterT1: t1.post.basketRemainingUsd["7.2(o)"],
      rpAfterT2: seq.steps[1]?.post.rpCapacityUsd,
    },
  };
}
