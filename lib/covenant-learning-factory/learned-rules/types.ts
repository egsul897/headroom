/**
 * Executable, data-driven rule artifacts.
 * Hand-written code must not encode per-case patterns — only the engine,
 * safety gates, and learner may live in TypeScript; everything else is rules.
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

export type LearnedRuleState = "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";

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

export interface LearnedRule {
  ruleId: string;
  /** Monotonic ruleset version that introduced or last accepted this rule. */
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
  };
  state: LearnedRuleState;
  metrics?: {
    errorsBefore: number;
    errorsAfter: number;
    sourcesReplayed: number;
    goldenOk: boolean;
  };
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
    acceptedRuleIds: string[];
    rejectedRuleIds: string[];
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

export function acceptedRules(ruleset: LearnedRuleSet): LearnedRule[] {
  return ruleset.rules.filter((r) => r.state === "ACCEPTED");
}

export function compileRuleRegex(rule: LearnedRule): RegExp | null {
  try {
    return new RegExp(rule.pattern, rule.flags ?? "i");
  } catch {
    return null;
  }
}
