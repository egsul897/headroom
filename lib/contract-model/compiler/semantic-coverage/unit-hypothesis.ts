/**
 * Phase 3E §155 - Layer A/B: deterministic semantic-unit hypothesis
 * generation. Takes the router's own admitted regions (router.ts) and
 * splits each into one or more MaterialSemanticUnit hypotheses - never
 * forced 1:1 with a structural node (task §7). The concrete motivating
 * case (task's own worked example): a single "shall not... except:"
 * section enumerating several carve-outs, one of which states its own
 * numeric dollar limitation, is modeled as an umbrella prohibition unit
 * PLUS one separately-represented PERMISSION unit per enumerated
 * carve-out - a carve-out with a stated cap is a basket in its own right,
 * structurally, even when it appears inside a longer prose list of
 * otherwise unlimited/qualitative carve-outs.
 *
 * INDEPENDENCE: reuses coverage-audit/signals.ts's detectIndependentSignals
 * directly (a pure, generic, already-tested text-pattern utility with zero
 * Phase 2B/2D conclusion dependency - the same reuse precedent router.ts
 * and Phase 3C's source-inventory.ts both already established). The
 * enumerated-item splitter below is independently authored against this
 * task's own §7/§13 requirement, not derived from
 * coverage-audit/signals.ts's own countInlineEnumerationMarkers (which
 * returns deduplicated marker names only, not the positions this layer
 * needs to actually split text into item spans) - inevitable vocabulary
 * overlap with that function's own "genuine item" gap heuristic is
 * expected, since both address the same real drafting pattern.
 *
 * This file never imports discovery/*, context-retrieval/*, semantic/
 * compile.ts, semantic-verification/verify.ts, or semantic-precedent/* -
 * enforced by tests/contract-model/semantic-coverage-independence.test.ts.
 */
import type { StructuralIndex } from "../structural-index";
import { detectIndependentSignals, detectAmendmentAndDefinitionalSignals, type SignalHit } from "../coverage-audit/signals";
import { extractValueAnchors, valueAnchorSetsDisjointAndNonEmpty } from "../value-anchors";
import { computeSemanticUnitId } from "./identity";
import type { DocumentRoutingResult, DetectedPostureSignal, MaterialSemanticUnit, MaterialUnitFamily, RoutedRegion, SemanticUnitMateriality, SourceAnchor } from "./types";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";

/** Merges the two signal families coverage-audit/signals.ts exposes - detectIndependentSignals' own PROHIBITORY_PERMISSIVE/ECONOMIC/MECHANIC/FAMILY_HEADLINE set plus the DEFINITIONAL category from detectAmendmentAndDefinitionalSignals (deliberately kept out of the former by that module's own design for its unrelated fallback-path purpose, but genuinely needed here so a real "X means..." definition is classified DEFINITIONAL_SIGNAL rather than falling through to whatever weaker signal happens to co-occur in the same clause). */
function detectAllSignals(text: string): SignalHit[] {
  return [...detectIndependentSignals(text), ...detectAmendmentAndDefinitionalSignals(text).filter((s) => s.category === "DEFINITIONAL")];
}

// ---------------------------------------------------------------------------
// Enumerated-item splitting (task §7/§13)
// ---------------------------------------------------------------------------

const ENUMERATION_MARKER = /\((?:[ivxlcdm]{1,6}|[a-z]{1,2}|\d{1,3})\)/gi;
const MIN_GAP_CHARS = 12;
const SUBSTANTIVE_NEARBY_GAP = /[$%]|greater of|lesser of|shall not|provided|so long as|notwithstanding|except|Indebtedness|Investment|Restricted Payment|Lien|Disposition/i;

interface MarkerOccurrence {
  marker: string;
  start: number;
  end: number;
}

function findGenuineMarkers(text: string): MarkerOccurrence[] {
  const re = new RegExp(ENUMERATION_MARKER.source, ENUMERATION_MARKER.flags);
  const occurrences: MarkerOccurrence[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    occurrences.push({ marker: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  const genuine: MarkerOccurrence[] = [];
  for (let i = 0; i < occurrences.length; i++) {
    const cur = occurrences[i]!;
    const nextStart = i + 1 < occurrences.length ? occurrences[i + 1]!.start : text.length;
    const gapText = text.slice(cur.end, nextStart);
    if (gapText.trim().length >= MIN_GAP_CHARS || SUBSTANTIVE_NEARBY_GAP.test(gapText)) genuine.push(cur);
  }
  return genuine;
}

export interface EnumeratedSplit {
  chapeauText: string;
  chapeauEnd: number;
  items: { marker: string; start: number; end: number; text: string }[];
}

/**
 * Splits region text into a chapeau (the umbrella text before the first
 * genuine enumerated item) plus one span per genuine item. Returns null
 * when fewer than two genuine markers are found (task's own "never force
 * 1:1" cuts both ways - a region with zero or one enumerated item is left
 * as a single unit, not artificially split).
 */
export function splitEnumeratedItems(text: string): EnumeratedSplit | null {
  const markers = findGenuineMarkers(text);
  if (markers.length < 2) return null;
  const items = markers.map((marker, i) => {
    const nextStart = i + 1 < markers.length ? markers[i + 1]!.start : text.length;
    return { marker: marker.marker, start: marker.start, end: nextStart, text: text.slice(marker.end, nextStart) };
  });
  return { chapeauText: text.slice(0, markers[0]!.start), chapeauEnd: markers[0]!.start, items };
}

// ---------------------------------------------------------------------------
// Family classification (task §9) - open taxonomy, headingHint checked
// first (most reliable - a real section heading like "6.01 Indebtedness"),
// falling back to the unit's own text. Generic keyword matching only - no
// company/package-specific term appears here (Architecture Invariants #29).
// ---------------------------------------------------------------------------

const FAMILY_KEYWORDS: { family: MaterialUnitFamily; re: RegExp }[] = [
  { family: "INDEBTEDNESS", re: /\bIndebtedness\b/i },
  { family: "LIENS", re: /\bLiens?\b/i },
  { family: "RESTRICTED_PAYMENTS", re: /\bRestricted Payments?\b/i },
  { family: "INVESTMENTS", re: /\bInvestments?\b/i },
  { family: "ACQUISITIONS", re: /\bAcquisitions?\b/i },
  { family: "ASSET_SALES", re: /\bAsset Sales?\b/i },
  { family: "DISPOSITIONS", re: /\bDispositions?\b/i },
  { family: "SALE_LEASEBACKS", re: /\bSale.?Leaseback/i },
  { family: "FINANCIAL_COVENANTS", re: /\bFinancial Covenants?\b/i },
  { family: "MANDATORY_PREPAYMENTS", re: /\bMandatory Prepayments?\b/i },
  { family: "REPORTING_INFORMATION", re: /\b(?:Reporting Requirements?|Financial Statements)\b/i },
  { family: "FUNDAMENTAL_CHANGES", re: /\b(?:Fundamental Changes?|Merger|Consolidation)\b/i },
  { family: "AFFILIATE_TRANSACTIONS", re: /\bAffiliate Transactions?\b/i },
  { family: "GUARANTOR_REQUIREMENTS", re: /\bGuarantor Requirements?\b/i },
  { family: "GUARANTEES", re: /\bGuarant(?:y|ies|ee)\b/i },
  { family: "COLLATERAL_SECURITY", re: /\b(?:Collateral|Security Agreement|Security Interest)\b/i },
  { family: "CHANGE_OF_CONTROL", re: /\bChange of Control\b/i },
  { family: "EVENTS_OF_DEFAULT", re: /\bEvents? of Default\b/i },
  { family: "RATING_TRIGGERS", re: /\bRating\b/i },
  { family: "SPRINGING_COVENANTS", re: /\bSpringing\b/i },
];

export function classifyFamily(text: string, headingHint: string | null): { family: MaterialUnitFamily; evidence: string | null } {
  if (headingHint) {
    for (const { family, re } of FAMILY_KEYWORDS) {
      if (re.test(headingHint)) return { family, evidence: `heading "${headingHint}" matched ${family}` };
    }
  }
  for (const { family, re } of FAMILY_KEYWORDS) {
    if (re.test(text)) return { family, evidence: `unit text matched ${family} keyword` };
  }
  return { family: "OTHER_UNCLASSIFIED", evidence: "no known family keyword matched heading or unit text - genuinely novel or non-covenant material" };
}

function matchFamilyKeyword(text: string): MaterialUnitFamily | null {
  for (const { family, re } of FAMILY_KEYWORDS) {
    if (re.test(text)) return family;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 3F.1.6.R BLOCKER-8 fix - coordinate-clause splitting (task §7/§13,
// same discipline as splitEnumeratedItems above, extended to the un-
// enumerated case 13-claim-identity-certification.json's F15-1 confirmed:
// "the Company shall not create Liens on the Collateral or incur
// Indebtedness in excess of $10,000,000" bundles TWO independently-
// operative, economically distinct claims in one sentence with no
// lettered/numbered marker for splitEnumeratedItems to split on - so both
// previously hashed to the SAME anchor span and SAME semanticUnitId.
//
// GENERALIZED, not hardcoded to Liens/Indebtedness: fires only when a
// top-level (non-parenthesized) "and"/"or" joins two clauses that EACH
// independently match a DIFFERENT entry in FAMILY_KEYWORDS (the same open,
// generic, non-package-specific taxonomy classifyFamily already uses,
// Architecture Invariants #29) - the same pair of covenant topics fused
// together is what makes two claims genuinely economically distinct in the
// common real-drafting shape of this defect. A right-hand clause that
// itself restates a modal verb ("...and shall not permit...") is never
// treated as a second claim's own object - that is the SAME claim's
// subject being restated, not a second independent one (regression guard:
// "The Borrower shall not, and shall not permit any Restricted Subsidiary
// to, create or suffer to exist any Lien..." must stay one unit).
//
// Phase 3F.1.6.RX Workstream D (BLOCKER-8 + AUDIT-F4) CLAIM IDENTITY V2 -
// generalizes the SAME split to the residual gap this splitter's own
// original design disclosed: TWO baskets of the SAME family fused into one
// un-enumerated sentence (e.g. a "$50m acquisition debt basket" and a
// "$25m working-capital debt basket" bundled together - both INDEBTEDNESS,
// no lettered marker). When both sides match the SAME family (not
// different families), this now ALSO splits, but ONLY when each side
// independently states a numeric/currency/percentage/ratio VALUE (via the
// generic, family-agnostic extractValueAnchors - see value-anchors.ts) and
// the two sides' value sets are DISJOINT - a genuine, source-grounded
// numeric difference, never a bare "and"/"or" with no distinguishing
// number (regression guard: "shall not create or suffer to exist any
// Lien" - same family, no numbers on either side - never splits; nor does
// a clause that merely restates its own single cap in two places - same
// family, IDENTICAL value on both sides - never splits, since the sets
// are not disjoint).
// ---------------------------------------------------------------------------

const RIGHT_CLAUSE_RESTATES_MODAL = /^(?:shall|will|must|may)\b/i;
const TOP_LEVEL_CONJUNCTION = /\b(?:and|or)\b/gi;

/**
 * The single shared qualification rule for "do these two adjacent clauses
 * state two genuinely independent claims, or is this an ordinary
 * conjunction inside one claim's own text?" - used identically by both the
 * legacy two-way findCoordinateClauseSplit (below) and the generalized
 * N-ary segmentCoordinateClauses (further below), so the two can never
 * silently drift out of sync by re-implementing the rule twice.
 *
 * `leftFamilyFallback`/`rightFamilyFallback` exist ONLY for
 * segmentCoordinateClauses' own inherited-family case (a shared chapeau
 * that states the family once and is never repeated in every sibling
 * clause - see that function's own doc comment); findCoordinateClauseSplit
 * itself never supplies them, so its behavior is byte-for-byte unchanged
 * from before this refactor.
 */
function isGenuineClauseBoundary(
  leftText: string,
  rightText: string,
  leftFamilyFallback: MaterialUnitFamily | null = null,
  rightFamilyFallback: MaterialUnitFamily | null = null
): { qualifies: boolean; leftFamily: MaterialUnitFamily | null; rightFamily: MaterialUnitFamily | null } {
  if (leftText.length === 0 || rightText.length === 0) return { qualifies: false, leftFamily: null, rightFamily: null };
  // A right-hand clause that itself restates a modal verb ("...and shall not
  // permit...") is never treated as a second claim's own object - that is
  // the SAME claim's subject being restated, not a second independent one.
  if (RIGHT_CLAUSE_RESTATES_MODAL.test(rightText)) return { qualifies: false, leftFamily: null, rightFamily: null };
  const leftFamily = matchFamilyKeyword(leftText) ?? leftFamilyFallback;
  const rightFamily = matchFamilyKeyword(rightText) ?? rightFamilyFallback;
  if (!leftFamily || !rightFamily) return { qualifies: false, leftFamily, rightFamily };
  // Cross-family fusion (BLOCKER-8's originally-confirmed shape) always
  // splits - two different covenant topics are inherently distinct claims
  // regardless of whether either states a number.
  const crossFamily = leftFamily !== rightFamily;
  // Same-family fusion (AUDIT-F4's frozen residual gap) splits ONLY when
  // each side independently states a source-grounded numeric value and the
  // two values genuinely differ - see the module-level doc comment above
  // for the full rationale and regression-guard examples.
  const sameFamilyValueSplit = !crossFamily && valueAnchorSetsDisjointAndNonEmpty(extractValueAnchors(leftText), extractValueAnchors(rightText));
  return { qualifies: crossFamily || sameFamilyValueSplit, leftFamily, rightFamily };
}

export interface CoordinateClauseSplit {
  left: { text: string; start: number; end: number };
  right: { text: string; start: number; end: number };
}

/**
 * LEGACY two-way primitive (Phase 3F.1.6.R BLOCKER-8 / Phase 3F.1.6.RX
 * Workstream D). Scans left-to-right through every top-level (paren-depth
 * 0) "and"/"or" occurrence and returns the FIRST one whose two sides
 * (everything before it vs everything after it, as two single blocks)
 * qualify per isGenuineClauseBoundary. Returns null when no such split
 * point exists (task's own "never force 1:1" cuts both ways here too - a
 * region with no genuine independent-claim conjunction is left as a single
 * unit).
 *
 * Retained standalone (unchanged behavior) rather than removed: it is a
 * correct, still-exported primitive for the exactly-one-fusion-point case,
 * and several regression suites exercise it indirectly through
 * hypothesizeUnitsForRegion. Phase 3F.1.6.RX-FINAL FINDING-4: its own
 * documented limitation (evaluating "everything before" vs "everything
 * after" as two monolithic blocks means it can find AT MOST one split per
 * region and never recurses into either side to find a second one) is why
 * hypothesizeUnitsForRegion no longer calls this function directly - see
 * segmentCoordinateClauses below, its generalized, arbitrary-N-ary
 * successor, which every real caller now uses.
 */
export function findCoordinateClauseSplit(text: string): CoordinateClauseSplit | null {
  const re = new RegExp(TOP_LEVEL_CONJUNCTION.source, TOP_LEVEL_CONJUNCTION.flags);
  let m: RegExpExecArray | null;
  const candidates: { start: number; end: number }[] = [];
  // Single paren-aware pass: track nesting depth up to each conjunction
  // match so only a TOP-LEVEL "and"/"or" (never one inside a parenthesized
  // aside) is considered a candidate split point.
  let depth = 0;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    for (; idx < m.index; idx++) {
      if (text[idx] === "(") depth++;
      else if (text[idx] === ")") depth = Math.max(0, depth - 1);
    }
    if (depth === 0) candidates.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  for (const c of candidates) {
    const leftRaw = text.slice(0, c.start);
    const rightRaw = text.slice(c.end);
    const leftTrimmedStart = leftRaw.length - leftRaw.trimStart().length;
    const leftText = leftRaw.trim();
    const rightLeadingWs = rightRaw.length - rightRaw.trimStart().length;
    const rightText = rightRaw.trim();
    const { qualifies } = isGenuineClauseBoundary(leftText, rightText);
    if (qualifies) {
      return {
        left: { text: leftText, start: leftTrimmedStart, end: c.start },
        right: { text: rightText, start: c.end + rightLeadingWs, end: text.length },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 3F.1.6.RX-FINAL Part A Workstream C - FINDING-4: generalized,
// arbitrary-N-ary fused-claim decomposition.
//
// The prior Part B recertification (docs/phase-3f1-6-rx-final-blocker-
// closure/26-part-b-blocker8-recertification.json, PART-B-BLOCKER8-FINDING-1)
// proved findCoordinateClauseSplit above performs AT MOST ONE split per
// region: it evaluates "everything before the delimiter" vs "everything
// after it" as two monolithic blocks and returns on the first delimiter
// whose two sides qualify - it never recurses into either resulting side to
// look for a SECOND qualifying delimiter. A sentence fusing THREE OR MORE
// independently-operative claims (same-family or cross-family, no
// lettered/numbered marker) is therefore only partially separated: the 2nd
// and every later claim collapse into one semanticUnitId despite each
// carrying its own distinguishing, source-grounded number.
//
// segmentCoordinateClauses below is the generalized, arbitrary-N
// replacement. Design (ITERATIVE, not recursive - see the termination note
// below):
//
//   1. Find EVERY top-level (paren-depth 0) delimiter in the ENTIRE input
//      text in a single linear scan - "and", "or", "and/or", and ";" (a
//      purely generic, package-agnostic delimiter grammar, Architecture
//      Invariants #29 - no covenant-specific term). This produces a FIXED,
//      FINITE list of raw fragments (delimiters.length + 1 of them),
//      computed exactly once, before any segmentation decision is made.
//   2. Walk that fixed fragment list LEFT TO RIGHT exactly once (a single
//      `for` loop, no recursion), maintaining one "current, growing
//      segment" and one "established family" (the most recently seen
//      explicit family keyword, so a family stated ONCE in a shared
//      chapeau - "may incur Indebtedness up to $10,000,000, or up to
//      $20,000,000, or up to $30,000,000" - still correctly attributes
//      family INDEBTEDNESS to every later basket that never repeats the
//      word itself, a real, common drafting pattern the exactly-once
//      two-way primitive above already could not reach even for N=2).
//   3. At each fragment boundary, isGenuineClauseBoundary (the SAME shared
//      rule findCoordinateClauseSplit uses - see above) decides whether
//      this is a genuine new claim (cross-family, or same-family with
//      disjoint source-grounded numeric values reused from value-
//      anchors.ts) or an ordinary continuation (an ordinary noun-phrase
//      conjunction like "cash and cash equivalents" never qualifies,
//      because neither side independently matches any FAMILY_KEYWORDS
//      entry; a bare same-family "or" with no distinguishing number on
//      both sides never qualifies either, exactly preserving AUDIT-F4-
//      RESIDUAL-1's own disclosed boundary). A genuine boundary closes the
//      current segment and starts a new one; otherwise the next fragment is
//      folded into the current (still-growing) segment.
//   4. Every emitted segment's start/end are exact absolute offsets into
//      the ORIGINAL input text (never fabricated, never inherited from a
//      sibling) - segments partition the input by construction, so no two
//      segments ever overlap or duplicate a span.
//
// TERMINATION PROOF: there is no recursion at all. Step 1 performs one
// linear regex scan bounded by text.length, producing a fragment array of
// bounded, FIXED size before the segmentation loop ever starts. Step 2's
// `for` loop iterates over that already-finite, already-computed array
// exactly `fragments.length - 1` times, performing O(1) work (a handful of
// regex tests + a Set-based value-anchor comparison) per iteration - it can
// never grow, branch into further sub-loops, or depend on its own output.
// Total work is O(text.length). This holds for EVERY input, including
// deliberately degenerate/malformed ones (a string of thousands of bare
// delimiters, unbalanced/deeply-nested parentheses, delimiters with nothing
// but whitespace between them) - see the dedicated hard-degenerate-input
// test in tests/contract-model/finding-4-recursive-coordinate-decomposition
// .test.ts. Arbitrary finite N is therefore supported directly: N is simply
// however many genuine boundaries this one bounded pass finds, with no
// hardcoded cap and no possibility of non-termination.
// ---------------------------------------------------------------------------

export interface CoordinateClauseSegment {
  text: string;
  start: number;
  end: number;
}

/** "and/or" is matched as a single token FIRST (alternation order matters)
 * so a literal "and/or" in source text produces one clean delimiter rather
 * than two adjacent "and" + "or" matches that would otherwise leave a
 * stray "/or"/"and/" fragment of punctuation glued onto a neighboring
 * segment's text. ";" is included as a purely generic, non-covenant-
 * specific coordinate delimiter (Architecture Invariants #29) - a common
 * real drafting pattern for un-enumerated sibling baskets/exceptions. */
const TOP_LEVEL_DELIMITER = /\band\/or\b|\b(?:and|or)\b|;/gi;

interface RawSpan {
  text: string;
  start: number;
  end: number;
}

function findTopLevelDelimiters(text: string): { start: number; end: number }[] {
  const re = new RegExp(TOP_LEVEL_DELIMITER.source, TOP_LEVEL_DELIMITER.flags);
  const occurrences: { start: number; end: number }[] = [];
  let depth = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    for (; idx < m.index; idx++) {
      if (text[idx] === "(") depth++;
      else if (text[idx] === ")") depth = Math.max(0, depth - 1);
    }
    if (depth === 0) occurrences.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return occurrences;
}

function trimmedSpan(raw: string, rawStart: number): RawSpan {
  const leadingWs = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  return { text: trimmed, start: rawStart + leadingWs, end: rawStart + leadingWs + trimmed.length };
}

/**
 * Mechanically splits `text` into the raw top-level fragments delimited by
 * every top-level "and"/"or"/"and-or"/";" occurrence - no family/value
 * qualification applied yet (that happens once, in the caller's single
 * forward pass). A single fragment (no top-level delimiter found at all)
 * is returned as a 1-element array. Bounded, non-recursive, computed once.
 */
function splitIntoRawFragments(text: string): RawSpan[] {
  const delimiters = findTopLevelDelimiters(text);
  if (delimiters.length === 0) return [trimmedSpan(text, 0)];
  const fragments: RawSpan[] = [];
  let cursor = 0;
  for (const d of delimiters) {
    fragments.push(trimmedSpan(text.slice(cursor, d.start), cursor));
    cursor = d.end;
  }
  fragments.push(trimmedSpan(text.slice(cursor), cursor));
  return fragments;
}

/**
 * Generalized, arbitrary-N-ary successor to findCoordinateClauseSplit - see
 * the module section doc comment above for the full design and termination
 * proof. Returns null when fewer than 2 genuine segments result (task's own
 * "never force 1:1" - a region with no genuine independent-claim boundary
 * is left as a single unit, exactly like the primitive above).
 */
export function segmentCoordinateClauses(text: string): CoordinateClauseSegment[] | null {
  const fragments = splitIntoRawFragments(text);
  if (fragments.length < 2) return null;

  const segments: CoordinateClauseSegment[] = [];
  let currentStart = fragments[0]!.start;
  let currentEnd = fragments[0]!.end;
  let currentText = fragments[0]!.text;
  let establishedFamily: MaterialUnitFamily | null = matchFamilyKeyword(currentText);

  for (let i = 1; i < fragments.length; i++) {
    const next = fragments[i]!;
    const { qualifies } = isGenuineClauseBoundary(currentText, next.text, establishedFamily, establishedFamily);
    if (qualifies) {
      segments.push({ text: currentText, start: currentStart, end: currentEnd });
      currentStart = next.start;
      currentEnd = next.end;
      currentText = next.text;
    } else {
      // Not a genuine boundary (ordinary noun-phrase conjunction, a
      // modal-restatement, or a same-family continuation with no
      // distinguishing number) - fold `next` into the still-growing
      // current segment rather than starting a new one.
      currentEnd = next.end;
      currentText = text.slice(currentStart, currentEnd);
    }
    // Track the most recently seen EXPLICIT family keyword so a later
    // fragment that never repeats it (a shared-chapeau sibling basket) can
    // still inherit it via isGenuineClauseBoundary's fallback parameters.
    const explicitFamily = matchFamilyKeyword(currentText);
    if (explicitFamily) establishedFamily = explicitFamily;
  }
  segments.push({ text: currentText, start: currentStart, end: currentEnd });

  return segments.length >= 2 ? segments : null;
}

// ---------------------------------------------------------------------------
// Posture-signal + materiality classification (task §8/§10)
// ---------------------------------------------------------------------------

export function classifyPostureSignal(signals: SignalHit[], isExceptionItem: boolean): DetectedPostureSignal {
  const names = new Set(signals.map((s) => s.name));
  // An enumerated item nested inside an exception/carve-out list is a permission by
  // construction, even when its own text carries no independent "may"/"permit" wording
  // of its own (task's own worked example: "(a) Indebtedness ... not to exceed $X" reads
  // as a bare description, but structurally IS the permission the chapeau's "except:" grants).
  if (isExceptionItem) return "PERMISSION_SIGNAL";
  if (names.has("shall_not") || names.has("may_not") || names.has("will_not") || names.has("shall_not_permit")) return "PROHIBITION_SIGNAL";
  if (names.has("permit_permitted") || names.has("shall_be_permitted") || names.has("may_permissive")) return "PERMISSION_SIGNAL";
  if (names.has("quoted_term_means") || names.has("quoted_term_colon")) return "DEFINITIONAL_SIGNAL";
  if (names.has("so_long_as") || names.has("subject_to") || names.has("unless") || names.has("only_if")) return "CONDITION_ONLY_SIGNAL";
  if (names.has("reclassification") || names.has("redesignation") || names.has("refinancing")) return "AMENDMENT_MECHANIC_SIGNAL";
  if (names.has("ebitda") || names.has("total_assets") || names.has("consolidated_assets")) return "CALCULATION_SIGNAL";
  return "UNCLEAR_SIGNAL";
}

const ECONOMIC_SIGNAL_NAMES = new Set(["currency_value", "percentage", "ratio_expression", "greater_of", "lesser_of", "aggregate_amount", "fixed_amount", "cap_language", "annual_limit", "cumulative_limit"]);
const REAL_MECHANIC_SIGNAL_NAMES = new Set(["grower_basket", "builder_basket", "ratio_basket", "shared_cap", "anti_duplication", "reclassification", "redesignation", "refinancing", "no_default_condition", "pro_forma_compliance", "mandatory_prepayment", "asset_sale_sweep", "cure_right", "acquisition_permission", "restricted_subsidiary_mechanic", "shall_not", "may_not", "will_not", "except", "provided_that", "notwithstanding", "subject_to", "so_long_as"]);

/**
 * Phase 3F.1 §27/F2 - a bare cross-reference to another provision's own
 * economics ("permitted under Section 6.04", "described in clause (c) of
 * the definition of Permitted Indebtedness") carries no local numeric or
 * keyword signal of its own, but is not confidently unimportant either -
 * the referenced provision may itself be materially significant, and this
 * unit cannot resolve that without following the reference. Generic
 * pattern only (no package-specific term list, Architecture Invariants
 * #29) - never upgrades past REVIEW_UNCERTAIN on its own; a genuine
 * upgrade to MATERIAL/CRITICAL still requires either a local signal or the
 * contextual floor (applyContextualMaterialityFloor).
 */
const CROSS_REFERENCE_PATTERN = /\b(?:permitted|described|set forth|referred to|as defined)\s+(?:under|pursuant to|in|by)\s+(?:clause|Section|paragraph|the definition of)\b/i;

export function classifyMateriality(signals: SignalHit[], ownText?: string): { materiality: SemanticUnitMateriality; reasoning: string } {
  const names = signals.map((s) => s.name);
  const economicHit = names.find((n) => ECONOMIC_SIGNAL_NAMES.has(n));
  if (economicHit) return { materiality: "CRITICAL", reasoning: `unit's own text carries an independent economic signal (${economicHit}) - an omission here could change a capacity/permission conclusion` };
  const mechanicHit = names.find((n) => REAL_MECHANIC_SIGNAL_NAMES.has(n));
  if (mechanicHit) return { materiality: "MATERIAL", reasoning: `unit's own text carries a real legal/mechanic signal (${mechanicHit}) with no independent numeric value of its own` };
  if (names.length > 0) return { materiality: "REVIEW_UNCERTAIN", reasoning: `unit's own text carries only weak/headline-shaped signal(s) (${names.join(", ")}) - materiality could not be confidently classified` };
  if (ownText && CROSS_REFERENCE_PATTERN.test(ownText)) return { materiality: "REVIEW_UNCERTAIN", reasoning: "unit's own text is a bare cross-reference to another provision's economics with no independent local signal - the referenced provision may itself be material, so this is not confidently unimportant" };
  return { materiality: "INFORMATIONAL", reasoning: "unit's own text carries no independently detected legal or economic signal" };
}

// ---------------------------------------------------------------------------
// Region -> unit(s) (task §7/§8)
// ---------------------------------------------------------------------------

interface HypothesisContext {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  operativeVersionRef: string | null;
}

function buildUnit(input: {
  ctx: HypothesisContext;
  anchors: SourceAnchor[];
  excerptText: string;
  signals: SignalHit[];
  isExceptionItem: boolean;
  headingHint: string | null;
  fromRawSourceFallback: boolean;
  detectionSignature: string;
  /**
   * Phase 3F.1.6.R BLOCKER-8 fix - a coordinate-clause split item (see
   * findCoordinateClauseSplit above) typically has no local negation/
   * obligation verb of its own (e.g. "incur Indebtedness in excess of
   * $10,000,000" - the "shall not" lives only in the FIRST clause's own
   * text). Used ONLY as a fallback when this item's own local signals
   * classify to UNCLEAR_SIGNAL - a unit that DOES carry its own local
   * posture signal always keeps it, never overridden by inheritance.
   */
  inheritedPosture?: DetectedPostureSignal;
}): MaterialSemanticUnit {
  const localPosture = classifyPostureSignal(input.signals, input.isExceptionItem);
  const posture = localPosture === "UNCLEAR_SIGNAL" && input.inheritedPosture ? input.inheritedPosture : localPosture;
  const { materiality, reasoning } = classifyMateriality(input.signals, input.excerptText);
  const { family, evidence } = classifyFamily(input.excerptText, input.headingHint);
  const signalNames = input.signals.map((s) => s.name).sort();
  return {
    semanticUnitId: computeSemanticUnitId(input.anchors, input.detectionSignature),
    companyId: input.ctx.companyId,
    packageKey: input.ctx.packageKey,
    instrumentKey: input.ctx.instrumentKey,
    operativeVersionRef: input.ctx.operativeVersionRef,
    granularity: "SEMANTIC_UNIT",
    anchors: input.anchors,
    family,
    familyEvidence: evidence,
    postureSignal: posture,
    materiality,
    materialityReasoning: reasoning,
    contextuallyElevated: false,
    excerptText: input.excerptText.slice(0, 500),
    detectedSignals: signalNames,
    fromRawSourceFallback: input.fromRawSourceFallback,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: input.fromRawSourceFallback ? "LOW" : materiality === "REVIEW_UNCERTAIN" ? "MEDIUM" : "HIGH",
    uncertaintyReasons: input.fromRawSourceFallback ? ["derived from raw-source fallback path - no structural node anchors this unit"] : [],
    inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
    provenance: `deterministic Layer A/B hypothesis over ${input.fromRawSourceFallback ? "raw-source-fallback" : "structural"} region - no discovery/context-retrieval/compiler/verifier/precedent output consulted`,
  };
}

/**
 * Hypothesizes one or more MaterialSemanticUnits from a single routed
 * region's own full text (task §7 - never forced 1:1 with the region's own
 * structural node). `fullText` must be the region's real OWN text (the
 * router's own excerptText is truncated for display and must never be used
 * for splitting - see the caller below).
 */
export function hypothesizeUnitsForRegion(region: RoutedRegion, fullText: string, headingHint: string | null, ctx: HypothesisContext, parentIsExceptionChapeau = false): MaterialSemanticUnit[] {
  const baseAnchor: SourceAnchor = {
    documentId: region.documentId,
    structuralNodeKey: region.structuralNodeKey,
    structuralNodeId: region.structuralNodeId,
    sectionRef: region.sectionRef,
    charStart: region.charStart,
    charEnd: region.charEnd,
    sourceCitation: region.structuralNodeKey ? `${region.documentId}::${region.sectionRef}` : `${region.documentId}::raw[${region.charStart}-${region.charEnd}]`,
  };

  const split = splitEnumeratedItems(fullText);
  if (!split) {
    // Phase 3F.1.6.R BLOCKER-8 fix (F15-1), generalized to arbitrary N by
    // Phase 3F.1.6.RX-FINAL Part A Workstream C (FINDING-4) - before
    // falling back to one whole-region unit, check for a bare
    // "clauseA (and|or|and/or|;) clauseB (and|or|and/or|;) clauseC ..."
    // fused sentence with no lettered marker but TWO OR MORE independently-
    // operative, economically distinct claims (see segmentCoordinateClauses
    // above). Fires only for a genuine family-difference (or, same-family,
    // a genuine disjoint numeric value) across each delimiter - never for
    // an ordinary sentence that merely contains "and"/"or" (e.g. "cash and
    // cash equivalents").
    const coordinateSegments = segmentCoordinateClauses(fullText);
    if (coordinateSegments) {
      // The FIRST (leftmost) segment is the one carrying whatever local
      // negation/obligation/permission verb governs the whole fused
      // sentence (e.g. "shall not" / "may") - every later segment routinely
      // has no such verb of its own (it inherits the first segment's
      // posture), exactly the same inheritance discipline the original
      // 2-way BLOCKER-8 fix established, generalized here to segment 0
      // being the inheritance ROOT for every sibling, not just segment 1.
      const rootSignals = detectAllSignals(coordinateSegments[0]!.text);
      const rootUnit = buildUnit({
        ctx,
        anchors: [{ ...baseAnchor, charStart: baseAnchor.charStart + coordinateSegments[0]!.start, charEnd: baseAnchor.charStart + coordinateSegments[0]!.end }],
        excerptText: coordinateSegments[0]!.text,
        signals: rootSignals,
        isExceptionItem: parentIsExceptionChapeau,
        headingHint,
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionSignature: `coordinate:0:${rootSignals.map((s) => s.name).sort().join(",")}`,
      });
      const units: MaterialSemanticUnit[] = [rootUnit];
      for (let i = 1; i < coordinateSegments.length; i++) {
        const segment = coordinateSegments[i]!;
        const segmentSignals = detectAllSignals(segment.text);
        units.push(
          buildUnit({
            ctx,
            anchors: [{ ...baseAnchor, charStart: baseAnchor.charStart + segment.start, charEnd: baseAnchor.charStart + segment.end }],
            excerptText: segment.text,
            signals: segmentSignals,
            isExceptionItem: parentIsExceptionChapeau,
            headingHint,
            fromRawSourceFallback: region.fromRawSourceFallback,
            detectionSignature: `coordinate:${i}:${segmentSignals.map((s) => s.name).sort().join(",")}`,
            inheritedPosture: rootUnit.postureSignal,
          })
        );
      }
      return units;
    }

    // task's own worked example applies even when the structural parser has ALREADY split
    // an "except: (a)...(b)...(c)..." list into separate child nodes (the common real-parser
    // case - see router.ts's own possibleUnstructuredMultiItem handling of the opposite
    // scenario) - a region whose PARENT node's own text is the exception chapeau is itself
    // the permission that chapeau grants, even though no text-level split happens HERE.
    const signals = detectAllSignals(fullText);
    return [
      buildUnit({
        ctx,
        anchors: [baseAnchor],
        excerptText: fullText,
        signals,
        isExceptionItem: parentIsExceptionChapeau,
        headingHint,
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionSignature: `whole-region:${signals.map((s) => s.name).sort().join(",")}`,
      }),
    ];
  }

  const chapeauSignals = detectAllSignals(split.chapeauText);
  const chapeauIsException = chapeauSignals.some((s) => s.name === "except");
  const units: MaterialSemanticUnit[] = [
    buildUnit({
      ctx,
      anchors: [{ ...baseAnchor, charEnd: baseAnchor.charStart + split.chapeauEnd }],
      excerptText: split.chapeauText,
      signals: chapeauSignals,
      isExceptionItem: false,
      headingHint,
      fromRawSourceFallback: region.fromRawSourceFallback,
      detectionSignature: `chapeau:${chapeauSignals.map((s) => s.name).sort().join(",")}`,
    }),
  ];

  for (const item of split.items) {
    const itemSignals = detectAllSignals(item.text);
    units.push(
      buildUnit({
        ctx,
        anchors: [{ ...baseAnchor, charStart: baseAnchor.charStart + item.start, charEnd: baseAnchor.charStart + item.end }],
        excerptText: item.text,
        signals: itemSignals,
        isExceptionItem: chapeauIsException,
        headingHint,
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionSignature: `item:${item.marker}:${itemSignals.map((s) => s.name).sort().join(",")}`,
      })
    );
  }

  return units;
}

function findNearestHeading(index: StructuralIndex, nodeId: string): string | null {
  const node = index.getNodeById(nodeId);
  if (node?.nodeType === "SECTION" && node.heading) return node.heading;
  const ancestors = index.getAncestors(nodeId);
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (a.nodeType === "SECTION" && a.heading) return a.heading;
  }
  return null;
}

/**
 * Hypothesizes units for every region a single document's routing pass
 * admitted (router.ts's own DocumentRoutingResult). Fetches each region's
 * REAL full text from the StructuralIndex (or the document's raw text for
 * a raw-source-fallback region) - never the router's own truncated
 * excerptText.
 */
function parentIsExceptionChapeau(index: StructuralIndex, nodeId: string): boolean {
  const parent = index.getParent(nodeId);
  if (!parent) return false;
  const parentOwnText = index.getNodeText(parent.nodeId, "OWN");
  return detectAllSignals(parentOwnText).some((s) => s.name === "except");
}

const MATERIALITY_RANK: Record<SemanticUnitMateriality, number> = { CRITICAL: 3, MATERIAL: 2, REVIEW_UNCERTAIN: 1, INFORMATIONAL: 0 };
/** Floor tier applied by context (task §21/§22) - MATERIAL, never CRITICAL: CRITICAL is reserved for a unit's own INDEPENDENT economic significance (types.ts's own documented reasoning for the 4-tier split), so mere structural nesting under a CRITICAL parent never itself manufactures a second CRITICAL unit. */
const CONTEXTUAL_FLOOR: SemanticUnitMateriality = "MATERIAL";

/**
 * Phase 3F.1 §19-23/F2 - the core fix for the confirmed materiality-
 * misclassification defect: classifyMateriality (above) is necessarily
 * local-only (it runs per-unit, before sibling/parent units exist yet).
 * This document-level PASS runs after every region in the document has
 * been hypothesized, so it can look up each unit's real structural PARENT
 * unit (if the parent was itself admitted and hypothesized - which,
 * combined with Workstream A's routing-closure fix, it now reliably is for
 * a genuine operative parent) and apply a materiality FLOOR when the
 * parent is itself operative and materially significant.
 *
 * SELECTIVE, NOT UNIVERSAL (task §22/§55's explicit requirement): the
 * floor applies only when the PARENT's own materiality already reached
 * CRITICAL/MATERIAL AND the parent's own posture is PROHIBITION_SIGNAL,
 * OBLIGATION_SIGNAL, or the parent fires the "except" signal (a genuine
 * operative restriction/obligation/exception-list chapeau) - a boilerplate
 * or purely definitional parent (materiality INFORMATIONAL/REVIEW_UNCERTAIN,
 * or posture DEFINITIONAL/CONDITION_ONLY/UNCLEAR with no "except") never
 * elevates its children. The floor never LOWERS a unit's own local
 * materiality (a unit with its own independent CRITICAL signal keeps it),
 * and never manufactures a second CRITICAL merely by nesting (see
 * CONTEXTUAL_FLOOR above).
 */
export function applyContextualMaterialityFloor(units: MaterialSemanticUnit[], index: StructuralIndex): MaterialSemanticUnit[] {
  if (units.length === 0) return units;

  // The MOST materially-significant unit at each PHYSICAL structural
  // occurrence - a node occasionally yields >1 unit (splitEnumeratedItems'
  // own chapeau+items), and the chapeau (not a low-materiality sibling
  // item) is what should represent that node's own materiality/posture for
  // floor purposes. Phase 3F.1.2: keyed by nodeId (real physical occurrence
  // identity), never the label-shaped structuralNodeKey - this is the exact
  // mechanism the Phase 3F.1.1 forensic report identified as R11's root
  // cause (docs/phase-3f1-1-residual-safety-forensics.md): when a parent
  // occurrence's label collided with another occurrence's, `getParent`
  // could resolve to the wrong physical ancestor, or the lookup below could
  // miss the correct parent's own best unit entirely (registered under a
  // DIFFERENT physical occurrence that happened to share the same label),
  // silently failing to elevate. Keying by nodeId makes this collision
  // structurally impossible.
  const bestUnitByNodeId = new Map<string, MaterialSemanticUnit>();
  for (const u of units) {
    const nodeId = u.anchors[0]?.structuralNodeId;
    if (!nodeId) continue;
    const existing = bestUnitByNodeId.get(nodeId);
    if (!existing || MATERIALITY_RANK[u.materiality] > MATERIALITY_RANK[existing.materiality]) bestUnitByNodeId.set(nodeId, u);
  }

  return units.map((unit) => {
    const nodeId = unit.anchors[0]?.structuralNodeId;
    if (!nodeId) return unit; // raw-source-fallback units have no structural parent to inherit from
    const parentNode = index.getParent(nodeId);
    if (!parentNode) return unit;
    const parentUnit = bestUnitByNodeId.get(parentNode.nodeId);
    if (!parentUnit) return unit; // parent was never admitted/hypothesized - nothing to inherit from (a genuine remaining routing gap, Workstream A's own concern)

    const parentIsOperative = parentUnit.postureSignal === "PROHIBITION_SIGNAL" || parentUnit.postureSignal === "OBLIGATION_SIGNAL" || parentUnit.detectedSignals.includes("except");
    const parentIsMaterialEnough = parentUnit.materiality === "CRITICAL" || parentUnit.materiality === "MATERIAL";

    if (!parentIsOperative || !parentIsMaterialEnough) return unit;
    if (MATERIALITY_RANK[unit.materiality] >= MATERIALITY_RANK[CONTEXTUAL_FLOOR]) return unit; // already at/above the floor - nothing to elevate, and the reasoning already reflects its own real basis

    return {
      ...unit,
      materiality: CONTEXTUAL_FLOOR,
      materialityReasoning: `${unit.materialityReasoning} | ELEVATED to ${CONTEXTUAL_FLOOR} by contextual floor (Phase 3F.1 §19-21): structural child of ${parentNode.nodeId} (parent materiality ${parentUnit.materiality}, posture ${parentUnit.postureSignal}) - a nested item under an operative restriction/obligation/exception list carries real legal or economic effect regardless of whether its own text independently states a number.`,
      contextuallyElevated: true,
    };
  });
}

export function hypothesizeUnitsForDocument(routing: DocumentRoutingResult, index: StructuralIndex, ctx: HypothesisContext): MaterialSemanticUnit[] {
  const units: MaterialSemanticUnit[] = [];
  for (const region of routing.regions) {
    const fullText = region.structuralNodeId ? index.getNodeText(region.structuralNodeId, "OWN") : (index.getDocumentText(region.documentId) ?? "").slice(region.charStart, region.charEnd);
    const headingHint = region.structuralNodeId ? findNearestHeading(index, region.structuralNodeId) : null;
    const parentException = region.structuralNodeId ? parentIsExceptionChapeau(index, region.structuralNodeId) : false;
    units.push(...hypothesizeUnitsForRegion(region, fullText, headingHint, ctx, parentException));
  }
  return applyContextualMaterialityFloor(units, index);
}
