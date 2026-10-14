/**
 * Held-out generalization gate for clf:sweep.
 *
 * A rule is MECHANICALLY_REPLAYED only when:
 * - its pattern is generalized (not a long literal excerpt)
 * - it was built from MIN_GENERALIZATION_SUPPORT or more distinct train packages
 * - those packages are disjoint from the held-out cohort
 * - held-out error count strictly falls, and no held-out package regresses
 * - every golden check still passes
 *
 * The cohort split is a deterministic hash of issuer (else package). It is not
 * a hand-coded issuer list. This gate never assigns INDEPENDENTLY_VERIFIED.
 */

import { createHash } from "node:crypto";
import { patternAbstractsSlot } from "./generalize";
import {
  measureReplaySource,
  withProposedRule,
  type GoldenCheck,
  type ReplaySource,
} from "./replay-gate";
import type { LearnedRule, LearnedRuleSet } from "./types";

export const MIN_GENERALIZATION_SUPPORT = 2;
const SPLIT_SALT = "clf-generalization-split-v1";

export type GeneralizationCohort = "TRAIN" | "HELD_OUT";

export interface GeneralizationGateResult {
  accepted: boolean;
  reason: string;
  errorsBefore: number;
  errorsAfter: number;
  sourcesReplayed: number;
  goldenOk: boolean;
  trainFixed: number;
  heldoutFixed: number;
  sourcesSpanned: number;
  rule: LearnedRule;
}

/**
 * Split key. Same issuer always lands on one side so a rule cannot train and
 * "hold out" on two packages of one issuer. Missing CIK falls back to package.
 */
export function generalizationSplitKey(args: {
  issuerCik?: string | null;
  packageKey?: string | null;
  sourceId?: string | null;
}): string {
  const digits = (args.issuerCik ?? "").replace(/\D/g, "");
  if (digits.length > 0 && !/^0+$/.test(digits)) {
    return `issuer:${digits.padStart(10, "0").slice(-10)}`;
  }
  const pkg = (args.packageKey || args.sourceId || "").trim();
  return `package:${pkg}`;
}

/** Deterministic 25% held-out. Stable for a given split key. */
export function assignGeneralizationCohort(splitKey: string): GeneralizationCohort {
  const digest = createHash("sha256").update(`${SPLIT_SALT}|${splitKey}`).digest();
  const n = digest.readUInt32BE(0);
  return n % 4 === 0 ? "HELD_OUT" : "TRAIN";
}

export function cohortForReplaySource(source: ReplaySource): GeneralizationCohort {
  return assignGeneralizationCohort(
    generalizationSplitKey({
      issuerCik: source.source.issuerCik,
      packageKey: source.packageKey,
      sourceId: source.sourceId,
    }),
  );
}

/**
 * Phrase and section rules must abstract a slot. Short structural anchors
 * (category / grower / alias) are already general; long escaped excerpts are not.
 */
export function ruleIsGeneralized(rule: LearnedRule): boolean {
  if (rule.kind === "PHRASE_PATTERN" || rule.kind === "SECTION_MAPPING") {
    return patternAbstractsSlot(rule.pattern);
  }
  const pieces = rule.pattern.split(/\\s\+/);
  const longLiteral = pieces.length >= 6 && pieces.every((p) => !/\\d|\(|\[/.test(p));
  return rule.pattern.length > 0 && rule.pattern.length <= 80 && !longLiteral;
}

/**
 * Search issuers until both cohorts are populated. Deterministic; not a
 * hard-coded issuer list. Tests and fixtures use this to build a split.
 */
export function findIssuersForGeneralizationSplit(
  trainCount: number,
  heldoutCount: number,
): { train: string[]; heldout: string[] } {
  const train: string[] = [];
  const heldout: string[] = [];
  for (let i = 1; train.length < trainCount || heldout.length < heldoutCount; i++) {
    if (i > 100000) throw new Error("generalization split search exhausted");
    const cik = String(i).padStart(10, "0");
    const cohort = assignGeneralizationCohort(generalizationSplitKey({ issuerCik: cik }));
    if (cohort === "TRAIN" && train.length < trainCount) train.push(cik);
    else if (cohort === "HELD_OUT" && heldout.length < heldoutCount) heldout.push(cik);
  }
  return { train, heldout };
}

function sumPair(
  sources: readonly ReplaySource[],
  baseline: LearnedRuleSet,
  candidateSet: LearnedRuleSet,
): { before: number; after: number; regression: boolean } {
  let before = 0;
  let after = 0;
  let regression = false;
  for (const source of sources) {
    const b = measureReplaySource(source, baseline);
    const a = measureReplaySource(source, candidateSet);
    if (a > b) regression = true;
    before += b;
    after += a;
  }
  return { before, after, regression };
}

/**
 * Accept only a generalized rule that improves held-out packages it was not
 * built from. State is MECHANICALLY_REPLAYED or REJECTED — never
 * INDEPENDENTLY_VERIFIED.
 */
export function evaluateGeneralizationGate(args: {
  baseline: LearnedRuleSet;
  candidate: LearnedRule;
  sources: ReplaySource[];
  goldens?: GoldenCheck[];
  minSupport?: number;
}): GeneralizationGateResult {
  const minSupport = args.minSupport ?? MIN_GENERALIZATION_SUPPORT;
  const byPackage = new Map<string, ReplaySource>();
  for (const source of args.sources) {
    if (!byPackage.has(source.packageKey)) byPackage.set(source.packageKey, source);
  }

  const supportKeys = [...new Set(args.candidate.provenance.packageKeys ?? [])];
  const trainKeys = supportKeys.filter((key) => {
    const src = byPackage.get(key);
    return src != null && cohortForReplaySource(src) === "TRAIN";
  });
  const sourcesSpanned = trainKeys.length;
  const builtFromHeldOut = supportKeys.some((key) => {
    const src = byPackage.get(key);
    return src != null && cohortForReplaySource(src) === "HELD_OUT";
  });

  const trainSources = args.sources.filter(
    (s) => trainKeys.includes(s.packageKey) && cohortForReplaySource(s) === "TRAIN",
  );
  const heldoutSources = args.sources.filter(
    (s) => cohortForReplaySource(s) === "HELD_OUT" && !supportKeys.includes(s.packageKey),
  );

  const candidateSet = withProposedRule(args.baseline, args.candidate);
  const train = sumPair(trainSources, args.baseline, candidateSet);
  const held = sumPair(heldoutSources, args.baseline, candidateSet);

  const goldens = args.goldens ?? [];
  let goldenOk = true;
  for (const g of goldens) {
    if (!g.run(candidateSet)) {
      goldenOk = false;
      break;
    }
  }

  const generalized = ruleIsGeneralized(args.candidate);
  const trainFixed = train.before - train.after;
  const heldoutFixed = held.before - held.after;
  const accepted =
    generalized &&
    !builtFromHeldOut &&
    sourcesSpanned >= minSupport &&
    heldoutSources.length > 0 &&
    goldenOk &&
    !held.regression &&
    held.after < held.before;

  const reason = !generalized
    ? "literal pattern is not a generalized rule"
    : builtFromHeldOut
      ? "rule was built from held-out packages"
      : sourcesSpanned < minSupport
        ? `support ${sourcesSpanned} < ${minSupport} distinct packages`
        : heldoutSources.length === 0
          ? "no held-out packages"
          : !goldenOk
            ? "golden regression"
            : held.regression
              ? "held-out regression"
              : held.after >= held.before
                ? `held-out errors did not drop (${held.before} → ${held.after})`
                : `mechanical replay improved held-out (${held.before} → ${held.after}); state=MECHANICALLY_REPLAYED not INDEPENDENTLY_VERIFIED`;

  const rule: LearnedRule = {
    ...args.candidate,
    state: accepted ? "MECHANICALLY_REPLAYED" : "REJECTED",
    metrics: {
      errorsBefore: train.before + held.before,
      errorsAfter: train.after + held.after,
      sourcesReplayed: trainSources.length + heldoutSources.length,
      goldenOk,
      adjudicationClass: accepted ? "MECHANICAL_REPLAY" : undefined,
      trainFixed,
      heldoutFixed,
      sourcesSpanned,
    },
  };

  return {
    accepted,
    reason,
    errorsBefore: train.before + held.before,
    errorsAfter: train.after + held.after,
    sourcesReplayed: trainSources.length + heldoutSources.length,
    goldenOk,
    trainFixed,
    heldoutFixed,
    sourcesSpanned,
    rule,
  };
}
