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
 *
 * IPV-19: definition amendments that name both the term and its home
 * section ("The definition of X in Section 1.01 … is hereby amended") must
 * target the DEFINITION, never REPLACE the whole of Section 1.01. Those
 * patterns run before section-level RESTATE so the more specific form wins.
 *
 * IPV-16: side-letter / consent overrides ("Notwithstanding Section X …")
 * are modification candidates (UNKNOWN_CHANGE / MODIFY) so the amendment
 * pipeline can attach a REVIEW_REQUIRED effect to the named provision.
 */
import type { ModificationCandidate, ModificationOperation, PackageDocumentInput } from "./types";

interface StatementPattern {
  operation: ModificationOperation;
  re: RegExp;
  /** Extracts the raw target-section-ref text from a match, or null if this pattern targets a defined term instead of a section. */
  sectionRef: (m: RegExpExecArray) => string | null;
  definedTermRef: (m: RegExpExecArray) => string | null;
}

// A section reference is very commonly followed by its own descriptive
// heading in parentheses before the rest of the amendment clause (e.g.
// "Section 1.1 (Defined Terms) of the Credit Agreement is hereby amended
// as follows" - real, generalized CONMED evidence: the second amendment's
// own definition-change clause used exactly this shape, which none of
// this module's original "Section N ... is amended" patterns tolerated,
// since they required "of the ... " (or the verb) immediately after the
// section number). Every "Section N ... is (verb)" pattern below now
// optionally allows one such parenthetical between the number and the
// rest of the clause - never CONMED-specific text, just the parenthetical
// itself.
const OPTIONAL_SECTION_HEADING = String.raw`(?:\(\s*[A-Za-z][A-Za-z0-9 ,.'&-]{0,60}\s*\)\s+)?`;
/** Optional "in/under Section N.NN …" / "set forth|contained|appearing|provided …" between a defined term and the amend verb (IPV-19 forms F1/F3). */
const OPTIONAL_DEFINITION_SECTION_LOCUS = String.raw`(?:(?:(?:set\s+forth|contained|appearing|provided)\s+)?(?:in|under)\s+Section\s+\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*\s+(?:of\s+the\s+[A-Za-z ]+?\s+)?)?`;

const PATTERNS: StatementPattern[] = [
  // IPV-19 (priority): "the definition of "Consolidated EBITDA" in Section 1.01
  // of the Credit Agreement is hereby amended and restated..." — MUST run
  // before the section-level RESTATE pattern, which would otherwise claim
  // "Section 1.01 … is hereby amended and restated" and wipe the whole
  // definitions section.
  {
    operation: "MODIFY",
    re: new RegExp(
      String.raw`the definition of\s*["“]?\s*([A-Z][A-Za-z0-9 ,.'&-]{1,80}?)\s*["”]?\s+${OPTIONAL_DEFINITION_SECTION_LOCUS}is (?:hereby )?amended`,
      "gi",
    ),
    sectionRef: () => null,
    definedTermRef: (m) => m[1]?.trim() ?? null,
  },
  // F2 form: "Section 1.01 … is hereby amended by amending and restating the definition of X"
  // Quotes required so the non-greedy term capture cannot stop at a single capital letter.
  // Keep the SECTION as the modification candidate (IPV-19): this drafting amends
  // the definitions section by restating one term — it must not be silently
  // rewritten into a definition-level RESTATE/REPLACE that erases sibling terms.
  {
    operation: "MODIFY",
    re: new RegExp(
      String.raw`Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+${OPTIONAL_SECTION_HEADING}(?:of the [A-Za-z ]+ )?is (?:hereby )?amended by amending and restating the definition of\s*["“]\s*([A-Z][A-Za-z0-9 ,.'&-]{1,80}?)\s*["”]`,
      "gi",
    ),
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // IPV-16: "Notwithstanding Section 7.01(b) of the Credit Agreement, …"
  // / "notwithstanding the limitation in Section 7.02(b)" — override /
  // consent / side-letter drafting that names a covenant without classic
  // "is hereby amended" language.
  {
    operation: "UNKNOWN_CHANGE",
    // No trailing \b: a word boundary between "1" and "(" would truncate "7.01(b)" to "7.01".
    re: /\b[Nn]otwithstanding\s+(?:the\s+(?:limitation|restrictions?|provisions?|foregoing)\s+in\s+)?Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)/g,
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // "Section 6.01 is hereby amended and restated in its entirety..."
  {
    operation: "RESTATE",
    re: new RegExp(String.raw`Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+${OPTIONAL_SECTION_HEADING}(?:of the [A-Za-z ]+ )?is hereby amended and restated`, "gi"),
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // "Section 1.01 is amended by adding..." / "Section 6.01 is hereby amended by..."
  {
    operation: "ADD",
    re: new RegExp(String.raw`Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+${OPTIONAL_SECTION_HEADING}(?:of the [A-Za-z ]+ )?is (?:hereby )?amended by adding`, "gi"),
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
  // "Section 6.03 is hereby deleted in its entirety" - a whole-section
  // deletion, distinct from the clause-level pattern above (real, common,
  // generalized amendment-language convention, added on real evidence
  // this module's own original pattern set never covered a bare section-
  // level deletion, only a lettered sub-clause one).
  {
    operation: "DELETE",
    re: new RegExp(String.raw`Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+${OPTIONAL_SECTION_HEADING}(?:of the [A-Za-z ]+ )?is (?:hereby )?deleted(?: in its entirety)?`, "gi"),
    sectionRef: (m) => m[1] ?? null,
    definedTermRef: () => null,
  },
  // Generic fallback: "Section 6.01 is hereby amended" without a more specific verb matched above.
  {
    operation: "MODIFY",
    re: new RegExp(String.raw`Section\s+(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)\s+${OPTIONAL_SECTION_HEADING}(?:of the [A-Za-z ]+ )?is (?:hereby )?amended\b`, "gi"),
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

/** True when a section-level RESTATE/MODIFY match is actually a definition amendment that already claimed this span (IPV-19). */
function isDefinitionLocusBefore(text: string, matchIndex: number): boolean {
  const lookback = text.slice(Math.max(0, matchIndex - 120), matchIndex);
  return /\bthe definition of\s*["“]?[^"”\n]{1,80}["”]?\s+(?:(?:set\s+forth\s+)?in\s+)?$/i.test(lookback)
    || /\bthe definition of\b/i.test(lookback) && /\bin\s+$/i.test(lookback);
}

export function detectModificationCandidates(doc: PackageDocumentInput): ModificationCandidate[] {
  const out: ModificationCandidate[] = [];
  const seenRestateOrAddSections = new Set<string>();
  // Every section/clause-level pattern above claims the char span it
  // matched - the whole-agreement UNKNOWN_CHANGE fallback (deliberately
  // last in PATTERNS) skips any match whose span falls inside one already
  // claimed, since a section-specific candidate is always strictly more
  // informative than the coarse whole-agreement one for the exact same
  // real amendment statement (never a separate, additional change).
  const claimedSpans: Array<[number, number]> = [];

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc.text)) !== null) {
      const sectionRef = pattern.sectionRef(m);
      const definedTermRef = pattern.definedTermRef(m);
      // IPV-19: section RESTATE that sits inside "the definition of X in Section N …"
      // is not a whole-section replacement — skip (the definition pattern already claimed it).
      if (pattern.operation === "RESTATE" && sectionRef && !definedTermRef && isDefinitionLocusBefore(doc.text, m.index)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      // The generic MODIFY fallback pattern only fires when a more specific
      // RESTATE/ADD pattern hasn't already claimed the same section - never
      // double-counts one amendment statement as two candidates.
      if (pattern.operation === "MODIFY" && sectionRef && seenRestateOrAddSections.has(sectionRef)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      // A more specific candidate already owns this span. A section
      // pattern must not retarget the locator inside "the definition of X
      // in Section 1.01 is hereby amended and restated".
      if (claimedSpans.some(([start, end]) => m!.index >= start && m!.index < end)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      // Skip a second candidate whose span sits inside an already-claimed
      // definition/override match (definition pattern claims before section RESTATE).
      if ((sectionRef || definedTermRef) && claimedSpans.some(([start, end]) => m!.index >= start && m!.index < end)) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      if ((pattern.operation === "RESTATE" || pattern.operation === "ADD") && sectionRef) seenRestateOrAddSections.add(sectionRef);
      if (sectionRef || definedTermRef) claimedSpans.push([m.index, m.index + m[0].length]);

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
