/**
 * Promotion gates for learned rules.
 *
 * MECHANICALLY_REPLAYED (replay gate vs kf_precedent / self-check signals)
 * must NEVER be treated as INDEPENDENTLY_VERIFIED or production VERIFIED.
 *
 * Promotion requires substantive held-out legal evidence — adjudicated golden
 * expectations from sources not used to synthesize or replay the rule.
 */

import { LearningFactoryLegalSafetyError } from "../promotion-guards";
import type {
  IndependentVerificationEvidence,
  LearnedRule,
  LearnedRuleState,
} from "./types";
import { isMechanicallyReplayedOnly, normalizeLearnedRuleState } from "./types";

export class LearnedRulePromotionError extends LearningFactoryLegalSafetyError {
  constructor(message: string) {
    super(message);
    this.name = "LearnedRulePromotionError";
  }
}

function setOf(ids: readonly string[]): Set<string> {
  return new Set(ids.map((s) => s.trim()).filter(Boolean));
}

function disjoint(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

/**
 * Validate held-out adjudication evidence. Throws if insufficient or contaminated.
 */
export function assertIndependentVerificationEvidence(
  evidence: IndependentVerificationEvidence,
): void {
  const heldOut = setOf(evidence.heldOutSourceIds);
  const synthesis = setOf(evidence.synthesisSourceIds);
  const replay = setOf(evidence.replaySourceIds);
  const goldens = evidence.adjudicatedGoldenRefs.map((s) => s.trim()).filter(Boolean);

  if (heldOut.size === 0) {
    throw new LearnedRulePromotionError(
      "INDEPENDENTLY_VERIFIED requires non-empty heldOutSourceIds (held-out legal sources)",
    );
  }
  if (goldens.length === 0) {
    throw new LearnedRulePromotionError(
      "INDEPENDENTLY_VERIFIED requires adjudicatedGoldenRefs (substantive held-out golden expectations)",
    );
  }
  if (!evidence.reviewerNote?.trim()) {
    throw new LearnedRulePromotionError(
      "INDEPENDENTLY_VERIFIED requires reviewerNote from attributable adjudication",
    );
  }
  if (!disjoint(heldOut, synthesis)) {
    throw new LearnedRulePromotionError(
      "held-out sources must be disjoint from synthesis sources (contamination)",
    );
  }
  if (!disjoint(heldOut, replay)) {
    throw new LearnedRulePromotionError(
      "held-out sources must be disjoint from mechanical replay sources (contamination)",
    );
  }
}

/**
 * Promote a MECHANICALLY_REPLAYED rule to INDEPENDENTLY_VERIFIED with evidence.
 * Automated replay paths must never call this without real held-out adjudication.
 */
export function promoteToIndependentlyVerified(
  rule: LearnedRule,
  evidence: IndependentVerificationEvidence,
): LearnedRule {
  const state = normalizeLearnedRuleState(rule.state);
  if (state !== "MECHANICALLY_REPLAYED" && state !== "ACCEPTED") {
    throw new LearnedRulePromotionError(
      `only MECHANICALLY_REPLAYED rules can be promoted (got ${rule.state})`,
    );
  }
  assertIndependentVerificationEvidence(evidence);
  return {
    ...rule,
    state: "INDEPENDENTLY_VERIFIED",
    independentVerification: evidence,
    metrics: {
      errorsBefore: rule.metrics?.errorsBefore ?? 0,
      errorsAfter: rule.metrics?.errorsAfter ?? 0,
      sourcesReplayed: rule.metrics?.sourcesReplayed ?? 0,
      goldenOk: rule.metrics?.goldenOk ?? false,
      adjudicationClass: "INDEPENDENT_HELD_OUT",
      trainFixed: rule.metrics?.trainFixed,
      heldoutFixed: rule.metrics?.heldoutFixed,
      sourcesSpanned: rule.metrics?.sourcesSpanned,
    },
  };
}

/**
 * Production/compute paths: refuse to treat mechanical replay as verified authority.
 */
export function assertNotTreatedAsVerifiedAuthority(rule: LearnedRule): void {
  if (isMechanicallyReplayedOnly(rule)) {
    throw new LearnedRulePromotionError(
      `rule ${rule.ruleId} is MECHANICALLY_REPLAYED only — not INDEPENDENTLY_VERIFIED; ` +
        `must not be treated as production VERIFIED / ContractRule authority`,
    );
  }
  const state = normalizeLearnedRuleState(rule.state);
  if (state === "PROPOSED" || state === "REJECTED" || state === "SUPERSEDED") {
    throw new LearnedRulePromotionError(
      `rule ${rule.ruleId} state ${state} is not verified legal authority`,
    );
  }
}

/** Map proposal/ledger state strings for Neon persistence. */
export function adjudicationStatusForState(state: LearnedRuleState): string {
  const n = normalizeLearnedRuleState(state);
  if (n === "INDEPENDENTLY_VERIFIED") return "INDEPENDENTLY_VERIFIED";
  if (n === "MECHANICALLY_REPLAYED" || n === "ACCEPTED") return "MECHANICALLY_REPLAYED";
  if (n === "REJECTED") return "REJECTED";
  if (n === "SUPERSEDED") return "SUPERSEDED";
  return "PROPOSED";
}
