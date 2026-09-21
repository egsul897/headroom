/**
 * §10 — the full-regeneration cost model, recomputed from the pilot's OWN completed
 * telemetry rather than from the four-candidate probe that started this.
 *
 * The projection is split the way the mission asks, because the two terms behave very
 * differently: Tier-1 cost is near-fixed per candidate and tiny, while the escalation
 * term is driven by a rate this pilot measures and a Sonnet 5 price that is ~130x higher.
 * Whether A_FULL is worth funding turns almost entirely on that rate.
 *
 * The alternative-timeout scenario is explicitly NOT a claim that timed-out candidates
 * would succeed given more time. It is the arithmetic of what the run would cost if they
 * did, so the value of investigating the ceiling can be compared against the cost of
 * simply escalating past it.
 */
import type { CandidateRecord } from "./compile-run";

/** A_FULL's benchmark-blind population, established in docs/phase-3-current-pipeline-regeneration/04. */
export const FULL_POPULATION = 1274;
/** Measured over 30 real compilations in the frozen Phase-3F run. */
export const SONNET5_PER_CANDIDATE_USD = 0.304;

export interface Projection {
  label: string;
  escalationRate: number;
  tier1Candidates: number;
  tier1CostUsd: number;
  escalatedCandidates: number;
  tier2CostUsd: number;
  totalUsd: number;
  savingVsAllSonnetPct: number;
}

export function project(label: string, escalationRate: number, tier1PerCandidateUsd: number, population = FULL_POPULATION): Projection {
  const tier1Cost = population * tier1PerCandidateUsd;
  const escalated = Math.round(population * escalationRate);
  const tier2Cost = escalated * SONNET5_PER_CANDIDATE_USD;
  const total = tier1Cost + tier2Cost;
  const allSonnet = population * SONNET5_PER_CANDIDATE_USD;
  return {
    label,
    escalationRate: Number(escalationRate.toFixed(4)),
    tier1Candidates: population,
    tier1CostUsd: Number(tier1Cost.toFixed(2)),
    escalatedCandidates: escalated,
    tier2CostUsd: Number(tier2Cost.toFixed(2)),
    totalUsd: Number(total.toFixed(2)),
    savingVsAllSonnetPct: Number((((allSonnet - total) / allSonnet) * 100).toFixed(1)),
  };
}

export function costModel(final: CandidateRecord[]) {
  const reachedModel = final.filter((r) => !r.failureReasons.includes("PROVIDER_FAILURE"));
  const completed = reachedModel.filter((r) => r.status !== "FAILED");
  const timeouts = reachedModel.filter((r) => r.failureReasons.includes("WALL_CLOCK_TIMEOUT"));
  const escalated = final.filter((r) => r.escalated);

  const tier1Records = final.filter((r) => r.tier === 1);
  const tier1Spend = tier1Records.reduce((s, r) => s + r.actualCostUsd, 0);
  const tier1PerCompleted = completed.length > 0 ? tier1Spend / completed.length : 0;
  const observedEscalationRate = reachedModel.length > 0 ? timeouts.length / reachedModel.length : 0;

  const allSonnet = FULL_POPULATION * SONNET5_PER_CANDIDATE_USD;

  return {
    basis: {
      candidatesReachingModel: reachedModel.length,
      completedOnTier1: completed.length,
      timeouts: timeouts.length,
      escalations: escalated.length,
      tier1SpendUsd: Number(tier1Spend.toFixed(4)),
      tier1CostPerCompletedCandidateUsd: Number(tier1PerCompleted.toFixed(5)),
      observedTimeoutRate: Number(observedEscalationRate.toFixed(4)),
      note: "Cost per COMPLETED candidate is the right unit: a timed-out candidate still bills for the tokens it streamed before the ceiling, so dividing by attempts would understate what a completion actually costs.",
    },
    allSonnetBaselineUsd: Number(allSonnet.toFixed(2)),
    projections: [
      project("observed rate", observedEscalationRate, tier1PerCompleted),
      project("20% escalation", 0.2, tier1PerCompleted),
      project("10% escalation", 0.1, tier1PerCompleted),
      project("5% escalation", 0.05, tier1PerCompleted),
    ],
    alternativeTimeoutScenario: {
      premise:
        "If every candidate that hit the wall-clock ceiling were instead given more time AND completed on Tier 1 — an assumption this pilot does NOT establish — the escalation term would go to zero.",
      totalUsd: Number((FULL_POPULATION * tier1PerCompleted).toFixed(2)),
      savingVsAllSonnetPct: Number((((allSonnet - FULL_POPULATION * tier1PerCompleted) / allSonnet) * 100).toFixed(1)),
      caveat:
        "Not a prediction. A candidate may be timing out because it is genuinely hard for this model, in which case more time buys nothing and the escalation is real work. The forensics in 06-timeout-forensics distinguish the two: a candidate still streaming tokens at the ceiling was making progress; one that produced nothing was not.",
    },
  };
}
