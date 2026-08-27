/**
 * Phase 2C §9 - explicit amendment-statement detection. Deterministic regex
 * over the amendment-like document's own text, matching the concrete
 * example patterns the task itself gives ("Section 6.01 is hereby
 * amended...", "the definition of X is amended and restated...", "clause
 * (x) is deleted...", "the Credit Agreement is hereby amended..."). Target
 * document resolution (matching the modification's own textual target
 * reference against another package document) is NOT done here - that is
 * relationship-resolution.ts's job, since it needs the whole package's
 * identities, not just one document's own text.
 */
import type { ModificationCandidate, ModificationOperation, PackageDocumentInput } from "./types";

interface StatementPattern {
  operation: ModificationOperation;
  re: RegExp;
  /** Extracts the raw target-section-ref text from a match, or null if this pattern targets a defined term instead of a section. */
  sectionRef: (m: RegExpExecArray) => string | null;
  definedTermRef: (m: RegExpExecArray) => string | null;
}

const PATTERNS: StatementPattern[] = [
  // "Section 6.01 is hereby amended and restated in its entirety..."
  {
    operation: "RESTATE",
    re: /Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+(?:of the [A-Za-z ]+ )?is hereby amended and restated/gi,
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // "Section 1.01 is amended by adding..." / "Section 6.01 is hereby amended by..."
  {
    operation: "ADD",
    re: /Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+(?:of the [A-Za-z ]+ )?is (?:hereby )?amended by adding/gi,
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // "clause (x) is deleted..." / "clause (x) is hereby deleted in its entirety"
  {
    operation: "DELETE",
    re: /clause\s+(\([a-zA-Z0-9]{1,7}\))\s+is (?:hereby )?deleted/gi,
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // "the definition of "Consolidated EBITDA" is amended and restated..." / "...is hereby amended by..."
  {
    operation: "MODIFY",
    re: /the definition of[\s]*[""]?([A-Z][A-Za-z0-9 ]{1,60})[""]?\s+is (?:hereby )?amended/gi,
    sectionRef: () => null,
    definedTermRef: (m) => m[1]?.trim() ?? null,
  },
  // Generic fallback: "Section 6.01 is hereby amended" without a more specific verb matched above.
  {
    operation: "MODIFY",
    re: /Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+(?:of the [A-Za-z ]+ )?is (?:hereby )?amended\b/gi,
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // Whole-agreement scope: "the Credit Agreement is hereby amended as follows" - no specific section yet (each individual amendment clause inside is caught by the patterns above); this one anchors that the DOCUMENT overall is amendment-shaped even absent a per-section match.
  {
    operation: "UNKNOWN_CHANGE",
    re: /the (Credit Agreement|Indenture|Agreement) is hereby amended(?! and restated)/gi,
    sectionRef: () => null,
    definedTermRef: () => null,
  },
];

function excerpt(text: string, charStart: number, matchLength: number): string {
  const start = Math.max(0, charStart - 40);
  const end = Math.min(text.length, charStart + matchLength + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function detectModificationCandidates(doc: PackageDocumentInput): ModificationCandidate[] {
  const out: ModificationCandidate[] = [];
  const seenRestateOrAddSections = new Set<string>();

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc.text)) !== null) {
      const sectionRef = pattern.sectionRef(m);
      const definedTermRef = pattern.definedTermRef(m);
      // The generic MODIFY fallback pattern only fires when a more specific
      // RESTATE/ADD pattern hasn't already claimed the same section - never
      // double-counts one amendment statement as two candidates.
      if (pattern.operation === "MODIFY" && sectionRef && seenRestateOrAddSections.has(sectionRef)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      if ((pattern.operation === "RESTATE" || pattern.operation === "ADD") && sectionRef) seenRestateOrAddSections.add(sectionRef);

      out.push({
        sourceDocumentId: doc.documentId,
        sourceNodeCitation: doc.label,
        sourceText: excerpt(doc.text, m.index, m[0].length),
        operation: pattern.operation,
        targetDocumentId: null,
        targetHint: null,
        targetSectionRef: sectionRef,
        targetDefinedTermRef: definedTermRef,
        status: "UNRESOLVED",
        unresolvedReason: "target document not yet resolved (resolved in a later pass against the whole package)",
        confidence: 0.7,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

export function detectPackageModificationCandidates(documents: PackageDocumentInput[]): ModificationCandidate[] {
  return documents.flatMap(detectModificationCandidates);
}
