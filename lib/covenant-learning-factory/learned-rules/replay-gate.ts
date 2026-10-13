/**
 * Replay gate: accept a candidate rule only when measured errors strictly drop
 * and golden regression is clean.
 */

import { runCovenantComputation } from "../../contract-model/covenant-computation";
import type { ComputationPackage } from "../../contract-model/covenant-computation/types";
import type { LearnedRule, LearnedRuleSet } from "./types";
import { emptyRuleSet } from "./types";

export interface ReplaySource {
  sourceId: string;
  packageKey: string;
  /** Minimal computation package built from Neon precedent text/excerpts. */
  pkg: ComputationPackage;
  /** Error count observed under the baseline ruleset for this source. */
  baselineErrorCount: number;
}

export interface GoldenCheck {
  name: string;
  /** Return true when golden expectations still hold under the candidate ruleset. */
  run: (ruleset: LearnedRuleSet) => boolean;
}

export interface ReplayGateResult {
  accepted: boolean;
  reason: string;
  errorsBefore: number;
  errorsAfter: number;
  sourcesReplayed: number;
  goldenOk: boolean;
  rule: LearnedRule;
}

function withProposedRule(base: LearnedRuleSet, candidate: LearnedRule): LearnedRuleSet {
  return {
    ...base,
    rules: [
      ...base.rules.filter((r) => r.ruleId !== candidate.ruleId),
      { ...candidate, state: "ACCEPTED" },
    ],
  };
}

/**
 * Count self-check / computation mistakes for a package under a ruleset.
 * Includes UNKNOWN-numeric clauses so CATEGORY_HINT / GROWER_FORM rules can reduce the score.
 */
export function countErrorsUnderRuleset(pkg: ComputationPackage, ruleset: LearnedRuleSet): number {
  const result = runCovenantComputation(pkg, { rules: ruleset });
  let mismatches = result.mistakes.length + result.omissions.length;
  for (const basket of result.baskets) {
    if (basket.category === "UNKNOWN" && /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(basket.citationExcerpt)) {
      mismatches += 1;
    }
  }
  return mismatches;
}

/**
 * Evaluate one candidate. Accept only if total errors across replay sources
 * strictly decrease and every golden check passes.
 */
export function evaluateReplayGate(args: {
  baseline: LearnedRuleSet;
  candidate: LearnedRule;
  sources: ReplaySource[];
  goldens?: GoldenCheck[];
}): ReplayGateResult {
  const candidateSet = withProposedRule(args.baseline, args.candidate);
  let before = 0;
  let after = 0;
  for (const source of args.sources) {
    before += source.baselineErrorCount;
    after += countErrorsUnderRuleset(source.pkg, candidateSet);
  }
  const goldens = args.goldens ?? [];
  let goldenOk = true;
  for (const g of goldens) {
    if (!g.run(candidateSet)) {
      goldenOk = false;
      break;
    }
  }
  const accepted = after < before && goldenOk && args.sources.length > 0;
  const reason = !args.sources.length
    ? "no replay sources"
    : !goldenOk
      ? "golden regression"
      : after >= before
        ? `errors did not drop (${before} → ${after})`
        : `errors dropped (${before} → ${after})`;
  const rule: LearnedRule = {
    ...args.candidate,
    state: accepted ? "ACCEPTED" : "REJECTED",
    metrics: {
      errorsBefore: before,
      errorsAfter: after,
      sourcesReplayed: args.sources.length,
      goldenOk,
    },
  };
  return {
    accepted,
    reason,
    errorsBefore: before,
    errorsAfter: after,
    sourcesReplayed: args.sources.length,
    goldenOk,
    rule,
  };
}

/** Default golden: empty ruleset computation still certifies as COMPUTED_NOT_CERTIFIED. */
export function defaultCertificationGolden(buildPkg: () => ComputationPackage): GoldenCheck {
  return {
    name: "certification-uncertified",
    run: (ruleset) => {
      const result = runCovenantComputation(buildPkg(), { rules: ruleset });
      return result.certification === "COMPUTED_NOT_CERTIFIED";
    },
  };
}

export function baselineOnly(version = 0): LearnedRuleSet {
  return emptyRuleSet(version);
}
