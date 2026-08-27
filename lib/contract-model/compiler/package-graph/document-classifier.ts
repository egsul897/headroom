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
 */
import type { DocumentType } from "@prisma/client";
import type { DocumentClassification } from "./types";
import type { PackageDocumentInput } from "./types";

const PREAMBLE_WINDOW = 3000;

interface ClassificationRule {
  type: DocumentType;
  patterns: RegExp[];
}

const RULES: ClassificationRule[] = [
  { type: "AMENDED_AND_RESTATED_AGREEMENT", patterns: [/amended and restated (credit agreement|indenture|loan agreement)/i, /(credit agreement|indenture),?\s+as amended and restated/i] },
  { type: "SUPPLEMENTAL_INDENTURE", patterns: [/(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+supplemental indenture/i, /\bsupplemental indenture\b/i] },
  { type: "JOINDER", patterns: [/\bjoinder agreement\b/i, /\bjoinder\b/i] },
  { type: "INTERCREDITOR_AGREEMENT", patterns: [/\bintercreditor agreement\b/i] },
  { type: "SECURITY_AGREEMENT", patterns: [/\bsecurity agreement\b/i, /\bpledge and security agreement\b/i, /\bcollateral agreement\b/i] },
  { type: "GUARANTEE", patterns: [/\bguaranty(?: and collateral)? agreement\b/i, /\bguarantee agreement\b/i, /^\s*guaranty\b/im] },
  { type: "COMPLIANCE_CERTIFICATE", patterns: [/\bcompliance certificate\b/i, /\bofficer'?s certificate\b/i] },
  { type: "SIDE_LETTER", patterns: [/\bside letter\b/i] },
  { type: "FEE_LETTER", patterns: [/\bfee letter\b/i] },
  // AMENDMENT checked before base CREDIT_AGREEMENT/INDENTURE so "Amendment
  // No. 3 to the Credit Agreement" is never misread as a fresh agreement.
  { type: "AMENDMENT", patterns: [/\bamendment\s+(no\.?|number)\s*\d+/i, /^\s*amendment\b/im, /\bthis amendment\b/i] },
  { type: "INDENTURE", patterns: [/\bindenture\b/i] },
  { type: "CREDIT_AGREEMENT", patterns: [/\bcredit agreement\b/i, /\bloan agreement\b/i] },
];

function findEvidence(patterns: RegExp[], preamble: string): string | null {
  for (const re of patterns) {
    const m = re.exec(preamble);
    if (m) return m[0];
  }
  return null;
}

export function classifyDocument(doc: PackageDocumentInput): DocumentClassification {
  const preamble = doc.text.slice(0, PREAMBLE_WINDOW);

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
