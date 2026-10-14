/**
 * Executable, data-driven rule artifacts.
 * Hand-written code must not encode per-case patterns — only the engine,
 * safety gates, and learner may live in TypeScript; everything else is rules.
 *
 * Adjudication honesty:
 * - PROPOSED: synthesized, not yet replayed
 * - MECHANICALLY_REPLAYED: passed the held-out generalization gate (sweep) or the
 *   lower-level replay measurement. Not independent legal adjudication.
 * - INDEPENDENTLY_VERIFIED: requires substantive held-out legal adjudication (not automatic).
 *   The sweep generalization gate must never set this state.
 *
 * Production/compute paths must never treat MECHANICALLY_REPLAYED as verified legal authority.
 */

import type { BasketCategory } from "../../contract-model/covenant-computation/types";

export const LEARNED_RULES_SCHEMA = "clf.learned-rules.v1" as const;
export const AUTHORITY_STATUS = "COMPUTED_NOT_CERTIFIED" as const;

export type LearnedRuleKind =
  | "PHRASE_PATTERN"
  | "DEFINITION_ALIAS"
  | "GROWER_FORM"
  | "SECTION_MAPPING"
  | "CATEGORY_HINT";

/**
 * Learned-rule lifecycle states.
 * Legacy "ACCEPTED" in on-disk JSON is normalized to MECHANICALLY_REPLAYED on load.
 */
export type LearnedRuleState =
  | "PROPOSED"
  | "MECHANICALLY_REPLAYED"
  | "INDEPENDENTLY_VERIFIED"
  | "REJECTED"
  | "SUPERSEDED"
  /** @deprecated Read-only legacy alias for MECHANICALLY_REPLAYED. */
  | "ACCEPTED";

export interface LearnedRuleEffect {
  /** Covenant family hint for extraction (e.g. DEBT_INCURRENCE). */
  family?: string;
  /** Basket category hint for classification. */
  category?: BasketCategory;
  /** Canonical term this alias maps to. */
  aliasOf?: string;
  /** Section title/number → family. */
  sectionFamily?: string;
}

/** Evidence required to promote MECHANICALLY_REPLAYED → INDEPENDENTLY_VERIFIED. */
export interface IndependentVerificationEvidence {
  /** Held-out source ids — must be disjoint from synthesis and replay sets. */
  heldOutSourceIds: string[];
  /** Adjudicated golden expectation refs (package keys, fixture ids, or review records). */
  adjudicatedGoldenRefs: string[];
  /** Sources that motivated synthesis (ledger provenance). */
  synthesisSourceIds: string[];
  /** Sources used in the mechanical replay gate. */
  replaySourceIds: string[];
  reviewerNote: string;
  adjudicatedAt: string;
}

export interface LearnedRule {
  ruleId: string;
  /** Monotonic ruleset version that introduced or last advanced this rule. */
  version: number;
  kind: LearnedRuleKind;
  /** Regex source synthesized from ledger evidence — never free-form invention. */
  pattern: string;
  flags?: string;
  effect: LearnedRuleEffect;
  provenance: {
    ledgerErrorIds: string[];
    synthesizedAt: string;
    epoch: number;
    note?: string;
    /** Packages that contributed this cluster. The gate counts train packages only. */
    packageKeys?: string[];
    /** Distinct packages in packageKeys at synthesis time. */
    sourcesSpanned?: number;
    /** True when the pattern abstracts a slot (amount, term, synonym, anchor). */
    generalized?: boolean;
    /** Normalized clause skeleton used to cluster errors. */
    normalizedSignature?: string;
  };
  state: LearnedRuleState;
  metrics?: {
    errorsBefore: number;
    errorsAfter: number;
    sourcesReplayed: number;
    goldenOk: boolean;
    /** Explicit: replay gate is mechanical, not independent legal adjudication. */
    adjudicationClass?: "MECHANICAL_REPLAY" | "INDEPENDENT_HELD_OUT";
    /** Errors removed on the train packages the rule was built from. */
    trainFixed?: number;
    /** Errors removed on held-out packages the rule was not built from. */
    heldoutFixed?: number;
    /** Distinct train packages supporting the rule. */
    sourcesSpanned?: number;
  };
  /** Present only when state === INDEPENDENTLY_VERIFIED. */
  independentVerification?: IndependentVerificationEvidence;
}

export interface LearnedRuleSet {
  schemaVersion: typeof LEARNED_RULES_SCHEMA;
  rulesetVersion: number;
  authorityStatus: typeof AUTHORITY_STATUS;
  rules: LearnedRule[];
  updatedAt: string;
  /** Provenance of the file itself. */
  writtenFrom?: {
    epoch: number;
    /** Rule ids advanced to MECHANICALLY_REPLAYED this write. */
    mechanicallyReplayedRuleIds: string[];
    rejectedRuleIds: string[];
    /** @deprecated legacy key — prefer mechanicallyReplayedRuleIds */
    acceptedRuleIds?: string[];
  };
}

export function emptyRuleSet(version = 0): LearnedRuleSet {
  return {
    schemaVersion: LEARNED_RULES_SCHEMA,
    rulesetVersion: version,
    authorityStatus: AUTHORITY_STATUS,
    rules: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Normalize legacy ACCEPTED → MECHANICALLY_REPLAYED. */
export function normalizeLearnedRuleState(state: string): LearnedRuleState {
  if (state === "ACCEPTED") return "MECHANICALLY_REPLAYED";
  return state as LearnedRuleState;
}

export function normalizeLearnedRule(rule: LearnedRule): LearnedRule {
  const state = normalizeLearnedRuleState(rule.state);
  return state === rule.state ? rule : { ...rule, state };
}

export function normalizeLearnedRuleSet(ruleset: LearnedRuleSet): LearnedRuleSet {
  return {
    ...ruleset,
    authorityStatus: AUTHORITY_STATUS,
    rules: ruleset.rules.map(normalizeLearnedRule),
    writtenFrom: ruleset.writtenFrom
      ? {
          ...ruleset.writtenFrom,
          mechanicallyReplayedRuleIds:
            ruleset.writtenFrom.mechanicallyReplayedRuleIds ??
            ruleset.writtenFrom.acceptedRuleIds ??
            [],
        }
      : undefined,
  };
}

/**
 * Rules loadable by the extractor at runtime (COMPUTED_NOT_CERTIFIED only).
 * Includes MECHANICALLY_REPLAYED and INDEPENDENTLY_VERIFIED — never implies production authority.
 */
export function loadableRules(ruleset: LearnedRuleSet): LearnedRule[] {
  return ruleset.rules
    .map(normalizeLearnedRule)
    .filter(
      (r) =>
        r.state === "MECHANICALLY_REPLAYED" ||
        r.state === "INDEPENDENTLY_VERIFIED" ||
        r.state === "ACCEPTED",
    );
}

/** @deprecated Use loadableRules — name "accepted" implied legal acceptance. */
export function acceptedRules(ruleset: LearnedRuleSet): LearnedRule[] {
  return loadableRules(ruleset);
}

export function independentlyVerifiedRules(ruleset: LearnedRuleSet): LearnedRule[] {
  return ruleset.rules
    .map(normalizeLearnedRule)
    .filter((r) => r.state === "INDEPENDENTLY_VERIFIED");
}

export function isIndependentlyVerified(rule: LearnedRule): boolean {
  return normalizeLearnedRuleState(rule.state) === "INDEPENDENTLY_VERIFIED";
}

/** True when the rule passed only the mechanical replay gate. */
export function isMechanicallyReplayedOnly(rule: LearnedRule): boolean {
  const s = normalizeLearnedRuleState(rule.state);
  return s === "MECHANICALLY_REPLAYED" || s === "ACCEPTED";
}

export function compileRuleRegex(rule: LearnedRule): RegExp | null {
  try {
    return new RegExp(rule.pattern, rule.flags ?? "i");
  } catch {
    return null;
  }
}
