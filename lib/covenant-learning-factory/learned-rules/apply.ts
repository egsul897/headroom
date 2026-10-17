/**
 * Runtime application of learned rules inside the covenant extractor/classifier.
 * Rules are data; this module only matches and applies effects.
 */

import type { BasketCategory } from "../../contract-model/covenant-computation/types";
import {
  loadableRules,
  compileRuleRegex,
  type LearnedRule,
  type LearnedRuleSet,
} from "./types";

export interface CategoryHintMatch {
  category: BasketCategory;
  ruleId: string;
}

export interface FamilyHintMatch {
  family: string;
  ruleId: string;
}

export interface SectionMappingMatch {
  sectionFamily: string;
  ruleId: string;
}

export interface AliasMatch {
  aliasOf: string;
  ruleId: string;
}

function activeOfKind(ruleset: LearnedRuleSet | undefined, kind: LearnedRule["kind"]): LearnedRule[] {
  if (!ruleset) return [];
  return loadableRules(ruleset).filter((r) => r.kind === kind);
}

/** First matching CATEGORY_HINT / GROWER_FORM wins (deterministic by ruleId). */
export function applyCategoryHints(text: string, ruleset?: LearnedRuleSet): CategoryHintMatch | null {
  const rules = [
    ...activeOfKind(ruleset, "CATEGORY_HINT"),
    ...activeOfKind(ruleset, "GROWER_FORM"),
    ...activeOfKind(ruleset, "PHRASE_PATTERN"),
  ].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  for (const rule of rules) {
    if (!rule.effect.category) continue;
    const re = compileRuleRegex(rule);
    if (re && re.test(text)) return { category: rule.effect.category, ruleId: rule.ruleId };
  }
  return null;
}

export function applyFamilyHints(text: string, ruleset?: LearnedRuleSet): FamilyHintMatch | null {
  const rules = activeOfKind(ruleset, "PHRASE_PATTERN").sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  for (const rule of rules) {
    if (!rule.effect.family) continue;
    const re = compileRuleRegex(rule);
    if (re && re.test(text)) return { family: rule.effect.family, ruleId: rule.ruleId };
  }
  return null;
}

export function applySectionMappings(title: string, ruleset?: LearnedRuleSet): SectionMappingMatch | null {
  const rules = activeOfKind(ruleset, "SECTION_MAPPING").sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  for (const rule of rules) {
    if (!rule.effect.sectionFamily) continue;
    const re = compileRuleRegex(rule);
    if (re && re.test(title)) return { sectionFamily: rule.effect.sectionFamily, ruleId: rule.ruleId };
  }
  return null;
}

export function applyDefinitionAlias(term: string, ruleset?: LearnedRuleSet): AliasMatch | null {
  const rules = activeOfKind(ruleset, "DEFINITION_ALIAS").sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  for (const rule of rules) {
    if (!rule.effect.aliasOf) continue;
    const re = compileRuleRegex(rule);
    if (re && re.test(term)) return { aliasOf: rule.effect.aliasOf, ruleId: rule.ruleId };
  }
  return null;
}

/**
 * Rules that should capture missed document spans into baskets during extract.
 * PHRASE_PATTERN with a family, plus SECTION_MAPPING (sectionFamily → family).
 */
export function phrasePatternCaptureRules(ruleset?: LearnedRuleSet): LearnedRule[] {
  if (!ruleset) return [];
  return loadableRules(ruleset)
    .filter(
      (r) =>
        (r.kind === "PHRASE_PATTERN" && Boolean(r.effect.family || r.effect.sectionFamily)) ||
        (r.kind === "SECTION_MAPPING" && Boolean(r.effect.sectionFamily)),
    )
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}
