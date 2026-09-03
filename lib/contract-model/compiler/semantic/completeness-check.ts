/**
 * POST-3F.2 remediation - Unit A2 (deterministic definition-completeness
 * cross-check). Root cause traced in docs/post-3f2-generalization-
 * architecture-decision.json §3/§4: the semantic compiler's schema/IR/
 * normalization layers already support an arbitrary number of sibling
 * definitions per candidate (no cardinality defect), but nothing today
 * NOTICES when the model's returned definitions[] array is a strict
 * subset of what the source text itself declares. This module is that
 * notice mechanism - and nothing more.
 *
 * SCOPE DISCIPLINE (mission S4/S6): this function answers exactly one
 * narrow question - "does the supplied source contain strong structural
 * evidence of defined terms that the semantic output appears not to
 * represent?" It does NOT interpret legal meaning, does NOT enumerate
 * covenant concepts, does NOT maintain a legal-term dictionary, and does
 * NOT infer what a missing definition actually says. It is a deterministic
 * pattern match over quoted-term-before-"means" citation syntax - the same
 * syntactic convention nearly every defined-term declaration in commercial
 * loan/bond drafting uses, regardless of what the term or its economics
 * are - so it generalizes across covenant families and drafting subject
 * matter without any package-specific content.
 *
 * CONSERVATISM (mission S6): this check only ever FIRES (reports a
 * suspected omission) when it has positive, quoted-citation evidence for a
 * term AND that exact term is absent from the compiled output. It never
 * fires merely because zero quoted-citation patterns were found at all
 * (many valid sections - a single-definition section, a rules-only
 * section, or one drafted with an unusual convention this pattern does not
 * recognize - will legitimately produce zero detections, and that must
 * never be treated as evidence of omission). A false negative (missing a
 * genuinely omitted term whose citation syntax this pattern does not
 * recognize) is an acceptable, disclosed limitation; a false positive
 * (flagging a section that was actually complete) is not - see the test
 * matrix in tests/contract-model/semantic-compiler/definition-
 * completeness-check.test.ts for the adversarial cases this was built
 * against (nested quotes, defined-term-referenced-but-not-defined-locally,
 * "shall mean" vs "means", multi-sentence definitions, quotes inside a
 * definition body, schedule/heading text, semicolon-separated clauses).
 */

/** One canonical citation-syntax pattern this check recognizes: a quoted phrase immediately followed by "means" or "shall mean". Deliberately narrow (never a fuzzy/NLP heuristic) so its false-positive rate stays governable by direct inspection of this one regex. */
const QUOTED_TERM_BEFORE_MEANS_RE = /["“]([^"“”]{1,80})["”]\s+(?:means|shall mean)\b/gi;

export interface DetectedSourceTerm {
  /** The exact quoted text between the quotation marks, trimmed - never normalized/reformatted beyond whitespace collapse, so it can be traced back to the literal source citation. */
  rawLabel: string;
  /** Lowercased, whitespace-collapsed form used for comparison against compiled definitions - comparison-only, never surfaced as if it were the source's own casing. */
  normalizedLabel: string;
}

export interface DefinitionCompletenessCheckResult {
  /** True only when this check found positive citation evidence of at least one defined term that the compiled output does not represent. False for every other case, including "no citation patterns detected at all" - see module header. */
  fired: boolean;
  /** Every quoted-term-before-"means" citation this check found in the supplied source text, regardless of whether it was ultimately judged missing. Empty array is a normal, expected outcome for many valid sections. */
  detectedSourceTermLabels: string[];
  /** The compiled output's own definition labels, as supplied to this check (never re-derived from anything else). */
  compiledTermLabels: string[];
  /** detectedSourceTermLabels minus compiledTermLabels, by normalized-label comparison. Empty unless `fired` is true. */
  missingTermLabels: string[];
  /** Human-readable reason this check fired, or null when it did not. Never a claim about WHY the term was omitted (that is outside this check's scope) - only that it was detected as cited and not represented. */
  reason: string | null;
}

function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Scans source text for the recognized citation syntax. Exported separately from the full check so tests and diagnostics can inspect detection in isolation from the compiled-output comparison. */
export function detectQuotedDefinedTerms(sourceText: string): DetectedSourceTerm[] {
  const seen = new Map<string, DetectedSourceTerm>();
  for (const match of sourceText.matchAll(QUOTED_TERM_BEFORE_MEANS_RE)) {
    const rawLabel = match[1]?.trim();
    if (!rawLabel) continue;
    const normalizedLabel = normalizeLabel(rawLabel);
    if (!normalizedLabel || seen.has(normalizedLabel)) continue;
    seen.set(normalizedLabel, { rawLabel, normalizedLabel });
  }
  return Array.from(seen.values());
}

/**
 * The full check (mission S4/S5). `sourceText` should be the same
 * operative source text the compiler itself was given for this candidate
 * (never a different/wider span - this check's evidence must match what
 * the model actually saw, or a "missing" finding would be meaningless).
 * `compiledDefinitions` is the candidate's own normalized IRDefinition[]
 * (or any object carrying a `termName`).
 */
export function checkDefinitionCompleteness(sourceText: string, compiledDefinitions: ReadonlyArray<{ termName: string }>): DefinitionCompletenessCheckResult {
  const detected = detectQuotedDefinedTerms(sourceText);
  const compiledLabels = compiledDefinitions.map((d) => d.termName);
  const compiledNormalized = new Set(compiledLabels.map(normalizeLabel));

  const missing = detected.filter((d) => !compiledNormalized.has(d.normalizedLabel));

  if (missing.length === 0) {
    return {
      fired: false,
      detectedSourceTermLabels: detected.map((d) => d.rawLabel),
      compiledTermLabels: compiledLabels,
      missingTermLabels: [],
      reason: null,
    };
  }

  return {
    fired: true,
    detectedSourceTermLabels: detected.map((d) => d.rawLabel),
    compiledTermLabels: compiledLabels,
    missingTermLabels: missing.map((d) => d.rawLabel),
    reason: `Deterministic completeness check found ${missing.length} quoted defined-term citation(s) in the supplied source (matching the '"Term" means'/'"Term" shall mean' pattern) that do not appear among the ${compiledLabels.length} compiled definition(s): ${missing.map((d) => `"${d.rawLabel}"`).join(", ")}. This is a structural detection only - it does not assert what these terms mean or why they were omitted.`,
  };
}

// ---------------------------------------------------------------------------
// POST-HOLDOUT-SEMANTIC-REMEDIATION Unit A secondary fix (docs/post-holdout-
// semantic-remediation/04-semantic-architecture-decision.json). The sibling
// check above answers "is a whole defined TERM missing from the output" -
// this section answers a different, narrower question: for a SINGLE
// definition whose calculationExpression collapsed to UNSUPPORTED, how much
// of its own internal structure was actually captured before that collapse?
// Purely structural (walks the closed IRExpression node-kind union, never a
// financial-term dictionary) and purely additive - it introduces a new,
// separate diagnostic, it does not alter checkDefinitionCompleteness above
// or any existing pass/fail verdict.

import type { IRExpression } from "../../ir/types";

/** Generic structural children of a composite IR node, by node kind - never term-specific, mirrors the same closed switch normalize.ts itself uses to build these nodes. */
function childExpressions(expr: IRExpression): IRExpression[] {
  switch (expr.kind) {
    case "ADD":
    case "SUM":
    case "MULTIPLY":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR":
      return expr.operands;
    case "SUBTRACT":
      return [expr.left, expr.right];
    case "DIVIDE":
      return [expr.numerator, expr.denominator];
    case "COMPARE":
      return [expr.left, expr.right];
    case "NOT":
      return [expr.operand];
    case "IF":
      return expr.else ? [expr.condition, expr.then, expr.else] : [expr.condition, expr.then];
    case "AS_OF":
    case "DURING_PERIOD":
      return [expr.value];
    case "SCHEDULE":
      return expr.defaultValue ? [...expr.cases.map((c) => c.value), expr.defaultValue] : expr.cases.map((c) => c.value);
    case "EVENT_ACTIVE":
      return expr.triggerCondition ? [expr.triggerCondition] : [];
    default:
      return [];
  }
}

export interface IntraDefinitionComponentCompletenessResult {
  /**
   * True when calculationExpression is a PARTIAL representation with
   * component structure to report: either (F-6) a live composite that keeps
   * its well-typed operands with one or more UNSUPPORTED children in place,
   * or (pre-F-6 shape, still produced for a genuine type conflict or a
   * composite with no typed operand) an UNSUPPORTED node carrying an
   * attemptedStructure sidecar. False for "already fully compiled" and for a
   * genuinely atomic/model-emitted UNSUPPORTED leaf with nothing to walk.
   */
  applicable: boolean;
  /** Total nodes in the walked tree (root plus every descendant reachable via childExpressions, descending into nested attemptedStructure sidecars), including the root itself. */
  totalComponentCount: number;
  /** Of totalComponentCount, how many are NOT themselves kind="UNSUPPORTED" - i.e. successfully normalized/type-checked structure. */
  wellTypedComponentCount: number;
  /** Of totalComponentCount, how many ARE kind="UNSUPPORTED" - the genuinely-failed component(s). */
  unsupportedComponentCount: number;
  /** Each unsupported component's own `reason` string, for direct citation - never a re-interpretation of what the component means. */
  unsupportedComponentReasons: string[];
  reason: string | null;
}

function containsUnsupported(expr: IRExpression): boolean {
  if (expr.kind === "UNSUPPORTED") return true;
  return childExpressions(expr).some(containsUnsupported);
}

/**
 * Walks a definition's calculationExpression tree and reports how many of
 * its components DID successfully normalize versus how many are genuinely
 * unsupported, instead of an all-or-nothing "kind === UNSUPPORTED" binary.
 * Two shapes are walked: (F-6) a live composite that keeps its well-typed
 * operands with UNSUPPORTED children in place - walked from the root; and
 * an UNSUPPORTED root carrying an attemptedStructure sidecar (a genuine
 * type conflict, or a composite with no typed operand) - walked from the
 * sidecar, exactly as before F-6. Never fires (never reports
 * applicable=true) for a fully-typed calculationExpression or for a
 * genuinely atomic UNSUPPORTED leaf with no structure to walk.
 */
export function checkIntraDefinitionComponentCompleteness(calculationExpression: IRExpression | null | undefined): IntraDefinitionComponentCompletenessResult {
  const notApplicable: IntraDefinitionComponentCompletenessResult = {
    applicable: false,
    totalComponentCount: 0,
    wellTypedComponentCount: 0,
    unsupportedComponentCount: 0,
    unsupportedComponentReasons: [],
    reason: null,
  };
  if (!calculationExpression) return notApplicable;
  const root = calculationExpression.kind === "UNSUPPORTED" ? calculationExpression.attemptedStructure : containsUnsupported(calculationExpression) ? calculationExpression : undefined;
  if (!root) return notApplicable;

  let total = 0;
  let wellTyped = 0;
  let unsupported = 0;
  const unsupportedReasons: string[] = [];

  // MAX_WALK_DEPTH is a defensive bound only (content-derived trees are
  // always finite) - it exists so a future, unforeseen malformed tree fails
  // safe (undercounts) rather than recursing unboundedly.
  const MAX_WALK_DEPTH = 200;
  function walk(expr: IRExpression, depth: number): void {
    if (depth > MAX_WALK_DEPTH) return;
    total++;
    if (expr.kind === "UNSUPPORTED") {
      unsupported++;
      unsupportedReasons.push(expr.reason);
      // Cascading poison propagation (a genuinely-unsupported leaf deep
      // inside a chain of composites, e.g. a multi-level nested IF pricing
      // grid, poisons every ancestor's own top-level type per type-check.ts
      // - correctly, and unchanged here) means a nested UNSUPPORTED node
      // frequently carries its OWN attemptedStructure sidecar (from a
      // deeper buildComposite call). Descending into it is what lets this
      // diagnostic report the true well-typed/unsupported split for a
      // deeply-nested tree instead of treating every nested UNSUPPORTED
      // wrapper as one opaque, unexplored leaf.
      if (expr.attemptedStructure) walk(expr.attemptedStructure, depth + 1);
    } else {
      wellTyped++;
    }
    for (const child of childExpressions(expr)) walk(child, depth + 1);
  }
  walk(root, 0);

  const collapsed = calculationExpression.kind === "UNSUPPORTED";
  return {
    applicable: true,
    totalComponentCount: total,
    wellTypedComponentCount: wellTyped,
    unsupportedComponentCount: unsupported,
    unsupportedComponentReasons: unsupportedReasons,
    reason: `This definition's calculationExpression is ${collapsed ? "UNSUPPORTED at its own top level, but its preserved attempted structure" : "a PARTIAL representation (non-executable, its unsupported components kept in place) that"} contains ${total} total component node(s): ${wellTyped} successfully normalized/type-checked and ${unsupported} genuinely unsupported. This is a structural component count only - it does not assert legal correctness of the captured components.`,
  };
}
