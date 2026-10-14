/**
 * Replay gate: accept a candidate rule only when measured errors strictly drop
 * and golden regression is clean.
 *
 * Measurement re-extracts baskets under the candidate ruleset and runs the same
 * self-check used in the sweep (including DISCOVERY_GAP against precedent candidates).
 */

import { runCovenantComputation } from "../../contract-model/covenant-computation";
import type { ComputationPackage } from "../../contract-model/covenant-computation/types";
import { buildComputationPackage, type PrecedentSourceRow } from "../sweep/build-package";
import { candidatesAsRows } from "../sweep/neon-load";
import {
  selfCheckComputation,
  type PrecedentCandidate,
} from "../sweep/self-check";
import type { LearnedRule, LearnedRuleSet } from "./types";
import { emptyRuleSet } from "./types";

export interface ReplaySource {
  sourceId: string;
  packageKey: string;
  /** Baseline package (informational); replay rebuilds from documentText + rules. */
  pkg: ComputationPackage;
  /** Full document text when available — required for re-extract under candidate rules. */
  documentText: string | null;
  /** Precedent candidates used for DISCOVERY_GAP self-check. */
  candidates: PrecedentCandidate[];
  /** Source row for package rebuild. */
  source: PrecedentSourceRow;
  /** Error count observed under the baseline / working ruleset for this source. */
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

export function withProposedRule(base: LearnedRuleSet, candidate: LearnedRule): LearnedRuleSet {
  return {
    ...base,
    rules: [
      ...base.rules.filter((r) => r.ruleId !== candidate.ruleId),
      {
        ...candidate,
        // Replay-gate pass = mechanical only — never INDEPENDENTLY_VERIFIED.
        state: "MECHANICALLY_REPLAYED",
        metrics: {
          errorsBefore: candidate.metrics?.errorsBefore ?? 0,
          errorsAfter: candidate.metrics?.errorsAfter ?? 0,
          sourcesReplayed: candidate.metrics?.sourcesReplayed ?? 0,
          goldenOk: candidate.metrics?.goldenOk ?? false,
          adjudicationClass: "MECHANICAL_REPLAY",
        },
      },
    ],
  };
}

/**
 * Rebuild package under ruleset, compute, self-check — count all ledger errors.
 * This is what the learner optimizes; CATEGORY_HINT-only measures are insufficient
 * when DISCOVERY_GAP dominates.
 */
export function countErrorsUnderRuleset(args: {
  source: PrecedentSourceRow;
  documentText: string | null;
  candidates: PrecedentCandidate[];
  ruleset: LearnedRuleSet;
  packageKey?: string;
}): number {
  const pkg = buildComputationPackage({
    source: args.source,
    documentText: args.documentText,
    candidates: candidatesAsRows(args.candidates),
    rules: args.ruleset,
  });
  const result = runCovenantComputation(pkg, { rules: args.ruleset });
  const errors = selfCheckComputation({
    packageKey: args.packageKey ?? pkg.packageKey,
    runId: "replay",
    sourceId: args.source.sourceId,
    result,
    candidates: args.candidates,
    definitions: [],
    conditions: [],
    now: "1970-01-01T00:00:00.000Z",
  });
  return errors.length;
}

export function measureReplaySource(source: ReplaySource, ruleset: LearnedRuleSet): number {
  return countErrorsUnderRuleset({
    source: source.source,
    documentText: source.documentText,
    candidates: source.candidates,
    ruleset,
    packageKey: source.packageKey,
  });
}

/**
 * Evaluate one candidate. Advance to MECHANICALLY_REPLAYED only if total errors
 * across replay sources strictly decrease and every golden check passes.
 *
 * This is NOT independent legal adjudication — signals are self-generated /
 * kf_precedent. Callers must not label the result as VERIFIED.
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
    after += measureReplaySource(source, candidateSet);
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
        : `mechanical replay improved (${before} → ${after}); state=MECHANICALLY_REPLAYED not INDEPENDENTLY_VERIFIED`;
  const rule: LearnedRule = {
    ...args.candidate,
    state: accepted ? "MECHANICALLY_REPLAYED" : "REJECTED",
    metrics: {
      errorsBefore: before,
      errorsAfter: after,
      sourcesReplayed: args.sources.length,
      goldenOk,
      adjudicationClass: accepted ? "MECHANICAL_REPLAY" : undefined,
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
