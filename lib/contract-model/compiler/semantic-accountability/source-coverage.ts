/**
 * SOURCE COVERAGE (Pass A trust boundary, v3).
 *
 * WHAT QUESTION THIS ANSWERS
 * --------------------------
 *   "What source material in this semantic unit has no semantic disposition?"
 *
 * NOT:
 *   "What source material MATCHING MY HEURISTIC VOCABULARY has no disposition?"
 *
 * The v2 detector this replaces answered the second question. It required a
 * span to clear five conjunctive filters - a closed connective vocabulary, a
 * 40-character floor, a 50%-coverage threshold, a punctuation boundary, and
 * the region literally named "operative" - before it was even ELIGIBLE to be
 * reported as a gap. An independent audit demonstrated that each filter alone
 * was sufficient to silence a material omission.
 *
 * THE INVERSION
 * -------------
 * Source is PRESUMED ACCOUNTABLE. Every character of every region in the
 * semantic unit is assigned one deterministic coverage disposition, and the
 * DEFAULT is UNACCOUNTED_SOURCE. A span leaves that default only when
 * deterministic logic can positively show one of:
 *   - an inventory item anchors it (COVERED_BY_INVENTORY);
 *   - it is a lead-in whose enumerated children are all accounted, and it
 *     carries no quantitative value of its own (COVERED_BY_CHILD_DESCENT);
 *   - another semantic unit owns it, by an explicit recorded link
 *     (ACCOUNTED_BY_EXTERNAL_UNIT);
 *   - it is deterministically non-semantic: punctuation, a bare enumerator or
 *     closed-class connective glue, a heading/label, a bare citation, a
 *     defined-term label, or page/TOC furniture.
 *
 * Heuristics here RANK AND SUPPRESS OBVIOUS NOISE. They never define the
 * trust boundary: nothing about a span's length, vocabulary, region label or
 * value type can make material text ineligible for scrutiny.
 *
 * INDEPENDENCE: this file derives only from source text + accepted item
 * spans. It imports no IR, no composition, no verifier (enforced by
 * tests/contract-model/semantic-accountability-independence.test.ts).
 */
import { scanQuantitativeValues } from "./quantitative";
import type { QuantitativeValue, SourceContextRegion } from "./types";

// ---------------------------------------------------------------------------
// Dispositions
// ---------------------------------------------------------------------------

export const COVERAGE_DISPOSITIONS = [
  "COVERED_BY_INVENTORY",
  "COVERED_BY_CHILD_DESCENT",
  "COVERED_BY_CONNECTIVE_OWNERSHIP",
  "ACCOUNTED_BY_EXTERNAL_UNIT",
  "STRUCTURAL_NOISE",
  "HEADING_OR_LABEL",
  "CITATION_ONLY",
  "DEFINED_TERM_LABEL",
  "PUNCTUATION_OR_DELIMITER",
  "NON_SEMANTIC_FORMATTING",
  "UNACCOUNTED_SOURCE",
] as const;
export type CoverageDisposition = (typeof COVERAGE_DISPOSITIONS)[number];

/** The dispositions that discharge accountability. Everything else - and anything unclassified - blocks. */
const ACCOUNTED: ReadonlySet<CoverageDisposition> = new Set<CoverageDisposition>([
  "COVERED_BY_INVENTORY",
  "COVERED_BY_CHILD_DESCENT",
  "COVERED_BY_CONNECTIVE_OWNERSHIP",
  "ACCOUNTED_BY_EXTERNAL_UNIT",
  "STRUCTURAL_NOISE",
  "HEADING_OR_LABEL",
  "CITATION_ONLY",
  "DEFINED_TERM_LABEL",
  "PUNCTUATION_OR_DELIMITER",
  "NON_SEMANTIC_FORMATTING",
]);

export const isAccountedDisposition = (d: CoverageDisposition): boolean => ACCOUNTED.has(d);

/**
 * SEMANTIC OWNERSHIP is narrower than ACCOUNTED (child-descent ownership remediation).
 *
 * "Accounted" answers "does this stretch need review?" - and a heading, a citation, an enumerator or a comma
 * does not. "Semantically owned" answers a different question: "is the meaning of this stretch REPRESENTED
 * somewhere?" Only two dispositions say yes: an inventory item anchors it, or a disclosed external unit owns
 * it. The six non-semantic classes say the opposite - there is no meaning here to represent.
 *
 * Child descent is semantic ownership propagation: a lead-in inherits coverage from the clauses it introduces
 * BECAUSE those clauses carry the meaning. It used to test the broad ACCOUNTED set, so a parent whose
 * "children" were nothing but enumerator glue - "(a) and" / "(b)," - was discharged on the strength of text
 * that is, by the detector's own verdict, meaningless. The RT-3 remediation surfaced "less the sum of
 * clauses " correctly and descent then re-absorbed it. A child being non-semantic proves nothing about a
 * substantive parent; it only proves the child needs no review.
 *
 * COVERED_BY_CHILD_DESCENT and COVERED_BY_CONNECTIVE_OWNERSHIP are deliberately NOT here. Neither can occur on
 * a child at evaluation time - parents are always non-enumerated units and children always enumerated, so an
 * enumerated unit is never itself a parent, and connective ownership runs after the descent loop - so listing
 * them would change nothing today while quietly licensing a self-justifying chain tomorrow. Every descent
 * therefore terminates, in one step, in an inventory or external anchor.
 */
const SEMANTIC_OWNERSHIP: ReadonlySet<CoverageDisposition> = new Set<CoverageDisposition>(["COVERED_BY_INVENTORY", "ACCOUNTED_BY_EXTERNAL_UNIT"]);
export const isSemanticallyOwned = (d: CoverageDisposition): boolean => SEMANTIC_OWNERSHIP.has(d);

/** One accounted-for stretch of source. Spans tile each region completely: every non-whitespace character belongs to exactly one. */
export interface SourceCoverageSpan {
  regionId: string;
  charStart: number;
  charEnd: number;
  disposition: CoverageDisposition;
  /** Why this disposition was assigned - always populated, so an UNACCOUNTED_SOURCE span can be read without re-deriving it. */
  reason: string;
  excerpt: string;
  /** Quantitative values located inside this span. */
  values: QuantitativeValue[];
  /** For COVERED_BY_EXTERNAL_UNIT: the unit that owns it. */
  externalOwnerRef?: string;
}

export interface SourceCoverageResult {
  spans: SourceCoverageSpan[];
  /** Spans that nothing accounts for - the trust-boundary output. */
  unaccounted: SourceCoverageSpan[];
  /** Values not inside any accounting item span AND not inside a deterministically non-semantic span. */
  unaccountedValues: (QuantitativeValue & { regionId: string })[];
  countsByDisposition: Record<CoverageDisposition, number>;
  /** Non-whitespace characters per disposition - the honest denominator for "how much source is accounted for". */
  charsByDisposition: Record<CoverageDisposition, number>;
  regionsConsidered: string[];
}

/** An accepted inventory item's span, as this layer sees it: text, position, and whether it accounts for anything. */
export interface AccountingSpanInput {
  regionId: string;
  charStart: number;
  charEnd: number;
  /** Only CRITICAL/MATERIAL items account for source; an INFORMATIONAL or REVIEW_UNCERTAIN echo never closes a gap. */
  materiality: string;
}

/** An explicit, recorded statement that another semantic unit owns a dependency region's semantics (§9 option A). */
export interface ExternalAccountabilityLink {
  regionId: string;
  /** The candidateRef of the unit that inventories this region's own semantics. */
  ownerCandidateRef: string;
  /** Deterministic proof the owner exists - normally the owner's frozenContentHash. Absent => the link does not discharge anything. */
  ownerInventoryHash: string;
}

export interface SourceCoverageInput {
  regions: SourceContextRegion[];
  spans: AccountingSpanInput[];
  externalAccountability?: ExternalAccountabilityLink[];
}

// ---------------------------------------------------------------------------
// Structural segmentation (§5) - boundaries, not a vocabulary
// ---------------------------------------------------------------------------

/** Enumerators in the shapes real documents use: (a) (iv) (12) (A) as well as bare "1." / "(a)" at a line start. */
const ENUMERATOR_SRC = String.raw`\((?:[a-zA-Z]{1,3}|[ivxlcdmIVXLCDM]{1,6}|\d{1,3})\)|\d{1,3}\.(?=\s)`;
const ENUMERATOR_AT_START = new RegExp(String.raw`^\s*(?:${ENUMERATOR_SRC})\s*`);

/**
 * Splits region text into accountable structural units. Boundaries are
 * STRUCTURAL, never a word list: sentence/clause terminators, line breaks,
 * and enumerator starts. A short clause is a unit exactly like a long one -
 * there is no length floor anywhere in this function.
 */
export function segmentSourceUnits(text: string, protectedRanges: { charStart: number; charEnd: number }[] = []): { charStart: number; charEnd: number }[] {
  const boundaries = new Set<number>([0, text.length]);
  // After a clause terminator followed by whitespace.
  for (const m of text.matchAll(/[.;:!?]["')\]]?\s+/g)) boundaries.add(m.index! + m[0].length);
  // At every line break (a table row / bulleted basket is not one unit - audit finding 7).
  for (const m of text.matchAll(/\n+[ \t]*/g)) boundaries.add(m.index! + m[0].length);
  // Immediately before an enumerator, wherever it appears.
  for (const m of text.matchAll(new RegExp(String.raw`(?:^|[\s(])(?=(?:${ENUMERATOR_SRC}))`, "g"))) boundaries.add(m.index! + m[0].length);
  // Before a dash-introduced aside (em dash / spaced hyphen), which carves out exceptions in real drafting.
  for (const m of text.matchAll(/\s+[–—-]\s+/g)) boundaries.add(m.index! + m[0].length);
  // After a comma. A comma-delimited aside is where drafting hides a qualifier inside a lead-in ("... plus,
  // without duplication and to the extent deducted ..., the sum of"). Splitting there costs nothing - glue-only
  // fragments classify as STRUCTURAL_NOISE - and it stops a lead-in's discharge from ever reaching a qualifier.
  for (const m of text.matchAll(/,\s+/g)) boundaries.add(m.index! + m[0].length);
  // Never split inside a quantitative value ("March 31, 2030", "$5,000,000"): a value must stay inside one unit
  // so it can be attributed to the span that holds it.
  const sorted = [...boundaries].filter((b) => !protectedRanges.some((r) => b > r.charStart && b < r.charEnd)).sort((a, b) => a - b);
  const out: { charStart: number; charEnd: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (b > a && text.slice(a, b).trim().length > 0) out.push({ charStart: a, charEnd: b });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic non-semantic classification (§3, §6)
// ---------------------------------------------------------------------------

/**
 * Closed-class English function words. A fragment built ONLY from these,
 * enumerators and punctuation carries no proposition of its own - it is the
 * glue segmentation left behind when it split a parent unit. This list can
 * only ever move a fragment OUT of scrutiny when the fragment contains no
 * content word and no value.
 *
 * This list is NOT proven safe. An independent red team showed that words which can introduce a condition or
 * exception ("except", "provided", ...) made a real cross-referenced exception score zero content words; those
 * are gone (canary #2). Other entries here remain KNOWN-BROKEN and deliberately untouched by that canary:
 * the adverbial adjuncts still swallow "jointly and severally" and "directly or indirectly", and `contentWords`
 * still cannot see digits, so a bare section number is invisible to it.
 */
/**
 * ADVERBIAL ADJUNCTS - a partition of the closed class below, not new vocabulary and not a phrase list.
 *
 * The comment that used to sit on these words read: "An adjunct modifies a proposition and cannot head one; a
 * residue made only of these sits beside text an item already anchors." The first half is true and the second
 * half does not follow from it. MODIFYING A PROPOSITION IS CHANGING IT. An independent red team demonstrated
 * the consequence twice over: "jointly and severally," and "directly or indirectly," score zero content words,
 * so both were dismissed as "the residue of splitting a parent unit" - joint-and-several liability silently
 * converted to several liability, and anti-evasion language silently deleted - while the clauses on either
 * side were covered and the region reported semanticallyComplete.
 *
 * Grammatical shortness does not make text non-semantic. These words change scope ("solely", "only"),
 * allocation ("jointly", "severally"), directness ("directly", "indirectly"), distribution ("collectively",
 * "individually", "respectively") and anaphoric reach ("foregoing", "aforesaid", "above", "below") of whatever
 * they attach to. A fragment carrying one is standalone modifier content, not syntactic glue.
 *
 * They stay inside FUNCTION_WORDS because the nominal-label tests (canaries #5, #7, #8) legitimately treat
 * them as grammar when deciding whether a NAME is a name. What changes is narrower: they can no longer let a
 * residue disappear as STRUCTURAL_NOISE.
 */
const ADVERBIAL_ADJUNCTS = new Set([
  "solely", "only", "also", "otherwise", "further", "respectively", "generally", "collectively", "individually",
  "directly", "indirectly", "together", "jointly", "severally", "hereinafter", "aforesaid", "foregoing", "above", "below",
]);

/**
 * ARITHMETIC / COMPOSITIONAL OPERATORS - a partition of the closed class below, not new vocabulary and not a
 * phrase list. These are exactly the seven words that already sat on the "arithmetic connectives" line of
 * FUNCTION_WORDS; nothing was invented or added.
 *
 * The comment that used to sit on them read: "arithmetic connectives joining formula components an item
 * already anchors ... A residue carrying an actual amount is never dismissed here - the value guard runs
 * first." Both halves are true and neither justifies dismissal. The OPERATOR is what says how the anchored
 * components combine: "less the sum of clauses (a) and (b)" turns two covered components into a subtraction,
 * and dropping it silently turns a net amount into a gross one. The value guard cannot help, because an
 * operator fragment carries no amount of its own - the amounts are in the components it joins.
 *
 * An independent red team's finding 3 listed this class alongside the adjuncts. The adjunct half was closed
 * by canary #9; the operator half was not, and the closure audit found the original probe
 * "less the sum of clauses (a) and (b)," still STRUCTURAL_NOISE while its two sibling probes surfaced ONLY
 * because "foregoing" happens to be an adjunct. That is incidental cover, not a repair. This partition closes
 * the operator class itself: addition, subtraction, multiplication, division and aggregation language is
 * substantive, and the classifier does not need to execute it - only refuse to dismiss it.
 *
 * They stay inside FUNCTION_WORDS because the nominal-label tests (canaries #5, #7) legitimately treat them as
 * grammar inside a NAME ("Consolidated EBITDA less Taxes" is still a defined-term name). What changes is
 * narrower: they can no longer let a residue disappear as STRUCTURAL_NOISE.
 */
const ARITHMETIC_OPERATORS = new Set(["plus", "minus", "less", "sum", "difference", "product", "quotient"]);

const FUNCTION_WORDS = new Set([
  // determiners, pronouns, prepositions, auxiliaries - pure grammar
  "a", "an", "and", "andor", "any", "are", "as", "at", "be", "been", "being", "both", "but", "by", "each", "either", "for", "from", "hereby", "hereof", "hereto", "hereunder", "in", "into", "is", "it", "its", "of", "on", "or", "other", "over", "per", "such", "than", "that", "the", "their", "then", "there", "thereof", "thereto", "thereunder", "these", "this", "those", "to", "under", "was", "were", "which", "who", "whom", "whose", "with", "within", "without",
  // structural lead-in nouns that introduce a list and carry no proposition alone
  "following", "clause", "clauses", "paragraph", "paragraphs", "section", "sections", "subsection", "subsections", "article", "articles", "annex", "exhibit", "schedule", "appendix",
  // NOTE - subordinating connectives were REMOVED from this set (canary #2).
  // They used to live here on the reasoning that "a real proviso or exception always carries a content word of
  // its own besides these". An independent red team falsified that: "except as provided in Section 6.02," is
  // built entirely from those connectives plus grammar plus a section number, so it scored zero content words
  // and was dismissed as STRUCTURAL_NOISE while a cross-referenced exception disappeared from the accounting.
  // A word that can introduce a condition, exception, proviso or override is never sufficient, on its own, to
  // make uncovered text harmless: provided, except, unless, including, subject, notwithstanding, however,
  // pursuant, whereas. They are content words now, and glue like ", provided that" is surfaced instead.
  // adverbial adjuncts - see ADVERBIAL_ADJUNCTS below. They remain in this set because the nominal-label tests
  // treat them as grammar, but they can NO LONGER make a residue vanish as structural noise (canary #9).
  ...ADVERBIAL_ADJUNCTS,
  // arithmetic / compositional operators - see ARITHMETIC_OPERATORS below. They remain in this set because the
  // nominal-label tests treat them as grammar, but they can NO LONGER make a residue vanish as structural
  // noise (closure remediation RT-3).
  ...ARITHMETIC_OPERATORS,
]);

const WORD_RE = /[A-Za-z][A-Za-z'-]*/g;

/** Strips enumerators and punctuation, returning the content words of a fragment. */
function contentWords(fragment: string): string[] {
  const words = fragment.replace(new RegExp(ENUMERATOR_SRC, "g"), " ").match(WORD_RE) ?? [];
  return words.map((w) => w.toLowerCase().replace(/[^a-z]/g, "")).filter((w) => w.length > 0 && !FUNCTION_WORDS.has(w));
}

/** "Section 6.02", "clause (iv)", "Schedule 1.01(a)" and nothing else. */
const CITATION_ONLY_RE = /^[\s(]*(?:see\s+)?(?:section|clause|paragraph|subsection|article|annex|exhibit|schedule|appendix)s?\s*[\dA-Za-z.()–—-]*\s*[.,;:)]*\s*$/i;
/**
 * The FRAME of a possible numbered caption ("6.02 Liens.", "SECTION 7.04 Dispositions."), capturing whatever
 * follows the number. The frame alone decides nothing - numbering is not evidence that what follows is a
 * label (canary #7). The remainder is put to isNominalLabel below.
 *
 * The body used to be `[A-Za-z][\w\s,'&/-]{0,80}?`: an arbitrary run of words under a length ceiling. An
 * independent red team walked a whole negative covenant through it - "6.02 The Borrower shall not create any
 * Lien on the Collateral" was a heading, and the line vanished with unaccounted 0, INVENTORY_OK and
 * semanticallyComplete true. The ceiling is gone; length never decides eligibility for scrutiny.
 */
const NUMBERED_CAPTION_FRAME_RE = /^\s*(?:section|article|annex|exhibit|schedule|appendix)?\s*\d+(?:\.\d+)*\s*[.:)]?\s*([A-Za-z][^\n]*?)\s*[.:]?\s*$/i;
/**
 * ALL-CAPS TYPOGRAPHY NOW GRANTS NOTHING AT ALL (canary #10).
 *
 * Canary #8 replaced "all caps + at most 82 characters" with a positive test: all caps, no clause punctuation,
 * no determiner or pronoun. That rule was necessary but never sufficient, and it shipped with its own
 * counterexample already pinned in a test: "BORROWER SHALL PAY INTEREST" satisfies every condition and is a
 * proposition. The reason is structural, not lexical - a determiner marks an argument position, but a
 * predication whose arguments are BARE NOUNS has no determiner to find. "COMPANY DELIVERS REPORTS" is the same
 * shape with no legal vocabulary in it at all. The absence of a determiner is therefore evidence of nothing.
 *
 * The architectural question this canary asks is: what independent structural evidence actually proves this
 * source is a heading? At this layer, none exists. computeSourceCoverage receives SourceContextRegion, whose
 * sourceNodeId and sectionRef describe the WHOLE region rather than the line; no per-fragment heading or
 * caption metadata reaches the classifier; segmentation reports where units begin and end, not what they are.
 * The structural index does distinguish heading-only nodes (reference-resolver.ts), but that signal is not
 * plumbed into coverage, and plumbing it is a larger change than this mission authorises.
 *
 * Since deterministic structure cannot positively distinguish "NEGATIVE COVENANTS" from "BORROWER SHALL PAY
 * INTEREST", the detector no longer pretends that it can. The ALL-CAPS suppression is removed outright rather
 * than patched with a further lexical exception. An all-caps fragment must now qualify under a frame that is
 * independent of casing - a bare citation, a numbered caption, a quoted defined-term name, pagination, a
 * table-of-contents leader - or it stays UNACCOUNTED_SOURCE.
 *
 * The cost is disclosed and accepted: a bare all-caps article heading with no section number in front of it is
 * now a review gap. A false review on an unusual heading is acceptable; a silently deleted covenant is not.
 * Restoring those controls to green is future work behind real structural heading metadata, NOT another
 * heuristic here.
 */
/**
 * Page furniture: "Page 12", "Page 12 of 40", "12 of 40", "- 12 -". Pagination must be established by
 * AFFIRMATIVE STRUCTURE - the word "page", the "N of M" folio idiom, or a number enclosed by dashes on both
 * sides. Numeric shape alone proves nothing (canary #6).
 *
 * The alternative `[-–—\s]*\d+[-–—\s]*` used to sit in the middle of this list, which made ANY standalone
 * integer page furniture. An independent red team walked a basket table straight through it: a bare
 * `25000000` on its own line was "page or table-of-contents furniture" and a basket amount disappeared with
 * unaccounted 0, INVENTORY_OK and semanticallyComplete true. A lone number may be a page number, a table cell,
 * a basket, a threshold, a period, a multiplier or any other contractual input; nothing about its shape says
 * which, so it is no longer suppressed here.
 */
const PAGE_FURNITURE_RE = /^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s+of\s+\d+|[-–—]\s*\d+\s*[-–—])\s*$/i;
const TOC_LEADER_RE = /\.{4,}\s*\d+\s*$/;
/**
 * The QUOTE FRAME of a possible defined-term label: `"Permitted Liens"`, or `"Permitted Liens" means`, standing
 * alone in a segment. The frame alone decides nothing - quotation marks are not evidence about what they
 * contain. What is inside the quotes is captured and put to isNominalLabel below (canary #5).
 */
const QUOTED_LABEL_FRAME_RE = /^\s*[“"]([^”"]+)[”"]\s*(?:means|shall\s+mean|has\s+the\s+meaning[^.]*)?\s*[.:;,]?\s*$/i;

/**
 * Is this text a LABEL - a name - rather than a proposition?
 *
 * Introduced for the text inside a pair of quotation marks (canary #5) and reused unchanged for the remainder
 * of a numbered caption (canary #7). Both frames pose the same question, and neither frame answers it: quotes
 * do not make text a name, and neither does a section number.
 *
 * Previously this asked only whether a quoted run was at most 120 characters and stood alone in its segment,
 * so an entire replacement covenant installed by an amendment - the operative point of the amendment - was
 * dismissed as "a quoted defined-term label with no operative body". Quotation marks do not make source
 * non-semantic; quoted source is accountable exactly like unquoted source.
 *
 * The test is now POSITIVE and structural: label-hood must be established, and only two things establish it.
 *   1. No clause punctuation inside the quotes. A sentence terminator or a comma is sentence structure, and a
 *      name has none.
 *   2. Every word inside is either pure grammar (the existing closed class) or an orthographic proper-noun
 *      form, and at least one is a name. A proposition fails this on its predicate: a lowercase content word
 *      such as "make", "deliver" or "continuing" is a verb doing work, not part of a name.
 *
 * Anything not established as a name keeps the conservative default and is surfaced for review. There is no
 * length ceiling here, no vocabulary belonging to any subject matter, and no notion of what an amendment is.
 *
 * Known and accepted false reviews: a lowercase defined term (`"business day"`) and a term carrying internal
 * periods (`"U.S. Government Securities"`) are reported rather than dismissed. Per the trust-boundary
 * architecture, a false review is acceptable and a silently dropped covenant is not.
 */
function isNominalLabel(candidate: string): boolean {
  const text = candidate.trim();
  if (text.length === 0) return false;
  if (/[.;:!?,]/.test(text)) return false;
  const words = text.match(new RegExp(WORD_RE.source, "g")) ?? [];
  if (words.length === 0) return false;
  let carriesAName = false;
  for (const word of words) {
    if (FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ""))) continue;
    if (!/^[A-Z]/.test(word)) return false;
    carriesAName = true;
  }
  return carriesAName;
}

/**
 * Classifies a fragment that no inventory item anchors. Returns
 * UNACCOUNTED_SOURCE unless a deterministic rule positively excludes it -
 * the conservative default required by §4 and §15.
 */
export function classifyUnaccountedFragment(fragment: string, values: QuantitativeValue[]): { disposition: CoverageDisposition; reason: string } {
  const trimmed = fragment.trim();
  if (trimmed.length === 0) return { disposition: "PUNCTUATION_OR_DELIMITER", reason: "whitespace only" };
  // NON-LATIN TEXT IS NOT PUNCTUATION (canary #11). This test used to be `!/[A-Za-z0-9]/` - "no ASCII
  // alphanumerics" taken to mean "punctuation and delimiters only". An independent red team walked a Chinese
  // negative-pledge sentence through it: 24 Han letters and an ideographic full stop, zero ASCII letters, so
  // the whole clause was PUNCTUATION_OR_DELIMITER and vanished between two covered English clauses. The
  // absence of [A-Za-z] establishes nothing. Punctuation is the absence of any letter or digit in ANY script.
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return { disposition: "PUNCTUATION_OR_DELIMITER", reason: "punctuation and delimiters only - no letter or digit in any script" };

  // A fragment carrying a quantitative value is never dismissed as noise, whatever its shape.
  if (values.length === 0) {
    if (PAGE_FURNITURE_RE.test(trimmed) || TOC_LEADER_RE.test(trimmed)) return { disposition: "NON_SEMANTIC_FORMATTING", reason: "page or table-of-contents furniture" };
    if (CITATION_ONLY_RE.test(trimmed)) return { disposition: "CITATION_ONLY", reason: "a bare cross-reference with no proposition of its own" };
    const quoted = QUOTED_LABEL_FRAME_RE.exec(trimmed);
    if (quoted && isNominalLabel(quoted[1]!)) return { disposition: "DEFINED_TERM_LABEL", reason: "a quoted defined-term name - nominal only, no proposition inside the quotation" };
    // A digit that survives enumerator stripping is contractual content the letter-blind rules below cannot
    // see (canary #6). contentWords matches [A-Za-z] only, so "25000000", "4.00" and "2028" all score zero
    // content words and would otherwise be dismissed as the residue of splitting a parent unit. Enumerator
    // forms - "(2)", "3." - are stripped first, so numeric enumerators are still suppressed as before. This
    // runs AFTER every positive structural rule - pagination, citation and the caption rules below - so a
    // fragment any of those establishes keeps its disposition. What is left is an unexplained number, and an
    // unexplained number is accountable.
    const carriesUnexplainedDigits = /\d/.test(trimmed.replace(new RegExp(ENUMERATOR_SRC, "g"), " "));
    // The same blindness, one layer down (canary #11): WORD_RE is [A-Za-z]-only, so contentWords sees nothing
    // in a fragment written in any other script and the STRUCTURAL_NOISE branch would swallow it next. A letter
    // the ASCII word scanner cannot see is substantive content that no rule here can prove is formatting. This
    // is script-agnostic by construction - it detects letters, not Chinese, Japanese, Korean or anything else -
    // and is confined to this branch: the ownership machinery and the nominal-label tests are unchanged.
    const carriesUnexplainedLetters = /\p{L}/u.test(trimmed.replace(new RegExp(ENUMERATOR_SRC, "g"), " ").replace(/[A-Za-z]/g, ""));
    // A residue carrying an adverbial adjunct is standalone modifier content, not glue (canary #9). The check
    // is deliberately confined to this branch: contentWords keeps its meaning everywhere else, so the
    // connective-ownership machinery (canary #2B) is untouched.
    const lowerWords = trimmed.toLowerCase().match(new RegExp(WORD_RE.source, "g")) ?? [];
    const carriesAdjunct = lowerWords.some((w) => ADVERBIAL_ADJUNCTS.has(w.replace(/[^a-z]/g, "")));
    // A residue carrying an arithmetic / compositional operator is substantive, not glue (closure remediation
    // RT-3). Confined to this branch exactly as the adjunct guard is: contentWords keeps its meaning everywhere
    // else, so connective ownership and the nominal-label tests are untouched.
    const carriesOperator = lowerWords.some((w) => ARITHMETIC_OPERATORS.has(w.replace(/[^a-z]/g, "")));
    const words = contentWords(trimmed);
    if (words.length === 0 && !carriesUnexplainedDigits && !carriesUnexplainedLetters && !carriesAdjunct && !carriesOperator) return { disposition: "STRUCTURAL_NOISE", reason: "enumerators, punctuation and closed-class connectives only - the residue of splitting a parent unit" };
    // Headings carry no clause terminator and no verb-bearing body; require BOTH the caption shape and the absence of an internal terminator.
    // A caption has no SENTENCE terminator inside it. A decimal point inside a section number ("7.04") is not one,
    // so the terminator must be followed by whitespace to count.
    const noInternalTerminator = !/[.;:!?]\s+\S/.test(trimmed);
    // Neither frame decides. A numbered line is a caption only when what FOLLOWS the number is a label
    // (canary #7); an ALL-CAPS line is a heading only when it is a determinerless nominal (canary #8).
    const numbered = NUMBERED_CAPTION_FRAME_RE.exec(trimmed);
    if (noInternalTerminator && numbered !== null && isNominalLabel(numbered[1]!)) return { disposition: "HEADING_OR_LABEL", reason: "a section caption - the text after the number is a name, not a proposition" };
    if (carriesOperator) {
      return {
        disposition: "UNACCOUNTED_SOURCE",
        reason: "carries an arithmetic or compositional operator that no inventory item anchors - the operator says how covered components combine, so it is standalone content and not the glue left over from splitting a parent unit",
      };
    }
    if (carriesAdjunct) {
      return {
        disposition: "UNACCOUNTED_SOURCE",
        reason: "carries an adverbial adjunct that no inventory item anchors - a modifier changes the scope, allocation, directness or distribution of what it attaches to, so it is standalone content and not the glue left over from splitting a parent unit",
      };
    }
    if (carriesUnexplainedLetters) {
      return {
        disposition: "UNACCOUNTED_SOURCE",
        reason: "carries letters outside the Latin script that no inventory item anchors and that no deterministic rule establishes as formatting - the detector cannot read them, and what it cannot read it cannot dismiss",
      };
    }
    // Last, once every positive structural rule above has had its chance: an unexplained number is accountable.
    if (carriesUnexplainedDigits) {
      return {
        disposition: "UNACCOUNTED_SOURCE",
        reason: "carries a number that no inventory item anchors, that the quantitative extractor did not recognise, and that no deterministic rule establishes as pagination - a bare number may be a basket, a threshold, a period or a page number, and its shape does not say which",
      };
    }
  }
  return {
    disposition: "UNACCOUNTED_SOURCE",
    reason: values.length > 0
      ? `no inventory item anchors this text, and it carries ${values.length} quantitative value(s) (${values.map((v) => v.rawText).join(", ")}) - materiality undetermined, never assumed immaterial`
      : "no inventory item anchors this text and no deterministic rule classifies it as non-semantic - materiality undetermined, never assumed immaterial",
  };
}

// ---------------------------------------------------------------------------
// Structural connective ownership (canary #2B)
// ---------------------------------------------------------------------------

/**
 * Connectives whose ENTIRE semantic contribution is to attach the subordinate clause that follows them.
 * Membership here does not make a fragment harmless - it only makes it a CANDIDATE for inheriting coverage from
 * a complement that deterministic structure proves is its own. Every condition in `connectiveOwnsComplement`
 * must still hold, and a fragment carrying any object of its own is rejected whatever words it uses.
 *
 * "notwithstanding" is deliberately absent. It is an OVERRIDE operator, not a clause introducer: its complement
 * is the provision being disapplied, which lives elsewhere in the agreement. Covering the text that follows it
 * therefore does not account for the override relationship, so a stranded "notwithstanding" stays a review gap.
 */
const CLAUSE_INTRODUCING_CONNECTIVES = new Set(["provided", "except", "unless", "including", "subject", "if", "whereas", "pursuant", "however"]);

/** Reference nouns that, together with a locator, make a fragment carry its OWN object rather than pure glue. */
const REFERENCE_NOUN_RE = /\b(section|clause|paragraph|subsection|article|annex|exhibit|schedule|appendix)s?\b/i;

/**
 * True when a fragment is nothing but a clause-introducing connective: it has at least one connective content
 * word, every content word it has is such a connective, and it carries no object of its own.
 *
 * The object test is what separates ", provided that" (glue) from ", except as provided in Section 6.02,"
 * (an exception whose content IS the cross-reference). A digit or a reference noun means the connective is
 * saying something itself, so it can never be discharged by whatever happens to follow it.
 */
function isPureClauseIntroducer(fragment: string, values: QuantitativeValue[]): boolean {
  if (values.length > 0) return false;
  if (/\d/.test(fragment)) return false;
  if (REFERENCE_NOUN_RE.test(fragment)) return false;
  if (/["\u201c\u201d]/.test(fragment)) return false;
  const words = contentWords(fragment);
  return words.length > 0 && words.every((w) => CLAUSE_INTRODUCING_CONNECTIVES.has(w));
}

/**
 * Attaches a stranded connective to the clause it introduces, but ONLY on deterministic structural evidence:
 *
 *  - the fragment is a pure clause introducer carrying no object and no value (above);
 *  - the very next span in the region is COVERED_BY_INVENTORY - nothing but whitespace intervenes, so no
 *    independent clause and no clause terminator sits between the connective and its complement;
 *  - that complement's coverage BEGINS where the connective ends, i.e. the covered clause is the one the
 *    connective introduces rather than some later clause;
 *  - the complement is substantive in its own right (it has content words of its own).
 *
 * If any of that is missing the fragment stays UNACCOUNTED_SOURCE. Text following a connective, a covered
 * neighbour, brevity, or resemblance to a known connective are each insufficient on their own.
 */
function applyConnectiveOwnership(regionSpans: SourceCoverageSpan[], text: string): void {
  for (let i = 0; i < regionSpans.length; i++) {
    const span = regionSpans[i]!;
    if (span.disposition !== "UNACCOUNTED_SOURCE") continue;
    if (!isPureClauseIntroducer(span.excerpt, span.values)) continue;
    // The complement must be the immediately following covered span, with only whitespace in between.
    let j = i + 1;
    while (j < regionSpans.length && regionSpans[j]!.excerpt.trim().length === 0) j++;
    const complement = regionSpans[j];
    if (!complement || complement.disposition !== "COVERED_BY_INVENTORY") continue;
    if (text.slice(span.charEnd, complement.charStart).trim().length > 0) continue;
    if (contentWords(complement.excerpt).length === 0) continue;
    span.disposition = "COVERED_BY_CONNECTIVE_OWNERSHIP";
    span.reason = `a clause-introducing connective carrying no object of its own, immediately followed by the covered clause it introduces (${complement.regionId}:${complement.charStart}-${complement.charEnd})`;
  }
}

// ---------------------------------------------------------------------------
// The coverage pass
// ---------------------------------------------------------------------------

const emptyCounts = (): Record<CoverageDisposition, number> => Object.fromEntries(COVERAGE_DISPOSITIONS.map((d) => [d, 0])) as Record<CoverageDisposition, number>;

/**
 * INDEPENDENT STRUCTURAL SEGMENTS (canary #3).
 *
 * Boundaries between INDEPENDENT propositions: a clause terminator followed by whitespace, or a line break.
 * Deliberately narrower than `segmentSourceUnits`, which also splits at commas, dashes and enumerators - those
 * separate the PARTS of one proposition, not one proposition from the next.
 */
function independentSegmentBounds(text: string): number[] {
  const bounds = new Set<number>([0, text.length]);
  for (const m of text.matchAll(/[.;:!?]["')\]]?\s+/g)) bounds.add(m.index! + m[0].length);
  for (const m of text.matchAll(/\n+[ \t]*/g)) bounds.add(m.index! + m[0].length);
  return [...bounds].sort((a, b) => a - b);
}

/**
 * Clips an inventory item's COVERAGE CREDIT to the independent segment its span starts in.
 *
 * A span is evidence about the proposition the item represents. It is not evidence about whatever else happens
 * to sit inside the same character range, and nothing downstream can tell the difference once the mask is
 * filled - which is how one item with a huge span and a vacuous proposition used to discharge a whole provision.
 *
 * A single item may still anchor a continuous clause that internal punctuation splits into several units
 * ("if the ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000" is one proposition): a comma
 * is not an independent-segment boundary. What is refused is one item claiming several INDEPENDENT propositions,
 * because there is no deterministic basis for believing it represents the second and third (mission §6 - false
 * review beats silent omission). The item keeps its full span for provenance; only the credit is clipped.
 */
function clipCreditToStartSegment(charStart: number, charEnd: number, bounds: number[]): { from: number; to: number } {
  let segEnd = charEnd;
  for (const b of bounds) {
    if (b > charStart) {
      segEnd = b;
      break;
    }
  }
  return { from: charStart, to: Math.min(charEnd, segEnd) };
}

/**
 * COORDINATION BOUNDARIES (canary #4).
 *
 * Coordination is a STRUCTURAL relation, not a vocabulary: "A and B and C" is three conjuncts whatever A, B and
 * C say. Splitting a lead-in there is what separates a pure introduction from a lead-in that carries independent
 * predicates of its own, without any threshold and without any legal keyword list.
 */
const COORDINATION_BOUNDARY_RE = /\s+(?:and\/or|and|or)\s+/gi;

/**
 * Residue-first child descent (mission §6).
 *
 * A parent's residue - what is left of the lead-in once child coverage is subtracted - is split at coordination
 * boundaries and only the FINAL fragment, the one that actually introduces the children, is eligible for
 * discharge. Everything earlier in the parent is an independent conjunct: children account for their own
 * semantics, they never grant their parent a blanket exemption.
 *
 * Each fragment is then re-classified by the ordinary conservative rules, so an earlier conjunct that happens to
 * be pure glue is still suppressed, and any fragment carrying a quantitative value of any kind is never
 * discharged - the value guard applies per fragment, not per residue.
 */
function splitParentResidue(span: SourceCoverageSpan, text: string): SourceCoverageSpan[] {
  const cuts: { start: number; end: number }[] = [];
  let cursor = span.charStart;
  const re = new RegExp(COORDINATION_BOUNDARY_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(span.excerpt)) !== null) {
    const boundary = span.charStart + m.index + m[0].length;
    if (boundary > cursor) cuts.push({ start: cursor, end: boundary });
    cursor = boundary;
  }
  if (cursor < span.charEnd) cuts.push({ start: cursor, end: span.charEnd });
  if (cuts.length <= 1) return [span];
  return cuts.map((c) => {
    const excerpt = text.slice(c.start, c.end);
    const values = span.values.filter((v) => v.charStart >= c.start && v.charEnd <= c.end);
    const { disposition, reason } = classifyUnaccountedFragment(excerpt, values);
    return { regionId: span.regionId, charStart: c.start, charEnd: c.end, disposition, reason, excerpt, values };
  });
}

const accountsForSource = (materiality: string): boolean => materiality === "CRITICAL" || materiality === "MATERIAL";

/**
 * Computes source coverage over EVERY region of the semantic unit.
 *
 * There is no region-kind filter, no length floor, no vocabulary gate and no
 * coverage threshold: partial coverage of a unit yields residue spans that
 * are themselves classified, so half of a boundary-free sentence can never
 * disappear behind one broad item span.
 */
export function computeSourceCoverage(input: SourceCoverageInput): SourceCoverageResult {
  const external = new Map((input.externalAccountability ?? []).filter((l) => l.ownerCandidateRef && l.ownerInventoryHash).map((l) => [l.regionId, l]));
  const spans: SourceCoverageSpan[] = [];

  for (const region of input.regions) {
    const text = region.text;
    const regionValues = scanQuantitativeValues(text);
    const valuesIn = (a: number, b: number) => regionValues.filter((v) => v.charStart >= a && v.charEnd <= b);
    const link = external.get(region.regionId);
    if (link) {
      spans.push({ regionId: region.regionId, charStart: 0, charEnd: text.length, disposition: "ACCOUNTED_BY_EXTERNAL_UNIT", reason: `semantics owned by unit ${link.ownerCandidateRef} (inventory ${link.ownerInventoryHash})`, excerpt: text, values: regionValues, externalOwnerRef: link.ownerCandidateRef });
      continue;
    }

    const mask = new Uint8Array(text.length);
    const bounds = independentSegmentBounds(text);
    for (const s of input.spans) {
      if (s.regionId !== region.regionId || !accountsForSource(s.materiality)) continue;
      // Span overlap is NOT semantic coverage (canary #3). Credit is clipped to the independent segment the
      // span starts in, so an overbroad anchor cannot discharge propositions it does not represent.
      const { from, to } = clipCreditToStartSegment(Math.max(0, s.charStart), Math.min(text.length, s.charEnd), bounds);
      if (to > from) mask.fill(1, from, to);
    }

    const units = segmentSourceUnits(text, regionValues);
    // Structural ownership (§7): a unit ending in ':' is a chapeau owning the enumerated units that follow it.
    // A lead-in owns the enumerated clauses that follow it. Ownership is STRUCTURAL: the parent of an enumerated
    // unit is the nearest preceding non-enumerated unit, whether or not the lead-in ends in a colon (real drafting
    // runs "... shall be (a) ... (b) ..." inline just as often as "... as follows:"). No vocabulary is consulted.
    const isEnumerated = units.map((u) => ENUMERATOR_AT_START.test(text.slice(u.charStart, u.charEnd)));
    const parentOf = new Array<number>(units.length).fill(-1);
    for (let i = 0; i < units.length; i++) {
      if (!isEnumerated[i]) continue;
      let j = i - 1;
      while (j >= 0 && isEnumerated[j]) j--;
      if (j >= 0) parentOf[i] = j;
    }

    // Per unit: covered stretches and uncovered residues, each classified on its own.
    const unitSpans: SourceCoverageSpan[][] = [];
    for (const u of units) {
      const local: SourceCoverageSpan[] = [];
      let runStart = u.charStart;
      let runCovered = mask[u.charStart] === 1;
      const flush = (end: number) => {
        if (end <= runStart) return;
        const frag = text.slice(runStart, end);
        if (frag.trim().length === 0) {
          local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition: "PUNCTUATION_OR_DELIMITER", reason: "whitespace between accounted spans", excerpt: frag, values: [] });
          return;
        }
        const vals = valuesIn(runStart, end);
        if (runCovered) local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition: "COVERED_BY_INVENTORY", reason: "anchored by a CRITICAL/MATERIAL inventory item span", excerpt: frag, values: vals });
        else {
          const { disposition, reason } = classifyUnaccountedFragment(frag, vals);
          local.push({ regionId: region.regionId, charStart: runStart, charEnd: end, disposition, reason, excerpt: frag, values: vals });
        }
      };
      for (let k = u.charStart; k < u.charEnd; k++) {
        const covered = mask[k] === 1;
        if (covered !== runCovered) {
          flush(k);
          runStart = k;
          runCovered = covered;
        }
      }
      flush(u.charEnd);
      unitSpans.push(local);
    }

    // Child descent (§7): a chapeau's own unaccounted residue is discharged only when EVERY child it owns is
    // accounted for and the residue carries no quantitative value of its own. Credit flows child -> parent only:
    // a covered parent never discharges an uncovered child (that is exactly the audit's carve-out failure).
    for (let i = 0; i < units.length; i++) {
      const children = parentOf.map((p, j) => (p === i ? j : -1)).filter((j) => j >= 0);
      if (children.length === 0) continue;
      // Two conditions, and they are different questions. Every child must need no review (nothing in it is
      // UNACCOUNTED_SOURCE) AND every child must carry at least one semantically OWNED span - an inventory or
      // external anchor. A child made only of enumerator glue, punctuation, a label or a citation is accounted
      // for but represents nothing, so it cannot lend its parent any semantics to inherit.
      const childrenAccounted = children.every((j) => unitSpans[j]!.every((s) => isAccountedDisposition(s.disposition)));
      const childrenOwned = children.every((j) => unitSpans[j]!.some((s) => isSemanticallyOwned(s.disposition)));
      if (!childrenAccounted || !childrenOwned) continue;
      // Residue-first (canary #4): the parent residue is split at coordination boundaries and ONLY the final
      // fragment - the one that introduces the children - can be discharged. An earlier conjunct is an
      // independent predicate of the parent's own, so it stays accountable; a fragment carrying a value of any
      // kind is never discharged.
      const rebuilt: SourceCoverageSpan[] = [];
      for (const s of unitSpans[i]!) {
        if (s.disposition !== "UNACCOUNTED_SOURCE") {
          rebuilt.push(s);
          continue;
        }
        rebuilt.push(...splitParentResidue(s, text));
      }
      let lastResidue = -1;
      for (let k = 0; k < rebuilt.length; k++) if (rebuilt[k]!.disposition === "UNACCOUNTED_SOURCE") lastResidue = k;
      // The eligible fragment must be the last thing in the parent unit apart from whitespace/punctuation, i.e.
      // it must actually run up to the children.
      const introducesChildren = lastResidue >= 0 && rebuilt.slice(lastResidue + 1).every((s) => s.excerpt.trim().length === 0 || s.disposition === "PUNCTUATION_OR_DELIMITER");
      if (introducesChildren && rebuilt[lastResidue]!.values.length === 0) {
        rebuilt[lastResidue] = { ...rebuilt[lastResidue]!, disposition: "COVERED_BY_CHILD_DESCENT", reason: `introduces an enumerated list whose ${children.length} child clause(s) are each anchored by an inventory item or an external unit and need no review; carries no independent conjunct and no quantitative value of its own` };
      }
      unitSpans[i] = rebuilt;
    }
    const regionSpans = unitSpans.flat();
    applyConnectiveOwnership(regionSpans, text);
    spans.push(...regionSpans);
  }

  const merged = mergeAdjacent(spans);
  const unaccounted = merged.filter((s) => s.disposition === "UNACCOUNTED_SOURCE");
  const countsByDisposition = emptyCounts();
  const charsByDisposition = emptyCounts();
  for (const s of merged) {
    countsByDisposition[s.disposition]++;
    charsByDisposition[s.disposition] += s.excerpt.replace(/\s+/g, "").length;
  }
  // A value is unaccounted when no CRITICAL/MATERIAL item anchors it AND the span holding it is not deterministically
  // non-semantic. Every quantitative kind counts - there is no money/percent/ratio shortlist (audit finding 2).
  const unaccountedValues: (QuantitativeValue & { regionId: string })[] = [];
  for (const s of merged) {
    if (s.disposition === "COVERED_BY_INVENTORY" || s.disposition === "ACCOUNTED_BY_EXTERNAL_UNIT") continue;
    if (isAccountedDisposition(s.disposition) && s.disposition !== "COVERED_BY_CHILD_DESCENT") continue;
    for (const v of s.values) unaccountedValues.push({ ...v, regionId: s.regionId });
  }
  return { spans: merged, unaccounted, unaccountedValues, countsByDisposition, charsByDisposition, regionsConsidered: input.regions.map((r) => r.regionId) };
}

/** Merges neighbouring spans that share a disposition, so a gap reads as one coherent stretch of text. */
function mergeAdjacent(spans: SourceCoverageSpan[]): SourceCoverageSpan[] {
  const out: SourceCoverageSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.regionId === s.regionId && last.charEnd === s.charStart && last.disposition === s.disposition) {
      last.charEnd = s.charEnd;
      last.excerpt += s.excerpt;
      last.values = [...last.values, ...s.values];
      continue;
    }
    out.push({ ...s, values: [...s.values] });
  }
  // Trim trailing/leading whitespace off unaccounted spans so an excerpt reads cleanly; offsets stay exact.
  return out.map((s) => {
    if (s.disposition !== "UNACCOUNTED_SOURCE") return s;
    const lead = s.excerpt.length - s.excerpt.trimStart().length;
    const trail = s.excerpt.length - s.excerpt.trimEnd().length;
    return { ...s, charStart: s.charStart + lead, charEnd: s.charEnd - trail, excerpt: s.excerpt.trim() };
  });
}
