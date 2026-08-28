/**
 * Phase 3D - conservative compiler integration (task §19-§21). Bridges the
 * Phase 3B/3B.1 compiler (compile.ts, caller.ts, cache.ts - all UNMODIFIED;
 * this is a new, additive file, never a change to any existing compiler
 * file) with Phase 3D's reviewed semantic precedent library. Precedent
 * (semantic-precedent/) has no knowledge this file exists and never
 * imports it - the Independence Contract enforced by
 * semantic-precedent-independence.test.ts runs the OTHER direction
 * (precedent must never import compiler internals); the compiler MAY
 * consult precedent, exactly as this file does.
 *
 * TWO-PASS DESIGN (task §19's own "measuring whether precedent improves or
 * degrades performance" needs both a baseline and a precedent-informed
 * result to compare):
 *  - Pass 1: an ordinary, unmodified compileCovenantToIR() call - the
 *    baseline. No precedent involved, no prompt changed.
 *  - Pass 2 (only when Stage 1+2 retrieval finds bounded APPLICABLE
 *    precedent for at least one Pass-1 rule - task's own cost discipline:
 *    skip the second model call entirely, saving real money, when no
 *    relevant precedent exists, which is the common case): the SAME
 *    compileCovenantToIR() call again, with the bounded precedent advisory
 *    spliced into the context bundle as an ordinary ContextItem (type
 *    OTHER_REQUIRED_CONTEXT, an existing enum value - zero schema changes
 *    needed anywhere in Phase 2D/3B), clearly labeled "REVIEWED
 *    ANALOGICAL EVIDENCE" per task §17's own labeling requirement, flowing
 *    through caller.ts's existing, unmodified "already-gathered context"
 *    prompt section like any other context item.
 *
 * CACHE STALENESS (task §49): a precedent-augmented input's
 * contextBundle.contentIdentity is deterministically rehashed to fold in
 * every precedent id/version and the retrieval/applicability algorithm
 * versions actually used. compile.ts's own unmodified computeCacheKey
 * already keys on contentIdentity, so a precedent change can never
 * silently reuse a stale cached compilation. Pass 2 also always runs
 * against a fresh, single-use cache instance (never the module-level
 * defaultCache Pass 1 may have populated) so it can never accidentally
 * short-circuit on a Pass-1 cache entry.
 *
 * SOURCE ALWAYS WINS (task §16/§65(B), permanent invariant): after Pass 2,
 * every dollar amount or percentage literal appearing in Pass 2's rules
 * that is grounded in NEITHER Pass 1's own output NOR the raw operative
 * source text is treated as precedent contamination - Pass 2 is discarded
 * wholesale and Pass 1 (never touched by precedent) is returned as final.
 * This is a mechanical, generic check (regex over generic $/% patterns,
 * never a benchmark-specific literal) - prompt wording alone is never
 * trusted to keep precedent advisory.
 */
import { compileCovenantToIR } from "./compile";
import { InMemorySemanticCompilationCache } from "./cache";
import type { SemanticCaller } from "./caller";
import type { SemanticCompilationResult, SemanticCompilerInput } from "./types";
import { computeItemId } from "../context-retrieval/identity";
import type { ContextItem } from "../context-retrieval/types";
import { hashParts } from "../hashing";
import { computeSemanticSignature } from "../semantic-precedent/signature";
import { SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION } from "../semantic-precedent/retrieval";
import { SEMANTIC_PRECEDENT_APPLICABILITY_ALGORITHM_VERSION } from "../semantic-precedent/applicability";
import { retrievePrecedent } from "../semantic-precedent/retrieve";
import { extractCapacityLiterals } from "../semantic-precedent/corrections";
import type { GeneralizedPrecedent, PrecedentRetrievalMatch } from "../semantic-precedent/types";
import type { IRSharedCapacity } from "../../ir/types";

const DEFAULT_MAX_ADVISORY_PRECEDENTS = 3;

export interface PrecedentIntegrationOptions {
  caller?: SemanticCaller;
  maxAdvisoryPrecedents?: number;
  sharedCapacities?: IRSharedCapacity[];
}

export interface PrecedentIntegrationResult {
  baseline: SemanticCompilationResult;
  /** Null when no relevant precedent was found for any Pass-1 rule (the common case) - Pass 2 is never attempted then, saving a full model call. Also null when Pass 2 ran but was rejected for introducing an unsupported literal (see precedentRejectedAsUnsupported). */
  precedentAugmented: SemanticCompilationResult | null;
  /** Every retrieval match considered, across every Pass-1 rule - for audit/measurement (task §41), independent of whether any of them cleared the bounded advisory threshold. */
  precedentMatches: PrecedentRetrievalMatch[];
  /** True only when Pass 2 ran AND was discarded because it introduced a literal ungrounded in Pass 1 or the operative source text - the caller must treat `baseline` as final in that case. */
  precedentRejectedAsUnsupported: boolean;
}

function extractNumbersFromSourceText(text: string): Set<number> {
  const numbers = new Set<number>();
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) numbers.add(Number(m[1]!.replace(/,/g, "")));
  for (const m of text.matchAll(/([\d.]+)\s?%/g)) numbers.add(Number(m[1]));
  return numbers;
}

/**
 * The mechanical "source always wins" gate (task §16/§65(B)). Two
 * independent checks:
 *
 * 1. CATEGORICAL/STRUCTURAL STABILITY - Pass 1 already made its own
 *    action/posture/logic/condition/scope/dependency/shared-cap judgment
 *    with ZERO precedent influence. If Pass 2 disagrees on ANY of those
 *    dimensions for a rule the two passes otherwise identify as "the same
 *    rule" (matched by ruleId - stable across both calls here since ruleId
 *    is derived from candidateRef+the model's own localRef slot, not rule
 *    content, so the same slot in both submissions yields the same
 *    ruleId), or if the two passes propose a different NUMBER of rules at
 *    all, or if a ruleId appears on only one side, that disagreement
 *    itself is treated as contamination - reusing computeSemanticSignature
 *    (this module's sibling) for the comparison rather than hand-picking a
 *    few fields, since task §16's own permanent invariant explicitly names
 *    "amounts/percentages/ratios/metric names/conditions/entity scope" and
 *    a signature diff is exactly a structural-shape diff across all of
 *    those (mirrors corrections.ts's own reuse of the same function for
 *    the same reason). This is deliberately conservative: it means Pass 2
 *    can only ever confirm Pass 1's own shape with a possibly-different
 *    (still separately grounded, below) numeric value, never introduce a
 *    genuinely new structural conclusion - task's own "validate safety
 *    before optimizing cost/usefulness" bias, applied here.
 *
 * 2. ECONOMIC GROUNDING - only AMOUNT/PERCENT are checked (never metric
 *    names): a metric-name rephrasing can legitimately differ between two
 *    honest compilations of the same source (defined-term normalization)
 *    even with zero precedent influence, so treating that as contamination
 *    would produce false rejections and defeat Pass 2 unnecessarily - a
 *    real economic-value hallucination is what this half of the gate
 *    exists to catch.
 */
function isPrecedentContaminated(baseline: SemanticCompilationResult, precedentAugmented: SemanticCompilationResult, operativeSourceText: string): boolean {
  if (baseline.rules.length !== precedentAugmented.rules.length) return true;

  const baselineById = new Map(baseline.rules.map((r) => [r.ruleId, r] as const));
  const augmentedById = new Map(precedentAugmented.rules.map((r) => [r.ruleId, r] as const));
  for (const [ruleId, baselineRule] of baselineById) {
    const augmentedRule = augmentedById.get(ruleId);
    if (!augmentedRule) return true;
    const baselineSignature = computeSemanticSignature(baselineRule, { sharedCapacities: baseline.sharedCapacities });
    const augmentedSignature = computeSemanticSignature(augmentedRule, { sharedCapacities: precedentAugmented.sharedCapacities });
    if (JSON.stringify(baselineSignature) !== JSON.stringify(augmentedSignature)) return true;
  }
  for (const ruleId of augmentedById.keys()) {
    if (!baselineById.has(ruleId)) return true;
  }

  const groundedAmounts = new Set<number>();
  const groundedPercents = new Set<number>();
  for (const rule of baseline.rules) {
    const literals = extractCapacityLiterals(rule.capacityExpression);
    literals.amounts.forEach((a) => groundedAmounts.add(a));
    literals.percents.forEach((p) => groundedPercents.add(p));
  }
  const sourceNumbers = extractNumbersFromSourceText(operativeSourceText);

  for (const rule of precedentAugmented.rules) {
    const literals = extractCapacityLiterals(rule.capacityExpression);
    for (const amount of literals.amounts) {
      if (!groundedAmounts.has(amount) && !sourceNumbers.has(amount)) return true;
    }
    for (const percent of literals.percents) {
      // IR percents are fractions (0.125); source text states "12.5%" - check both representations.
      if (!groundedPercents.has(percent) && !sourceNumbers.has(percent) && !sourceNumbers.has(percent * 100)) return true;
    }
  }
  return false;
}

function buildPrecedentContextItem(precedents: GeneralizedPrecedent[], sourceDocumentId: string): ContextItem {
  const normalizedRef = precedents
    .map((p) => `${p.precedentId}@v${p.version}`)
    .sort()
    .join(",");
  const lines = precedents.map((p, i) => {
    const structural = p.structuralLessons.length > 0 ? ` Structural lessons: ${p.structuralLessons.join("; ")}.` : "";
    const dependency = p.dependencyLessons.length > 0 ? ` Dependency lessons: ${p.dependencyLessons.join("; ")}.` : "";
    return `${i + 1}. ${p.lessonDescription}${structural}${dependency}`;
  });

  return {
    itemId: computeItemId(sourceDocumentId, normalizedRef, "OTHER_REQUIRED_CONTEXT"),
    type: "OTHER_REQUIRED_CONTEXT",
    documentId: sourceDocumentId,
    structuralNodeKey: null,
    structuralNodeId: null,
    normalizedRef,
    sourceCitation: "reviewed semantic precedent library (Phase 3D)",
    excerptText: [
      "REVIEWED ANALOGICAL EVIDENCE (advisory only - this is NOT source text and never overrides the operative source text above; do not copy any amount, percentage, metric name, condition, or entity scope from this evidence unless it is independently supported by the operative source text or already-gathered context above):",
      ...lines,
    ].join("\n"),
    reason: "bounded, applicability-ranked reviewed precedent retrieved for this candidate's own compiled shape - advisory only, never authoritative",
    retrievalDepth: 0,
    retrievalPath: [],
    retrievalMethod: "SEMANTIC_RELEVANCE",
    confidence: null,
  };
}

function augmentInputWithPrecedent(input: SemanticCompilerInput, precedentItem: ContextItem, precedents: GeneralizedPrecedent[]): SemanticCompilerInput {
  const augmentedContentIdentity = hashParts([
    input.contextBundle.contentIdentity,
    "phase-3d-precedent-augmented",
    SEMANTIC_PRECEDENT_RETRIEVAL_ALGORITHM_VERSION,
    SEMANTIC_PRECEDENT_APPLICABILITY_ALGORITHM_VERSION,
    ...precedents.map((p) => `${p.precedentId}@v${p.version}`).sort(),
  ]);
  return {
    ...input,
    contextBundle: {
      ...input.contextBundle,
      items: [...input.contextBundle.items, precedentItem],
      contentIdentity: augmentedContentIdentity,
    },
  };
}

/**
 * Runs the two-pass precedent-integration flow described above.
 * `precedentPool` must already be filtered by the caller to the tenancy/
 * package-exclusion scope appropriate for this compilation (this function
 * has no concept of tenant or package, by design - task §9's own
 * mechanical anti-memorization requirement extends to this integration
 * layer too, exactly as it does to retrieve.ts).
 */
export async function compileCovenantToIRWithPrecedent(input: SemanticCompilerInput, precedentPool: GeneralizedPrecedent[], options: PrecedentIntegrationOptions = {}): Promise<PrecedentIntegrationResult> {
  const baseline = await compileCovenantToIR(input, { caller: options.caller });

  const allMatches: PrecedentRetrievalMatch[] = [];
  const advisoryScored: PrecedentRetrievalMatch[] = [];
  const maxAdvisory = options.maxAdvisoryPrecedents ?? DEFAULT_MAX_ADVISORY_PRECEDENTS;

  for (const rule of baseline.rules) {
    const signature = computeSemanticSignature(rule, { sharedCapacities: options.sharedCapacities });
    const retrieval = retrievePrecedent(`${input.candidateRef}::${rule.ruleId}`, signature, precedentPool, { maxAdvisoryPrecedents: maxAdvisory });
    allMatches.push(...retrieval.matches);
    for (const id of retrieval.boundedAdvisoryPrecedentIds) {
      const match = retrieval.matches.find((m) => m.precedentId === id);
      if (match) advisoryScored.push(match);
    }
  }

  const uniqueAdvisoryIds = [...new Map(advisoryScored.map((m) => [m.precedentId, m])).values()]
    .sort((a, b) => b.candidateScore - a.candidateScore)
    .slice(0, maxAdvisory)
    .map((m) => m.precedentId);

  if (uniqueAdvisoryIds.length === 0) {
    return { baseline, precedentAugmented: null, precedentMatches: allMatches, precedentRejectedAsUnsupported: false };
  }

  const precedentsById = new Map(precedentPool.map((p) => [p.precedentId, p]));
  const advisoryPrecedents = uniqueAdvisoryIds.map((id) => precedentsById.get(id)).filter((p): p is GeneralizedPrecedent => p !== undefined);

  const precedentItem = buildPrecedentContextItem(advisoryPrecedents, input.sourceDocumentId);
  const augmentedInput = augmentInputWithPrecedent(input, precedentItem, advisoryPrecedents);
  const precedentAugmentedRaw = await compileCovenantToIR(augmentedInput, { caller: options.caller, cache: new InMemorySemanticCompilationCache() });

  const contaminated = isPrecedentContaminated(baseline, precedentAugmentedRaw, input.operativeSourceText);
  return {
    baseline,
    precedentAugmented: contaminated ? null : precedentAugmentedRaw,
    precedentMatches: allMatches,
    precedentRejectedAsUnsupported: contaminated,
  };
}
