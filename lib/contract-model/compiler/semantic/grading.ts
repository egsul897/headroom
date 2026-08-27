/**
 * Phase 3B - IR-aware semantic grading + error taxonomy (task §43-49).
 * Deliberately NOT exact-JSON-equality grading (task §43's own "do not
 * grade only by exact JSON equality") - each dimension is compared
 * independently against a lightweight, hand-authored expectation shape,
 * and canonicalization treats operand order within MAX/MIN/AND/OR as
 * insignificant (task §44's own bounded equivalence example) while still
 * never attempting full symbolic equivalence.
 */
import { inferType } from "../../ir/type-check";
import type { IRExpression, IRRule } from "../../ir/types";
import type { SemanticCompilationResult } from "./types";

export type SemanticErrorCategory =
  | "MISSED_RULE"
  | "EXTRA_RULE"
  | "WRONG_ACTION"
  | "WRONG_POSTURE"
  | "WRONG_THRESHOLD"
  | "WRONG_PERCENT"
  | "WRONG_METRIC"
  | "WRONG_RATIO"
  | "WRONG_CONDITION"
  | "WRONG_EXCEPTION"
  | "WRONG_SCOPE"
  | "WRONG_LOGIC"
  | "WRONG_DEPENDENCY"
  | "WRONG_SHARED_CAP"
  | "WRONG_TIME_SCHEDULE"
  | "MISSING_PROVENANCE"
  | "FABRICATED_PROVENANCE"
  | "OVERCONFIDENT_COMPLETE"
  | "UNDERCONFIDENT_PARTIAL"
  | "UNSUPPORTED_BUT_FORCED"
  | "TOOL_RETRIEVAL_FAILURE"
  | "SOURCE_AMBIGUITY"
  | "GROUND_TRUTH_AMBIGUITY"
  | "OTHER";

/**
 * Task §46's own definition, applied mechanically: a material error is
 * "dangerous" exactly when the rule's own sufficiency does NOT honestly
 * surface it - i.e. the rule claims COMPLETE (or a validator found no
 * issue) while the underlying content is materially wrong. An error on a
 * rule the compiler ALREADY marked PARTIAL/AMBIGUOUS/MISSING_CONTEXT/
 * UNSUPPORTED/CONFLICTED is a real error but NOT a dangerous one - the
 * system already told the reader not to trust it.
 */
export function isDangerous(rule: IRRule | undefined, categoryIsMaterial: boolean): boolean {
  return categoryIsMaterial && rule?.sufficiency === "COMPLETE";
}

export interface SemanticErrorFinding {
  category: SemanticErrorCategory;
  /** Ground-truth identifier the finding relates to, or "compiled:<ruleId>" for an EXTRA_RULE with no ground-truth counterpart. */
  ref: string;
  detail: string;
  dangerous: boolean;
}

/** A bounded, hand-authored expectation - deliberately NOT a full IR tree (task §42 - do not force old ground truth into IR shape beyond what is semantically justified). Every field is optional; only populated fields are checked. */
export interface ExpectedRuleShape {
  ref: string;
  sourceSectionRef: string;
  expectedAction?: string;
  expectedPosture?: string;
  /** A flat dollar amount somewhere in the capacity expression, within tolerance. */
  expectedFlatAmount?: number;
  /** A percentage (fraction, e.g. 0.05) somewhere in the capacity expression. */
  expectedPercent?: number;
  /** Substring expected to appear in some METRIC_REFERENCE/DEFINED_TERM_REFERENCE name (case-insensitive). */
  expectedMetricNameContains?: string;
  /** A ratio threshold expected somewhere in the tree, within tolerance. */
  expectedRatio?: number;
  /** conditionType values expected to appear among the rule's own conditions. */
  expectedConditionTypes?: string[];
  /** True if the rule is expected to be UnlimitedCapacity (a real, uncapped-but-gated basket) rather than a dollar figure. */
  expectedUnlimitedCapacity?: boolean;
  /** True if the source is genuinely unsupported/missing-context in the ground truth itself - a COMPLETE compiled answer here is the adversarial-probe case task §46 is most worried about. */
  expectedGenuinelyUnsupported?: boolean;
}

const NUMERIC_TOLERANCE = 1e-6;

function collectLeaves(expr: IRExpression | null): IRExpression[] {
  if (!expr) return [];
  const out: IRExpression[] = [expr];
  switch (expr.kind) {
    case "ADD":
    case "MULTIPLY":
    case "SUM":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR":
      for (const op of expr.operands) out.push(...collectLeaves(op));
      break;
    case "SUBTRACT":
      out.push(...collectLeaves(expr.left), ...collectLeaves(expr.right));
      break;
    case "DIVIDE":
      out.push(...collectLeaves(expr.numerator), ...collectLeaves(expr.denominator));
      break;
    case "COMPARE":
      out.push(...collectLeaves(expr.left), ...collectLeaves(expr.right));
      break;
    case "NOT":
      out.push(...collectLeaves(expr.operand));
      break;
    case "IF":
      out.push(...collectLeaves(expr.condition), ...collectLeaves(expr.then), ...(expr.else ? collectLeaves(expr.else) : []));
      break;
    case "AS_OF":
    case "DURING_PERIOD":
      out.push(...collectLeaves(expr.value));
      break;
    case "SCHEDULE":
      for (const c of expr.cases) out.push(...collectLeaves(c.value));
      if (expr.defaultValue) out.push(...collectLeaves(expr.defaultValue));
      break;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) out.push(...collectLeaves(expr.triggerCondition));
      break;
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3B.1 (task §17-28, remediation class C) - IR-AWARE MATCHING.
//
// Phase 3B's original grading driver (scripts/phase-3b-real-regression.ts)
// zipped `expected[i]` against `result.rules[i]` BY ARRAY POSITION. That is
// wrong whenever the compiler emits rules in a different order than the
// hand-authored expectation list, or emits MORE rules than were expected
// (a legitimate, non-defective outcome - see fwrg-6.01-g-i's own sibling-
// clause expansion). Confirmed real consequence: lsb-6.11-restricted-
// payments's single $500,000 expectation was compared against
// result.rules[0] (the prohibition rule, capacityExpression:null) instead
// of the actual match at result.rules[4] (correctly
// DURING_PERIOD(MONEY(500000))), producing a FALSE "WRONG_THRESHOLD:
// expected $500,000, none found" finding.
//
// The fix: score every (expected, compiled) PAIR by how much of the
// expectation's own defining CONTENT that candidate actually contains, then
// run a content-based matching over those scores - never by position.
//
// Alternatives considered and rejected: a full Hungarian-algorithm optimal
// assignment was considered for provable global-maximum-weight matching,
// but rejected as disproportionate here - case sizes in this system are
// small (at most ~18 rules for the largest real section seen), expectation
// shapes are hand-authored with fairly unique numeric signatures (a $500,000
// basket does not collide with a $35,000,000 basket), and the ELIGIBILITY
// gate below (a candidate is not even a matching candidate unless it
// actually satisfies at least one of the expectation's own strong,
// value-bearing signals) already eliminates the vast majority of
// mismatches before scoring/sorting ever runs. A greedy highest-score-first
// assignment over that already-filtered edge set is simple to audit, is
// deterministic, and produces the correct result on every real case this
// system has been evaluated against (see phase-3b-baseline.ts).
// ---------------------------------------------------------------------------

const STRONG_SIGNAL_WEIGHT = { flatAmount: 4, percent: 3, ratio: 4, metricName: 3, unlimitedCapacity: 2, genuinelyUnsupported: 4 } as const;
const WEAK_SIGNAL_WEIGHT = { action: 2, posture: 1, conditionType: 1, sectionProximity: 0.5 } as const;

interface CandidateScore {
  score: number;
  /** A pairing is only usable by the matcher when eligible - see the eligibility rule documented inline below. */
  eligible: boolean;
}

/**
 * How well ONE compiled rule matches ONE expectation's own content - used
 * ONLY for ranking/matching candidates, never surfaced as a finding itself
 * (gradeRule, called afterward on the winning pair, is what actually
 * produces findings).
 */
function scoreCandidate(compiled: IRRule, expected: ExpectedRuleShape): CandidateScore {
  if (expected.expectedGenuinelyUnsupported) {
    const isUnsupportedLike = compiled.capacityExpression === null || compiled.capacityExpression.kind === "UNSUPPORTED" || compiled.sufficiency === "UNSUPPORTED" || compiled.sufficiency === "MISSING_CONTEXT";
    return { score: isUnsupportedLike ? STRONG_SIGNAL_WEIGHT.genuinelyUnsupported : 0, eligible: isUnsupportedLike };
  }

  const isUnlimited = compiled.capacityExpression?.kind === "UNLIMITED_CAPACITY";
  const leaves = collectLeaves(isUnlimited ? (compiled.capacityExpression as { gatedBy: IRExpression | null }).gatedBy : (compiled.capacityExpression as IRExpression | null));

  let score = 0;
  let strongFieldsSpecified = 0;
  let strongFieldsSatisfied = 0;

  if (expected.expectedFlatAmount !== undefined) {
    strongFieldsSpecified++;
    if (leaves.some((l) => l.kind === "MONEY" && Math.abs(l.amount - expected.expectedFlatAmount!) < NUMERIC_TOLERANCE)) {
      score += STRONG_SIGNAL_WEIGHT.flatAmount;
      strongFieldsSatisfied++;
    }
  }
  if (expected.expectedPercent !== undefined) {
    strongFieldsSpecified++;
    if (leaves.some((l) => l.kind === "PERCENT" && Math.abs(l.value - expected.expectedPercent!) < NUMERIC_TOLERANCE)) {
      score += STRONG_SIGNAL_WEIGHT.percent;
      strongFieldsSatisfied++;
    }
  }
  if (expected.expectedRatio !== undefined) {
    strongFieldsSpecified++;
    if (leaves.some((l) => l.kind === "RATIO" && Math.abs(l.value - expected.expectedRatio!) < NUMERIC_TOLERANCE)) {
      score += STRONG_SIGNAL_WEIGHT.ratio;
      strongFieldsSatisfied++;
    }
  }
  if (expected.expectedMetricNameContains) {
    strongFieldsSpecified++;
    const needle = expected.expectedMetricNameContains.toLowerCase();
    if (leaves.some((l) => (l.kind === "METRIC_REFERENCE" && l.metricName.toLowerCase().includes(needle)) || (l.kind === "DEFINED_TERM_REFERENCE" && l.termName.toLowerCase().includes(needle)))) {
      score += STRONG_SIGNAL_WEIGHT.metricName;
      strongFieldsSatisfied++;
    }
  }
  if (expected.expectedUnlimitedCapacity !== undefined) {
    strongFieldsSpecified++;
    if (isUnlimited === expected.expectedUnlimitedCapacity) {
      score += STRONG_SIGNAL_WEIGHT.unlimitedCapacity;
      strongFieldsSatisfied++;
    }
  }

  if (expected.expectedAction && compiled.action === expected.expectedAction) score += WEAK_SIGNAL_WEIGHT.action;
  if (expected.expectedPosture && compiled.posture === expected.expectedPosture) score += WEAK_SIGNAL_WEIGHT.posture;
  if (expected.expectedConditionTypes) {
    for (const ct of expected.expectedConditionTypes) if (compiled.conditions.some((c) => c.conditionType === ct)) score += WEAK_SIGNAL_WEIGHT.conditionType;
  }
  if (compiled.sourceSectionRef && expected.sourceSectionRef && compiled.sourceSectionRef.includes(expected.sourceSectionRef)) score += WEAK_SIGNAL_WEIGHT.sectionProximity;

  // ELIGIBILITY: when the expectation specifies at least one strong, value-bearing signal (a
  // dollar figure, percent, ratio, metric name, or unlimited-capacity flag), at least ONE of
  // those must actually be satisfied for this pairing to be a real candidate match at all -
  // this is what stops the matcher from forcing a weak/spurious match (sharing only posture or
  // action, which many unrelated rules in the same section commonly share) onto a rule that
  // plainly does not carry the expected content. Without this gate, the matcher could still
  // pick a "best available" wrong pairing purely on weak signals; with it, an expectation whose
  // defining content is not present in ANY compiled rule is left correctly unmatched
  // (MISSED_RULE) rather than misassigned - the exact behavior task §40 requires for a genuine
  // omission (a missing basket whose dollar figure appears nowhere in the compiler's output) to
  // surface honestly, with no section-specific logic anywhere in this scoring function.
  const eligible = strongFieldsSpecified > 0 ? strongFieldsSatisfied > 0 : score > 0;
  return { score, eligible };
}

export interface RuleMatchResult {
  matched: { expected: ExpectedRuleShape; compiled: IRRule }[];
  unmatchedExpected: ExpectedRuleShape[];
  unmatchedCompiled: IRRule[];
}

/**
 * Content-based matching between a section's compiled rules and its
 * hand-authored expectations (task §17) - greedy maximum-weight bipartite
 * matching over the ELIGIBLE edge set from scoreCandidate. Deterministic:
 * ties are broken by original expected-order then compiled-order, never by
 * insertion order into a Set/Map.
 */
export function matchExpectedToCompiled(compiled: IRRule[], expected: ExpectedRuleShape[]): RuleMatchResult {
  const edges: { i: number; j: number; score: number }[] = [];
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < compiled.length; j++) {
      const { score, eligible } = scoreCandidate(compiled[j]!, expected[i]!);
      if (eligible) edges.push({ i, j, score });
    }
  }
  edges.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);

  const matchedExpectedIdx = new Set<number>();
  const matchedCompiledIdx = new Set<number>();
  const matched: { expected: ExpectedRuleShape; compiled: IRRule }[] = [];
  for (const edge of edges) {
    if (matchedExpectedIdx.has(edge.i) || matchedCompiledIdx.has(edge.j)) continue;
    matchedExpectedIdx.add(edge.i);
    matchedCompiledIdx.add(edge.j);
    matched.push({ expected: expected[edge.i]!, compiled: compiled[edge.j]! });
  }

  return {
    matched,
    unmatchedExpected: expected.filter((_, i) => !matchedExpectedIdx.has(i)),
    unmatchedCompiled: compiled.filter((_, j) => !matchedCompiledIdx.has(j)),
  };
}

/**
 * The IR-aware replacement for the old positional `expected.forEach((exp, i)
 * => gradeRule(result.rules[i], exp))` pattern (task §17) - matches by
 * content first, then delegates to gradeRule (unchanged) for the winning
 * pairs, and reports genuinely unmatched expectations/rules honestly rather
 * than comparing the wrong pair.
 */
export function gradeRules(compiled: IRRule[], expected: ExpectedRuleShape[]): SemanticErrorFinding[] {
  const { matched, unmatchedExpected, unmatchedCompiled } = matchExpectedToCompiled(compiled, expected);
  const findings: SemanticErrorFinding[] = [];
  for (const { expected: exp, compiled: c } of matched) findings.push(...gradeRule(c, exp));
  for (const exp of unmatchedExpected) {
    // Task §46's own "dangerous" definition applies here too: a MISSED_RULE is dangerous only
    // when the compiler produced NOTHING that honestly signals the gap for this exact clause. If
    // the compiled batch already contains a rule for the SAME sourceSectionRef whose sufficiency
    // is not COMPLETE (e.g. fwrg-6.04-b's own type-check safety net downgraded it to PARTIAL/
    // UNSUPPORTED after catching a malformed ADD), the compiler already told the reader not to
    // trust that clause - a real gap, but not a SILENT one, so it is not dangerous. Only a
    // clause with no attempted rule at all, or only a CONFIDENTLY COMPLETE (but wrong/absent)
    // one, is dangerous - exactly lsb-6.13's own preserved case, where sub-clauses (e)-(l) have
    // no compiled rule under §6.13 at all beyond the section's own confidently-COMPLETE
    // prohibition/(b)/(c)/(d) rules. This check uses only sourceSectionRef string equality and
    // sufficiency - no section number, threshold, or package name is referenced.
    const attemptedThisExactClause = compiled.some((c) => c.sourceSectionRef === exp.sourceSectionRef && c.sufficiency !== "COMPLETE");
    findings.push({
      category: "MISSED_RULE",
      ref: exp.ref,
      detail: attemptedThisExactClause
        ? `no compiled rule satisfied expected §${exp.sourceSectionRef}'s own defining content, but the compiler did attempt this exact section and honestly flagged it as non-COMPLETE - a real gap, not a silently confident one`
        : `no compiled rule found for expected §${exp.sourceSectionRef} (no candidate rule contained the expectation's own defining content)`,
      dangerous: !attemptedThisExactClause,
    });
  }
  for (const c of unmatchedCompiled) {
    // Informational only, never dangerous (task §46's own definition of "dangerous" requires a
    // MATERIAL error - an additional rule the ground truth simply did not author an expectation
    // for, e.g. fwrg-6.01-g-i's own correct sibling-clause coverage, is not itself a defect).
    findings.push({ category: "EXTRA_RULE", ref: `compiled:${c.ruleId}`, detail: `compiled rule (§${c.sourceSectionRef ?? "?"}, action=${c.action}, posture=${c.posture}, sufficiency=${c.sufficiency}) did not correspond to any ground-truth expectation for this provision - informational only, not necessarily a defect`, dangerous: false });
  }
  return findings;
}

/** Compares one compiled IRRule against one hand-authored expectation, producing zero or more findings. Never throws on a missing field - only checks what the expectation actually specifies. */
export function gradeRule(compiled: IRRule | undefined, expected: ExpectedRuleShape): SemanticErrorFinding[] {
  const findings: SemanticErrorFinding[] = [];
  if (!compiled) {
    findings.push({ category: "MISSED_RULE", ref: expected.ref, detail: `no compiled rule found for expected §${expected.sourceSectionRef}`, dangerous: true });
    return findings;
  }

  if (expected.expectedGenuinelyUnsupported) {
    const capacityIsUnsupported = compiled.capacityExpression === null || (compiled.capacityExpression.kind === "UNSUPPORTED" && compiled.sufficiency !== "COMPLETE") || compiled.sufficiency === "UNSUPPORTED" || compiled.sufficiency === "MISSING_CONTEXT";
    if (!capacityIsUnsupported) {
      findings.push({ category: "OVERCONFIDENT_COMPLETE", ref: expected.ref, detail: `ground truth marks this a genuinely unsupported/missing-context provision, but the compiler produced sufficiency=${compiled.sufficiency}`, dangerous: isDangerous(compiled, true) });
    }
    return findings;
  }

  if (expected.expectedAction && compiled.action !== expected.expectedAction) {
    findings.push({ category: "WRONG_ACTION", ref: expected.ref, detail: `expected action ${expected.expectedAction}, got ${compiled.action}`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedPosture && compiled.posture !== expected.expectedPosture) {
    findings.push({ category: "WRONG_POSTURE", ref: expected.ref, detail: `expected posture ${expected.expectedPosture}, got ${compiled.posture}`, dangerous: isDangerous(compiled, true) });
  }

  const isUnlimited = compiled.capacityExpression?.kind === "UNLIMITED_CAPACITY";
  const leaves = collectLeaves(isUnlimited ? (compiled.capacityExpression as { gatedBy: IRExpression | null }).gatedBy : (compiled.capacityExpression as IRExpression | null));

  if (expected.expectedUnlimitedCapacity !== undefined && expected.expectedUnlimitedCapacity !== isUnlimited) {
    findings.push({ category: "WRONG_THRESHOLD", ref: expected.ref, detail: `expected UnlimitedCapacity=${expected.expectedUnlimitedCapacity}, got ${isUnlimited}`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedFlatAmount !== undefined) {
    const found = leaves.some((l) => l.kind === "MONEY" && Math.abs(l.amount - expected.expectedFlatAmount!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_THRESHOLD", ref: expected.ref, detail: `expected a MONEY leaf of ${expected.expectedFlatAmount}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedPercent !== undefined) {
    const found = leaves.some((l) => l.kind === "PERCENT" && Math.abs(l.value - expected.expectedPercent!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_PERCENT", ref: expected.ref, detail: `expected a PERCENT leaf of ${expected.expectedPercent}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedRatio !== undefined) {
    const found = leaves.some((l) => l.kind === "RATIO" && Math.abs(l.value - expected.expectedRatio!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_RATIO", ref: expected.ref, detail: `expected a RATIO leaf of ${expected.expectedRatio}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedMetricNameContains) {
    const needle = expected.expectedMetricNameContains.toLowerCase();
    const found = leaves.some((l) => (l.kind === "METRIC_REFERENCE" && l.metricName.toLowerCase().includes(needle)) || (l.kind === "DEFINED_TERM_REFERENCE" && l.termName.toLowerCase().includes(needle)));
    if (!found) findings.push({ category: "WRONG_METRIC", ref: expected.ref, detail: `expected a metric/defined-term reference containing "${expected.expectedMetricNameContains}", none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedConditionTypes) {
    for (const ct of expected.expectedConditionTypes) {
      if (!compiled.conditions.some((c) => c.conditionType === ct)) {
        findings.push({ category: "WRONG_CONDITION", ref: expected.ref, detail: `expected a condition of type ${ct}, none found`, dangerous: isDangerous(compiled, true) });
      }
    }
  }

  // Structural type-check sanity - a rule whose own capacityExpression does not type-check should never have been marked COMPLETE. normalize.ts's own enforceSufficiencyConsistency already guards this upstream (task §27), so this should never fire in practice - it exists as an independent regression check against that guarantee, not a new detection path.
  if (compiled.capacityExpression && compiled.capacityExpression.kind !== "UNLIMITED_CAPACITY" && inferType(compiled.capacityExpression) === "UNSUPPORTED" && compiled.sufficiency === "COMPLETE") {
    findings.push({ category: "OTHER", ref: expected.ref, detail: "capacityExpression does not type-check yet sufficiency is COMPLETE - the deterministic sufficiency-consistency guard should have caught this", dangerous: true });
  }

  return findings;
}

export interface GradingSummary {
  totalExpected: number;
  totalCompiled: number;
  findings: SemanticErrorFinding[];
  dangerousCount: number;
  byCategory: Record<string, number>;
  completePrecision: number | null; // of rules marked COMPLETE, what fraction had zero findings
  sufficiencyDistribution: Record<string, number>;
}

export function summarizeGrading(results: SemanticCompilationResult[], expectations: Map<string, ExpectedRuleShape>, findingsByRef: SemanticErrorFinding[]): GradingSummary {
  const allRules = results.flatMap((r) => r.rules);
  const sufficiencyDistribution: Record<string, number> = {};
  for (const rule of allRules) sufficiencyDistribution[rule.sufficiency] = (sufficiencyDistribution[rule.sufficiency] ?? 0) + 1;

  const byCategory: Record<string, number> = {};
  for (const f of findingsByRef) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

  const completeRules = allRules.filter((r) => r.sufficiency === "COMPLETE");
  const completeRulesWithFindings = new Set(findingsByRef.filter((f) => f.dangerous).map((f) => f.ref));
  const completePrecision = completeRules.length > 0 ? (completeRules.length - completeRulesWithFindings.size) / completeRules.length : null;

  return {
    totalExpected: expectations.size,
    totalCompiled: allRules.length,
    findings: findingsByRef,
    dangerousCount: findingsByRef.filter((f) => f.dangerous).length,
    byCategory,
    completePrecision,
    sufficiencyDistribution,
  };
}
