/**
 * Phase 3F.1.6.RX Workstream D (BLOCKER-8 + AUDIT-F4) - generic,
 * package/family-agnostic numeric-value-anchor extraction and verified-quote
 * matching from arbitrary contract text (Architecture Invariants #29 - no
 * covenant/company-specific keyword or section rule appears here; purely
 * currency/percentage/ratio grammar and whitespace-normalized substring
 * matching, both of which generalize to any document, any family, any
 * package).
 *
 * WHY THIS EXISTS: AUDIT-F4 froze the residual gap the prior BLOCKER-8 fix
 * (docs/phase-3f1-6-r-blocker-remediation/11-claim-identity-remediation.json)
 * disclosed rather than closed - "SAME FAMILY + SAME ROLE + SAME SOURCE NODE
 * DOES NOT IMPLY SAME CLAIM" (e.g. a real sentence bundling a "$50m
 * acquisition debt basket" and a "$25m working-capital debt basket" - same
 * family INDEBTEDNESS, same role BASKET, same source node, but two
 * genuinely distinct economic propositions). The prior fix's own families-
 * only fingerprint cannot disambiguate this, by its own design (see that
 * file's part4_disclosedResidualRisk). This module supplies the missing,
 * SOURCE-GROUNDED disambiguating signal both identity layers (discovery's
 * discoveryId/candidateRef and semantic-coverage's semanticUnitId) can
 * reuse identically rather than each re-inventing it - and, critically,
 * reused identically means "these two claims are distinct" can never
 * diverge between the two layers merely because they implemented numeric
 * extraction slightly differently.
 *
 * GROUNDING DISCIPLINE (never hash raw AI paraphrase - this task's own
 * explicit prohibition): extractGroundedValueAnchors and
 * verifyDistinguishingQuote both take a candidate-supplied text (which MAY
 * be AI-authored, e.g. Pass B's own `description`/`distinguishingQuote`
 * fields) and a REAL source ground-truth text, and return only what
 * independently verifies against the ground truth. A value or quote that
 * does not verify is discarded, never used as a weaker/partial signal - a
 * fail-closed default consistent with this codebase's disclosure
 * discipline elsewhere (see discovery/pass-c-neighborhood.ts's own
 * exact-resolution-only comment for the same discipline applied to
 * relativeRef resolution). Because the OUTPUT of grounding is a normalized,
 * canonical VALUE (a number) or a whitespace-normalized VERBATIM substring
 * of real source text - never the candidate's own paraphrase wording -
 * two independently-authored, differently-worded descriptions of the exact
 * same real clause (Phase B may re-describe a clause differently across
 * independent detections/reruns) still normalize to the identical grounded
 * anchor, so a genuine duplicate detection is never spuriously turned into
 * two false-distinct siblings (this task's own "must not cause identity
 * explosion for real duplicates" requirement, adversarial case 8).
 */

const CURRENCY_RE = /[$£€]\s?([\d,]+(?:\.\d+)?)\s?(million|mm|bn|billion|thousand|k)?\b/gi;
const PERCENTAGE_RE = /(\d+(?:\.\d+)?)\s?%/g;
const RATIO_RE = /(\d+(?:\.\d+)?)\s*(?:x\b|to\s*1(?:\.0+)?\b|:\s*1(?:\.0+)?\b)/gi;

const CURRENCY_MULTIPLIERS: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  mm: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000,
};

function canonicalNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Extracts every currency/percentage/ratio value mentioned anywhere in
 * `text` and returns each as a canonicalized, tagged anchor string (e.g.
 * "usd:50000000", "pct:5", "ratio:3"). "$50,000,000", "$50 million", and
 * "$50MM" all normalize to the SAME anchor ("usd:50000000") - formatting
 * differences in how a number is written never change its identity
 * (adversarial case 9, formatting-perturbation stability). Order is
 * whatever order matches occur in `text`; callers needing a value-agnostic
 * SET comparison should dedupe/sort themselves (see
 * valueAnchorSetsDisjointAndNonEmpty below, which does this correctly).
 */
export function extractValueAnchors(text: string): string[] {
  const anchors: string[] = [];
  for (const m of text.matchAll(CURRENCY_RE)) {
    const amount = canonicalNumber(m[1]!);
    if (Number.isNaN(amount)) continue;
    const multiplier = m[2] ? (CURRENCY_MULTIPLIERS[m[2].toLowerCase()] ?? 1) : 1;
    anchors.push(`usd:${amount * multiplier}`);
  }
  for (const m of text.matchAll(PERCENTAGE_RE)) {
    const value = canonicalNumber(m[1]!);
    if (Number.isNaN(value)) continue;
    anchors.push(`pct:${value}`);
  }
  for (const m of text.matchAll(RATIO_RE)) {
    const value = canonicalNumber(m[1]!);
    if (Number.isNaN(value)) continue;
    anchors.push(`ratio:${value}`);
  }
  return anchors;
}

/**
 * True only when both sides carry at least one value anchor AND the two
 * sides' anchor sets share NO common value - i.e. a genuine, source-
 * grounded numeric difference exists between them. Two clauses that merely
 * both happen to mention SOME number, but the SAME number (e.g. a clause
 * restating its own cap in two places), must never be treated as carrying
 * a distinguishing signal by this function - `false` in that case, exactly
 * matching "must not force-split" discipline already established for
 * findCoordinateClauseSplit.
 */
export function valueAnchorSetsDisjointAndNonEmpty(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  return !b.some((v) => setA.has(v));
}

/**
 * Extracts value anchors from `candidateText` (which may be AI-authored,
 * e.g. a discovery candidate's own `description`) but keeps only the ones
 * INDEPENDENTLY confirmed present in `sourceGroundTruthText` (the real
 * underlying source text this candidate is anchored to) - see the
 * module-level GROUNDING DISCIPLINE note above. A hallucinated or
 * mis-paraphrased number that does not actually appear in the source is
 * silently dropped, never trusted.
 */
export function extractGroundedValueAnchors(candidateText: string, sourceGroundTruthText: string): string[] {
  const candidateAnchors = extractValueAnchors(candidateText);
  if (candidateAnchors.length === 0) return [];
  const groundTruthAnchors = new Set(extractValueAnchors(sourceGroundTruthText));
  return [...new Set(candidateAnchors)].filter((a) => groundTruthAnchors.has(a)).sort();
}

// ---------------------------------------------------------------------------
// Verified-quote matching - the discovery layer's optional, tolerant Pass B
// extension (distinguishingQuote on SemanticRuleItem). A quote is never
// trusted as identity input unless it independently verifies as a genuine
// verbatim (whitespace-normalized) substring of the real source text.
// ---------------------------------------------------------------------------

/** Below this many non-whitespace characters, a "quote" could coincidentally substring-match generic boilerplate (e.g. "the Company") and would not genuinely distinguish two sibling claims - rejected rather than trusted as a weak signal. */
const MIN_VERIFIED_QUOTE_NON_WHITESPACE_LENGTH = 12;

export function normalizeForSpanMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Verifies a candidate-supplied "distinguishing quote" is a genuine
 * whitespace-normalized VERBATIM substring of `sourceGroundTruthText`.
 * Returns the normalized quote (safe to fold into an identity fingerprint)
 * only when verified; `null` otherwise - the caller must then treat the
 * quote as though it were never supplied (fail-closed), never as a
 * weaker/partial signal. Two reformattings of the identical real quote
 * (extra whitespace, a trailing period) verify identically because both
 * sides of the substring check are whitespace-normalized first.
 */
export function verifyDistinguishingQuote(quote: string | undefined, sourceGroundTruthText: string): string | null {
  if (!quote) return null;
  const normalizedQuote = normalizeForSpanMatch(quote);
  if (normalizedQuote.replace(/\s/g, "").length < MIN_VERIFIED_QUOTE_NON_WHITESPACE_LENGTH) return null;
  const normalizedSource = normalizeForSpanMatch(sourceGroundTruthText);
  if (!normalizedSource.includes(normalizedQuote)) return null;
  return normalizedQuote;
}
