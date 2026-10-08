/**
 * Governing-source binding for basket/formula candidates.
 *
 * Generalizable (no issuer-specific offsets or hardcoded section numbers).
 * Every binding carries source identity, exact offsets, and provenance.
 * A formula without sufficient governing context remains incomplete.
 */

import { existsSync, readFileSync } from "node:fs";
import { buildProvenance, type SourceProvenance } from "./provenance";

export type SpanFidelityClass =
  | "OPERATIVE_PROVISION"
  | "NUMERICAL_FRAGMENT"
  | "HEADING_ONLY"
  | "UNRESOLVED";

export type BindingResolution =
  | "BOUND"
  | "PARTIAL"
  | "UNRESOLVED_SOURCE_MISSING"
  | "UNRESOLVED_GOVERNING_PROVISION"
  | "UNRESOLVED_SPAN_NOT_REPLAYABLE";

export interface BoundSpan {
  text: string;
  provenance: SourceProvenance;
}

export interface GoverningSourceBinding {
  candidateId: string;
  documentPath: string;
  sourceRecovered: boolean;
  spanReplayable: boolean;
  spanFidelity: SpanFidelityClass;
  bindingResolution: BindingResolution;
  extractedSpan: BoundSpan | null;
  governingProhibitionOrPermission: BoundSpan | null;
  parentSection: { label: string; charStart: number | null; charEnd: number | null } | null;
  parentSubsection: { label: string; charStart: number | null; charEnd: number | null } | null;
  applicableExceptionOrProviso: BoundSpan | null;
  referencedSections: string[];
  definedTerms: string[];
  entityScope: string | null;
  measurementDateOrTestingPeriod: string | null;
  amendmentVersionAuthority: string | null;
  sufficientForAffirmativePermission: boolean;
  blockers: string[];
}

const SECTION_HEADING_RE =
  /(?:^|\n)\s*(?:Section|SECTION|§)\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))*(?:\([a-zA-Z0-9]+\))*)\b[^\n]{0,160}/g;
const SUBSECTION_RE = /(?:^|\n)\s*(\([a-z]\)|\([ivxlcdm]+\)|\([A-Z]\))\s+/g;
const XREF_RE =
  /\b(?:Section|§)\s*\d+(?:\.\d+)*(?:\([a-z0-9]+\))*(?:\([A-Z0-9]+\))*/gi;
const TERM_RE =
  /\b(Consolidated (?:EBITDA|Net Income|Total Assets)|Applicable EBITDA|Available Amount|Payment Conditions|Total Assets|Fixed Charge Coverage Ratio|Interest Coverage Ratio|(?:First Lien |Secured |Total )?(?:Net )?Leverage Ratio)\b/g;
const ENTITY_RE =
  /\b(Borrower(?:s)?|Guarantor(?:s)?|Loan Part(?:y|ies)|Restricted Subsidiar(?:y|ies)|Foreign Subsidiar(?:y|ies)|non-Guarantor(?:s)?|Parent)\b/i;
const MEASURE_RE =
  /\b(most recently ended|Test Period|Reference Date|four (?:consecutive )?fiscal quarters|as of the date of determination|LTM)\b/i;
const PROVISO_RE = /\b(provided that|provided,? however|so long as|subject to)\b/i;
const MAY_RE = /\b(may|is permitted to|shall be permitted to)\b/i;
const CEILING_ONLY_RE =
  /^(?:the\s+)?(?:greater|lesser)\s+of\b|^\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?$|^\d+%\s+of\b/i;

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export function classifySpanFidelity(span: string, governingWindow: string | null): SpanFidelityClass {
  const s = span.trim();
  if (!s) return "UNRESOLVED";
  if (/^(ARTICLE|SECTION|§)\s*\d+/i.test(s) && s.length < 80) return "HEADING_ONLY";
  const window = governingWindow || s;
  const hasPermission = MAY_RE.test(window) || /\bother (indebtedness|liens?|investments?|restricted payments?)\b/i.test(window);
  const hasCeiling = /\b(shall not exceed|not to exceed|in an aggregate)\b/i.test(window);
  if (s.length < 100 && CEILING_ONLY_RE.test(s) && !hasPermission) return "NUMERICAL_FRAGMENT";
  if (s.length < 80 && /(\$\d|\d%\s+of|greater of)/i.test(s) && !hasPermission && !hasCeiling) {
    return "NUMERICAL_FRAGMENT";
  }
  if (hasPermission || (hasCeiling && s.length >= 100)) return "OPERATIVE_PROVISION";
  if (s.length >= 160 && (hasCeiling || /means\b/i.test(s))) return "OPERATIVE_PROVISION";
  return "NUMERICAL_FRAGMENT";
}

function findNearestHeading(
  source: string,
  index: number,
  pattern: RegExp,
): { label: string; charStart: number; charEnd: number } | null {
  let best: { label: string; charStart: number; charEnd: number } | null = null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index > index) break;
    best = {
      label: m[0].replace(/^\s+/, "").trim().slice(0, 160),
      charStart: m.index,
      charEnd: m.index + m[0].length,
    };
  }
  return best;
}

function expandGoverningWindow(source: string, spanStart: number, spanEnd: number): string {
  const parent = findNearestHeading(source, spanStart, SECTION_HEADING_RE);
  const start = parent ? parent.charStart : Math.max(0, spanStart - 800);
  // Extend forward through provisos / next section boundary.
  let end = Math.min(source.length, spanEnd + 1200);
  const after = source.slice(spanEnd);
  const nextSection = after.search(/(?:\n)\s*(?:Section|SECTION|§)\s+\d+/);
  if (nextSection >= 0) end = Math.min(end, spanEnd + nextSection);
  return source.slice(start, end);
}

export function bindGoverningSource(input: {
  candidateId: string;
  exactSourceSpan: string;
  documentPath: string;
  amendmentVersionNote?: string | null;
  sourceText?: string | null;
}): GoverningSourceBinding {
  const blockers: string[] = [];
  const documentPath = input.documentPath;
  let sourceText = input.sourceText ?? null;
  if (sourceText == null) {
    if (!documentPath || !existsSync(documentPath)) {
      return {
        candidateId: input.candidateId,
        documentPath,
        sourceRecovered: false,
        spanReplayable: false,
        spanFidelity: "UNRESOLVED",
        bindingResolution: "UNRESOLVED_SOURCE_MISSING",
        extractedSpan: null,
        governingProhibitionOrPermission: null,
        parentSection: null,
        parentSubsection: null,
        applicableExceptionOrProviso: null,
        referencedSections: [],
        definedTerms: [],
        entityScope: null,
        measurementDateOrTestingPeriod: null,
        amendmentVersionAuthority: input.amendmentVersionNote ?? null,
        sufficientForAffirmativePermission: false,
        blockers: ["CANONICAL_SOURCE_BYTES_UNAVAILABLE"],
      };
    }
    sourceText = readFileSync(documentPath, "utf8");
  }

  const provenance = buildProvenance(sourceText, input.exactSourceSpan, documentPath);
  const spanReplayable = provenance.matchKind !== "NOT_FOUND";
  if (!spanReplayable) {
    blockers.push("SPAN_NOT_REPLAYABLE_AGAINST_SOURCE_BYTES");
  }

  const charStart = provenance.charOffsetStart;
  const charEnd = provenance.charOffsetEnd;
  let governingWindow: string | null = null;
  let parentSection: GoverningSourceBinding["parentSection"] = null;
  let parentSubsection: GoverningSourceBinding["parentSubsection"] = null;

  if (charStart != null && charEnd != null) {
    parentSection = findNearestHeading(sourceText, charStart, SECTION_HEADING_RE);
    parentSubsection = findNearestHeading(sourceText, charStart, SUBSECTION_RE);
    governingWindow = expandGoverningWindow(sourceText, charStart, charEnd);
  } else if (spanReplayable && provenance.matchKind === "WHITESPACE_NORMALIZED") {
    // Approximate window via normalized search is not offset-exact; mark partial.
    blockers.push("WHITESPACE_NORMALIZED_OFFSETS_UNAVAILABLE");
    governingWindow = input.exactSourceSpan;
  }

  const fidelity = classifySpanFidelity(input.exactSourceSpan, governingWindow);
  const refs = unique([
    ...((governingWindow || input.exactSourceSpan).match(XREF_RE) ?? []),
    ...(parentSection ? [parentSection.label.match(XREF_RE)?.[0] ?? ""] : []),
  ]);
  const terms = unique([...(governingWindow || input.exactSourceSpan).matchAll(TERM_RE)].map((m) => m[0]));
  const entity = (governingWindow || input.exactSourceSpan).match(ENTITY_RE)?.[0] ?? null;
  const measure = (governingWindow || input.exactSourceSpan).match(MEASURE_RE)?.[0] ?? null;

  let proviso: BoundSpan | null = null;
  if (governingWindow && PROVISO_RE.test(governingWindow)) {
    const idx = governingWindow.search(PROVISO_RE);
    const slice = governingWindow.slice(Math.max(0, idx - 40), Math.min(governingWindow.length, idx + 280));
    const pProv = buildProvenance(sourceText, slice, documentPath);
    // Prefer recording text even if whitespace-normalized.
    proviso = { text: slice, provenance: pProv };
  }

  let governing: BoundSpan | null = null;
  if (governingWindow && governingWindow.length > input.exactSourceSpan.length) {
    governing = {
      text: governingWindow,
      provenance: buildProvenance(sourceText, governingWindow, documentPath),
    };
  } else if (fidelity === "OPERATIVE_PROVISION") {
    governing = { text: input.exactSourceSpan, provenance };
  } else {
    blockers.push("GOVERNING_PROVISION_NOT_ESTABLISHED");
  }

  const hasPermissionLanguage =
    MAY_RE.test(governingWindow || "") ||
    /\bother (indebtedness|liens?|investments?|restricted payments?)\b.{0,120}\b(not to exceed|shall not exceed)/is.test(
      governingWindow || "",
    );

  const sufficient =
    spanReplayable &&
    fidelity === "OPERATIVE_PROVISION" &&
    hasPermissionLanguage &&
    governing != null &&
    !blockers.includes("GOVERNING_PROVISION_NOT_ESTABLISHED");

  if (!sufficient) {
    if (fidelity === "NUMERICAL_FRAGMENT") blockers.push("NUMERICAL_FRAGMENT_INSUFFICIENT_FOR_PERMISSION");
    if (!hasPermissionLanguage) blockers.push("NO_PERMISSION_AUTHORITY_IN_GOVERNING_CONTEXT");
  }

  let bindingResolution: BindingResolution = "BOUND";
  if (!spanReplayable) bindingResolution = "UNRESOLVED_SPAN_NOT_REPLAYABLE";
  else if (blockers.includes("GOVERNING_PROVISION_NOT_ESTABLISHED")) {
    bindingResolution = "UNRESOLVED_GOVERNING_PROVISION";
  } else if (blockers.length > 0 || fidelity !== "OPERATIVE_PROVISION") bindingResolution = "PARTIAL";

  return {
    candidateId: input.candidateId,
    documentPath,
    sourceRecovered: true,
    spanReplayable,
    spanFidelity: fidelity,
    bindingResolution,
    extractedSpan: { text: input.exactSourceSpan, provenance },
    governingProhibitionOrPermission: governing,
    parentSection,
    parentSubsection,
    applicableExceptionOrProviso: proviso,
    referencedSections: refs,
    definedTerms: terms,
    entityScope: entity,
    measurementDateOrTestingPeriod: measure,
    amendmentVersionAuthority: input.amendmentVersionNote ?? null,
    sufficientForAffirmativePermission: sufficient,
    blockers: unique(blockers),
  };
}
