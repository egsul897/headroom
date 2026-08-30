/**
 * Phase C Stage 1 - STRUCTURE (task §8/§9). Deterministic, not an LLM call:
 * real evidence from Phase C0 (docs/phase-c0-analyzer-validation.md §V) shows
 * a single-call LLM design does not scale past ~117 pages at real extraction
 * density, and structural boundaries (article/section headers) are exactly
 * the kind of information a plain regex scan finds reliably and for free -
 * spending real model tokens on it would be a pure cost/latency regression
 * with no accuracy upside. Generalized across documents with different
 * numbering conventions by trying several candidate header patterns and
 * keeping whichever finds the most real matches, rather than hardcoding one
 * document's own style (the same "give the mechanism the pattern as a
 * parameter" generalization lib/contract-model/analyzer/coverage.ts already
 * established for its own marker-detection mechanism).
 *
 * Phase 2A (docs/phase-2a-structural-index.md) widens this from a flat
 * ARTICLE/SECTION-only list to the full nested DocumentNodeType tree
 * (ARTICLE -> SECTION -> SUBSECTION -> CLAUSE -> SUBCLAUSE), reusing
 * clause-hierarchy.ts's exact-sequence nested-clause parser within each
 * SECTION's own text span, and computing every node's real OWNED text span
 * (own text plus every nested descendant) via a single rank-based stack
 * pass - never a second full-document rescan per node.
 */
import { hashParts } from "./hashing";
import { computeStableKey } from "../stable-keys";
import { buildClauseTree } from "./clause-hierarchy";
import { STRUCTURAL_INDEX_VERSION, type CompilerDocumentInput, type StageRunResult, type StructuralNode } from "./types";

/**
 * Phase 2A finding: the original line-anchored (`^...$`) patterns silently
 * matched ZERO sections in FWRG's own real article-6-negative-covenants.txt
 * fixture, which contains no newline characters at all (a real, previously
 * undiagnosed defect - `^`/`$` only match string boundaries or real `\n`
 * positions, so a heading buried in one continuous line of text was simply
 * invisible to them). LSB's own fixture separately showed a heading with a
 * leading space and a doubled internal space ("\n SECTION  6.01 Indebtedness"),
 * which a strict `^Section\s+` anchor also misses. The patterns below are
 * NOT line-anchored at all; instead a genuine heading is distinguished from
 * an ordinary in-text citation ("...is permitted under Section 6.06 , and...")
 * by requiring a short, capitalized title terminating in its own period (for
 * SECTION) or an ALL-CAPS title run (for ARTICLE) immediately after the
 * number - a citation is instead followed by ordinary lowercase sentence
 * continuation or clause-marker punctuation, which fails both shapes. The
 * original line-anchored patterns are kept as fallback candidates (via
 * bestMatches's "keep whichever finds the most real matches" design) for a
 * cleanly line-broken document where they remain the simplest correct match.
 *
 * Phase 3F.1.6.RX-FINAL finding (Part B recert BLOCKER-1, category
 * "inconsistent capitalization"): the shape-based patterns below used the
 * LITERAL keyword spelling ("ARTICLE"/"Section"/"SECTION") with no `i` flag,
 * while only the line-anchored fallback patterns carried `i`. A lowercase
 * keyword ("article vi covenants", "section 6.02 Liens.") mid-sentence - not
 * at a literal line start - could never fall back to a line-anchored
 * pattern, so it was silently invisible regardless of how much genuine
 * positional evidence surrounded it, on any continuous-prose (newline-free)
 * document - a direct structural recurrence of the ORIGINAL historical
 * defect this same doc-comment describes above (line-anchored-only patterns
 * going blind on a newline-free document), just triggered by keyword CASE
 * instead of by newline ABSENCE. The fix is `ciKeyword` (below): it makes
 * ONLY the keyword's own spelling case-insensitive (an explicit per-letter
 * `[Xx]` alternation), never the whole regex via the `i` flag - the whole-
 * regex `i` flag is deliberately NOT used here because it would also relax
 * the TITLE-shape character classes (`[A-Z]` for a SECTION title's first
 * letter, `[A-Z ,&';-]` for an ARTICLE's ALL-CAPS title run), destroying the
 * very capitalization evidence that distinguishes a heading-shaped title
 * span from an ordinary lowercase sentence continuation - the general
 * principle this fix establishes: keyword spelling case carries no real
 * evidentiary weight (an author's/OCR engine's case convention for a fixed
 * word like "Section" is typographic noise), while a title's OWN
 * capitalization remains genuine positive evidence of heading-shaped text
 * and is left fully intact. Applied uniformly to every shape-based
 * keyword-anchored pattern in this file (ARTICLE_PATTERNS[0],
 * SECTION_PATTERNS[0], INTEGER_SECTION_PATTERNS[0]) - one general mechanism
 * at every call site, not a one-off patch at whichever site an adversarial
 * probe happened to hit.
 */
function ciKeyword(word: string): string {
  return word
    .split("")
    .map((ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)
    .join("");
}
const ARTICLE_KEYWORD = ciKeyword("ARTICLE");
const SECTION_KEYWORD = ciKeyword("Section");

/**
 * Phase 3F.1.6.RX-FINAL finding, surfaced (not introduced) while implementing
 * `ciKeyword` above: ARTICLE_PATTERNS[0]'s number-to-title gap was a bare
 * `\s+` - UNBOUNDED whitespace, able to span an entire real paragraph break
 * (two or more newlines). A bare citation with no title of its own on the
 * same line ("...text for ARTICLE I.\n\nARTICLE II COVENANTS\n\nSection
 * 1...") let the regex's own non-greedy title capture + end-of-title
 * lookahead skip straight past the blank-line paragraph break and swallow
 * the ENTIRELY DIFFERENT, later, real "ARTICLE II COVENANTS" heading as if
 * it were the citation's own title - a single spurious match spanning two
 * unrelated headings, silently deleting the real ARTICLE II occurrence.
 * Confirmed via direct regex probing that this reproduces identically
 * against the ORIGINAL, unmodified, purely case-sensitive pattern with an
 * ALL-CAPS citation ("ARTICLE I." in all caps) - this is a genuine
 * PRE-EXISTING latent defect in the gap's own unboundedness, orthogonal to
 * keyword case, merely never previously exercised by any committed test
 * (every existing test's own citation-shaped ARTICLE reference happened to
 * use Title Case "Article", which the pre-fix literal-"ARTICLE"-only
 * pattern could not match at all, accidentally dodging the bug rather than
 * avoiding it by design). Directly coupled to this remediation's own scope
 * (same file, same pattern, same "does this candidate reach the plausibility
 * gate as a well-formed match at all" question) and produces exactly this
 * module's own named failure class if left alone (a real heading silently
 * vanishing), so it is fixed here as part of this pass rather than filed
 * separately.
 *
 * The general fix: a single heading's own number-to-title gap must never
 * cross a genuine paragraph break - in every real fixture, a heading's
 * number and its own title sit on the same line or on two IMMEDIATELY
 * adjacent lines (at most one newline between them), never separated by a
 * blank line. `BOUNDED_GAP` encodes exactly that: ordinary same-line
 * whitespace, OR exactly one newline (optionally with same-line whitespace
 * on either side of it) - never two or more. This closes the ballooning
 * defect at its root (the match now simply fails to complete AT ALL for a
 * title-less citation immediately followed by a paragraph break, rather
 * than needing the downstream plausibility gate to catch it after the fact)
 * and cannot affect any legitimate heading, since no real heading's own
 * number-to-title span ever needs to cross a blank line to begin with.
 * Applied uniformly to every keyword-anchored shape-based pattern that has a
 * number-to-title gap (ARTICLE_PATTERNS[0], SECTION_PATTERNS[0],
 * INTEGER_SECTION_PATTERNS[0]) - the same general principle at every call
 * site with an analogous gap, not a one-off patch at the single site an
 * adversarial probe happened to hit.
 */
const BOUNDED_GAP = "(?:[^\\S\\n]*\\n[^\\S\\n]*|[^\\S\\n]+)";

const ARTICLE_PATTERNS = [
  new RegExp(`${ARTICLE_KEYWORD}\\s+([IVXLC]+|\\d+)\\.?${BOUNDED_GAP}([A-Z][A-Z ,&';-]{0,58}?)(?=\\s+[A-Z][a-z]|\\s*$)`, "g"),
  /^ARTICLE\s+([IVXLC]+|\d+)\.?\s*([^\n]*)$/gim,
];

/**
 * Phase 3F.1.6.RX finding: these four shapes are matched via `unionMatches`
 * (see its own doc-comment below), NOT `bestMatches` - a real, demonstrated
 * gap in the prior single-winner design. "Section 6.01 Title ." (keyword),
 * "§6.01 Title" (section-symbol), and a bare "6.01 Title" (no keyword at
 * all) are genuinely different, independently-occurring real conventions -
 * CONMED's own real Guarantee and Collateral Agreement mixes the keyword
 * style throughout its main body with a bare-decimal style inside its own
 * attached Assignment and Acceptance exhibit form ("1.1 Assignor .", "1.2
 * Assignee ."), and any document whose numbering style differs between its
 * majority sections and a minority (an inserted amendment section, a
 * differently-drafted exhibit, ...) has the same shape. Under the old
 * winner-take-all `bestMatches`, whichever single pattern found the most
 * matches across the WHOLE document was kept and every OTHER pattern's own
 * real, distinct headings were silently discarded entirely - never even
 * reaching the plausibility gate below, regardless of how solid their own
 * positional evidence was. This reproduces on real CONMED/DSGR fixture text
 * (see docs/phase-3f1-6-rx-final-blocker-closure/03-blocker1-structural-
 * remediation.json) and is fixed generally, with no per-pattern priority
 * change to the shapes below and no package-specific logic.
 */
const SECTION_PATTERNS = [
  // Title characters allow "[" / "]" (a "[Reserved]" section) and ";" (a
  // real, common compound heading like "Payments of Indebtedness;
  // Modifications of Subordinated Indebtedness" - observed verbatim in both
  // real fixtures). Keyword spelling is case-insensitive via `ciKeyword`
  // (see its own doc-comment above `ARTICLE_PATTERNS`) - the title-shape
  // requirement (`[A-Z]` starting the title) stays genuinely case-sensitive.
  new RegExp(`(?:${SECTION_KEYWORD}|§)\\s+(\\d+\\.\\d+)\\.?${BOUNDED_GAP}(\\[?[A-Z][A-Za-z ,&';[\\]-]{1,90}?\\]?)\\s*\\.(?!\\d)`, "g"),
  /^Section\s+(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^§\s?(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^(\d+\.\d+)\s+([A-Z][^\n]*)$/gm,
];

/**
 * Phase 2F.1 §5 (SECTION_NUMBER_GRAMMAR) - real, confirmed finding:
 * CONMED's own real amendment documents (Second Amendment 2022, First
 * Omnibus Amendment 2026) use flat integer section numbering ("SECTION
 * 1. Amendments .", "SECTION 2. Increased Facility Activation Notice
 * .") with NO decimal sub-number at all - a genuine, ordinary amendment-
 * drafting convention SECTION_PATTERNS above never covered (it requires
 * `\d+\.\d+`). These patterns mirror SECTION_PATTERNS' own two proven
 * shapes exactly, substituted to a bare 1-2 digit integer, with a
 * `(?!\.\d)` guard so an inline citation to a REAL decimal section (e.g.
 * "Section 1.1 (Defined Terms) of the Credit Agreement", which appears
 * verbatim inside the Second Amendment's own body, referring to a
 * DIFFERENT document's section - never a heading of this document) can
 * never be mistaken for a bare integer heading: the guard rejects "1" in
 * "1.1" because a dot-digit follows it. Run as an ADDITIONAL match set,
 * unioned with (never replacing) SECTION_PATTERNS' own decimal-style
 * winner - a single real document may legitimately contain both styles
 * (task's own "mixed Section-style + integer-style document" case), and
 * this must never change matching for a decimal-only document (FWRG/LSB
 * regression) since integer patterns simply find zero matches there.
 */
const INTEGER_SECTION_PATTERNS = [
  new RegExp(`${SECTION_KEYWORD}\\s+(\\d{1,2})(?!\\.\\d)\\.?${BOUNDED_GAP}(\\[?[A-Z][A-Za-z ,&';[\\]-]{1,90}?\\]?)\\s*\\.(?!\\d)`, "g"),
  /^(?:Section|SECTION)\s+(\d{1,2})(?!\.\d)\.?\s*([^\n]*)$/gim,
];

/**
 * Bare "N. Title" top-level headings with no "Section"/"SECTION" keyword
 * at all (task's own example: "1. Amendment ... / 2. Conditions ...").
 * Deliberately its OWN, more conservative pattern (not unioned into
 * INTEGER_SECTION_PATTERNS' own bestMatches contest) because it carries
 * real collision risk against an ordinary numbered list that happens to
 * start at a line boundary - task §5's own "do not break ordinary
 * numbered lists inside substantive sections." Guarded by: (a) line-
 * anchored (must be the literal start of a line, not mid-sentence); (b)
 * a real Title-Case heading-shaped continuation (capital letter, then
 * lowercase word characters - excludes an all-caps run-on like a
 * spaced-letter "W I T N E S S E T H" recital marker, and excludes a
 * bare number followed by more numbers/currency, e.g. a basket dollar
 * figure "1. $50,000,000" would not match: `[A-Z][a-z]` requires a
 * lowercase letter immediately after the first capital); (c) capped at
 * 1-2 digits, since real top-level amendment section counts are always
 * small - this also keeps a stray large integer (a defined dollar
 * threshold, a year, a CUSIP fragment) from ever qualifying.
 */
const BARE_INTEGER_SECTION_PATTERN = /^(\d{1,2})\.\s+([A-Z][a-z][^\n]*)$/gm;

/**
 * Phase 3F.1.5.R (Workstream A) introduced this gate as a "plausibility
 * gate before a same/shallower-rank pop" (see docs/foundation-remediation/
 * 01-source-accounting-remediation.json's `p110Q3Determination`) to stop an
 * in-text citation shaped exactly like a real heading (the known fixture:
 * "...permitted under Section 6.05 Reserved . and subject to...") from
 * being accepted as a raw top-level SECTION. Once accepted, such a node
 * corrupted BOTH the clause-tree region-slicing below (which bounds each
 * SECTION's own clause-parsing region by the NEXT top-level raw's
 * charStart, so the spurious raw truncated the real enclosing section's own
 * region before its later lettered clauses were reached) and the global
 * rank-based stack pass (which popped the real section early and
 * re-parented those later clauses under the spurious node instead) - both
 * consumers trust the same uncritically-accepted raw list, which is why the
 * gate runs BEFORE either one ever sees a candidate.
 *
 * Phase 3F.1.6.R (Workstream C) rewrites the gate's actual test. The
 * original implementation enumerated 14 citation-signal phrases ("under",
 * "pursuant to", "as defined in", "set forth in", ...) and rejected a
 * candidate only when it was immediately preceded by an EXACT match of one
 * of them. The independent Phase 3F.1.6 certification
 * (docs/phase-3f1-6-final-foundation-certification/03-structural-integrity-
 * certification.json, finding STRUCT-1) proved this is an unwinnable arms
 * race: real drafting phrases an in-text citation in essentially unbounded
 * ways, and all 7 of its residual real-data findings (CONMED 1, DSGR 6)
 * were genuine citations that slipped past the list by one missing word, a
 * substituted preposition, or an absent preposition entirely - "partly
 * defined in" (not "as defined in"), "in compliance with" (not tracked at
 * all), "as provided by" (the list only had "provided ... in"), "in
 * accordance with the requirements of" (extra words after the tracked
 * phrase), "subject to the terms of" (same), and a bare parenthetical
 * subject with no preposition before it whatsoever ("(and Section 2.07
 * shall apply...)"). Appending those five phrasings would only produce the
 * next unseen document's 8th gap - the charter for this remediation
 * explicitly forbids that arms race.
 *
 * The gate below asks a different question. Instead of "does the text
 * immediately before this candidate match one of N known-bad phrases" -
 * absence-of-evidence, defeated by any unseen phrasing - it asks "is there
 * POSITIVE, purely typographic evidence that this candidate genuinely opens
 * a new structural block", never keyed to the CONTENT of the preceding
 * words at all. Two independent positional signals are combined with OR
 * (either alone is real-world sufficient evidence of a genuine heading
 * boundary - grounded in actually reading FWRG/LSB/CONMED/DSGR's own real
 * heading text, not assumed):
 *
 *  (A) PARAGRAPH BREAK - the whitespace run immediately before the
 *      candidate contains two or more newlines, once a single page-number-
 *      shaped decorative artifact is first discounted (a real page break's
 *      own running page number - e.g. ".\n\n168\n\nSECTION 7.01" - sits
 *      between two blank lines and is never itself citation prose; a
 *      citation's own section number is never whitespace-bounded on both
 *      sides at this exact position, and a dollar figure's trailing digit
 *      group is comma-preceded, never whitespace-preceded, so neither is
 *      ever mistaken for one). This is the dominant real shape in
 *      CONMED/DSGR - including the case no phrase list can ever generalize
 *      to: a SECTION heading immediately following an ARTICLE heading with
 *      no sentence, and so no period, between them at all.
 *  (B) SENTENCE-BOUNDARY PUNCTUATION - once trailing whitespace (and any
 *      page-number artifact) is stripped, the real preceding text's own
 *      last character is a sentence/clause terminator - '.', ':', ';',
 *      '!', or '?' (optionally followed by a closing quote or bracket, e.g.
 *      "...applied)." or "...follows:"). This is the dominant real shape in
 *      FWRG's own fixture, which - a separate, previously-diagnosed, real
 *      defect (see the module-level comment above `ARTICLE_PATTERNS`) -
 *      contains NO newline characters anywhere at all, so signal (A) can
 *      never fire there; every real FWRG heading is instead immediately
 *      preceded by the end of a genuinely complete sentence or an
 *      enumeration-introducing colon.
 *
 * A third, narrower signal handles one real shape neither (A) nor (B)
 * covers - an ALL-CAPS ARTICLE title giving way directly to its first
 * SECTION with no terminating punctuation and no blank line of its own
 * ("ARTICLE VI COVENANTS Section 6.01 Indebtedness ."- there is no
 * "sentence" for an ALL-CAPS title to end with):
 *
 *  (C) ADJACENT TO A PLAUSIBLE ARTICLE - a SECTION-shaped candidate sits
 *      immediately after (whitespace only between) the end of an ARTICLE
 *      match that ALREADY passed signal (A), (B), or document-start on its
 *      OWN merits - never an arbitrary all-caps word (a defined-term
 *      acronym like "GAAP" or "EBITDA" must never launder a citation
 *      sitting right after it into a heading), and never cascaded through
 *      an ARTICLE reference that was itself rejected as a citation.
 *
 * Neither (A) nor (B) inspects WHAT WORD precedes the candidate, only WHERE
 * the nearest sentence/paragraph boundary sits relative to it, and (C)
 * anchors only to another candidate's own already-established match
 * boundary, never to lexical content either - so a document using phrasing
 * this fix's own author never anticipated is handled identically to every
 * known package, closing the exact class of gap a phrase list cannot. All 7
 * certified STRUCT-1 sites fail all three signals
 * (each is separated from its own preceding text by exactly one newline or
 * none, and that preceding text ends mid-word/mid-clause, never in
 * terminal punctuation) and are correctly rejected; see
 * docs/phase-3f1-6-r-blocker-remediation/03-structural-heading-remediation.json
 * for the full design record and before/after regression numbers, and
 * tests/foundation-audit/p1-10-rank-stack-plausibility-gate.test.ts plus
 * tests/certification/structural-heading-positive-evidence-false-negative-
 * guard.test.ts for the adversarial regression this rewrite must never
 * break (every legitimate heading shape - ARTICLE/SECTION, semicolon/colon-
 * preceded, page-boundary, OCR-irregular whitespace, bare-number-only,
 * repeated labels, schedules/exhibits, and malformed neighboring text).
 *
 * A candidate failing both signals is dropped entirely, never pushed into
 * `raws` - unchanged from the original fix's own contract: this is NOT a
 * re-parented/demoted node, there is no synthetic substitute, the text is
 * simply never treated as a structural boundary at all, so it falls
 * through as ordinary body prose of whichever real node's region already
 * contains it.
 *
 * This remains a heuristic, not a certainty - structural-index.ts's
 * SECTION_NUMBER_SEQUENCE_ANOMALY detection (Phase 3F.1.4's bounded,
 * detection-only mitigation for this same defect class) is kept as
 * defense-in-depth rather than removed, exactly as before.
 */

/**
 * A whitespace-bounded page-number-shaped decorative artifact standing alone
 * at the very end of `before` - a real page break's own running page number,
 * optionally labeled ("Page 42", case-insensitive) and/or dash-wrapped
 * ("-42-", a common running-footer style) - never a citation's own section
 * number (always glued directly to "Section "/"Article "/a decimal point,
 * never isolated as a bare whitespace-bounded token on its own) and never a
 * dollar figure's trailing digit group (comma-preceded, not whitespace-
 * preceded). "Page"/"-" are recognized here as a closed, universally
 * standard typographic decoration for a page number - not an open-ended
 * citation-preposition list - so this remains within the "purely positional/
 * typographic evidence" contract, never keyed to drafting phrasing.
 *
 * Phase 3F.1.6.RX finding: the original implementation collapsed the entire
 * matched artifact (including BOTH surrounding whitespace runs) down to a
 * SINGLE preserved character, which only happened to keep a real paragraph
 * break's 2+-newline count intact when the source text already had MORE
 * than one newline on at least one side of the page number (as in every
 * real CONMED/DSGR fixture, which use a full blank-line-bounded page break -
 * ".\n\n69\n\nSECTION 2.09"). A real, equally common PDF-text-extraction
 * convention instead places a page number between two SINGLE newlines with
 * no blank line at all ("...permitted hereby.\n42\nSECTION 6.02..." or the
 * same with a "Page "/dash decoration) - the old single-character collapse
 * silently destroyed one of the two real newlines in that shape, leaving
 * only 1 and wrongly failing signal (A) (and signal (B), since the real
 * preceding sentence's own terminal period sits further back, before the
 * page-number line, not immediately adjacent). The fix below preserves the
 * FULL whitespace run on both sides of the artifact - it strips only the
 * decorative token itself, never manufacturing newlines that were not
 * really there and never losing ones that were, so a single-newline-bounded
 * page number and a blank-line-bounded one are both handled correctly and
 * identically to how a human reader would discount either one.
 */
function stripTrailingPageNumberArtifact(before: string): string {
  return before.replace(/(^|\s+)(?:page\s+)?-?\d{1,4}-?(\s*)$/i, "$1$2");
}

/**
 * Phase 3F.1.6.RX-FINAL finding (Part B recert BLOCKER-1): the label
 * recognizer above claimed to cover "an optional 'Page ' label" as a closed
 * typographic CLASS, but its actual implementation (`[Pp]age`) enumerated
 * exactly two case variants and silently missed the equally common ALL-CAPS
 * "PAGE" running-footer/header convention - the same case-sensitivity root
 * cause as `ciKeyword` above, recurring at a third call site. Fixed by
 * adding the `i` flag: this regex has no OTHER letter class whose case
 * carries evidentiary meaning (unlike ARTICLE_PATTERNS/SECTION_PATTERNS,
 * where a whole-regex `i` flag would also relax a real title-shape signal),
 * so `i` alone is the fully general fix here.
 *
 * Phase 3F.1.6.RX-FINAL finding (Part B recert BLOCKER-1, "footnote
 * marker"): a short (1-3 digit) run glued DIRECTLY (no intervening
 * whitespace) onto real sentence-terminal punctuation - the shape a
 * superscript footnote/endnote reference marker collapses to under
 * plain-text PDF extraction - defeats both positional signals whenever only
 * a single newline separates it from the next heading, for a SECTION or an
 * ARTICLE candidate alike. When the dropped candidate is an ARTICLE, its own
 * real child SECTION is silently re-parented to `parentSectionRef: null`
 * instead of the correct ARTICLE ref - a genuine instance of this module's
 * own named "rank-stack corruption" failure class, in the opposite
 * direction from the original certified defect (a real parent silently
 * vanishing, rather than a spurious node being wrongly accepted). Recognized
 * here as a distinct, GENERAL typographic-noise CLASS, never a special case.
 * The `(?<!\d)` guard is load-bearing, not decorative: without it, an
 * ORDINARY decimal number ending a real sentence - "...shall not exceed
 * 4.00 to 1.00" - would itself be misread as "terminal punctuation ('.')
 * plus a glued footnote digit ('00')", manufacturing a FALSE sentence-end
 * signal exactly where none exists (caught empirically: this exact shape
 * appears, deliberately, in this file's own Category-6 precision-boundary
 * regression coverage - see tests/certification/structural-heading-rx-
 * adversarial-expansion.test.ts's "documented boundary" describe block -
 * and a first draft of this fix without the guard silently reopened it). A
 * real inline citation number is likewise never glued directly to terminal
 * punctuation with no space ("Section 6.05" always has a space before its
 * own number), and a dollar figure's trailing digit group is comma-grouped,
 * never a bare 1-3 digit stray - so with the digit-preceded case excluded,
 * this cannot misfire on ordinary prose numerals of any kind. Fixing this at
 * the ROOT - discounting the noise before either positional signal is ever
 * evaluated - is what prevents the rank-stack corruption generally: an
 * ARTICLE that would have been corruption-causing if dropped is instead
 * never dropped, because the noise hiding its real positional evidence has
 * been stripped away exactly as a human reader would discount it. This
 * composes safely with the page-number artifact above - the two noise
 * classes never overlap structurally (one is whitespace-BOUNDED, the other
 * is glued with NO whitespace to the preceding punctuation).
 *
 * Phase 3F.1-terminal Part A (OPEN-1 remediation): Part B's own independent
 * recertification (docs/phase-3f1-6-rx-final-terminal-closure/14-part-b-
 * finding1-recertification.json) proved the regex above still only
 * recognizes the noise CLASS when it *begins* with a literal terminal-
 * punctuation character - a closing quote/bracket is recognized only when
 * it TRAILS that punctuation mark, never when the closing quote/bracket/
 * paren IS itself the last visible character (a sentence commonly ends at a
 * quoted defined term or a parenthetical qualifier with no separate period)
 * and the footnote digit is glued directly onto IT instead. Rather than
 * special-casing "a digit glued to a closing paren/quote" as one more
 * enumerated shape (which the auditor's own report warns would just be the
 * next unseen shape's future gap), the class this function recognizes is
 * generalized to its own real root definition: a short (1-3 digit) run,
 * not itself preceded by another digit (so it can never split a real
 * multi-digit number), glued with NO intervening whitespace onto whatever
 * character actually precedes it - punctuation, a closing bracket/quote, or
 * anything else - is footnote/endnote-marker-shaped noise, UNLESS stripping
 * it would unmask what is really the fractional part of an ordinary decimal
 * number (the character right before the digit run is '.', and the
 * character before THAT is itself a digit - e.g. "4.00"; this is the exact
 * Category-6 precision guard the original `(?<!\d)` lookbehind protects,
 * now re-expressed for a class no longer anchored to a fixed leading
 * punctuation character). A digit run preceded by real WHITESPACE is
 * deliberately excluded here (left entirely to
 * `stripTrailingPageNumberArtifact` above) - that is the OTHER, structurally
 * distinct noise class this module already recognizes (a page number
 * standing on its own, isolated by whitespace on both sides), and keeping
 * the two classes disjoint (glued vs. whitespace-bounded) is what lets both
 * compose safely in one pipeline without either one's own shape leaking
 * into the other's.
 *
 * This generalization does not, by itself, decide whether a candidate is
 * accepted - it only widens what counts as discountable noise before the
 * boundary-evidence SCORE below is computed (see `boundaryPlausibilityScore`
 * and its own doc-comment) from several independent signals, none of which
 * is individually a mandatory gate.
 */
function stripTrailingFootnoteMarker(before: string): string {
  const trailingWhitespace = before.match(/\s*$/)![0];
  const core = before.slice(0, before.length - trailingWhitespace.length);
  const digitRun = core.match(/(?<!\d)\d{1,3}$/);
  if (!digitRun) return before;
  const charBeforeDigitRun = core[core.length - digitRun[0].length - 1];
  if (charBeforeDigitRun !== undefined && /\s/.test(charBeforeDigitRun)) return before; // whitespace-bounded - a page-number-shaped artifact, not a glued footnote/endnote marker; left to stripTrailingPageNumberArtifact
  const withoutDigitRun = core.slice(0, core.length - digitRun[0].length);
  if (/\d\.$/.test(withoutDigitRun)) return before; // the real fractional part of an ordinary decimal number (e.g. "4.00") - never noise
  return withoutDigitRun + trailingWhitespace;
}

/**
 * The full typographic-noise-stripping pipeline: every recognized decorative
 * artifact class (page/running-footer numbers, footnote/endnote reference
 * markers) discounted before either positional signal is evaluated. Adding a
 * genuinely new noise CLASS in the future means adding one more general
 * strip function here - never a per-document or per-phrase special case -
 * and it automatically protects both signal (A) and signal (B), and both
 * ARTICLE and SECTION candidates, uniformly.
 */
function stripTrailingTypographicNoise(before: string): string {
  return stripTrailingPageNumberArtifact(stripTrailingFootnoteMarker(before));
}

/** Signal (A): two or more newlines in the trailing whitespace run (after discounting recognized typographic noise) - a real paragraph break isolating the candidate on its own line/block. */
function precededByParagraphBreak(withoutPageNumber: string): boolean {
  const trailingWhitespace = withoutPageNumber.match(/\s*$/)![0];
  return (trailingWhitespace.match(/\n/g) ?? []).length >= 2;
}

/** Signal (B): once trailing whitespace is stripped, the real preceding text's own last character terminates a sentence/clause - '.', ':', ';', '!', or '?' (optionally followed by a closing quote/bracket, e.g. "...applied)."). Empty (nothing real precedes - just whitespace/a page number) counts as a document/region start, which is trivially plausible. A single trailing OPENING quote/bracket (with its own preceding whitespace) is also peeled off before this check - real drafting routinely introduces a literally-quoted restated heading with one ('...to read in full as follows: "Section 6.04 Limitation...'), and the terminal-punctuation evidence this signal actually relies on (the colon here) still has to be present underneath once the opening quote itself is set aside; nothing is accepted on the strength of the quote/bracket alone. */
function precededBySentenceTerminalPunctuation(withoutPageNumber: string): boolean {
  const trimmed = withoutPageNumber.replace(/\s+$/, "");
  if (trimmed.length === 0) return true;
  if (/[.:;!?]["'’”)\]]*$/.test(trimmed)) return true;
  const withoutOpeningQuote = trimmed.replace(/["'“‘([]\s*$/, "").replace(/\s+$/, "");
  if (withoutOpeningQuote.length === trimmed.length) return false; // no opening quote/bracket was actually there to peel off
  if (withoutOpeningQuote.length === 0) return true;
  return /[.:;!?]["'’”)\]]*$/.test(withoutOpeningQuote);
}

/**
 * Phase 3F.1-terminal Part A (OPEN-1 remediation): the boundary-plausibility
 * check is a SCORED, compositional evaluation of several independent
 * typographic/positional signals, not a single mandatory feature. Per this
 * phase's own §9-10 requirement, no one signal (an exact punctuation
 * character before a footnote digit, a specific bracket shape, ...) is a
 * hard gate - each signal contributes weighted evidence, and a candidate is
 * accepted once the combined weight of INDEPENDENT evidence clears a fixed
 * threshold, exactly the way a human reader weighs several partial clues
 * together rather than requiring one of them to be perfect.
 *
 * Signals (all purely typographic/positional - never keyed to WHAT WORD
 * precedes the candidate, preserving the same "not a phrase list" property
 * every prior mechanism in this file already established):
 *
 *  - PARAGRAPH_BREAK (weight 3, independently sufficient): 2+ real
 *    newlines once typographic noise is discounted - unchanged from the
 *    original signal (A).
 *  - SENTENCE_TERMINAL_PUNCTUATION (weight 3, independently sufficient):
 *    the preceding text's own last character is a real sentence/clause
 *    terminator once noise is discounted - unchanged from the original
 *    signal (B).
 *  - NOISE_DISCOUNTED (weight 1, alone insufficient): a real typographic
 *    noise artifact (a footnote/endnote marker or page-number decoration)
 *    was actually present immediately at this boundary and had to be
 *    discounted to see through to it - itself real, general evidence that
 *    something is obscuring the true boundary character, without regard to
 *    what that artifact specifically was glued onto.
 *  - CLOSING_DELIMITER (weight 1, alone insufficient): once noise is
 *    discounted, the real preceding text's own last character is a closing
 *    quotation mark or bracket - a parenthetical or quoted span having just
 *    closed. Deliberately weak and NEVER sufficient alone (see
 *    `precededByClosingDelimiter`'s own doc-comment) - ordinary prose ends
 *    in a closing parenthetical constantly, including mid-citation, so
 *    this only ever corroborates other evidence, never substitutes for it.
 *  - AT_LEAST_ONE_NEWLINE (weight 1, alone insufficient): the candidate is
 *    at least on its own line, even without a full paragraph break -
 *    weaker geometric evidence than PARAGRAPH_BREAK, only ever a
 *    corroborating signal.
 *
 * The combination NOISE_DISCOUNTED + CLOSING_DELIMITER + AT_LEAST_ONE_NEWLINE
 * (1+1+1 = 3, meeting the threshold) is what closes OPEN-1: a footnote/
 * endnote digit glued directly onto a bare closing paren or quotation mark,
 * with no separate terminal punctuation of its own, now supplies three
 * independent pieces of real corroborating evidence together - is genuinely
 * on its own line, has something glued onto it that had to be discounted to
 * see through to the real boundary character, and that real character is
 * itself a just-closed delimiter - rather than requiring the noise-stripping
 * regex to guess the exact one punctuation-then-bracket shape a human
 * reader would recognize as "the sentence basically ended right there."
 * This is deliberately NOT the same as treating "ends in a closing
 * bracket" as standalone sufficient evidence: that alone (see the dedicated
 * negative-control tests) would launder an ordinary in-text citation ending
 * in a parenthetical aside, sitting on its own line before a real
 * heading-shaped candidate, into a false positive - requiring genuine noise
 * to have been discounted first is what keeps this narrow and grounded in
 * the same "footnote/page-marker context" signal this whole remediation is
 * about, not a bare bracket shape by itself.
 *
 * Two signals this phase's own charter names as available in principle -
 * numbering-rank-sequence continuity and citation-context - are
 * deliberately NOT included as acceptance-granting weight here. Both were
 * concretely shown, in this same file's own prior remediation record (see
 * the doc-comment above `unionMatches`'s sibling defect-3/Category-6
 * analysis and the identical proof re-run in
 * tests/certification/part-b-recert-blocker1-independent-adversarial.test.ts
 * describe block 3), to be indistinguishable - by any positional or
 * numbering evidence available to this design - from a real, certified
 * false-positive shape (a table row/bullet-list/signature-block/multi-
 * column-collapsed fragment immediately followed by the numerically NEXT
 * section, separated by exactly one newline with no terminal punctuation).
 * Adding rank continuity as sufficient (or even as one more point tipping a
 * single newline over threshold) would silently reopen that exact,
 * already-examined boundary. Left out on the same honest, evidence-based
 * basis the phase's own prior work used - not by oversight.
 */
const PLAUSIBILITY_SIGNAL_WEIGHT = {
  PARAGRAPH_BREAK: 3,
  SENTENCE_TERMINAL_PUNCTUATION: 3,
  NOISE_DISCOUNTED: 1,
  CLOSING_DELIMITER: 1,
  AT_LEAST_ONE_NEWLINE: 1,
} as const;
const PLAUSIBILITY_SCORE_THRESHOLD = 3;

/** Weak, independently-insufficient signal: at least one real newline sits in the trailing whitespace, once typographic noise is discounted - the candidate is at least on its own line, short of a full paragraph break. */
function precededByAtLeastOneNewline(withoutNoise: string): boolean {
  return /\n/.test(withoutNoise.match(/\s*$/)![0]);
}

/**
 * Weak, independently-insufficient signal: once trailing whitespace and any
 * discounted noise are removed, the real preceding text's own last
 * character is a closing quotation mark or bracket - a parenthetical or
 * quoted span having just closed. Deliberately never treated as
 * standalone-sufficient: ordinary prose (including an in-text citation)
 * ends in a closing parenthetical constantly - "...as set forth in the
 * Credit Agreement (as amended)" is exactly as real and exactly as common
 * as a genuine heading boundary shaped this way, and nothing about the
 * bracket ITSELF tells the two apart. It only ever contributes corroborating
 * weight alongside another independent signal (see
 * `PLAUSIBILITY_SIGNAL_WEIGHT`'s own doc-comment).
 */
function precededByClosingDelimiter(withoutNoise: string): boolean {
  const trimmed = withoutNoise.replace(/\s+$/, "");
  return /["'’”)\]]$/.test(trimmed);
}

/**
 * The full SCORED boundary-plausibility evaluation - see
 * `PLAUSIBILITY_SIGNAL_WEIGHT`'s own doc-comment for the complete signal
 * catalogue and rationale. Exported internally as its own step because
 * Signal (C) below needs to know which ARTICLE candidates pass THIS
 * narrower test before it can safely use their match ends as an adjacency
 * anchor (never cascading through a rejected in-text citation to an
 * ARTICLE reference).
 */
function isPlausibleByPositionalSignals(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 200);
  const before = text.slice(windowStart, matchIndex);
  if (windowStart === 0 && before.trim().length === 0) return true; // true document start
  const withoutNoise = stripTrailingTypographicNoise(before);
  const noiseDiscounted = withoutNoise !== before;
  let score = 0;
  if (precededByParagraphBreak(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.PARAGRAPH_BREAK;
  if (precededBySentenceTerminalPunctuation(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.SENTENCE_TERMINAL_PUNCTUATION;
  if (noiseDiscounted) score += PLAUSIBILITY_SIGNAL_WEIGHT.NOISE_DISCOUNTED;
  if (precededByClosingDelimiter(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.CLOSING_DELIMITER;
  if (precededByAtLeastOneNewline(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.AT_LEAST_ONE_NEWLINE;
  return score >= PLAUSIBILITY_SCORE_THRESHOLD;
}

/** The largest entry of the ascending-sorted `ends` that is `<= index`, or null if none - the nearest candidate heading-match boundary at or before `index`. */
function nearestPrecedingEnd(ends: number[], index: number): number | null {
  let result: number | null = null;
  for (const e of ends) {
    if (e > index) break;
    result = e;
  }
  return result;
}

/**
 * Signal (C): a SECTION-shaped candidate immediately follows - with only
 * whitespace between, never any real prose - the end of an ARTICLE match
 * that ALREADY passed the two positional signals above (or sits at document
 * start) on its own merits. A real ARTICLE title (an ALL-CAPS run, per
 * ARTICLE_PATTERNS' own shape) routinely gives way directly to its first
 * SECTION with no terminating punctuation of its own and no blank line
 * ("ARTICLE VI COVENANTS Section 6.01 Indebtedness .", or the same with a
 * single newline instead of a space) - there is no "sentence" for an
 * ALL-CAPS title to end with. This is deliberately narrow - it anchors only
 * to an ARTICLE match already independently established as plausible, never
 * to an arbitrary all-caps word (a real defined-term acronym like "GAAP" or
 * "EBITDA" sitting just before a citation must never become a laundering
 * vector for that citation) - so it cannot cascade through a rejected
 * in-text citation to an ARTICLE reference.
 */
function isImmediatelyAfterPlausibleArticle(text: string, matchIndex: number, plausibleArticleEnds: number[]): boolean {
  const nearest = nearestPrecedingEnd(plausibleArticleEnds, matchIndex);
  if (nearest === null) return false;
  return text.slice(nearest, matchIndex).trim().length === 0;
}

/**
 * Phase 3F.1-terminal Part A (OPEN-1 remediation, FALSIFICATION-2): when
 * ARTICLE_PATTERNS[0]'s ALL-CAPS title-shape requirement fails to match (a
 * genuinely lowercase-titled heading - reachable at all only because
 * `ciKeyword` made the keyword itself case-insensitive), `bestMatches`
 * falls back to ARTICLE_PATTERNS[1], the crude line-anchored pattern, which
 * has NO title-shape validation of its own and captures the entire rest of
 * the physical line verbatim - including a glued footnote digit or a
 * trailing parenthetical aside - as the heading text.
 *
 * The general fix reuses, rather than duplicates, the title-shape principle
 * ARTICLE_PATTERNS[0] already encodes in its own character class
 * (`[A-Z ,&';-]`- letters, spaces, and a small closed set of standard
 * heading punctuation; notably NOT parentheses or digits, so a trailing
 * parenthetical or footnote marker is structurally excluded from ever being
 * captured as part of a real title there): a captured heading's own title
 * text is trimmed down to its own leading run of exactly those same
 * characters, case-INSENSITIVE (for the identical reason `ciKeyword` is
 * case-insensitive - an author's/OCR engine's capitalization convention is
 * typographic noise, never evidentiary, while the character COMPOSITION of
 * the title - is it letters/spaces/standard heading punctuation, or
 * something else entirely - is genuine shape evidence). This is a complete
 * no-op for ARTICLE_PATTERNS[0]'s own shape-based match (whose title
 * already contains nothing outside this character class, by construction
 * of its own regex), and is the general fix for ARTICLE_PATTERNS[1]'s
 * crude fallback - applied uniformly to every ARTICLE heading regardless of
 * which pattern produced it, never as a fallback-specific special case.
 */
function extractTitleLikeSpan(rawTitle: string): string {
  return (rawTitle.match(/^[A-Za-z ,&';-]*/)?.[0] ?? "").trim();
}

function bestMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  let best: RegExpExecArray[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches.length > best.length) best = matches;
  }
  return best;
}

/**
 * Phase 3F.1.6.RX finding: `bestMatches` (above) is winner-take-all across
 * an ENTIRE pattern array - it returns only the single pattern's own match
 * set that happens to find the most matches over the WHOLE document, never
 * a union of several. This is safe when the patterns in an array are mostly
 * redundant alternate captures of the SAME convention (as ARTICLE_PATTERNS'
 * two entries mostly are - a shape-based match and a line-anchored fallback
 * for the identical roman/numeric-ARTICLE convention), but SECTION_PATTERNS
 * bundles together what are, in real drafting, GENUINELY DIFFERENT AND
 * LEGITIMATELY CO-OCCURRING numbering conventions within one document -
 * "Section 6.01 Title .", "§6.01 Title", and a bare "6.01 Title" with no
 * keyword at all. A real document that uses the keyword style for most of
 * its sections and a bare or "§"-prefixed style for a minority of them
 * (observed, structurally, in exactly the same way CONMED's own real
 * amendments mix decimal and flat-integer numbering within one document -
 * see the INTEGER_SECTION_PATTERNS doc-comment) would have had the entire
 * minority style SILENTLY DROPPED under `bestMatches`: whichever single
 * pattern found the most matches document-wide "won", and the other
 * patterns' own genuinely distinct real headings were never even
 * considered, regardless of how plausible each one's own boundary evidence
 * was. This is a different root cause from the isPlausibleByPositionalSignal
 * citation-vs-heading gate above (it happens further upstream, at pattern
 * selection, before any plausibility check ever runs) but produces the same
 * class of symptom this whole gate exists to prevent - a real heading
 * silently missing from the structural index.
 *
 * `unionMatches` replaces `bestMatches` for SECTION_PATTERNS with the same
 * additive, overlap-deduplicated union already used (via `overlapsAny`) to
 * combine decimalSectionMatches/integerSectionMatches/bareIntegerMatches
 * into one `sectionMatches` array - just applied one level earlier, WITHIN
 * the array of decimal-style pattern shapes itself. Patterns are still
 * tried in the array's own declared priority order (the shape-based, most
 * format-rich pattern first), and a later pattern's match is kept only when
 * it does not overlap a real span an earlier, higher-priority pattern
 * already claimed - so a document where one shape already wins every real
 * occurrence is completely unaffected (every later pattern's own matches on
 * that document are the SAME real headings, already claimed, and are
 * discarded as overlaps - never double-counted), and a document mixing
 * conventions gets every genuinely distinct real heading from every
 * pattern, not just the numerically dominant style's own.
 */
function unionMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  const accepted: RegExpExecArray[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!overlapsAny(m, accepted)) accepted.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return accepted.sort((a, b) => a.index - b.index);
}

/** Containment rank used to compute owned text spans - a node's span is closed by the next node of equal or shallower rank; a deeper rank always nests inside its opener without closing it. */
const RANK: Record<StructuralNode["nodeType"], number> = { ARTICLE: 0, SECTION: 1, SUBSECTION: 2, CLAUSE: 3, SUBCLAUSE: 4 };

interface RawNode {
  nodeType: StructuralNode["nodeType"];
  heading: string;
  sectionRef: string;
  charStart: number;
  parentSectionRef: string | null;
}

/** True if `candidate`'s own matched span overlaps any span already claimed by `existing` - the dedup rule that lets decimal-style and integer-style SECTION patterns run as an ADDITIVE union (task §5) without ever double-counting the same real heading twice. */
function overlapsAny(candidate: RegExpExecArray, existing: RegExpExecArray[]): boolean {
  const candStart = candidate.index;
  const candEnd = candidate.index + candidate[0].length;
  return existing.some((e) => {
    const start = e.index;
    const end = e.index + e[0].length;
    return candStart < end && candEnd > start;
  });
}

export function parseDocumentStructure(doc: CompilerDocumentInput): StructuralNode[] {
  // P1-10 plausibility gate (see the doc-comment above `bestMatches`):
  // applied to each match SOURCE right after `bestMatches` selects the
  // winning pattern shape (pattern-selection is a shape-richness contest,
  // never affected by plausibility) and before any match is used for
  // anything else - overlap dedup, established-span computation, or raw
  // node construction - so an implausible match is uniformly invisible to
  // every downstream consumer, never merely to the rank-stack.
  // ARTICLE candidates are resolved first, using signals (A)/(B)/document-
  // start ONLY - never signal (C), which is section-specific and anchors TO
  // an already-resolved ARTICLE, so it cannot apply here without circularity.
  const articleMatches = bestMatches(doc.text, ARTICLE_PATTERNS).filter((m) => isPlausibleByPositionalSignals(doc.text, m.index));
  // Signal (C)'s own anchor set - only the ARTICLE ends that themselves
  // survived (A)/(B)/document-start above, sorted ascending (bestMatches
  // already returns matches in left-to-right document order for a single
  // winning pattern, and `overlapsAny`/regex `exec` scanning guarantee no
  // pattern's own matches are ever produced out of order).
  const plausibleArticleEnds = articleMatches.map((m) => m.index + m[0].length);
  const isPlausible = (m: RegExpExecArray) => isPlausibleByPositionalSignals(doc.text, m.index) || isImmediatelyAfterPlausibleArticle(doc.text, m.index, plausibleArticleEnds);

  const decimalSectionMatches = unionMatches(doc.text, SECTION_PATTERNS).filter(isPlausible);
  const integerSectionMatches = bestMatches(doc.text, INTEGER_SECTION_PATTERNS)
    .filter(isPlausible)
    .filter((m) => !overlapsAny(m, decimalSectionMatches));
  const bareIntegerRe = new RegExp(BARE_INTEGER_SECTION_PATTERN.source, BARE_INTEGER_SECTION_PATTERN.flags);
  const bareIntegerMatchesRaw: RegExpExecArray[] = [];
  let bm: RegExpExecArray | null;
  while ((bm = bareIntegerRe.exec(doc.text)) !== null) {
    bareIntegerMatchesRaw.push(bm);
    if (bm.index === bareIntegerRe.lastIndex) bareIntegerRe.lastIndex++;
  }
  // The bare "N. Title" pattern (no "Section" keyword at all) is the
  // riskiest of the three SECTION match sources - real prose routinely
  // contains an ordinary numbered list ("1. Indebtedness under Loan
  // Documents. 2. Intercompany Indebtedness. ...") that also happens to
  // sit at a line start. Task §5's own "distinguish document-level
  // numbered sections from enumerated items within a section": a bare
  // match is only accepted when it falls OUTSIDE every already-
  // established (decimal or keyword-"Section") match's own governed
  // span (that match's start up to the next established match, or
  // document end) - i.e. it is never accepted as a new top-level
  // section while it is textually nested inside an already-recognized
  // one. A document with NO established matches at all (the task's own
  // "1. Amendment / 2. Conditions / 3. Representations" example, with no
  // "Section" keyword anywhere) has no governed spans to fall inside, so
  // every bare match there is accepted.
  const established = [...decimalSectionMatches, ...integerSectionMatches].sort((a, b) => a.index - b.index);
  function fallsInsideAnEstablishedSpan(charStart: number): boolean {
    for (let i = 0; i < established.length; i++) {
      const spanStart = established[i]!.index;
      const spanEnd = established[i + 1]?.index ?? Infinity;
      if (charStart >= spanStart && charStart < spanEnd) return true;
    }
    return false;
  }
  const bareIntegerMatches = bareIntegerMatchesRaw
    .filter(isPlausible)
    .filter((m) => !overlapsAny(m, decimalSectionMatches) && !overlapsAny(m, integerSectionMatches) && !fallsInsideAnEstablishedSpan(m.index));
  // Union, not replacement: a decimal-style document's own matches are completely unaffected (FWRG/LSB regression-safe by construction), and a flat-integer-only document (no decimal matches at all) gets its headings from the integer sets instead.
  const sectionMatches = [...decimalSectionMatches, ...integerSectionMatches, ...bareIntegerMatches].sort((a, b) => a.index - b.index);

  const raws: RawNode[] = [];
  for (const m of articleMatches) {
    raws.push({ nodeType: "ARTICLE", heading: extractTitleLikeSpan(m[2] ?? ""), sectionRef: (m[1] ?? "").trim(), charStart: m.index, parentSectionRef: null });
  }
  for (const m of sectionMatches) {
    const sectionRef = (m[1] ?? "").trim();
    const parentArticle = [...articleMatches].reverse().find((a) => a.index < m.index);
    raws.push({ nodeType: "SECTION", heading: (m[2] ?? "").trim(), sectionRef, charStart: m.index, parentSectionRef: parentArticle ? (parentArticle[1] ?? "").trim() : null });
  }
  raws.sort((a, b) => a.charStart - b.charStart);

  // Parse nested SUBSECTION/CLAUSE/SUBCLAUSE markers within each SECTION's
  // own raw region (up to the next top-level node, or document end).
  const topLevel = raws.slice();
  for (let i = 0; i < topLevel.length; i++) {
    const node = topLevel[i]!;
    if (node.nodeType !== "SECTION") continue;
    const regionEnd = topLevel[i + 1]?.charStart ?? doc.text.length;
    const regionText = doc.text.slice(node.charStart, regionEnd);
    for (const c of buildClauseTree(regionText)) {
      const parentSuffix = c.parentMarkerPath.join("");
      const ownSuffix = [...c.parentMarkerPath, c.marker].join("");
      raws.push({
        nodeType: c.nodeType,
        heading: "",
        sectionRef: `${node.sectionRef}${ownSuffix}`,
        charStart: node.charStart + c.charStart,
        parentSectionRef: `${node.sectionRef}${parentSuffix}`,
      });
    }
  }
  raws.sort((a, b) => a.charStart - b.charStart);

  // Sibling ordinal - position among nodes sharing the same direct parent, in document order (never a global index across the whole document).
  const ordinalByParent = new Map<string, number>();
  const ordinals = raws.map((r) => {
    const key = r.parentSectionRef ?? " ROOT";
    const ord = ordinalByParent.get(key) ?? 0;
    ordinalByParent.set(key, ord + 1);
    return ord;
  });

  // Phase 3F.1.2 - the unique PHYSICAL SOURCE OCCURRENCE identity for each raw
  // node, computed up front from documentId + nodeType + charStart (the
  // approved ADR's "Option D" span-primary construction, via the repo's
  // existing computeStableKey convention - never a second hashing scheme).
  // Unlike sectionRef/nodeKey (labels, which real drafting can legitimately
  // repeat - a cross-reference sentence, a table-of-contents entry, a
  // duplicate/malformed section number - see
  // docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md), no two raws in this
  // array can ever collide on nodeId: charStart is unique per physical match
  // within one parse pass (overlapsAny already prevents accepting two
  // overlapping matches into the same candidate set).
  const nodeIds = raws.map((r) => computeStableKey("structural-node", doc.documentId, r.nodeType, String(r.charStart)));

  // Owned text span (own text + every descendant) AND the true physical
  // parent occurrence via one rank-based stack pass - O(n), no per-node
  // rescanning. The stack top at push time (after popping every entry whose
  // rank is >= this node's own rank) is, by construction, the nearest
  // enclosing node of shallower rank - i.e. this node's real, physical
  // parent occurrence, determined from actual nesting position, never by
  // re-matching parentSectionRef against a label (which is exactly the
  // mechanism that let two distinct physical occurrences merge children
  // under the pre-3F.1.2 label-keyed scheme).
  const charEndByIndex = new Map<number, number>();
  const parentIndexByIndex = new Map<number, number>();
  const stack: number[] = [];
  raws.forEach((r, i) => {
    while (stack.length > 0 && RANK[raws[stack[stack.length - 1]!]!.nodeType] >= RANK[r.nodeType]) {
      charEndByIndex.set(stack.pop()!, r.charStart);
    }
    if (stack.length > 0) parentIndexByIndex.set(i, stack[stack.length - 1]!);
    stack.push(i);
  });
  while (stack.length > 0) charEndByIndex.set(stack.pop()!, doc.text.length);

  return raws
    .map((r, i) => ({
      documentId: doc.documentId,
      nodeType: r.nodeType,
      heading: r.heading,
      sectionRef: r.sectionRef,
      nodeKey: `${doc.documentId}::${r.sectionRef.replace(/\s+/g, "")}`,
      nodeId: nodeIds[i]!,
      charStart: r.charStart,
      charEnd: charEndByIndex.get(i) ?? doc.text.length,
      ordinal: ordinals[i]!,
      parentSectionRef: r.parentSectionRef,
      parentNodeId: parentIndexByIndex.has(i) ? nodeIds[parentIndexByIndex.get(i)!]! : null,
    }))
    .sort((a, b) => a.charStart - b.charStart);
}

export function runStructureStage(documents: CompilerDocumentInput[]): StageRunResult<StructuralNode[]> {
  const allNodes = documents.flatMap(parseDocumentStructure);
  if (allNodes.length === 0) {
    return { status: "REVIEW_REQUIRED", output: [], notes: ["No article/section headers matched any known structural pattern - structural inventory could not be built; every downstream stage's coverage claims are unreliable for this package until this is resolved."] };
  }
  return { status: "COMPLETED", output: allNodes };
}

export function structureOutputHash(nodes: StructuralNode[]): string {
  return hashParts([STRUCTURAL_INDEX_VERSION, ...nodes.map((n) => `${n.documentId}|${n.nodeType}|${n.sectionRef}|${n.charStart}|${n.nodeId}`)]);
}
