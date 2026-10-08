/**
 * Deterministic structural proviso attachment for exception limbs.
 * If attachment cannot be established → AMBIGUOUS_CONDITION_SCOPE.
 */

export type ProvisoAttachmentKind =
  | "OWN_CLAUSE"
  | "TRAILING_LIST_WIDE"
  | "SECTION_WIDE"
  | "PARENT_PROVISO_MAY_INTERACT"
  | "HANGING"
  | "CROSS_REFERENCED"
  | "MULTI_LIMB"
  | "NONE"
  | "AMBIGUOUS";

export interface ProvisoHit {
  text: string;
  charStart: number;
  charEnd: number;
  attachment: ProvisoAttachmentKind;
  appliesToRefs: string[];
  evidence: string;
}

export interface ProvisoAttachmentResult {
  hits: ProvisoHit[];
  primaryAttachment: ProvisoAttachmentKind;
  ambiguous: boolean;
  refusalClass?: "AMBIGUOUS_CONDITION_SCOPE";
}

const PROVIDED_RE = /\bprovided\s+(?:further\s+)?(?:that|however)\b/gi;
const PROVIDED_HOWEVER_RE = /\bprovided\s*,\s*however\b/gi;

export function findProvisoMarkers(text: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  const patterns = [PROVIDED_HOWEVER_RE, PROVIDED_RE];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = Math.min(text.length, start + 240);
      out.push({ start, end, text: text.slice(start, end).replace(/\s+/g, " ").trim() });
    }
  }
  // dedupe overlapping
  out.sort((a, b) => a.start - b.start);
  const deduped: typeof out = [];
  for (const h of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && h.start < prev.end) continue;
    deduped.push(h);
  }
  return deduped;
}

/**
 * Attach provisos found in parent block and exception limb.
 * - Parent "provided that" before exception list → PARENT_PROVISO_MAY_INTERACT / SECTION_WIDE
 * - Limb-local "provided" → OWN_CLAUSE or HANGING if after enumerated text
 * - Multi-limb (x)/(y) shared proviso → MULTI_LIMB
 * - Cannot establish → AMBIGUOUS
 */
export function attachProvisos(input: {
  exceptionRef: string;
  parentBlockText: string;
  exceptionLimbText: string;
  siblingLimbRefs?: string[];
  hasCrossReferencedProviso?: boolean;
}): ProvisoAttachmentResult {
  const hits: ProvisoHit[] = [];
  const parentMarkers = findProvisoMarkers(input.parentBlockText);
  const limbMarkers = findProvisoMarkers(input.exceptionLimbText);

  for (const m of parentMarkers) {
    hits.push({
      text: m.text,
      charStart: m.start,
      charEnd: m.end,
      attachment: "PARENT_PROVISO_MAY_INTERACT",
      appliesToRefs: [input.exceptionRef, ...(input.siblingLimbRefs ?? [])],
      evidence: "Parent-block proviso marker precedes/governs enumerated exception list",
    });
  }

  for (const m of limbMarkers) {
    const afterColonOrSemi = /[;:]\s*$/.test(input.exceptionLimbText.slice(0, m.start).trimEnd());
    const hanging =
      m.start > input.exceptionLimbText.length * 0.35 ||
      /\bInitial Agreement\b/i.test(input.exceptionLimbText) ||
      PROVIDED_HOWEVER_RE.test(input.exceptionLimbText);
    PROVIDED_HOWEVER_RE.lastIndex = 0;
    const multiLimb = /\([xy]\)|\(i\)|\(ii\)/i.test(input.exceptionLimbText);
    let attachment: ProvisoAttachmentKind = "OWN_CLAUSE";
    if (hanging || afterColonOrSemi) attachment = "HANGING";
    if (multiLimb && limbMarkers.length === 1) attachment = "MULTI_LIMB";
    hits.push({
      text: m.text,
      charStart: m.start,
      charEnd: m.end,
      attachment,
      appliesToRefs: multiLimb ? [input.exceptionRef, ...(input.siblingLimbRefs ?? [])] : [input.exceptionRef],
      evidence: `Limb-local proviso (${attachment})`,
    });
  }

  if (input.hasCrossReferencedProviso) {
    hits.push({
      text: "proviso incorporated by cross-reference",
      charStart: -1,
      charEnd: -1,
      attachment: "CROSS_REFERENCED",
      appliesToRefs: [input.exceptionRef],
      evidence: "Condition/proviso incorporated via cross-reference target",
    });
  }

  if (hits.length === 0) {
    // Nested exception without locatable provided-that may still be ambiguous for attachment
    const nestedComplex =
      /:\s*$/.test(input.exceptionLimbText.trim()) ||
      /:\s*\n\s*\([a-z]\)/i.test(input.exceptionLimbText) ||
      (/\([a-z]\)/.test(input.exceptionLimbText) && /\([xy]\)/.test(input.exceptionLimbText));
    if (nestedComplex) {
      return {
        hits: [],
        primaryAttachment: "AMBIGUOUS",
        ambiguous: true,
        refusalClass: "AMBIGUOUS_CONDITION_SCOPE",
      };
    }
    return { hits: [], primaryAttachment: "NONE", ambiguous: false };
  }

  const priority: ProvisoAttachmentKind[] = [
    "AMBIGUOUS",
    "HANGING",
    "PARENT_PROVISO_MAY_INTERACT",
    "SECTION_WIDE",
    "MULTI_LIMB",
    "CROSS_REFERENCED",
    "TRAILING_LIST_WIDE",
    "OWN_CLAUSE",
    "NONE",
  ];
  let primary: ProvisoAttachmentKind = "NONE";
  for (const p of priority) {
    if (hits.some((h) => h.attachment === p)) {
      primary = p;
      break;
    }
  }

  return {
    hits,
    primaryAttachment: primary,
    ambiguous: primary === "AMBIGUOUS",
    refusalClass: primary === "AMBIGUOUS" ? "AMBIGUOUS_CONDITION_SCOPE" : undefined,
  };
}
