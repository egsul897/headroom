/**
 * A side letter, consent, or waiver that names a section may control that
 * section. The detector always records an unresolved override so the base
 * text is never reported as a resolved operative reading.
 *
 * When a side letter states a single clear capacity figure for the named
 * section ("notwithstanding Section X … exceeding $N" / "not to exceed $N"),
 * that figure is captured as superseding operative language (spliced into the
 * unique money figure of the base clause when safe). Consents, waivers, and
 * ambiguous amount windows leave newText null — fail closed.
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageDocumentInput } from "../package-graph/types";
import { hashParts } from "../hashing";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "./types";

const CAPTION = /^\s*(?:side\s+letter|consent|waiver)\b/i;
const SIDE_LETTER_CAPTION = /^\s*side\s+letter\b/i;
const SECTION_REF = String.raw`(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)`;
const MONEY_RE = /\$\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;
const OVERRIDE_PATTERNS = [
  new RegExp(String.raw`notwithstanding\s+(?:the\s+limitation\s+in\s+)?(?:section|§)\s*${SECTION_REF}`, "gi"),
  new RegExp(String.raw`hereby\s+consent\b[\s\S]{0,600}?section\s+${SECTION_REF}`, "gi"),
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function moneyFigures(text: string): string[] {
  return [...text.matchAll(MONEY_RE)].map((m) => m[0]!);
}

/**
 * Capture the verbatim override window for a named section from a side letter
 * when that window carries exactly one money figure. The operative-state
 * applicator splices that figure into the last authoritative clause text;
 * returning only source-verbatim text keeps independent verification honest.
 * Returns null when authority for a replacement amount is not uniquely clear.
 */
export function captureSafeOverrideNewText(documentText: string, sectionRef: string, _baseClauseText: string | null = null): string | null {
  const escaped = escapeRegExp(sectionRef);
  // No \b after the section ref: refs end in ")" (e.g. 7.01(b)), which is
  // already a non-word character, so \b would never match before the following space.
  // Do not stop at the first "." — section numbers like 7.01 contain dots.
  const headerRe = new RegExp(
    String.raw`notwithstanding\s+(?:the\s+limitation\s+in\s+)?(?:section|§)\s*${escaped}(?![a-zA-Z0-9(])`,
    "i",
  );
  const header = headerRe.exec(documentText);
  if (!header) return null;
  const fromHeader = documentText.slice(header.index);
  // Sentence end: period followed by whitespace+capital, paragraph break, or EOS.
  const sentenceEnd = fromHeader.search(/\.(?:\s+(?=[A-Z])|\s*$|\n)|$/);
  const rawWindow = sentenceEnd >= 0 ? fromHeader.slice(0, sentenceEnd + 1) : fromHeader.slice(0, 500);
  const window = rawWindow.replace(/\s+/g, " ").trim();
  const amounts = moneyFigures(window);
  if (amounts.length !== 1) return null;
  return window;
}

/** Unique money figure from a captured override window, or null if not unique. */
export function uniqueOverrideAmount(overrideText: string | null | undefined): string | null {
  if (!overrideText) return null;
  const amounts = moneyFigures(overrideText);
  return amounts.length === 1 ? amounts[0]! : null;
}

/** Splice a unique override amount into clause text that itself has exactly one money figure. */
export function spliceOverrideAmountIntoClause(clauseText: string, overrideAmount: string): string | null {
  const baseAmounts = moneyFigures(clauseText);
  if (baseAmounts.length !== 1) return null;
  return clauseText.replace(baseAmounts[0]!, overrideAmount);
}

export function detectUnclassifiedOverrides(input: {
  document: PackageDocumentInput;
  documents: readonly PackageDocumentInput[];
  index: StructuralIndex;
  instrumentKeyForDocument: (documentId: string | null) => string | null;
  effectiveDate: EffectiveDateResult;
}): AmendmentEffectCandidate[] {
  if (!CAPTION.test(input.document.text)) return [];
  const isSideLetter = SIDE_LETTER_CAPTION.test(input.document.text);
  const refs = new Set<string>();
  for (const pattern of OVERRIDE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(input.document.text)) !== null) {
      if (match[1]) refs.add(match[1]);
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  return [...refs].map((sectionRef) => {
    const holders = input.documents.filter((d) => d.documentId !== input.document.documentId && input.index.findNodesByRef(d.documentId, sectionRef).length > 0);
    const targetDocumentId = holders.length === 1 ? holders[0]!.documentId : null;
    const target: AmendmentTarget = {
      kind: targetDocumentId ? "SECTION" : "UNKNOWN",
      targetDocumentId,
      targetInstrumentKey: input.instrumentKeyForDocument(targetDocumentId),
      targetStructuralNodeKey: null,
      targetSectionRef: sectionRef,
      targetDefinedTermRef: null,
      targetHint: null,
    };
    const overrideDocumentId = input.document.documentId;
    const overrideDocumentLabel = (input.document.label ?? "").trim() || overrideDocumentId;
    const effectId = hashParts(["amendment-effect", overrideDocumentId, "UNCLASSIFIED_OVERRIDE", sectionRef]);
    // Provenance only: documentId, available label, and effectId. Do not embed
    // operative body text or dollar amounts in the diagnostic reason.
    const unresolvedReason = `UNCLASSIFIED_OVERRIDE: override from documentId=${overrideDocumentId} label=${JSON.stringify(overrideDocumentLabel)} effectId=${effectId} names Section ${sectionRef}. Its effect on that provision was not established, so the base text is not the resolved operative text.`;
    const newText = isSideLetter ? captureSafeOverrideNewText(input.document.text, sectionRef) : null;
    return {
      effectId,
      amendmentDocumentId: overrideDocumentId,
      target,
      operation: "UNKNOWN_CHANGE",
      effectiveDate: input.effectiveDate,
      newText,
      oldText: null,
      sourceCitation: input.document.label,
      sourceExcerpt: input.document.text.replace(/\s+/g, " ").trim().slice(0, 300),
      confidence: 0.4,
      status: "REVIEW_REQUIRED",
      unresolvedReason,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    };
  });
}
