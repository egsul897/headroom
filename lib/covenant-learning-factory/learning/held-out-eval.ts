/**
 * Per-rule attribution for issuer-held-out validation of learned capture rules.
 * Scores one source exactly as the scoreboard does (same package build, computation, tree locator and self-check),
 * refusing learned credit in each rule's own support documents, and attributes to each learned rule:
 *   credited    – candidates credited only by that rule's basket,
 *   unsupported – UNSUPPORTED_SEMANTICS errors raised on that rule's basket,
 *   baskets     – baskets the rule created.
 * Used on DEV only; the evaluation split is never consulted while choosing rules.
 */
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import type { LearnedRuleSet } from "../learned-rules/types";
import { buildComputationPackage } from "../sweep/build-package";
import { candidatesAsRows } from "../sweep/neon-load";
import { buildTreeLocator } from "../sweep/tree-locator";
import { selfCheckComputation } from "../sweep/self-check";
import type { ScoreboardSourceInput } from "../scoreboard";

const FIXED_NOW = "1970-01-01T00:00:00.000Z";
const LEARNED = "learned-";

export interface RuleAttribution {
  credited: number;
  unsupported: number;
  baskets: number;
}

export interface AttributedScore {
  total: number;
  counts: Record<string, number>;
  perRule: Record<string, RuleAttribution>;
  /** DISCOVERY_GAP candidate ids and COVERAGE_GAP condition ids (the learning signal). */
  gapCandidateIds: string[];
  gapConditionIds: string[];
}

export function scoreWithAttribution(
  input: ScoreboardSourceInput,
  rules: LearnedRuleSet,
  supportOf: (ruleId: string) => ReadonlySet<string>,
): AttributedScore {
  const sourceId = input.source.sourceId;
  const pkg = buildComputationPackage({ source: input.source, documentText: input.documentText, candidates: candidatesAsRows(input.candidates), rules });
  const result = runCovenantComputation(pkg, { rules, createdAt: FIXED_NOW });
  const ruleOf = (k: string) => (k.startsWith(LEARNED) ? k.slice(LEARNED.length) : null);
  const credited: Record<string, number> = {};
  const errors = selfCheckComputation({
    packageKey: `clf-sweep:${sourceId}`,
    runId: `scoreboard:${sourceId}`,
    sourceId,
    result,
    candidates: input.candidates,
    definitions: input.definitions,
    conditions: input.conditions,
    now: FIXED_NOW,
    locator: process.env.CLF_SCOREBOARD_TREE === "0" ? undefined : buildTreeLocator({ documentText: input.documentText, candidates: input.candidates }),
    creditRefusal: (b) => {
      const r = ruleOf(b.stableKey);
      return r && supportOf(r).has(sourceId) ? "SELF_SEEDED" : null;
    },
    creditStats: {},
    creditTag: (b) => ruleOf(b.stableKey),
    creditedStats: credited,
  });
  const perRule: Record<string, RuleAttribution> = {};
  const at = (r: string) => (perRule[r] ??= { credited: 0, unsupported: 0, baskets: 0 });
  for (const b of result.baskets) {
    const r = ruleOf(b.stableKey);
    if (r) at(r).baskets += 1;
  }
  for (const [r, n] of Object.entries(credited)) at(r).credited += n;
  const counts: Record<string, number> = { COVERAGE_GAP: 0, DISCOVERY_GAP: 0, UNSUPPORTED_SEMANTICS: 0 };
  const gapCandidateIds: string[] = [];
  const gapConditionIds: string[] = [];
  for (const e of errors) {
    if (!(e.class in counts)) continue;
    counts[e.class] += 1;
    const ev = (e.evidence ?? {}) as Record<string, unknown>;
    if (e.class === "UNSUPPORTED_SEMANTICS" && typeof ev.stableKey === "string") {
      const r = ruleOf(ev.stableKey);
      if (r) at(r).unsupported += 1;
    }
    if (e.class === "DISCOVERY_GAP" && typeof ev.candidateId === "string") gapCandidateIds.push(ev.candidateId);
    if (e.class === "COVERAGE_GAP" && typeof ev.conditionId === "string") gapConditionIds.push(ev.conditionId);
  }
  return { total: counts.COVERAGE_GAP + counts.DISCOVERY_GAP + counts.UNSUPPORTED_SEMANTICS, counts, perRule, gapCandidateIds, gapConditionIds };
}
