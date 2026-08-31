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
 *  - SELF_CONTAINED_BOUNDARY (weight 1, alone insufficient, AND a hard
 *    veto - see below): candidate-local, POST-match evidence, not another
 *    heuristic about the preceding text. See `titleBodySeparationHolds`'s
 *    own doc-comment for the full mechanism and the FIX-1 root-cause record
 *    this signal replaces (`NOISE_DISCOUNTED`).
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
 * FIX-1 (HEADROOM FINAL 3F.1 CLOSURE) - root-cause removal of
 * `NOISE_DISCOUNTED`: an independent auditor proved the OPEN-1 remediation
 * above violated the governing principle "NOISE REMOVAL MAY EXPOSE
 * EVIDENCE. THE EXISTENCE OF NOISE MUST NOT ITSELF COUNT AS POSITIVE
 * HEADING EVIDENCE." The removed signal computed `noiseDiscounted` purely as
 * "did stripping typographic noise change the `before` text at all", with NO
 * requirement that the discounted noise have anything to do with THIS
 * candidate genuinely being a heading boundary. A genuine footnote/endnote
 * digit glued to a wholly UNRELATED, earlier sentence's own closing
 * paren/quote, sitting on the physical line immediately before an ORDINARY
 * in-text section citation that itself begins a new line, supplied
 * NOISE_DISCOUNTED(1) + CLOSING_DELIMITER(1) + AT_LEAST_ONE_NEWLINE(1) = 3,
 * clearing the threshold and promoting that citation into a false top-level
 * SECTION node purely because of noise adjacency it had no causal
 * relationship to - real rank-stack corruption (see
 * tests/certification/part-b-terminal-recert-open1-independent.test.ts,
 * now updated to certify the fix below rather than the defect).
 *
 * Deleting the point outright (with no replacement) would reopen the
 * original false negative this whole mechanism exists to fix: a real
 * heading legitimately preceded by a footnote-marker-obscured boundary with
 * no separate terminal punctuation of its own (e.g.
 * `..."Permitted Tax Distribution")9\nSection 6.09 Limitation...`) would
 * drop back below threshold (CLOSING_DELIMITER(1) + AT_LEAST_ONE_NEWLINE(1)
 * = 2 < 3) and vanish again - see
 * tests/certification/part-b-recert-finding1-independent.test.ts describe
 * blocks 1-3, which this fix must keep passing.
 *
 * The replacement, `SELF_CONTAINED_BOUNDARY` (from `titleBodySeparationHolds`
 * below), is deliberately NOT another "what precedes this candidate"
 * heuristic - every signal in that family (preceding punctuation, preceding
 * noise, preceding brackets, numbering-rank continuity, citation-context
 * phrasing) was already shown, across this file's own remediation history,
 * to be structurally IDENTICAL for a real footnote-adjacent heading and an
 * ordinary in-text citation that happens to quote that same section's own
 * official title (the auditor's own reproduction proves this directly: the
 * `before` text is byte-for-byte the same shape in both the true-heading and
 * false-heading constructions). The one place the two shapes genuinely
 * differ is what comes AFTER the candidate's own matched span: a real
 * heading's title is followed by the start of new, self-contained content
 * (a capitalized sentence beginning the section's own body, a lettered
 * clause, a digit, an opening quote, or the end of the document/region) -
 * never a lowercase word continuing whatever sentence the "heading" text was
 * actually sitting inside of. This is genuinely NEW, candidate-local
 * evidence (title/body separation - one of the signal families this
 * phase's own charter names as available), not a rephrasing of anything
 * already tried and rejected.
 *
 * Tier chosen: (A) deterministic candidate-local structural signal, per this
 * phase's own preferred-order guidance - proven sufficient below to resolve
 * every adversarial shape in
 * tests/certification/part-a-final-fix1-structural.test.ts (the required
 * matrix) without needing a bounded structural-ambiguity classifier (tier
 * B) or falling back to plain body text (tier C). A human reader
 * disambiguates the auditor's own reproduction the same way: not by staring
 * harder at the footnote digit two lines up, but by noticing the sentence
 * immediately after "Section 6.09 Limitation on Restricted Payments."
 * starts with a lowercase "is" - i.e. it never really ended.
 *
 * Because a real heading is NEVER followed by a lowercase continuation in
 * any fixture in this codebase (FWRG/LSB/CONMED/DSGR included - verified
 * directly, not assumed), `titleBodySeparationHolds` failing is treated as a
 * HARD VETO, not merely a missing point: it overrides even the two
 * independently-sufficient signals above. This is required, not optional -
 * an ordinary sentence ending in a real terminal period or a real paragraph
 * break, immediately followed by a citation that happens to quote the
 * target section's own official title, would otherwise still launder
 * through PARAGRAPH_BREAK or SENTENCE_TERMINAL_PUNCTUATION alone, with no
 * noise or footnote involved at all (see
 * tests/certification/part-a-final-fix1-structural.test.ts, "citation after
 * an ordinary closing parenthetical (no footnote at all)" and "citation
 * after page-number noise" - both reproduce with zero footnote/noise
 * adjacency, proving this is a strictly more general fix than patching the
 * noise-adjacency path alone would have been).
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
 * basis the phase's own prior work used - not by oversight. FIX-1 confirms
 * this remains true even with `titleBodySeparationHolds` in play: the
 * table-row/bullet-list/signature-block shapes this file's own Category 6
 * regression protects are followed by ordinary capitalized body prose
 * exactly like a real heading is, so `titleBodySeparationHolds` correctly
 * returns true for them too - it is not a rank-continuity signal in
 * disguise, it never inspects the candidate's own number at all, only the
 * shape of what follows its matched span, and their rejection continues to
 * rest entirely on PARAGRAPH_BREAK/SENTENCE_TERMINAL_PUNCTUATION/
 * CLOSING_DELIMITER/AT_LEAST_ONE_NEWLINE never reaching threshold.
 */
const PLAUSIBILITY_SIGNAL_WEIGHT = {
  PARAGRAPH_BREAK: 3,
  SENTENCE_TERMINAL_PUNCTUATION: 3,
  SELF_CONTAINED_BOUNDARY: 1,
  CLOSING_DELIMITER: 1,
  AT_LEAST_ONE_NEWLINE: 1,
} as const;
const PLAUSIBILITY_SCORE_THRESHOLD = 3;

/**
 * FIX-1: the candidate-local "title/body separation" signal that replaces
 * `NOISE_DISCOUNTED` (see `PLAUSIBILITY_SIGNAL_WEIGHT`'s own doc-comment for
 * the full root-cause analysis). Purely POST-match, purely typographic -
 * never keyed to WHAT WORD follows the candidate, only to its CASE, exactly
 * the same "shape, not phrase" discipline every other signal in this file
 * already follows.
 *
 * Skips whitespace immediately after the candidate's own matched span (the
 * end of its captured title, or the end of its matched line for a
 * line-anchored fallback pattern) and inspects the single next real
 * character:
 *  - a lowercase ASCII letter means the candidate's own "title-ending
 *    period" (or ALL-CAPS title's own natural end) was never really a
 *    sentence/section boundary at all - the surrounding sentence just
 *    continues right through it in ordinary lowercase prose. This is
 *    exactly what happens when an in-text citation happens to quote its
 *    target section's own official Title-Case name (a real, common drafting
 *    shape - "...as further limited by Section 6.09 Limitation on
 *    Restricted Payments. is only an illustrative..."): the regex's own
 *    title-shape requirement (a capitalized span ending at the next period)
 *    matches identically whether that span is a real heading or a quoted
 *    citation, so nothing about the MATCH ITSELF tells the two apart - only
 *    what comes after it does.
 *  - anything else - an uppercase letter (a new sentence, a defined term),
 *    a digit, an opening quote/bracket/paren, a lettered clause marker, or
 *    the end of the document/region entirely - is genuine, if weak,
 *    evidence that real content of its own begins right where the candidate
 *    ends, exactly the shape every real heading in FWRG/LSB/CONMED/DSGR
 *    exhibits.
 *
 * Deliberately does not distinguish "a real new sentence" from "a numbered
 * list marker" from "end of document" - all three are equally genuine
 * "something else, self-contained, starts here" evidence, and drawing a
 * finer distinction would require exactly the kind of semantic/lexical
 * judgment this file's whole design forbids.
 *
 * Two refinements over a naive "just look at the character right after the
 * regex match", both found by running this exact suite against real and
 * synthetic fixtures rather than assumed up front:
 *
 *  1. A crude LINE-ANCHORED fallback pattern (ARTICLE_PATTERNS[1],
 *     SECTION_PATTERNS[1-3], INTEGER_SECTION_PATTERNS[1]) has no title-shape
 *     validation of its own - its title capture is `[^\n]*`, swallowing the
 *     ENTIRE rest of the physical line, including a false candidate's own
 *     "is only an illustrative cross-reference..." run-on continuation, as
 *     part of the "title" itself. Checking only the character immediately
 *     after such a match's own end is blind to this - the false
 *     continuation was already absorbed INTO the match. The fix scans the
 *     candidate's own FULL MATCHED TEXT (never past it, into unrelated
 *     later content) for the first genuine sentence-terminal punctuation
 *     mark followed by whitespace; if the real title logically ends there
 *     (mid-match), that boundary - not the regex's own greedy match end -
 *     is what gets evaluated. A shape-based pattern's own match already
 *     ends exactly at its title's natural terminator, so this scan simply
 *     finds nothing and falls through to the original check for those.
 *  2. This file's own `ciKeyword` design deliberately allows a legitimate
 *     heading to use a lowercase keyword ("section 6.02 Liens ."). A
 *     real ARTICLE immediately followed by such a lowercase-keyword SECTION
 *     (no terminal punctuation, no blank line - the exact §10 shape this
 *     file's own signal (C) exists for) would otherwise be misread as
 *     "lowercase continuation" purely because the NEXT heading's own
 *     keyword happens to be spelled in lowercase - punishing a convention
 *     this file elsewhere explicitly supports. `looksLikeNewContentStart`
 *     special-cases exactly this: text starting with "article"/"section"/"§"
 *     (any case) is always treated as the start of new content, never as
 *     prose continuation, regardless of its own letter case.
 *  3. Real, committed fixtures (DSGR doc-b's real body "ARTICLE III"
 *     heading; CONMED doc-a's real "SECTION 2.10 Termination or
 *     Reduction\nof Revolving Credit Commitments ." heading; CONMED doc-b's
 *     real "2.4\nAmendments, etc. with respect to the Primary Obligations ."
 *     heading and its own ToC entry) proved a THIRD real shape: a crude
 *     LINE-ANCHORED FALLBACK pattern (no title-shape validation of its own,
 *     unlike the shape-based patterns) can capture only PART of a real
 *     title - either because the title wraps onto a second physical line
 *     via a single newline ("Termination or Reduction\nof Revolving Credit
 *     Commitments ."), or because an ordinary mid-title ABBREVIATION period
 *     ("Amendments, etc. with respect to...") is mistaken, by the internal-
 *     terminal scan above, for the title's own true end. Naively
 *     re-attempting the rescue by "look a little further for terminal
 *     punctuation, then re-check" (an earlier draft of this fix) turns out
 *     to be UNSOUND in general applied without restriction: an embedded
 *     citation's own fake continuation ALSO eventually reaches its own
 *     sentence-ending punctuation and is typically followed by genuinely
 *     new content (a lettered clause, the next real heading) - real
 *     paragraphs are finite, so "keep reading until something looks new"
 *     would eventually rescue almost any fake citation too, given a long
 *     enough lookahead; the earlier draft's precision depended entirely on
 *     the ARBITRARY length of the specific adversarial text used to probe
 *     it, not on any real distinguishing feature - confirmed by 3 of this
 *     remediation's OWN required adversarial cases regressing when that
 *     draft's bound merely happened to be wide enough.
 *
 *     The GENUINE, general distinguishing feature is not "how far until
 *     something new appears" but WHETHER THE MATCH ITSELF ALREADY REACHED A
 *     VALIDATED END: SECTION_PATTERNS[0] / INTEGER_SECTION_PATTERNS[0] (the
 *     shape-based patterns) never produce a match at all unless it closes
 *     with real terminal punctuation - `\.(?!\d)` is baked into the regex
 *     itself - so whenever a candidate's own match ends that way with NO
 *     other internal terminal punctuation before it, its matchEnd is a
 *     VALIDATED true title boundary, and no wrap-tolerance is needed OR
 *     wanted (this is exactly the shape both the original bug and its
 *     false-positive reopening occur under - an in-text citation quoting a
 *     Title-Case section name always closes with a real period, by the same
 *     regex construction a genuine heading does, so `looksLikeNewContentStart`
 *     alone - the plain, non-wrap-tolerant, single-character check - is what
 *     correctly rejects it). Wrap-tolerance (`looksLikeNewContentStartAfterPossibleTitleWrap`)
 *     is reserved for the two shapes that genuinely need it - matchEnd with
 *     no terminal punctuation of its own at all (title truncated by a
 *     line-anchored fallback before reaching ANY punctuation), or the
 *     position right after an INTERNAL terminal found mid-match (which may
 *     be a genuine mid-title abbreviation, not the real title/body seam) -
 *     and even then only as a single BOUNDED hop, never an open-ended or
 *     multi-hop search: a real title's own continuation (whether a wrapped
 *     second line or the tail end of an abbreviation) is always short and
 *     resolves to genuine new content within that one bounded hop; an
 *     embedded citation's fake continuation is long, unbounded, ordinary
 *     prose that does not.
 */
function looksLikeNewContentStart(text: string, pos: number): boolean {
  const after = text.slice(pos, pos + 200);
  const skipped = after.match(/^\s*/)![0].length;
  const rest = after.slice(skipped, skipped + 20);
  if (rest.length === 0) return true; // end of document/region - trivially self-contained, nothing to bleed into
  if (/^(?:article|section|§)\b/i.test(rest)) return true; // a recognized heading keyword may legitimately be spelled lowercase (ciKeyword) - never mistaken for an ordinary lowercase prose word
  return !/[a-z]/.test(rest[0]!);
}

/**
 * Wrap-tolerant variant of `looksLikeNewContentStart` - see
 * `titleBodySeparationHolds`'s own doc-comment for exactly when this is used
 * instead of the plain check, and why an open-ended or multi-hop version of
 * this same idea would be unsound. A real title's own short continuation
 * (a wrapped second line, or the tail of a mid-title abbreviation) reaches
 * genuine new content within a SHORT, bounded distance; an embedded
 * citation's fake continuation is long, ordinary, unbounded prose that does
 * not. Hops forward through at most one bounded terminal-punctuation
 * boundary and re-checks with the plain test - never recursed further.
 */
const WRAP_CONTINUATION_BOUND = 150;

function looksLikeNewContentStartAfterPossibleTitleWrap(text: string, pos: number): boolean {
  if (looksLikeNewContentStart(text, pos)) return true;
  const after = text.slice(pos, pos + 500);
  const skipped = after.match(/^\s*/)![0].length;
  const boundedWindow = after.slice(skipped, skipped + WRAP_CONTINUATION_BOUND);
  const terminal = boundedWindow.match(/[.:;!?]\s+/);
  if (!terminal) return false; // no genuine terminal punctuation within a real title-wrap's own natural length - ordinary unbounded prose, not a wrapped title fragment
  const nextPos = pos + skipped + terminal.index! + terminal[0].length;
  return looksLikeNewContentStart(text, nextPos); // exactly one hop, never recursed further
}

function titleBodySeparationHolds(text: string, matchStart: number, matchEnd: number): boolean {
  const matchText = text.slice(matchStart, matchEnd);
  const internalTerminal = matchText.match(/[.:;!?]\s+/);
  if (internalTerminal) {
    // The match's own text already contains an internal terminal-
    // punctuation boundary - most often a crude fallback pattern that
    // swallowed an entire physical line. This is not always the real
    // title/body seam: it can be an ordinary mid-title ABBREVIATION period
    // ("etc.") with a few more, still-short title words following it before
    // the real seam. One bounded hop resolves both honestly with the same
    // mechanism: a genuine abbreviation's tail is short and reaches real new
    // content quickly; an embedded citation's fake continuation
    // ("miscellaneous provisions. is merely a cross-reference...") is long
    // enough that it does not, and is correctly rejected exactly as before.
    const pos = matchStart + internalTerminal.index! + internalTerminal[0].length;
    return looksLikeNewContentStartAfterPossibleTitleWrap(text, pos);
  }
  // No internal terminal within the match's own text. If the match's own
  // last character is itself real terminal punctuation, the regex already
  // validated a complete, self-terminating title (this is the ONLY way a
  // shape-based pattern - SECTION_PATTERNS[0]/INTEGER_SECTION_PATTERNS[0] -
  // ever produces a match at all) - matchEnd is a trustworthy true
  // boundary, and wrap-tolerance must NOT be applied (that is precisely how
  // an in-text citation's own quoted Title-Case name would otherwise be
  // laundered through, since it closes with a real period exactly the same
  // way a genuine heading does). Otherwise, the match ends in a bare word
  // with no punctuation of its own at all - only a crude, title-shape-
  // unvalidated LINE-ANCHORED FALLBACK pattern can ever produce that (a
  // shape-based pattern never matches at all without reaching its own
  // terminal punctuation first) - meaning the capture is provably
  // incomplete, and the real title may legitimately continue onto the next
  // physical line.
  const endsInOwnTerminalPunctuation = /[.:;!?]$/.test(matchText);
  return endsInOwnTerminalPunctuation ? looksLikeNewContentStart(text, matchEnd) : looksLikeNewContentStartAfterPossibleTitleWrap(text, matchEnd);
}

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
 *
 * `matchEnd` (the candidate's own matched span end, not merely its start)
 * is required as of FIX-1: `titleBodySeparationHolds` is evaluated FIRST,
 * as a hard veto that overrides every signal below it - including the two
 * independently-sufficient ones - because "what precedes this candidate"
 * evidence of any kind (real noise, real terminal punctuation, a real
 * paragraph break) has been proven, in this file's own certified history,
 * to be reproducible identically for a genuine heading and for an in-text
 * citation that merely quotes that heading's own official title. Only the
 * candidate's OWN forward-looking title/body separation tells the two
 * apart. See `titleBodySeparationHolds` and `PLAUSIBILITY_SIGNAL_WEIGHT`'s
 * own doc-comments for the full mechanism and root-cause record.
 */
function isPlausibleByPositionalSignals(text: string, matchIndex: number, matchEnd: number): boolean {
  const selfContainedBoundary = titleBodySeparationHolds(text, matchIndex, matchEnd);
  if (!selfContainedBoundary) return false; // hard veto - see doc-comment above
  const windowStart = Math.max(0, matchIndex - 200);
  const before = text.slice(windowStart, matchIndex);
  if (windowStart === 0 && before.trim().length === 0) return true; // true document start
  const withoutNoise = stripTrailingTypographicNoise(before);
  let score = 0;
  if (precededByParagraphBreak(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.PARAGRAPH_BREAK;
  if (precededBySentenceTerminalPunctuation(withoutNoise)) score += PLAUSIBILITY_SIGNAL_WEIGHT.SENTENCE_TERMINAL_PUNCTUATION;
  score += PLAUSIBILITY_SIGNAL_WEIGHT.SELF_CONTAINED_BOUNDARY; // guaranteed true here (the veto above already returned false otherwise) - see PLAUSIBILITY_SIGNAL_WEIGHT's own doc-comment for why this is both a veto and a corroborating weight
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
  const { articleMatches, sectionMatches } = decideAcceptedStructuralMatches(doc);
  return buildStructuralNodesFromAcceptedMatches(doc, articleMatches, sectionMatches);
}

/**
 * The full candidate-generation + deterministic acceptance-decision pipeline
 * (P1-10 plausibility gate - see the doc-comment above `bestMatches`),
 * producing the final, DECIDED sets of ARTICLE and SECTION matches
 * `parseDocumentStructure` builds real nodes from. Extracted as its own
 * function (Phase 3F.1 Human Architecture Decision, Workstream OPEN-1) so
 * the new triage-driven candidate GENERATION below
 * (`collectRawStructuralCandidates`) can reuse the exact same regex/overlap/
 * established-span mechanics without duplicating them, while this function's
 * own ACCEPTANCE logic (isPlausible et al.) is left completely untouched -
 * `parseDocumentStructure` itself is a pure behavior-preserving refactor,
 * zero risk to the existing regression suite (tests/certification/
 * part-a-final-fix1-structural.test.ts and
 * tests/certification/part-b-terminal-recert-open1-independent.test.ts in
 * particular, which this remediation is required to keep passing
 * unmodified).
 */
function decideAcceptedStructuralMatches(doc: CompilerDocumentInput): { articleMatches: RegExpExecArray[]; sectionMatches: RegExpExecArray[] } {
  // applied to each match SOURCE right after `bestMatches` selects the
  // winning pattern shape (pattern-selection is a shape-richness contest,
  // never affected by plausibility) and before any match is used for
  // anything else - overlap dedup, established-span computation, or raw
  // node construction - so an implausible match is uniformly invisible to
  // every downstream consumer, never merely to the rank-stack.
  // ARTICLE candidates are resolved first, using signals (A)/(B)/document-
  // start ONLY - never signal (C), which is section-specific and anchors TO
  // an already-resolved ARTICLE, so it cannot apply here without circularity.
  const articleMatches = bestMatches(doc.text, ARTICLE_PATTERNS).filter((m) => isPlausibleByPositionalSignals(doc.text, m.index, m.index + m[0].length));
  // Signal (C)'s own anchor set - only the ARTICLE ends that themselves
  // survived (A)/(B)/document-start above, sorted ascending (bestMatches
  // already returns matches in left-to-right document order for a single
  // winning pattern, and `overlapsAny`/regex `exec` scanning guarantee no
  // pattern's own matches are ever produced out of order).
  const plausibleArticleEnds = articleMatches.map((m) => m.index + m[0].length);
  // FIX-1: `titleBodySeparationHolds` is re-applied here as an explicit AND
  // across BOTH acceptance paths - not only inside `isPlausibleByPositionalSignals`
  // (which already covers the first path) - so that a SECTION-shaped
  // candidate embedded mid-sentence can never slip through via signal (C)
  // (ARTICLE-adjacency) either. `isImmediatelyAfterPlausibleArticle` itself
  // is deliberately left untouched (its own contract never needed to
  // change), so this is the general fix applied uniformly at the one place
  // both paths converge, never a special case bolted onto signal (C).
  const isPlausible = (m: RegExpExecArray) => {
    const matchEnd = m.index + m[0].length;
    if (!titleBodySeparationHolds(doc.text, m.index, matchEnd)) return false;
    return isPlausibleByPositionalSignals(doc.text, m.index, matchEnd) || isImmediatelyAfterPlausibleArticle(doc.text, m.index, plausibleArticleEnds);
  };

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
  return { articleMatches, sectionMatches };
}

/**
 * The span/rank-stack/ordinal/nodeId construction that turns a final,
 * already-DECIDED set of ARTICLE and SECTION matches into real
 * StructuralNode[] (nested clause parsing, owned-span computation, sibling
 * ordinals, stable node identity). Extracted, byte-for-byte, from
 * `parseDocumentStructure`'s own former tail as a PURE REFACTOR (no behavior
 * change - same inputs produce the same outputs) so the new triage-driven
 * parse path (`parseDocumentStructureWithTriage`/
 * `applyStructuralAmbiguityOverrides` below) can reuse this exact,
 * already-certified mechanical construction instead of duplicating it.
 */
function buildStructuralNodesFromAcceptedMatches(doc: CompilerDocumentInput, articleMatches: RegExpExecArray[], sectionMatches: RegExpExecArray[]): StructuralNode[] {
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

// =============================================================================
// Phase 3F.1 HUMAN ARCHITECTURE DECISION (Workstream OPEN-1)
// =============================================================================
/**
 * `parseDocumentStructure` above is the primary, deterministic system and is
 * left completely UNCHANGED by this remediation (see
 * `decideAcceptedStructuralMatches`'s own doc-comment) - the large existing
 * regression suite depends on its exact behavior. But this file's own long
 * doc-comment history above (NOISE_DISCOUNTED -> titleBodySeparationHolds)
 * records TWO independent auditors falsifying every attempt to make purely
 * typographic evidence resolve "Section 6.09 Restricted Payments." as either
 * a real heading or an ordinary in-prose citation in EVERY case. The most
 * careful attempt (titleBodySeparationHolds) is providably indistinguishable
 * for the specific pair that matters most in real drafting: a real heading
 * whose body starts with an ordinary new sentence, versus a well-punctuated
 * in-text citation immediately followed by an ordinary new sentence of the
 * surrounding paragraph. Both end in a real terminal period and are both
 * followed by non-lowercase text - no refinement of "what does the next
 * character look like" can ever tell them apart; it requires reading actual
 * CONTENT on both sides and judging discourse structure.
 *
 * The mandated architecture (see docs/phase-3f1-human-architecture-decision/
 * 02-structural-triage-design.json for the full design record): deterministic
 * parsing remains primary and resolves the overwhelming majority of real
 * documents with ZERO model calls. A candidate whose deterministic evidence
 * cannot safely resolve heading-vs-prose-reference identity is triaged
 * AMBIGUOUS and routed to a bounded, source-only structural classifier
 * (structural-ambiguity-classifier.ts) - never a mandatory stage, never a
 * replacement for this file's own regex/positional-signal machinery, only an
 * ambiguity resolver for the residual cases that machinery has been
 * independently, repeatedly proven unable to resolve alone.
 *
 * Everything below is ADDITIVE: a new, separate triage-driven parse path
 * (`parseDocumentStructureWithTriage`, `applyStructuralAmbiguityOverrides`)
 * that reuses `decideAcceptedStructuralMatches`'s own candidate-GENERATION
 * mechanics (bestMatches/unionMatches/BARE_INTEGER_SECTION_PATTERN/overlap
 * dedup - all unchanged) but replaces its accept/reject DECISION with the new
 * three-valued triage below. `parseDocumentStructure` itself never calls any
 * of this code and is entirely unaffected.
 */

/** Conceptually `CONFIDENT_HEADING | CONFIDENT_PROSE_REFERENCE | AMBIGUOUS`, per the governing spec - never collapsed to a boolean or a numeric score that silently resolves ambiguity into certainty. */
export type StructuralCandidateDecision = "CONFIDENT_HEADING" | "CONFIDENT_PROSE_REFERENCE" | "AMBIGUOUS";

/** How the candidate's own matched title text relates to its own terminal punctuation - see `classifySeamValidation`'s own doc-comment. */
export type StructuralSeamValidation = "VALIDATED_TERMINATED" | "ABSORBED_SENTENCE" | "INCOMPLETE_NO_TERMINAL";

/** What immediately follows the candidate's own matched span - see `classifyContinuationShapeForTriage`'s own doc-comment. */
export type StructuralContinuationShape = "LOWERCASE_ORDINARY" | "LOWERCASE_DEFINITIONAL" | "IMMEDIATE_KEYWORD" | "SELF_CONTAINED_OTHER";

/** The full, disclosed signal bundle behind one triage decision - never collapsed to a single opaque score; every field here is real, independently-inspectable, purely typographic/positional evidence (never keyed to drafting phrasing). */
export interface StructuralCandidateTriageSignals {
  isDocumentOrRegionStart: boolean;
  isImmediatelyAfterConfidentArticle: boolean;
  hasParagraphBreak: boolean;
  hasSentenceTerminalPunctuation: boolean;
  hasClosingDelimiter: boolean;
  hasAtLeastOneNewline: boolean;
  seamValidation: StructuralSeamValidation;
  continuationShape: StructuralContinuationShape;
}

export interface StructuralCandidateTriageResult {
  decision: StructuralCandidateDecision;
  reason: string;
  signals: StructuralCandidateTriageSignals;
}

/**
 * Classifies the RELATIONSHIP between a candidate's own matched text and its
 * own terminal punctuation - a purely typographic, candidate-LOCAL signal
 * (never keyed to what precedes or follows the match). Three shapes:
 *
 *  - VALIDATED_TERMINATED: the match's own last real character is terminal
 *    punctuation ([.:;!?]), with no EARLIER terminal-followed-by-more-text
 *    inside the match - the regex construction itself guarantees this IS a
 *    genuine, complete title span with a known end. Both SECTION_PATTERNS[0]/
 *    INTEGER_SECTION_PATTERNS[0] (shape-based, `\.(?!\d)` baked into the
 *    regex) and a crude line-anchored fallback whose own captured line
 *    happens to end in real punctuation with nothing else inside produce
 *    this shape.
 *  - ABSORBED_SENTENCE: the match's own text contains an INTERNAL terminal
 *    mark followed by more real text, before the match's own end - only a
 *    title-shape-unvalidated line-anchored fallback pattern (`[^\n]*`) can
 *    ever produce this, by swallowing an entire, possibly-unrelated sentence
 *    as if it were part of the "title". This is EXACTLY the shape the
 *    auditor's own falsifying reproduction
 *    (tests/certification/part-b-final-fix1-independent-recert.test.ts, Part
 *    2/3) exploits: a citation's own real title ends, then its surrounding
 *    sentence's own continuation gets absorbed into the same "match" because
 *    nothing in the crude pattern's own grammar stops it there. Typography
 *    genuinely cannot confirm where the real title ends inside this shape -
 *    routed AMBIGUOUS, never resolved by guessing (the previous, now-removed
 *    `looksLikeNewContentStartAfterPossibleTitleWrap` wrap-tolerance
 *    mechanism WAS exactly such a guess, and the auditor's own Part 3 proved
 *    it unsound: the identical text, merely re-wrapped, flipped a correct
 *    rejection into a false acceptance).
 *  - INCOMPLETE_NO_TERMINAL: the match ends in neither its own terminal
 *    punctuation nor an internal one - only a crude fallback that ran out of
 *    physical line before reaching ANY punctuation (a title that genuinely
 *    wraps onto a second physical line) produces this. Typography cannot
 *    confirm whether the real title legitimately continues (a wrapped real
 *    heading) or the captured fragment already bled into ordinary prose -
 *    routed AMBIGUOUS, for the identical reason.
 */
/**
 * Strips the candidate's own leading "KEYWORD NUMBER[.]<gap>" prefix (e.g.
 * "SECTION 1.", "Section 6.01", "ARTICLE VI") from its matched text, leaving
 * only the real TITLE portion (still including that title's own trailing
 * punctuation, if any - the prefix strip stops right before the title
 * starts, never consuming any of it). This matters because the number
 * itself routinely carries its own period ("SECTION 1." - a bare-integer
 * numbering convention's own terminator; "6.01" - an ordinary decimal
 * separator) which is NOT title/body-seam punctuation at all and must never
 * be mistaken for one by `classifySeamValidation` below - scanning the RAW
 * match text for "a terminal mark followed by more text" would otherwise
 * false-trigger ABSORBED_SENTENCE on every single bare-integer heading
 * ("SECTION 1. Amendments." - the period after "1" is followed by
 * whitespace then "Amendments", which looks identical in shape to a real
 * mid-title sentence break unless the numbering's own period is excluded
 * first).
 */
function extractTitlePortionForSeamCheck(matchText: string, candidateNumber: string): string {
  if (!candidateNumber) return matchText;
  const numIdx = matchText.indexOf(candidateNumber);
  if (numIdx === -1) return matchText;
  let pos = numIdx + candidateNumber.length;
  if (matchText[pos] === ".") pos++; // the number's own optional trailing period (BOUNDED_GAP's own leading dot is handled by the whitespace skip below when absent)
  while (pos < matchText.length && /\s/.test(matchText[pos]!)) pos++;
  return matchText.slice(pos);
}

/**
 * A real title, even an unusually long compound one, is never this long -
 * SECTION_PATTERNS[0]/INTEGER_SECTION_PATTERNS[0]'s own shape-based title
 * capture is itself bounded to 90 characters by construction, so any titlePortion
 * exceeding this (necessarily unbounded-crude-fallback-produced) bound is, by
 * construction, evidence of an absorbed run-on rather than a real title -
 * disclosed, purely typographic "title SHAPE" evidence (the spec's own named
 * signal category), never a phrase list.
 */
const MAX_PLAUSIBLE_TITLE_LENGTH = 110;

/**
 * A short, real-title-shaped run: starts with a capital letter, contains
 * only ordinary heading-title characters (letters/spaces/standard heading
 * punctuation - the SAME character class SECTION_PATTERNS/ARTICLE_PATTERNS'
 * own shape-based title captures already use elsewhere in this file, reused
 * here rather than inventing a second one), and ends in its own terminal
 * punctuation - the ENTIRE candidate string must conform (the trailing `$`
 * anchor is load-bearing: without it, a long absorbed run-on that merely
 * BEGINS with title-shaped characters would false-pass).
 */
const SHORT_TITLE_SHAPE = /^\[?[A-Z][A-Za-z ,&';[\]-]{0,90}?\]?[.:;!?]$/;

interface StructuralSeamResolution {
  validation: StructuralSeamValidation;
  /** Absolute offset in the full document text where continuation-shape should actually be evaluated - the candidate's own real seam, which for a rescued short-title-prefix is NOT the same as the crude fallback pattern's own greedy matchEnd. */
  continuationOffset: number;
}

/**
 * Resolves BOTH the seam-validation verdict AND the exact position
 * continuation-shape evidence should be read from - the latter is not
 * always simply `matchEnd`. A crude, unbounded fallback pattern
 * (BARE_INTEGER_SECTION_PATTERN's own `[^\n]*` design in particular)
 * routinely swallows an entire physical line as "the title" even when the
 * REAL title is short and reaches its own terminal punctuation well before
 * the match's own greedy end (e.g. "1. Amendment. The Credit Agreement is
 * hereby amended..." - the real title is "Amendment.", with ordinary body
 * text continuing on the very same line, exactly as a shape-based pattern
 * would have captured had one existed for this convention). When the text
 * BEFORE the first internal terminal is itself SHORT_TITLE_SHAPE-conforming,
 * that terminal - not the crude match's own greedy end - is the real,
 * already-available seam: no hop, no guess, no bounded lookahead into
 * uncertain territory (the exact mechanism the auditor's own Part 3 proved
 * unsound) - the terminal is directly inside text this function is already
 * given. When the pre-terminal text is NOT short-title-shaped (contains
 * anything outside the title character class - most tellingly, an embedded
 * "Section 6.09"-style cross-reference, whose digits are never part of that
 * class - or simply exceeds the same 90-character bound the shape-based
 * patterns themselves enforce), that is genuine ABSORBED_SENTENCE evidence:
 * the crude pattern swallowed real, unrelated prose, and typography cannot
 * safely locate the seam at all.
 */
function resolveStructuralSeam(matchIndex: number, matchEnd: number, matchText: string, candidateNumber: string, candidateType: "ARTICLE" | "SECTION"): StructuralSeamResolution {
  const titlePortion = extractTitlePortionForSeamCheck(matchText, candidateNumber);
  const titlePortionAbsoluteStart = matchIndex + (matchText.length - titlePortion.length);

  const internalTerminal = titlePortion.match(/[.:;!?]\s+\S/); // a terminal mark followed by more real text still inside the title portion
  if (internalTerminal) {
    const prefixBeforeTerminal = titlePortion.slice(0, internalTerminal.index! + 1);
    if (SHORT_TITLE_SHAPE.test(prefixBeforeTerminal)) {
      return { validation: "VALIDATED_TERMINATED", continuationOffset: titlePortionAbsoluteStart + internalTerminal.index! + 1 };
    }
    return { validation: "ABSORBED_SENTENCE", continuationOffset: matchEnd };
  }
  if (/[.:;!?]\s*$/.test(titlePortion)) {
    if (titlePortion.length > MAX_PLAUSIBLE_TITLE_LENGTH) {
      // One long, uninterrupted run ending in a single terminal mark with no
      // internal structure of its own at all - too long to plausibly be a
      // real title (see MAX_PLAUSIBLE_TITLE_LENGTH's own doc-comment); most
      // likely an entire absorbed sentence that happens to contain no other
      // punctuation of its own before its own final period.
      return { validation: "ABSORBED_SENTENCE", continuationOffset: matchEnd };
    }
    return { validation: "VALIDATED_TERMINATED", continuationOffset: matchEnd };
  }
  // An ARTICLE's own ALL-CAPS title (ARTICLE_PATTERNS' own shape) carries no
  // terminal punctuation of its own by convention - it is a title run, not a
  // sentence - so ARTICLE_PATTERNS[0]'s own lookahead-bounded match (and
  // ARTICLE_PATTERNS[1]'s full-line fallback, which stops at a real line
  // break) already constitutes a validated title boundary even with no
  // internal terminal present. Never extended to SECTION, whose shape-based
  // pattern (SECTION_PATTERNS[0]/INTEGER_SECTION_PATTERNS[0]) always DOES
  // require and capture a real trailing period by construction - a SECTION
  // candidate reaching this branch can only be a title-shape-unvalidated
  // line-anchored fallback that genuinely ran out of line before any
  // punctuation, which is exactly the wrap-uncertain shape this file's own
  // module-level doc-comment (INCOMPLETE_NO_TERMINAL) describes.
  if (candidateType === "ARTICLE") return { validation: "VALIDATED_TERMINATED", continuationOffset: matchEnd };
  return { validation: "INCOMPLETE_NO_TERMINAL", continuationOffset: matchEnd };
}

/**
 * What immediately follows the candidate's own matched span - deliberately a
 * SINGLE, bounded, non-recursive check (unlike the now-removed
 * `looksLikeNewContentStartAfterPossibleTitleWrap`, whose own bounded-but-
 * still-guessing "hop forward past one more terminal" mechanism was itself
 * proven, by the auditor's own Part 3 minimal pair, to be a fresh
 * false-positive path rather than a safe rescue). A candidate whose own seam
 * is not VALIDATED_TERMINATED never reaches this function's result at all
 * (see `evaluateStructuralCandidateTriage` below) - it is routed AMBIGUOUS
 * before any continuation shape is even consulted, closing that exact class
 * of defect at its root rather than patching the guess.
 *
 *  - LOWERCASE_ORDINARY: an ordinary lowercase ASCII letter - the strongest
 *    remaining reliable reject signal this file has: real drafting practice,
 *    across every fixture this codebase has examined, never legitimately
 *    continues a real heading's own title into a lowercase word (the one
 *    disclosed exception - a "Term. means ..." definitions convention - is
 *    its own named LOWERCASE_DEFINITIONAL shape below, never silently folded
 *    into this one).
 *  - LOWERCASE_DEFINITIONAL: the narrow, closed, near-universal legal-
 *    drafting convention "Term. means ..." / "Term. shall mean ..." -
 *    disclosed and bounded (exactly two fixed continuations recognized,
 *    never an open phrase list) rather than silently lumped in with ordinary
 *    lowercase prose, because a real definitions-style heading legitimately
 *    uses it (see the required test matrix's own "definitions-style 'Term.
 *    means ...' where genuinely structural" case, and the auditor's own
 *    falsifying reproduction Part 4).
 *  - IMMEDIATE_KEYWORD: another recognized structural keyword
 *    (ARTICLE/Section/§, any case) sits within a SHORT whitespace-only gap
 *    (<=2 characters) of the candidate's own end - the genuine signal-(C)
 *    shape ("ARTICLE VI COVENANTS Section 6.01 Indebtedness ." with no
 *    sentence between them). Deliberately BOUNDED (unlike the original
 *    `looksLikeNewContentStart`'s own unbounded whitespace-skip-then-keyword
 *    check, which the auditor's own final Part 3 case exploited: a fake,
 *    fully-absorbed citation "sentence" followed - after a full paragraph
 *    break - by an unrelated REAL subsequent heading was laundered through
 *    purely because a keyword eventually appeared somewhere downstream,
 *    regardless of how much real prose sat between). Requiring near-adjacency
 *    closes that hole at the root: a keyword found only after skipping a
 *    genuine paragraph break is never "immediate" and instead falls through
 *    to SELF_CONTAINED_OTHER below, evaluated on its own positional merits.
 *  - SELF_CONTAINED_OTHER: anything else self-contained-shaped (an uppercase
 *    letter, a digit, an opening quote/bracket/paren, or the end of the
 *    document/region) - genuine, but on its own only WEAK evidence: this is
 *    the shape a real heading's own body exhibits, but it is ALSO the shape
 *    an ordinary, well-punctuated in-text citation exhibits when followed by
 *    an unrelated new sentence of the surrounding paragraph (the auditor's
 *    own central falsifying finding) - so this shape alone never confers
 *    CONFIDENT_HEADING in `evaluateStructuralCandidateTriage` below; it must
 *    be corroborated by independent BEFORE-evidence (paragraph break,
 *    document start, ARTICLE-adjacency) or is otherwise routed AMBIGUOUS.
 */
function classifyContinuationShapeForTriage(text: string, pos: number): StructuralContinuationShape {
  const after = text.slice(pos, pos + 200);
  const skipped = after.match(/^\s*/)![0].length;
  const skippedWhitespace = after.slice(0, skipped);
  const rest = after.slice(skipped, skipped + 20);
  if (rest.length === 0) return "SELF_CONTAINED_OTHER"; // end of document/region - trivially self-contained
  // Bounded adjacency is measured in NEWLINES, not raw character count: a
  // genuine paragraph break ("\n\n") is only 2 characters but represents
  // real separation, not immediate adjacency - a naive character-count bound
  // would let a keyword found only after a full paragraph break (with real,
  // if entirely absorbed-into-the-match, prose in between) still register as
  // "immediate", reopening exactly the unbounded-keyword-lookahead hole this
  // function's own doc-comment describes. At most a single newline (or pure
  // same-line whitespace) counts as immediate.
  const newlineCount = (skippedWhitespace.match(/\n/g) ?? []).length;
  if (newlineCount <= 1 && skipped <= 4 && /^(?:article|section|§)\b/i.test(rest)) return "IMMEDIATE_KEYWORD";
  if (/^(?:means\b|shall\s+mean\b)/i.test(rest)) return "LOWERCASE_DEFINITIONAL";
  if (/^[a-z]/.test(rest)) return "LOWERCASE_ORDINARY";
  return "SELF_CONTAINED_OTHER";
}

/**
 * The full triage decision procedure. Per the governing spec, NO single
 * signal below is individually decisive in every branch except the two
 * genuinely reliable ones this file's own remediation history has actually
 * earned the right to treat that way: an ordinary lowercase continuation
 * (real drafting, across every examined fixture, never legitimately
 * continues a heading's own title that way) and an unresolved seam
 * (typography cannot even confirm where the title itself ends, so nothing
 * downstream of it is trustworthy either). Every other branch requires TWO
 * independent pieces of corroborating evidence (a validated seam AND
 * non-lowercase continuation, AND separately strong positional isolation)
 * before granting CONFIDENT_HEADING - anything resting on only ONE weak
 * signal (bare sentence-terminal punctuation with no paragraph break; a
 * definitional continuation with no strong isolation) is honestly routed
 * AMBIGUOUS rather than resolved by a guess, per this phase's own mandate.
 */
function evaluateStructuralCandidateTriage(text: string, matchIndex: number, matchEnd: number, matchText: string, candidateNumber: string, candidateType: "ARTICLE" | "SECTION", isImmediatelyAfterConfidentArticle: boolean): StructuralCandidateTriageResult {
  const windowStart = Math.max(0, matchIndex - 200);
  const beforeRaw = text.slice(windowStart, matchIndex);
  const isDocumentOrRegionStart = windowStart === 0 && beforeRaw.trim().length === 0;
  const before = stripTrailingTypographicNoise(beforeRaw);
  const seam = resolveStructuralSeam(matchIndex, matchEnd, matchText, candidateNumber, candidateType);
  const signals: StructuralCandidateTriageSignals = {
    isDocumentOrRegionStart,
    isImmediatelyAfterConfidentArticle,
    hasParagraphBreak: precededByParagraphBreak(before),
    hasSentenceTerminalPunctuation: precededBySentenceTerminalPunctuation(before),
    hasClosingDelimiter: precededByClosingDelimiter(before),
    hasAtLeastOneNewline: precededByAtLeastOneNewline(before),
    seamValidation: seam.validation,
    continuationShape: classifyContinuationShapeForTriage(text, seam.continuationOffset),
  };

  if (signals.seamValidation !== "VALIDATED_TERMINATED") {
    // Checked BEFORE the lowercase-continuation check below, deliberately:
    // when the seam itself is not validated, `continuationShape` was read at
    // the crude match's own unreliable end (`matchEnd`), not a confirmed
    // seam - an ordinary lowercase grammatical continuation there (e.g. "...
    // Termination or Reduction\nof Revolving Credit Commitments." - "of" is
    // a completely normal continuation of a real, legitimately wrapped
    // title, not evidence the candidate is prose) must never be trusted as
    // reject evidence when we do not even know where the real title ends.
    const reason =
      signals.seamValidation === "ABSORBED_SENTENCE"
        ? "the candidate's own matched text already contains an internal sentence-terminal mark followed by more real text that is not itself a short, title-shaped run - typography cannot confirm where the real title actually ends, so nothing about what follows the match is trustworthy either."
        : "the candidate's own matched text never reaches its own terminal punctuation at all - typography cannot confirm whether this is a legitimately wrapped title or a fragment that already bled into ordinary prose.";
    return { decision: "AMBIGUOUS", reason, signals };
  }
  if (signals.continuationShape === "LOWERCASE_ORDINARY") {
    return { decision: "CONFIDENT_PROSE_REFERENCE", reason: "an ordinary lowercase word immediately continues past the candidate's own validated title-ending seam - the sentence it sits inside of never really ended here.", signals };
  }
  if (signals.isDocumentOrRegionStart) {
    return { decision: "CONFIDENT_HEADING", reason: "candidate sits at the true start of the document/region - nothing precedes it for it to be the citation object of.", signals };
  }
  if (signals.isImmediatelyAfterConfidentArticle) {
    return { decision: "CONFIDENT_HEADING", reason: "candidate immediately follows (whitespace only) an already-confident ARTICLE heading.", signals };
  }
  if (signals.hasParagraphBreak) {
    return { decision: "CONFIDENT_HEADING", reason: "a genuine paragraph break isolates the candidate - real, strong visual/structural separation on the preceding side, corroborated by a validated, non-lowercase-continuing seam.", signals };
  }
  if (signals.continuationShape === "IMMEDIATE_KEYWORD") {
    return { decision: "CONFIDENT_HEADING", reason: "candidate is immediately (whitespace only, no intervening prose) followed by another recognized structural heading keyword.", signals };
  }
  if (signals.hasSentenceTerminalPunctuation) {
    return {
      decision: "AMBIGUOUS",
      reason:
        "the only preceding evidence is ordinary sentence-terminal punctuation with no paragraph break, and the candidate is followed by ordinary self-contained-shaped text. This exact combination is typographically IDENTICAL for a genuine heading (whose body legitimately starts a new sentence) and for a well-punctuated in-prose citation immediately followed by an unrelated new sentence of the surrounding paragraph - deterministic evidence alone cannot resolve it (see this file's own module-level doc-comment on the human architecture decision).",
      signals,
    };
  }
  if (signals.continuationShape === "LOWERCASE_DEFINITIONAL") {
    return { decision: "AMBIGUOUS", reason: "candidate is followed by a 'means'/'shall mean' definitional continuation with no strong preceding isolation evidence - plausibly a real definitions-style heading, or a citation to a defined term.", signals };
  }
  return { decision: "CONFIDENT_PROSE_REFERENCE", reason: "no genuine positional isolation evidence of any kind precedes the candidate - it reads as embedded mid-sentence text with no structural separation.", signals };
}

/** Stable key identifying one physical candidate occurrence for override-map purposes - never a label (sectionRef), which real drafting can legitimately repeat. */
export function structuralCandidateKey(candidateType: "ARTICLE" | "SECTION", charStart: number): string {
  return `${candidateType}:${charStart}`;
}

export interface AmbiguousStructuralCandidate {
  documentId: string;
  candidateType: "ARTICLE" | "SECTION";
  candidateKey: string;
  /** The regex-captured number/label (e.g. "6.09", "VI") - real, already-visible text, never a parser judgment. */
  candidateNumber: string;
  candidateText: string;
  charStart: number;
  charEnd: number;
  precedingWindow: string;
  followingWindow: string;
  nearestConfidentHeadingBefore: string | null;
  nearestConfidentHeadingAfter: string | null;
  triage: StructuralCandidateTriageResult;
}

export interface StructuralTriageStats {
  totalCandidates: number;
  confidentHeadingCount: number;
  confidentProseReferenceCount: number;
  ambiguousCount: number;
}

export interface StructuralParseWithTriageResult {
  nodes: StructuralNode[];
  ambiguousCandidates: AmbiguousStructuralCandidate[];
  triageStats: StructuralTriageStats;
}

const TRIAGE_WINDOW_CHARS = 300;

/** One raw regex candidate, tagged with its own triage result and enclosing document text - the shared unit both `parseDocumentStructureWithTriage` and `applyStructuralAmbiguityOverrides` build from `decideRawStructuralCandidates` below. */
interface TriagedCandidate {
  candidateType: "ARTICLE" | "SECTION";
  match: RegExpExecArray;
  triage: StructuralCandidateTriageResult;
}

/**
 * Generates the FULL candidate superset (unfiltered by any acceptance
 * decision) and triages every one of them, reusing `decideAcceptedStructuralMatches`'s
 * exact regex/overlap/established-span GENERATION mechanics - never a
 * second, drifting reimplementation of that matching logic. ARTICLE
 * candidates are triaged first (document-start/paragraph-break only, never
 * signal-C, which is section-specific and anchors TO an already-confident
 * ARTICLE); their own CONFIDENT_HEADING ends become the anchor set section
 * candidates may use for signal-C, exactly mirroring
 * `decideAcceptedStructuralMatches`'s own two-phase structure.
 */
function decideRawStructuralCandidates(doc: CompilerDocumentInput): TriagedCandidate[] {
  const rawArticleMatches = bestMatches(doc.text, ARTICLE_PATTERNS);
  const triagedArticles: TriagedCandidate[] = rawArticleMatches.map((m) => ({
    candidateType: "ARTICLE",
    match: m,
    triage: evaluateStructuralCandidateTriage(doc.text, m.index, m.index + m[0].length, m[0], (m[1] ?? "").trim(), "ARTICLE", false),
  }));
  const confidentArticleEnds = triagedArticles.filter((c) => c.triage.decision === "CONFIDENT_HEADING").map((c) => c.match.index + c.match[0].length);

  const rawDecimalSectionMatches = unionMatches(doc.text, SECTION_PATTERNS);
  const rawIntegerSectionMatches = bestMatches(doc.text, INTEGER_SECTION_PATTERNS).filter((m) => !overlapsAny(m, rawDecimalSectionMatches));
  const bareIntegerRe = new RegExp(BARE_INTEGER_SECTION_PATTERN.source, BARE_INTEGER_SECTION_PATTERN.flags);
  const rawBareIntegerMatchesAll: RegExpExecArray[] = [];
  let bm: RegExpExecArray | null;
  while ((bm = bareIntegerRe.exec(doc.text)) !== null) {
    rawBareIntegerMatchesAll.push(bm);
    if (bm.index === bareIntegerRe.lastIndex) bareIntegerRe.lastIndex++;
  }
  // Mirrors decideAcceptedStructuralMatches's own "established span" concept,
  // but purely mechanically (candidate EXISTENCE, not acceptance CONFIDENCE)
  // - a bare integer candidate falling inside ANY recognized decimal/integer
  // candidate's own governed span is still an ordinary enumerated list item
  // nested inside that section, regardless of whether that enclosing
  // candidate ultimately triages CONFIDENT or AMBIGUOUS.
  const establishedForBareIntegerExclusion = [...rawDecimalSectionMatches, ...rawIntegerSectionMatches].sort((a, b) => a.index - b.index);
  function fallsInsideAnEstablishedSpan(charStart: number): boolean {
    for (let i = 0; i < establishedForBareIntegerExclusion.length; i++) {
      const spanStart = establishedForBareIntegerExclusion[i]!.index;
      const spanEnd = establishedForBareIntegerExclusion[i + 1]?.index ?? Infinity;
      if (charStart >= spanStart && charStart < spanEnd) return true;
    }
    return false;
  }
  const rawBareIntegerMatches = rawBareIntegerMatchesAll.filter((m) => !overlapsAny(m, rawDecimalSectionMatches) && !overlapsAny(m, rawIntegerSectionMatches) && !fallsInsideAnEstablishedSpan(m.index));

  const rawSectionMatches = [...rawDecimalSectionMatches, ...rawIntegerSectionMatches, ...rawBareIntegerMatches].sort((a, b) => a.index - b.index);
  const triagedSections: TriagedCandidate[] = rawSectionMatches.map((m) => {
    const matchEnd = m.index + m[0].length;
    const isImmediatelyAfterConfidentArticle = isImmediatelyAfterPlausibleArticle(doc.text, m.index, confidentArticleEnds);
    return { candidateType: "SECTION", match: m, triage: evaluateStructuralCandidateTriage(doc.text, m.index, matchEnd, m[0], (m[1] ?? "").trim(), "SECTION", isImmediatelyAfterConfidentArticle) };
  });

  return [...triagedArticles, ...triagedSections].sort((a, b) => a.match.index - b.match.index);
}

/** Builds the rich, source-only `AmbiguousStructuralCandidate` record for one triaged-AMBIGUOUS candidate - bounded windows only, and neighboring CONFIDENT heading TEXT only (never an id/IR/decision), per the classifier's own independence contract. */
function buildAmbiguousCandidateRecord(doc: CompilerDocumentInput, candidate: TriagedCandidate, confidentHeadingsSorted: { charStart: number; heading: string; sectionRef: string; candidateType: "ARTICLE" | "SECTION" }[]): AmbiguousStructuralCandidate {
  const { match, candidateType, triage } = candidate;
  const charStart = match.index;
  const charEnd = match.index + match[0].length;
  const before = confidentHeadingsSorted.filter((h) => h.charStart < charStart).at(-1) ?? null;
  const after = confidentHeadingsSorted.find((h) => h.charStart >= charEnd) ?? null;
  const label = (h: { candidateType: "ARTICLE" | "SECTION"; sectionRef: string; heading: string }) => `${h.candidateType === "ARTICLE" ? "ARTICLE" : "Section"} ${h.sectionRef}${h.heading ? " " + h.heading : ""}`.trim();
  return {
    documentId: doc.documentId,
    candidateType,
    candidateKey: structuralCandidateKey(candidateType, charStart),
    candidateNumber: (match[1] ?? "").trim(),
    candidateText: match[0],
    charStart,
    charEnd,
    precedingWindow: doc.text.slice(Math.max(0, charStart - TRIAGE_WINDOW_CHARS), charStart),
    followingWindow: doc.text.slice(charEnd, Math.min(doc.text.length, charEnd + TRIAGE_WINDOW_CHARS)),
    nearestConfidentHeadingBefore: before ? label(before) : null,
    nearestConfidentHeadingAfter: after ? label(after) : null,
    triage,
  };
}

/**
 * The new, triage-driven parse path (Phase 3F.1 Human Architecture Decision).
 * CONFIDENT_HEADING candidates are accepted exactly as `parseDocumentStructure`
 * would accept a plausible match; CONFIDENT_PROSE_REFERENCE candidates are
 * dropped exactly as it would drop an implausible one; AMBIGUOUS candidates
 * are, by default (no classifier consulted yet), FAIL-CLOSED excluded from
 * `nodes` - never fabricating a structural boundary that could re-parent real
 * content - and instead surfaced in full in `ambiguousCandidates` for
 * `structural-ambiguity-resolution.ts` to resolve via the bounded classifier.
 * `triageStats` gives the cost-discipline rate metrics (deterministic
 * resolution rate = 1 - ambiguousCount/totalCandidates) the governing spec
 * requires measuring and reporting.
 */
export function parseDocumentStructureWithTriage(doc: CompilerDocumentInput): StructuralParseWithTriageResult {
  const candidates = decideRawStructuralCandidates(doc);
  const confidentArticles = candidates.filter((c) => c.candidateType === "ARTICLE" && c.triage.decision === "CONFIDENT_HEADING").map((c) => c.match);
  const confidentSections = candidates.filter((c) => c.candidateType === "SECTION" && c.triage.decision === "CONFIDENT_HEADING").map((c) => c.match);
  const nodes = buildStructuralNodesFromAcceptedMatches(doc, confidentArticles, confidentSections);

  const confidentHeadingsSorted = candidates
    .filter((c) => c.triage.decision === "CONFIDENT_HEADING")
    .map((c) => ({ charStart: c.match.index, heading: (c.match[2] ?? "").trim(), sectionRef: (c.match[1] ?? "").trim(), candidateType: c.candidateType }))
    .sort((a, b) => a.charStart - b.charStart);

  const ambiguousCandidates = candidates.filter((c) => c.triage.decision === "AMBIGUOUS").map((c) => buildAmbiguousCandidateRecord(doc, c, confidentHeadingsSorted));

  const triageStats: StructuralTriageStats = {
    totalCandidates: candidates.length,
    confidentHeadingCount: candidates.filter((c) => c.triage.decision === "CONFIDENT_HEADING").length,
    confidentProseReferenceCount: candidates.filter((c) => c.triage.decision === "CONFIDENT_PROSE_REFERENCE").length,
    ambiguousCount: ambiguousCandidates.length,
  };

  return { nodes, ambiguousCandidates, triageStats };
}

/**
 * Rebuilds the final node list once a set of AMBIGUOUS candidates has been
 * resolved by the async structural-ambiguity classifier
 * (structural-ambiguity-resolution.ts). `overrides` maps `structuralCandidateKey`
 * -> true (treat as accepted, i.e. LIKELY_HEADING) | false (treat as
 * rejected, i.e. LIKELY_PROSE_REFERENCE) - a candidate absent from the map
 * (UNCERTAIN, a failed/synthetic call, or simply never resolved) keeps the
 * FAIL-CLOSED default from `parseDocumentStructureWithTriage`: excluded,
 * never re-parenting real content on a guess. A CONFIDENT_HEADING or
 * CONFIDENT_PROSE_REFERENCE candidate's own triage decision is never
 * overridden by this map, even if a key happens to collide - only candidates
 * this module itself classified AMBIGUOUS are ever eligible for resolution,
 * enforced by construction in `structural-ambiguity-resolution.ts` (it only
 * ever builds override entries from `ambiguousCandidates`).
 */
export function applyStructuralAmbiguityOverrides(doc: CompilerDocumentInput, overrides: ReadonlyMap<string, boolean>): StructuralNode[] {
  const candidates = decideRawStructuralCandidates(doc);
  const isAccepted = (c: TriagedCandidate): boolean => {
    if (c.triage.decision === "CONFIDENT_HEADING") return true;
    if (c.triage.decision === "CONFIDENT_PROSE_REFERENCE") return false;
    return overrides.get(structuralCandidateKey(c.candidateType, c.match.index)) ?? false; // AMBIGUOUS + unresolved -> fail-closed excluded
  };
  const acceptedArticles = candidates.filter((c) => c.candidateType === "ARTICLE" && isAccepted(c)).map((c) => c.match);
  const acceptedSections = candidates.filter((c) => c.candidateType === "SECTION" && isAccepted(c)).map((c) => c.match);
  return buildStructuralNodesFromAcceptedMatches(doc, acceptedArticles, acceptedSections);
}
