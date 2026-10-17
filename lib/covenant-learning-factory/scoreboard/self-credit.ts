/**
 * Scoreboard self-credit guard (deterministic, no AI).
 *
 * Learned PHRASE_PATTERN rules are synthesized from the scoreboard's own precedent items: the rule's pattern is the
 * opening of one item (or the shared opening of a cluster of items), and its family is that item's label. Matching a
 * candidate with a rule seeded from that candidate, or from the same document, re-finds memorized text; it is not
 * evidence of discovery. The guard refuses that credit.
 *
 * Seed provenance is derived generically from the ruleset and the scored inputs: a rule's seed items are the precedent
 * items (candidates, conditions, definitions) whose excerpt BEGINS with the rule's pattern; its seed documents are the
 * sources holding them (by sourceId and by contentSha256, so a duplicate copy of a seed document is also refused).
 * Several seed documents (a cluster, or the same opening in two documents) are all refused: we cannot tell which one
 * the rule came from, so we fail closed. A capture rule with no derivable seed earns no credit anywhere and is counted.
 */
import { createHash } from "node:crypto";
import { phrasePatternCaptureRules } from "../learned-rules/apply";
import { compileRuleRegex, type LearnedRule, type LearnedRuleSet } from "../learned-rules/types";
import { canonicalJson } from "./integrity";

export const SEED_PROVENANCE_SCHEMA = "clf-rule-seed-provenance/v1" as const;
export const LEARNED_BASKET_PREFIX = "learned-";

/** Credit-refusal reasons (stable strings; they key the report counts). */
export const REFUSED_SELF_SEEDED = "SELF_SEEDED";
export const REFUSED_NO_PROVENANCE = "NO_PROVENANCE";

export interface RuleSeedItem {
  sourceId: string;
  contentSha256: string | null;
  kind: "candidate" | "condition" | "definition";
  itemId: string;
}

export interface RuleSeedProvenance {
  /** Distinct seed documents. Empty = no derivable seed (fails closed). */
  sourceIds: string[];
  contentSha256s: string[];
  items: RuleSeedItem[];
}

export interface SeedProvenanceFile {
  schema: typeof SEED_PROVENANCE_SCHEMA;
  method: string;
  /** Bound to the exact ruleset and inputs it was derived from; any mismatch = every rule lacks provenance. */
  rulesetSha256: string;
  snapshotSha256: string;
  summary: { captureRules: number; withSeed: number; withoutSeed: number; multiSourceSeed: number };
  rules: Record<string, RuleSeedProvenance>;
}

export const SEED_METHOD =
  "seed items = precedent items (candidates, conditions, definitions) whose excerpt begins with the rule pattern " +
  "(sticky match at the first non-space character); seed documents = their sourceIds and contentSha256s";

export interface SeedInputSource {
  source: { sourceId: string; contentSha256?: string | null };
  candidates: { candidateId: string; excerpt?: string | null }[];
  conditions: { conditionId: string; excerpt?: string | null }[];
  definitions: { definitionId: string; body?: string | null }[];
}

function stickyRegex(rule: LearnedRule): RegExp | null {
  const re = compileRuleRegex(rule);
  if (!re) return null;
  try {
    return new RegExp(re.source, re.flags.replace(/[gy]/g, "") + "y");
  } catch {
    return null;
  }
}

function beginsWith(re: RegExp, text: string | null | undefined): boolean {
  if (!text) return false;
  const lead = /^\s*/.exec(text)![0].length;
  re.lastIndex = lead;
  return re.test(text);
}

/** Derive seed provenance for every learned capture rule (the only rules that create match-earning baskets). */
export function deriveSeedProvenance(
  rules: LearnedRuleSet,
  sources: readonly SeedInputSource[],
  ids: { rulesetSha256: string; snapshotSha256: string },
): SeedProvenanceFile {
  const out: Record<string, RuleSeedProvenance> = {};
  let withSeed = 0;
  let multi = 0;
  const capture = phrasePatternCaptureRules(rules);
  for (const rule of capture) {
    const re = stickyRegex(rule);
    const items: RuleSeedItem[] = [];
    if (re) {
      for (const s of sources) {
        const sha = s.source.contentSha256 ?? null;
        const add = (kind: RuleSeedItem["kind"], itemId: string, text: string | null | undefined) => {
          if (beginsWith(re, text)) items.push({ sourceId: s.source.sourceId, contentSha256: sha, kind, itemId });
        };
        for (const c of s.candidates) add("candidate", c.candidateId, c.excerpt);
        for (const c of s.conditions) add("condition", c.conditionId, c.excerpt);
        for (const d of s.definitions) add("definition", d.definitionId, d.body);
      }
    }
    const sourceIds = [...new Set(items.map((i) => i.sourceId))].sort();
    const contentSha256s = [...new Set(items.map((i) => i.contentSha256).filter((x): x is string => Boolean(x)))].sort();
    if (sourceIds.length) withSeed += 1;
    if (sourceIds.length > 1) multi += 1;
    out[rule.ruleId] = { sourceIds, contentSha256s, items };
  }
  return {
    schema: SEED_PROVENANCE_SCHEMA,
    method: SEED_METHOD,
    rulesetSha256: ids.rulesetSha256,
    snapshotSha256: ids.snapshotSha256,
    summary: { captureRules: capture.length, withSeed, withoutSeed: capture.length - withSeed, multiSourceSeed: multi },
    rules: out,
  };
}

export interface SelfCreditGuard {
  /** null = the basket may earn credit in this source; otherwise the refusal reason. */
  refusal(basket: { stableKey: string }, source: { sourceId: string; contentSha256?: string | null }): string | null;
  /** Capture rules with no usable provenance (no seed, or provenance bound to another ruleset/snapshot). */
  rulesWithoutProvenance: number;
  /** Why provenance is unusable as a whole (null when it is bound to this ruleset and snapshot). */
  unboundReason: string | null;
}

/**
 * Build the guard for one evaluation. Provenance that is missing, malformed, or bound to a different ruleset or
 * snapshot is treated as absent for every rule (fail closed: learned captures earn no credit at all).
 */
export function selfCreditGuard(
  rules: LearnedRuleSet,
  provenance: SeedProvenanceFile | null,
  ids: { rulesetSha256: string; snapshotSha256: string | null },
): SelfCreditGuard {
  const captureIds = new Set(phrasePatternCaptureRules(rules).map((r) => r.ruleId));
  let unboundReason: string | null = null;
  if (!provenance) unboundReason = "no seed provenance supplied";
  else if (provenance.schema !== SEED_PROVENANCE_SCHEMA) unboundReason = `unsupported provenance schema ${String(provenance.schema)}`;
  else if (provenance.rulesetSha256 !== ids.rulesetSha256) unboundReason = `provenance ruleset ${provenance.rulesetSha256.slice(0, 12)} ≠ scored ruleset ${ids.rulesetSha256.slice(0, 12)}`;
  else if (!ids.snapshotSha256 || provenance.snapshotSha256 !== ids.snapshotSha256) unboundReason = `provenance snapshot ${provenance.snapshotSha256.slice(0, 12)} ≠ scored inputs ${(ids.snapshotSha256 ?? "NONE").slice(0, 12)}`;
  const table = unboundReason ? {} : provenance!.rules;
  const seeded = new Map<string, { ids: Set<string>; shas: Set<string> }>();
  for (const id of captureIds) {
    const p = table[id];
    if (p && Array.isArray(p.sourceIds) && p.sourceIds.length > 0) seeded.set(id, { ids: new Set(p.sourceIds), shas: new Set(p.contentSha256s ?? []) });
  }
  return {
    rulesWithoutProvenance: captureIds.size - seeded.size,
    unboundReason,
    refusal(basket, source) {
      if (!basket.stableKey.startsWith(LEARNED_BASKET_PREFIX)) return null;
      const ruleId = basket.stableKey.slice(LEARNED_BASKET_PREFIX.length);
      const p = seeded.get(ruleId);
      if (!p) return REFUSED_NO_PROVENANCE;
      if (p.ids.has(source.sourceId) || (source.contentSha256 && p.shas.has(source.contentSha256))) return REFUSED_SELF_SEEDED;
      return null;
    },
  };
}

/** sha256 of a provenance file's canonical JSON (recorded in reports for traceability). */
export function provenanceSha256(p: SeedProvenanceFile): string {
  return createHash("sha256").update(canonicalJson(p)).digest("hex");
}
