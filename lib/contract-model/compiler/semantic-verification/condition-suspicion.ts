/**
 * Phase 3F.1.6.RX-FINAL Terminal Closure, Workstream D - FINDING-5 /
 * BLOCKER-9's condition-omission defect class, THIRD recurrence
 * (fixed once in 3F.1.6.R, fixed again in 3F.1.6.RX Part A, found open a
 * third time by 3F.1.6.RX Part B - docs/phase-3f1-6-rx-final-blocker-
 * closure/27-part-b-blocker9-recertification.json).
 *
 * ===========================================================================
 * WHY A NEW MODULE, NOT "8 MORE REGEX ENTRIES"
 * ===========================================================================
 * Every prior remediation (including this lineage's own two immediately
 * preceding attempts) fixed BLOCKER-9 by adding newly-discovered exact
 * idiomatic phrases to source-inventory.ts's CONDITIONAL_PHRASE alternation.
 * That pattern has now failed three times in a row with three different
 * vocabularies, because English qualifying-condition drafting is a
 * genuinely open-ended set of SURFACE PHRASINGS built from a much smaller,
 * closed set of GRAMMATICAL CONSTRUCTIONS. Enumerating surface phrasings
 * can never catch up with drafting variation; detecting the underlying
 * CONSTRUCTIONS can, because the constructions themselves do not multiply
 * the way idiom choice does.
 *
 * This module therefore detects condition suspicion via a small number of
 * COMPOSITIONAL SLOT-GRAMMAR FRAMES rather than one flat idiom list. Each
 * frame names a real, closed grammatical/morphological category (a
 * subordinating-conjunction-like complex preposition, a light-noun-headed
 * compound conjunction, a nominalization suffix class, a modal+participle
 * passive construction, an occurrence-predicate verb class, a citation
 * connective) and a SLOT that varies (the specific noun, the specific
 * defined term, the specific citation). Because the SLOT is open (matched
 * structurally/morphologically, not by exact string), a frame catches
 * combinations its own author never typed as a literal test string - see
 * the "novel combination" tests in condition-suspicion-architecture.test.ts,
 * which exercise combinations absent from this file's own comments.
 *
 * HONEST LIMITS (do not overclaim): several frames still bottom out in a
 * small, closed LEXICAL class (a handful of light nouns - event/case/
 * circumstance/extent/degree; a handful of satisfaction-class participles -
 * deemed/satisfied/fulfilled/met/achieved/complied with/eligible/entitled/
 * qualified; a handful of occurrence verbs - occurred/arisen/taken place).
 * These are NOT the same failure mode as an idiom list, for two reasons:
 * (1) they are genuinely closed grammatical/semantic categories in English
 * (there is no long tail of new "light nouns" the way there is an
 * unbounded tail of new legal drafting idioms), and (2) the SLOT they
 * combine with (the noun-of-suffix, the capitalized defined term, the
 * citation) is open and does the real generalization work. But this module
 * does not claim to have escaped enumeration entirely - it claims to have
 * moved the enumeration down from "the whole idiomatic phrase" (where it
 * demonstrably cannot keep up) to "a small closed function/semantic-class
 * word list" (where it structurally can), and to route anything that still
 * falls outside even that net to Layer 2's own independent AI materiality
 * judgment via the EXISTING routing mechanism (reconciliation.ts's aggregate
 * signal count -> verify.ts's shouldInvokeSemanticReview), rather than
 * trying to hand-classify every legal conclusion deterministically.
 *
 * This module produces ONLY suspicion signals (structural routing evidence)
 * - it never itself judges materiality. It is deliberately biased toward
 * recall over precision at the level of "does this text contain a
 * conditional/exception/proviso-shaped construction" (task's own "route to
 * AI for materiality judgment rather than hardcode every English drafting
 * variant"), while still declining to fire on the highest-frequency,
 * lowest-information bare function words ("if"/"when" alone) that would
 * otherwise make every candidate in the corpus route to Layer 2 regardless
 * of any real conditional relationship - see the BENIGN/PRECISION test
 * block in condition-suspicion-architecture.test.ts for what stays quiet.
 *
 * All output items are emitted with the SAME SourceInventoryItemKind values
 * source-inventory.ts already defined (CONDITIONAL_PHRASE/EXCEPTION_MARKER/
 * PROVISO_MARKER) - this module changes HOW those kinds get detected, not
 * the type surface or any downstream consumer (reconciliation.ts's
 * buildAggregateSignals, findings.ts, verify.ts's shouldInvokeSemanticReview
 * are all untouched by this change; they already treat "count of these 3
 * kinds vs. IR condition/exception count" as their routing signal, and
 * automatically benefit from broader, more honest detection here with zero
 * changes to their own logic - the fix is entirely upstream, in what counts
 * as a signal, not in how signals get routed).
 *
 * SCOPE DISCIPLINE: no company/package/family-specific keyword anywhere
 * here (Architecture Invariants #29) - every frame is a generic
 * grammatical/legal-drafting construction that would behave identically on
 * a package this module has never seen. No import of anything from
 * discovery/*, semantic/compile.ts, or semantic/caller.ts (this module
 * lives under semantic-verification/ and is covered by the same
 * independence import-boundary check as every other file here).
 */

export type ConditionSuspicionCategory =
  | "LEGACY_ENUMERATED_CONNECTIVE"
  | "NOMINAL_CONDITIONAL_CONNECTIVE"
  | "EVENT_TRIGGER_NOMINALIZATION"
  | "EVENT_TRIGGER_DEFINED_TERM"
  | "OCCURRENCE_PREDICATE"
  | "MODAL_SATISFACTION_PASSIVE"
  | "CROSS_REFERENCE_INCORPORATION"
  | "PRO_FORMA_TEMPORAL"
  | "CONDITION_PRECEDENT_FRAME";

export interface ConditionSuspicionPattern {
  category: ConditionSuspicionCategory;
  /** kind exactly matches SourceInventoryItemKind - kept as a plain string here to avoid a circular import of types.ts's own re-export surface; source-inventory.ts assigns the real typed kind when consuming this. */
  kind: "CONDITIONAL_PHRASE" | "EXCEPTION_MARKER" | "PROVISO_MARKER";
  description: string;
  re: RegExp;
}

/**
 * Category 1 - LEGACY_ENUMERATED_CONNECTIVE. This is the ORIGINAL
 * BLOCKER-9/RX-Part-A idiom alternation, kept VERBATIM for non-regression
 * (every one of these connectives is a genuine, already-tested,
 * already-proven-precise signal - deleting them would be a real recall
 * regression, not an architecture improvement). This category is NOT the
 * source of this remediation's new recall - it is retained for continuity
 * only. The genuinely new generalization comes from the compositional
 * frames below (categories 2-9), which is what actually closes the 8
 * previously-missed forms without adding a 9th/10th/11th literal entry
 * here.
 */
const LEGACY_ENUMERATED_CONNECTIVE_RE =
  /\b(?:so long as|provided(?:,?\s+that)?|unless|except(?:\s+that)?|if and only if|only if|subject to|notwithstanding|until\s+such\s+time\s+as|no\s+(?:Event\s+of\s+)?Default|conditioned\s+(?:upon|on)|(?:following|upon)\s+satisfaction\s+of|immediately\s+before\s+and\s+after)\b/gi;

/**
 * Category 2 - NOMINAL_CONDITIONAL_CONNECTIVE. English has a small, closed
 * set of "light nouns" (event, case, circumstance, extent, degree) that
 * combine with a preposition + relativizer to form a grammaticalized
 * compound conjunction functionally identical to "if"/"to the extent" -
 * "in the event of/that", "in case of/that", "to the extent/degree
 * that/to which", "on condition that". This is a SLOT GRAMMAR: {PREP} +
 * DET? + {LIGHT NOUN} + {relativizer}, not a list of the whole multi-word
 * idiom - it automatically covers "in the case that"/"to the degree that"
 * even though this file's own comments never type those exact strings as
 * literal targets (see the "novel combination" tests).
 *
 * Closes Part B's 3 non-numeric gap forms directly: "in the event of",
 * "in the event that", "to the extent that" (all without an embedded
 * ratio/amount figure - the ONLY thing that used to save these was a
 * coincidental numeric match, never real recall - see reconciliation.ts's
 * own disclosed "coincidental capture" comment history).
 */
const NOMINAL_CONDITIONAL_CONNECTIVE_RE =
  /\b(?:in\s+the\s+(?:event|case)\s+(?:of|that|where)|to\s+the\s+(?:extent|degree)\s+(?:that|to\s+which)|in\s+case\s+(?:of|that)|on\s+condition\s+that)\b/gi;

/**
 * Category 3 - EVENT_TRIGGER_NOMINALIZATION. A closed morphological class:
 * English nominalizes "achievement"/"completion" verbs with a handful of
 * suffixes (-tion, -sion, -ance, -ence, -ment, -ness - occurrence,
 * consummation, satisfaction, effectiveness, termination, expiration,
 * execution, designation, repayment, expiration, resolution...). Combined
 * with a leading temporal/event preposition ("upon"/"following"/"after"/
 * "before"/"once") and a trailing "of", this SLOT PATTERN catches "upon
 * the occurrence of X", "following the consummation of X", "upon the
 * expiration of X" etc. by matching the SUFFIX, never the specific noun -
 * a brand-new nominalization this file's author never wrote (e.g.
 * "expiration") is caught the same way "occurrence" is, because both share
 * the closed suffix class, not because both were separately enumerated.
 *
 * Closes Part B's gap form: "upon the occurrence of [a defined trigger]" -
 * genuinely, not merely by adding "occurrence" as its own new literal
 * target (the suffix class would have caught it, and any of its many
 * synonyms, before this specific word was ever seen).
 */
const EVENT_TRIGGER_NOMINALIZATION_RE = /\b(?:upon|following|after|before|once)\s+(?:the\s+|a\s+|an\s+)?[a-zA-Z]{3,}(?:tion|sion|ance|ence|ment|ness)\s+of\b/gi;

/**
 * Category 4 - EVENT_TRIGGER_DEFINED_TERM. Deliberately CASE-SENSITIVE (no
 * `i` flag - capitalization is the entire signal here, so an `i` flag
 * would defeat detection by letting lowercase text satisfy `[A-Z]`). Any
 * event/temporal preposition followed directly by a Capitalized
 * Multi-Word Phrase is structurally a defined-term-triggered condition,
 * regardless of WHICH defined term - "Upon the Trigger Event,", "upon a
 * Change of Control", "following the Qualified IPO". Tolerates a single
 * lowercase glue word (of/the/and/or) inside the capitalized run so that
 * internally-glued defined terms ("Change of Control") are recognized as
 * one phrase rather than only their first capitalized word - the same
 * "over-inclusive by design, filtered downstream by reconciliation"
 * discipline this file's own METRIC_MENTION_RE heuristic in
 * source-inventory.ts already documents and relies on.
 *
 * Closes Part B's gap form: "a condition expressed purely as a
 * capitalized DEFINED TERM trigger ('Upon the Trigger Event,') with no
 * other connective word from the pattern list at all" - and also picks up
 * "as and when [X] required following a Change of Control" via its own
 * "following a Change of Control" span, independent of "as and when"
 * itself (which this module does not need to special-case).
 */
const EVENT_TRIGGER_DEFINED_TERM_RE =
  /\b(?:[Uu]pon|[Ff]ollowing|[Aa]fter|[Bb]efore|[Oo]nce)\s+(?:the\s+|a\s+|an\s+)?[A-Z][a-zA-Z]*(?:\s+(?:of|the|and|or)\s+[A-Z][a-zA-Z]*|\s+[A-Z][a-zA-Z]*){1,3}\b/g;

/**
 * Category 5 - OCCURRENCE_PREDICATE. A closed, small class of "occurrence"
 * verbs (occur, arise, take place) combined with a perfect-aspect
 * auxiliary (has/have/having/shall have/will have), optionally negated
 * ("has not... occurred") - the standard grammatical shape credit
 * agreements use to state that an event is (or is not) currently/already
 * true, independent of which defined term or event is the subject: "a
 * Change of Control has occurred", "no Default has occurred and is
 * continuing", "no Qualified IPO has yet occurred", "an Event of Default
 * shall have occurred and be continuing". This generalizes the OLD
 * hand-enumerated "no (Event of )?Default" pattern (kept above for
 * continuity) to ANY subject, not only the word "Default".
 *
 * Closes Part B's gap forms: "upon the occurrence of a Change of Control"
 * (co-occurs with category 3's own match on the same span, redundant
 * corroboration is fine), "shall be deemed satisfied when a Qualified IPO
 * has occurred" (via "has occurred"), and "to the extent that no
 * Qualified IPO has yet occurred" (via "has yet occurred", also
 * independently caught by category 2's "to the extent that").
 */
const OCCURRENCE_PREDICATE_RE = /\b(?:has|have|having|shall\s+have|will\s+have)\s+(?:not\s+)?(?:yet\s+)?(?:occurred|arisen|taken\s+place)\b/gi;

/**
 * Category 6 - MODAL_SATISFACTION_PASSIVE. A modal or perfect auxiliary
 * (shall/will/is/are/has been/have been) plus an optional "be" plus a
 * small closed class of satisfaction/eligibility participles (deemed,
 * satisfied, fulfilled, met, achieved, complied with, eligible, entitled,
 * qualified) - the standard passive-voice framing of "this condition is
 * satisfied" regardless of which condition. Tolerates up to two
 * intervening adverbs/participles ("shall be conclusively deemed",
 * "shall be treated as satisfied") - ordinary modal-adverb-participle
 * word order, not a fixed three-word idiom.
 *
 * Closes Part B's gap form directly: passive voice "shall be deemed
 * satisfied when" - via "shall be... deemed" (the "when" is not itself
 * needed as a marker; this frame fires on the modal+participle alone).
 */
const MODAL_SATISFACTION_PASSIVE_RE =
  /\b(?:shall|will|is|are|has\s+been|have\s+been)\s+(?:be\s+)?(?:\w+\s+){0,2}(?:deemed|satisfied|fulfilled|met|achieved|complied\s+with|eligible|entitled|qualified)\b/gi;

/**
 * Category 7 - CROSS_REFERENCE_INCORPORATION. A citation-connective
 * ("in accordance with"/"pursuant to"/"as set forth on/in/under"/"set
 * forth on/in/under") followed, within a short bounded window, by a
 * structural-reference keyword (Section/Schedule/Exhibit/Annex/Article/
 * Appendix) plus its identifier. This is the "dependency on another
 * covenant/definition" architecture bullet: a rule's own operative
 * permission incorporated by cross-reference elsewhere, which the IR must
 * independently resolve - deliberately reimplemented here as a small
 * local pattern (not imported from compiler/structural-references.ts,
 * which resolves references against a real StructuralIndex/node identity
 * this module's own independence contract does not need and should not
 * take on) rather than a second parallel citation-resolution engine.
 *
 * Closes Part B's gap form directly: "a condition incorporated purely by
 * schedule cross-reference ... with no conditional connective word
 * anywhere in the sentence".
 */
const CROSS_REFERENCE_INCORPORATION_RE =
  /\b(?:in\s+accordance\s+with|pursuant\s+to|as\s+(?:set\s+forth|provided)\s+(?:on|in|under)|set\s+forth\s+(?:on|in|under))\b[^.;:]{0,60}?\b(?:Section|Schedule|Exhibit|Annex|Article|Appendix)\s+[0-9A-Za-z]/gi;

/**
 * Category 8 - PRO_FORMA_TEMPORAL. The standard credit-agreement temporal-
 * predicate vocabulary for pro forma testing: "giving effect to/thereto",
 * "pro forma basis/compliance/effect", and a generalized (order/adverb-
 * tolerant) form of the old fixed "immediately before and after" phrase.
 * These are temporal predicates in the architecture requirement's own
 * sense - they mark that a rule's operative effect depends on a
 * before/after comparison around a transaction, which is exactly the
 * "before/after giving effect" test class this remediation is required to
 * cover with a NEW construction, not the old literal string.
 */
const PRO_FORMA_TEMPORAL_RE =
  /\b(?:giving\s+effect\s+(?:to|thereto)|pro\s+forma\s+(?:basis|compliance|effect)|(?:immediately\s+)?(?:before|prior\s+to)\s+and\s+(?:immediately\s+)?after)\b/gi;

/**
 * Category 9 - CONDITION_PRECEDENT_FRAME. "condition(s) precedent" and "as
 * a condition (precedent) to" are themselves closed-form legal terms of
 * art for exactly this defect class (a fact that must be true before a
 * permission is operative) - detecting the term of art directly, rather
 * than whatever event happens to be named as the condition.
 */
const CONDITION_PRECEDENT_FRAME_RE = /\b(?:as\s+a\s+condition(?:\s+precedent)?\s+to|condition(?:s)?\s+precedent)\b/gi;

/**
 * The full pattern set source-inventory.ts consumes. Every entry maps to
 * kind "CONDITIONAL_PHRASE" - EXCEPTION_MARKER/PROVISO_MARKER remain
 * their own, unchanged, already-precise patterns directly in
 * source-inventory.ts (this remediation found no recall gap in those two
 * kinds specifically; broadening CONDITIONAL_PHRASE's own detection
 * mechanism is what closes every one of Part B's 8 forms).
 */
export const CONDITION_SUSPICION_PATTERNS: ConditionSuspicionPattern[] = [
  { category: "LEGACY_ENUMERATED_CONNECTIVE", kind: "CONDITIONAL_PHRASE", description: "Original BLOCKER-9/RX-Part-A idiom alternation, retained verbatim for non-regression.", re: LEGACY_ENUMERATED_CONNECTIVE_RE },
  { category: "NOMINAL_CONDITIONAL_CONNECTIVE", kind: "CONDITIONAL_PHRASE", description: "Light-noun-headed compound conjunction: in the event of/that, in case of/that, to the extent/degree that/to which, on condition that.", re: NOMINAL_CONDITIONAL_CONNECTIVE_RE },
  { category: "EVENT_TRIGGER_NOMINALIZATION", kind: "CONDITIONAL_PHRASE", description: "Temporal/event preposition + morphologically-nominalized event noun (suffix class) + \"of\".", re: EVENT_TRIGGER_NOMINALIZATION_RE },
  { category: "EVENT_TRIGGER_DEFINED_TERM", kind: "CONDITIONAL_PHRASE", description: "Temporal/event preposition + Capitalized Multi-Word (Defined Term) Phrase.", re: EVENT_TRIGGER_DEFINED_TERM_RE },
  { category: "OCCURRENCE_PREDICATE", kind: "CONDITIONAL_PHRASE", description: "Perfect-aspect auxiliary + occurrence-class verb (has/have/having/shall have (not)? (yet)? occurred/arisen/taken place).", re: OCCURRENCE_PREDICATE_RE },
  { category: "MODAL_SATISFACTION_PASSIVE", kind: "CONDITIONAL_PHRASE", description: "Modal/perfect auxiliary + optional \"be\" + satisfaction/eligibility participle class.", re: MODAL_SATISFACTION_PASSIVE_RE },
  { category: "CROSS_REFERENCE_INCORPORATION", kind: "CONDITIONAL_PHRASE", description: "Citation connective + Section/Schedule/Exhibit/Annex/Article/Appendix reference within a bounded window.", re: CROSS_REFERENCE_INCORPORATION_RE },
  { category: "PRO_FORMA_TEMPORAL", kind: "CONDITIONAL_PHRASE", description: "giving effect to/thereto, pro forma basis/compliance/effect, generalized before-and-after.", re: PRO_FORMA_TEMPORAL_RE },
  { category: "CONDITION_PRECEDENT_FRAME", kind: "CONDITIONAL_PHRASE", description: "\"condition(s) precedent\" / \"as a condition (precedent) to\" terms of art.", re: CONDITION_PRECEDENT_FRAME_RE },
];
