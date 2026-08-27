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

  // Tier 2 (fallback, original behavior): broad preamble scan.
  for (const rule of RULES) {
    const evidence = findEvidence(rule.patterns, preamble);
    if (evidence) {
      // A declared type that agrees with the deterministic evidence is
      // reported as a CONFIRMED classification (both signals agree) rather
      // than just DETERMINISTIC_TITLE_PATTERN - stronger confidence, still
      // never forced past what the text shows.
      const confirmed = doc.declaredType === rule.type;
      return {
        documentId: doc.documentId,
        type: rule.type,
        confidence: confirmed ? 0.98 : 0.9,
        evidence: [evidence],
        resolutionMethod: confirmed ? "DETERMINISTIC_DECLARED_TYPE_CONFIRMED" : "DETERMINISTIC_TITLE_PATTERN",
      };
    }
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
