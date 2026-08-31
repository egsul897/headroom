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
