/**
 * A side letter, consent, or waiver that names a section may control that
 * section. This detector does not decide the legal effect and does not
 * capture a dollar amount. It records an unresolved override so the base
 * text is not reported as the resolved operative text.
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageDocumentInput } from "../package-graph/types";
import { hashParts } from "../hashing";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "./types";

const CAPTION = /^\s*(?:side\s+letter|consent|waiver)\b/i;
const SECTION_REF = String.raw`(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)`;
const OVERRIDE_PATTERNS = [
  new RegExp(String.raw`notwithstanding\s+(?:the\s+limitation\s+in\s+)?(?:section|§)\s*${SECTION_REF}`, "gi"),
  new RegExp(String.raw`hereby\s+consent\b[\s\S]{0,600}?section\s+${SECTION_REF}`, "gi"),
];

export function detectUnclassifiedOverrides(input: {
  document: PackageDocumentInput;
  documents: readonly PackageDocumentInput[];
  index: StructuralIndex;
  instrumentKeyForDocument: (documentId: string | null) => string | null;
  effectiveDate: EffectiveDateResult;
}): AmendmentEffectCandidate[] {
  if (!CAPTION.test(input.document.text)) return [];
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
    return {
      effectId: hashParts(["amendment-effect", input.document.documentId, "UNCLASSIFIED_OVERRIDE", sectionRef]),
      amendmentDocumentId: input.document.documentId,
      target,
      operation: "UNKNOWN_CHANGE",
      effectiveDate: input.effectiveDate,
      newText: null,
      oldText: null,
      sourceCitation: input.document.label,
      sourceExcerpt: input.document.text.replace(/\s+/g, " ").trim().slice(0, 300),
      confidence: 0.4,
      status: "REVIEW_REQUIRED",
      unresolvedReason: `UNCLASSIFIED_OVERRIDE: this side letter, consent, or waiver names Section ${sectionRef}. Its effect on that provision was not established, so the base text is not the resolved operative text.`,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    };
  });
}
