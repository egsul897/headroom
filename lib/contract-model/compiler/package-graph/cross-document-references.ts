/**
 * Phase 2C §12 - cross-document reference leads: explicit mentions of
 * ANOTHER agreement by name ("the Credit Agreement", "pursuant to the
 * Indenture", "as defined in the First Lien Credit Agreement", "subject to
 * the Intercreditor Agreement"). Distinct from Phase 2A's
 * structural-references.ts, which is deliberately same-document-only
 * (in-document Section/Article/Schedule/Exhibit refs) - this module never
 * touches that logic, it only recognizes named-AGREEMENT mentions, which
 * Phase 2A never attempted.
 *
 * Resolution against a real target document happens in
 * relationship-resolution.ts, which has the whole package's identities;
 * this module only detects the lead and preserves the raw hint - matching
 * task §12's "store cross-document reference leads... resolve them only
 * when evidence is sufficient... do not guess based solely on similar
 * titles" (the guard against name-similarity guessing lives in the
 * resolver, not here).
 */
import type { CrossDocumentReferenceLead, PackageDocumentInput } from "./types";

const NAMED_AGREEMENT_PATTERNS: RegExp[] = [
  /\bthe\s+((?:First Lien|Second Lien|Senior|Subordinated)?\s*Credit Agreement)\b(?!\s+dated)/gi,
  /\bthe\s+((?:First Lien|Second Lien|Senior|Subordinated)?\s*Indenture)\b(?!\s+dated)/gi,
  /\bthe\s+(Intercreditor Agreement)\b/gi,
  /\bthe\s+(Security Agreement)\b/gi,
  /\bthe\s+(Guaranty(?: Agreement)?)\b/gi,
  /\bas defined in the\s+([A-Z][A-Za-z0-9 ]{2,60}?(?:Agreement|Indenture))\b/gi,
  /\bpursuant to the\s+([A-Z][A-Za-z0-9 ]{2,60}?(?:Agreement|Indenture))\b/gi,
  /\bsubject to the\s+([A-Z][A-Za-z0-9 ]{2,60}?(?:Agreement|Indenture))\b/gi,
];

export function detectCrossDocumentReferenceLeads(doc: PackageDocumentInput): CrossDocumentReferenceLead[] {
  const out: CrossDocumentReferenceLead[] = [];
  const seenOffsets = new Set<number>();
  for (const re of NAMED_AGREEMENT_PATTERNS) {
    const pattern = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(doc.text)) !== null) {
      if (!seenOffsets.has(m.index)) {
        seenOffsets.add(m.index);
        out.push({
          sourceDocumentId: doc.documentId,
          referenceText: m[0],
          charStart: m.index,
          namedAgreementHint: (m[1] ?? m[0]).trim(),
          targetDocumentId: null,
          status: "UNRESOLVED",
          unresolvedReason: "not yet resolved against the package's other documents",
        });
      }
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return out.sort((a, b) => a.charStart - b.charStart);
}

export function detectPackageCrossDocumentReferenceLeads(documents: PackageDocumentInput[]): CrossDocumentReferenceLead[] {
  return documents.flatMap(detectCrossDocumentReferenceLeads);
}
