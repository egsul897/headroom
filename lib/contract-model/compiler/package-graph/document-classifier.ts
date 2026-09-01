/**
 * Phase 2C §4 - deterministic document classification. Cheap-signal-first
 * (task §8): looks only at the document's own title/heading and first
 * ~3000 chars (the preamble - where a real financing document always
 * states what it is), never a full-document semantic pass. UNKNOWN with
 * evidence (or lack of it) beats a forced guess (task §4's own explicit
 * instruction).
 *
 * Order matters: more specific patterns (AMENDED_AND_RESTATED_AGREEMENT,
 * SUPPLEMENTAL_INDENTURE) are checked before their more generic parents
 * (AMENDMENT, INDENTURE) so "Amended and Restated Credit Agreement" does
 * not get misclassified as a plain AMENDMENT.
 *
 * Phase 2F.3 §4/§25 root-cause fix (docs/phase-2f3-package-graph-
 * remediation.md): the ORIGINAL, single-tier version of this function
 * scanned the whole preamble for ANY rule match in a fixed priority order,
 * with no distinction between text describing the document ITSELF and
 * text describing an OTHER agreement this document merely references
 * (real, confirmed on CONMED Document C: its own recital reads "...to the
 * Seventh Amended and Restated Credit Agreement, dated as of July 16,
 * 2021" - a reference to the document it amends - and the old scanner
 * matched "Amended and Restated Credit Agreement" from THAT reference
 * before ever reaching the AMENDMENT rule, misclassifying a Second
 * Amendment as a fresh base agreement). The fix adds a PRIMARY,
 * higher-priority signal - a document's own explicit self-referential
 * defined term, e.g. "(this "Amendment")" - which is standard financing-
 * document drafting convention industry-wide (not CONMED-specific): a
 * document that opens "..., dated as of [DATE] (this "[X]"), to [target
 * reference]..." is unambiguously calling itself "[X]", and whatever it
 * references afterward is definitionally NOT its own type. Only when no
 * such self-term is found (or the self-term does not map to any known
 * rule) does classification fall back to the original broad preamble
 * scan - unchanged, so a document written without this convention (most
 * of this module's own existing synthetic test fixtures, and any base
 * agreement with a plain title) keeps behaving exactly as before.
 */
import type { DocumentType } from "@prisma/client";
import type { DocumentClassification } from "./types";
import type { PackageDocumentInput } from "./types";

const PREAMBLE_WINDOW = 3000;
/** The self-referential parenthetical always appears very early (right after the document's own "dated as of" clause, before any target-agreement reference) - a small window keeps this signal cheap and avoids ever picking up a LATER "(the "X")" defined term that names something else entirely. */
const SELF_REFERENCE_WINDOW = 1200;

interface ClassificationRule {
  type: DocumentType;
  patterns: RegExp[];
}

const RULES: ClassificationRule[] = [
  { type: "AMENDED_AND_RESTATED_AGREEMENT", patterns: [/amended and restated (credit agreement|indenture|loan agreement)/i, /(credit agreement|indenture),?\s+as amended and restated/i] },
  { type: "SUPPLEMENTAL_INDENTURE", patterns: [/(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+supplemental indenture/i, /\bsupplemental indenture\b/i] },
  { type: "JOINDER", patterns: [/\bjoinder agreement\b/i, /\bjoinder\b/i] },
  { type: "INTERCREDITOR_AGREEMENT", patterns: [/\bintercreditor agreement\b/i] },
  // Composite guarantee-and-collateral/security document (task §5/§12) -
  // checked before the plain GUARANTEE and SECURITY_AGREEMENT rules below
  // so a real combined agreement (a standard, generalizable leveraged-
  // finance document type, e.g. CONMED's own real "Guarantee and
  // Collateral Agreement") is never force-fit into only one half of its
  // real identity.
  { type: "GUARANTEE_AND_SECURITY_AGREEMENT", patterns: [/\bguarant(?:y|ee)\s+and\s+(?:collateral|security)\s+agreement\b/i, /\bpledge,?\s+guarant(?:y|ee)\s+and\s+security\s+agreement\b/i] },
  { type: "SECURITY_AGREEMENT", patterns: [/\bsecurity agreement\b/i, /\bpledge and security agreement\b/i, /\bcollateral agreement\b/i] },
  { type: "GUARANTEE", patterns: [/\bguaranty(?: and collateral)? agreement\b/i, /\bguarantee agreement\b/i, /^\s*guaranty\b/im] },
  { type: "COMPLIANCE_CERTIFICATE", patterns: [/\bcompliance certificate\b/i, /\bofficer'?s certificate\b/i] },
  { type: "SIDE_LETTER", patterns: [/\bside letter\b/i] },
  { type: "FEE_LETTER", patterns: [/\bfee letter\b/i] },
  // AMENDMENT checked before base CREDIT_AGREEMENT/INDENTURE so "Amendment
  // No. 3 to the Credit Agreement" is never misread as a fresh agreement.
  // The ordinal-word variant ("First Amendment", "Second Amendment" with
  // no "No. N") mirrors the same ordinal convention SUPPLEMENTAL_INDENTURE
  // already recognizes above - a generalized drafting-style variant, not
  // evidence-specific.
  { type: "AMENDMENT", patterns: [/\bamendment\s+(no\.?|number)\s*\d+/i, /^\s*amendment\b/im, /\bthis amendment\b/i, /^\s*(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+amendment\b/im, /^\s*(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+omnibus amendment\b/im] },
  { type: "INDENTURE", patterns: [/\bindenture\b/i] },
  { type: "CREDIT_AGREEMENT", patterns: [/\bcredit agreement\b/i, /\bloan agreement\b/i] },
];

function findEvidence(patterns: RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/**
 * POST-3F.2 classifier remediation - a document's own caption/self-
 * description always appears at or near the very top of its own text;
 * any mention of an OTHER document type it references, requires, or
 * attaches (a table-of-contents/exhibit-list entry, a cross-reference, a
 * required-delivery clause) necessarily appears LATER. Text position is
 * therefore a general, structural proxy for "is this evidence about the
 * document itself, or about something the document merely mentions" -
 * unlike RULES array order, which has no relationship to the document's
 * own text at all. Finds the EARLIEST match across ALL of a rule's own
 * alternative patterns (not just the first pattern-array-order match),
 * since a rule's patterns are alternative phrasings of the same signal,
 * not a priority list.
 */
function earliestRuleMatch(patterns: RegExp[], text: string): { index: number; evidence: string } | null {
  let best: { index: number; evidence: string } | null = null;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, evidence: m[0] };
  }
  return best;
}

/** Two matches "overlap" when their text spans intersect - used to recognize that a composite/specific rule's own match (e.g. AMENDED_AND_RESTATED_AGREEMENT matching "amended and restated credit agreement") textually CONTAINS its generic parent's own match (CREDIT_AGREEMENT matching "credit agreement" as a nested substring) - the SAME evidence, never two competing candidates, so no false ambiguity is ever raised for an amended-and-restated agreement, a supplemental indenture, or a composite guarantee-and-security agreement. */
function matchesOverlap(a: { index: number; evidence: string }, b: { index: number; evidence: string }): boolean {
  const aEnd = a.index + a.evidence.length;
  const bEnd = b.index + b.evidence.length;
  return a.index < bEnd && b.index < aEnd;
}

/** How close to the document's own start a match must be to count as "caption zone" evidence for the ambiguity guard - generous enough for a real caption + party block, never large enough to reach deep into a table of contents. */
const CAPTION_ZONE_CHARS = 500;
/** How close two DIFFERENT, non-overlapping matches' positions must be to count as genuinely competing (rather than one clearly preceding the other as a later, weaker mention). */
const AMBIGUITY_GAP_CHARS = 150;
/**
 * Every RULES type EXCEPT the two base facility types (Credit Agreement/
 * Indenture) is, by this whole package-graph system's own design
 * (relationship-resolution.ts's RELATIONSHIP_TYPES_BY_SOURCE_CLASSIFICATION),
 * a document whose entire purpose is to reference, modify, guarantee,
 * secure, join, or otherwise relate to ANOTHER agreement - an amendment
 * names what it amends, a guarantee names what it guarantees, a joinder
 * names what it joins, an intercreditor agreement names the several
 * facilities it governs, and (real, disclosed) an omnibus amendment
 * routinely names MULTIPLE such related agreements (a base facility AND
 * a security/guarantee document) within its own caption sentence. That is
 * ordinary financing-document drafting convention industry-wide, not a
 * package-specific pattern - so the ambiguity guard below only ever
 * applies when the WINNING match is itself one of the two base facility
 * types, never when it is one of these inherently-referencing types
 * (which would otherwise false-positive on virtually every real
 * amendment/joinder/guarantee/security/intercreditor document this
 * codebase has ever encountered).
 */
const BASE_REFERENCEABLE_TYPES = new Set<DocumentType>(["CREDIT_AGREEMENT", "INDENTURE"]);

/** Matches the classic financing-document self-reference: "..., dated as of [DATE] (this "[Term]"), to/among ...". Straight and curly quotes both real (raw SEC-filing text extraction commonly renders curly quotes as spaced straight quotes - "(this " Amendment ")" - so surrounding whitespace inside the quotes is tolerated and trimmed). */
const SELF_REFERENCE_RE = /\(this\s+["'“”]\s*([^"'“”]{2,80}?)\s*["'“”]\)/i;

function findRuleMatchForType(term: string): DocumentType | null {
  for (const rule of RULES) {
    if (findEvidence(rule.patterns, term)) return rule.type;
  }
  return null;
}

export function classifyDocument(doc: PackageDocumentInput): DocumentClassification {
  const preamble = doc.text.slice(0, PREAMBLE_WINDOW);

  // Tier 1 (highest confidence): the document's own explicit self-
  // referential defined term, if present and if it maps to a known type -
  // never a forced guess when the captured term is too generic (e.g. bare
  // "Agreement") to map onto any specific rule; falls through to Tier 2.
  const selfReferenceMatch = SELF_REFERENCE_RE.exec(doc.text.slice(0, SELF_REFERENCE_WINDOW));
  if (selfReferenceMatch) {
    const selfTerm = selfReferenceMatch[1]!.trim();
    const selfType = findRuleMatchForType(selfTerm);
    if (selfType) {
      const confirmed = doc.declaredType === selfType;
      return {
        documentId: doc.documentId,
        type: selfType,
        confidence: confirmed ? 0.99 : 0.97,
        evidence: [selfReferenceMatch[0]],
        resolutionMethod: confirmed ? "DETERMINISTIC_DECLARED_TYPE_CONFIRMED" : "DETERMINISTIC_SELF_REFERENTIAL_TITLE",
      };
    }
  }

  // Tier 2 (fallback, position-aware preamble scan) - the rule whose
  // evidence appears EARLIEST in the document's own text wins, not the
  // rule checked first in RULES array order (see earliestRuleMatch's own
  // doc comment for the rationale). RULES array order is used only as a
  // final tiebreaker when two rules' earliest matches sit at the exact
  // same position (in practice never observed - two distinct literal
  // phrases cannot both start at the same character index).
  const allMatches: { ruleIndex: number; type: DocumentType; index: number; evidence: string }[] = [];
  for (let i = 0; i < RULES.length; i++) {
    const m = earliestRuleMatch(RULES[i]!.patterns, preamble);
    if (m) allMatches.push({ ruleIndex: i, type: RULES[i]!.type, index: m.index, evidence: m.evidence });
  }
  if (allMatches.length > 0) {
    let winner = allMatches[0]!;
    for (const m of allMatches) {
      if (m.index < winner.index || (m.index === winner.index && m.ruleIndex < winner.ruleIndex)) winner = m;
    }
    // Ambiguity guard: a genuinely DIFFERENT, non-overlapping type's
    // evidence sits comparably early and comparably close to the winner -
    // two disjoint, comparably-prominent signals with no clear single
    // winner, never resolved by an arbitrary confident pick (mission §7).
    const conflict = BASE_REFERENCEABLE_TYPES.has(winner.type)
      ? allMatches.find((m) => m.type !== winner.type && winner.index <= CAPTION_ZONE_CHARS && m.index <= CAPTION_ZONE_CHARS && Math.abs(m.index - winner.index) <= AMBIGUITY_GAP_CHARS && !matchesOverlap(winner, m))
      : undefined;
    if (conflict) {
      return {
        documentId: doc.documentId,
        type: doc.declaredType ?? "UNKNOWN",
        confidence: doc.declaredType ? 0.3 : 0,
        evidence: [winner.evidence, conflict.evidence],
        resolutionMethod: "DETERMINISTIC_CAPTION_AMBIGUOUS",
      };
    }
    // A declared type that agrees with the deterministic evidence is
    // reported as a CONFIRMED classification (both signals agree) rather
    // than just DETERMINISTIC_TITLE_PATTERN - stronger confidence, still
    // never forced past what the text shows.
    const confirmed = doc.declaredType === winner.type;
    return {
      documentId: doc.documentId,
      type: winner.type,
      confidence: confirmed ? 0.98 : 0.9,
      evidence: [winner.evidence],
      resolutionMethod: confirmed ? "DETERMINISTIC_DECLARED_TYPE_CONFIRMED" : "DETERMINISTIC_TITLE_PATTERN",
    };
  }

  // No deterministic title signal at all - honest UNKNOWN (or OTHER_DEBT_DOCUMENT
  // when there is at least a declared type suggesting it belongs in this
  // package, without inventing certainty the text itself does not support).
  return {
    documentId: doc.documentId,
    type: doc.declaredType ?? "UNKNOWN",
    confidence: doc.declaredType ? 0.3 : 0,
    evidence: [],
    resolutionMethod: "UNKNOWN_NO_SIGNAL",
  };
}

export function classifyPackageDocuments(documents: PackageDocumentInput[]): DocumentClassification[] {
  return documents.map(classifyDocument);
}
