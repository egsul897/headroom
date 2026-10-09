/**
 * SOURCE-REFERENCE FIDELITY (Phase 3 - source references are source identity, not model discretion).
 *
 * When the operative source states "in compliance with the financial covenants contained in Section 9.1", the
 * authoritative semantic target of that condition is Section 9.1 - exactly as drafted. The model may classify the
 * relationship (REQUIRES / LIMITED_BY), the condition's meaning, the target combination and the evaluation basis; it
 * may NOT replace the reference with sub-clauses of its own choosing (9.1(a), 9.1(b), ...), widen it to the enclosing
 * section, or invent one the source never states. One-to-many expansion of a whole-section reference onto certified
 * units is a PACKAGE-level derived artifact (covenant-map/package-dependencies.ts), never a candidate-level rewrite.
 *
 * The stated references come from authenticated source text: a deterministic scan of the candidate's own operative text
 * (absolute "Section X" / "§ X" references, explicit lists, relative "clause (x) of this Section" references, and
 * ranges "clauses (a) through (d)" when the structural index resolves the range deterministically), plus — IPV-15 —
 * section references stated inside retrieved definition texts the unit depends on (definition-mediated shared capacity
 * such as Available Amount naming 7.06(c)/7.08(d)). Pass A inventory `referencedSections` may corroborate but never
 * create a stated reference on their own (SA-1). Every model-emitted target is classified against that set:
 *
 *   EXACT_SOURCE_REFERENCE             the reference as drafted (text-equal after whitespace/case folding)
 *   SOURCE_EQUIVALENT_NORMALIZATION    the same target under identity normalization ("Section 9.1" -> "9.1", "§ 9.1")
 *   MODEL_NARROWED_REFERENCE           a structural descendant of a stated reference (expansion) - excluded, restored
 *                                      to the stated reference when lineage proves it
 *   MODEL_BROADENED_REFERENCE          a structural ancestor of stated reference(s) - excluded, restored to them
 *   MODEL_INVENTED_REFERENCE           related to no stated reference - excluded, review
 *   SOURCE_REFERENCE_UNVERIFIABLE      no stated reference exists at all (no text reference, no lineage) - kept, but
 *                                      the unit is limited (review); never silently authoritative
 *
 * Only EXACT / SOURCE_EQUIVALENT / restored references become authoritative automatically. Raw emitted references are
 * always retained in the rule's non-authoritative audit. Agreement-agnostic by construction.
 */
import type { StructuralIndex } from "../structural-index";
import { normalizeReferenceText } from "./source-reference";
import { scanSourceReferences, type SourceTargetSelector } from "../source-reference-scan";

// v3 (IPV-15): stated-reference set is still SOURCE TEXT ONLY (SA-1) — operative text plus retrieved definition
// bodies the unit depends on. Pass A inventory `referencedSections` may corroborate but never create a stated
// reference. Every stated reference carries its source-derived target selector (SA-2).
export const SOURCE_REFERENCE_FIDELITY_VERSION = "source-reference-fidelity.v3";

export type ReferenceFidelityClass =
  | "EXACT_SOURCE_REFERENCE"
  | "SOURCE_EQUIVALENT_NORMALIZATION"
  | "MODEL_NARROWED_REFERENCE"
  | "MODEL_BROADENED_REFERENCE"
  | "MODEL_INVENTED_REFERENCE"
  | "SOURCE_REFERENCE_UNVERIFIABLE";

export interface StatedSourceReference {
  /** The reference text as the source states it ("Section 9.1", "clause (b) of this Section", "the Payment Conditions"). */
  raw: string;
  /** Normalized section identity ("9.1", "9.1(b)"), or null for a named (non-section) reference. */
  normalized: string | null;
  /** Always OPERATIVE_TEXT (v2): only authenticated source text states a reference. INVENTORY_LINEAGE is retained in the type for pre-v2 artifacts and is never emitted. */
  origin: "OPERATIVE_TEXT" | "INVENTORY_LINEAGE";
  charStart: number | null;
  charEnd?: number | null;
  /** SA-2: the target-selection language read from the source around the reference. */
  selector?: SourceTargetSelector;
}

export interface EmittedReferenceClassification {
  emitted: string;
  normalized: string | null;
  classification: ReferenceFidelityClass;
  /** The stated reference(s) the emitted one maps to (one for EXACT/EQUIVALENT/NARROWED; one or more for BROADENED). */
  statedRefs: string[];
  detail: string;
}

/** SA-1 corroboration classes of a Pass A inventory claim against the source-grounded references of its own span. */
export type InventoryReferenceClaimClass = "CORROBORATED" | "MODEL_INVENTED_REFERENCE" | "MODEL_NARROWED_REFERENCE" | "MODEL_BROADENED_REFERENCE";

export interface ReferenceFidelityOutcome {
  version: typeof SOURCE_REFERENCE_FIDELITY_VERSION;
  /** The references that are authoritative for the field, in order, deduplicated. Exactly the drafted references. */
  authoritativeRefs: string[];
  /** SA-2: the source-derived selector of each authoritative reference (keyed by its normalized identity; UNRESOLVED_SELECTOR for an unverifiable one). */
  selectors: Record<string, SourceTargetSelector>;
  classifications: EmittedReferenceClassification[];
  /** Raw emitted references removed from the authoritative set (expansion / broadening / invention), with the reason. */
  excluded: { emitted: string; classification: ReferenceFidelityClass; restoredTo: string | null }[];
  /** True when at least one emitted reference could not be classified against any stated reference (field stays non-authoritative-for-certainty). */
  unverifiable: boolean;
  invented: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Explicit section-shaped references stated in `text` - the ONE deterministic citation grammar (compiler/source-reference-scan.ts). */
export function statedSectionReferencesInText(text: string, opts: { baseSectionRef?: string | null; index?: StructuralIndex | null; documentId?: string | null } = {}): StatedSourceReference[] {
  return scanSourceReferences(text, opts).map((r) => ({ raw: r.raw, normalized: r.normalized, origin: "OPERATIVE_TEXT" as const, charStart: r.charStart, charEnd: r.charEnd, selector: r.selector }));
}

/** Named (non-section) references stated verbatim in the text: the emitted phrase, stripped of a leading article, occurs in the operative text. */
function namedReferenceStated(emitted: string, text: string): boolean {
  const term = emitted.trim().replace(/^(?:the|such|any)\s+/i, "").replace(/^["“”']+|["“”']+$/g, "").trim();
  if (term.length < 3) return false;
  return text.toLowerCase().includes(term.toLowerCase());
}

export interface ClassifyReferencesInput {
  emitted: string[];
  operativeText: string;
  /**
   * IPV-15: full texts of retrieved DEFINITION / DEFINITION_DEPENDENCY items the unit depends on.
   * Section references stated there are admissible stated references for this unit (definition-mediated
   * shared capacity). Never model prose — only source-backed context-bundle excerpts.
   */
  definitionAuthorityTexts?: readonly string[] | null;
  /**
   * Pass A lineage: the SOURCE-GROUNDED referencedSections of the inventory items the node consumes. Corroboration
   * only (recorded in the audit); never a stated reference on its own (SA-1).
   */
  lineageRefs?: readonly string[] | null;
  baseSectionRef?: string | null;
  index?: StructuralIndex | null;
  documentId?: string | null;
}

function authorityTexts(input: Omit<ClassifyReferencesInput, "emitted">): string[] {
  return [input.operativeText, ...(input.definitionAuthorityTexts ?? [])].filter((t) => t.trim().length > 0);
}

/** The authenticated stated-reference set: operative text plus retrieved definition bodies (IPV-15). */
export function statedReferencesFor(input: Omit<ClassifyReferencesInput, "emitted">): StatedSourceReference[] {
  const opts = { baseSectionRef: input.baseSectionRef, index: input.index, documentId: input.documentId };
  const out: StatedSourceReference[] = [];
  const seen = new Set<string>();
  for (const text of authorityTexts(input)) {
    for (const ref of statedSectionReferencesInText(text, opts)) {
      const key = ref.normalized ?? norm(ref.raw);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

export function classifyEmittedReferences(input: ClassifyReferencesInput): ReferenceFidelityOutcome {
  const stated = statedReferencesFor(input);
  const authority = authorityTexts(input).join("\n");
  const classifications: EmittedReferenceClassification[] = [];
  const authoritative: string[] = [];
  const excluded: ReferenceFidelityOutcome["excluded"] = [];
  const selectors: Record<string, SourceTargetSelector> = {};
  const addAuth = (ref: string, selector?: SourceTargetSelector) => {
    const key = normalizeReferenceText(ref) ?? norm(ref);
    if (!authoritative.some((a) => (normalizeReferenceText(a) ?? norm(a)) === key)) authoritative.push(ref);
    if (selector && !selectors[key]) selectors[key] = selector;
  };
  const lineage = new Set((input.lineageRefs ?? []).map((l) => normalizeReferenceText(l) ?? norm(l)));
  const corroboration = (n: string) => (lineage.has(n) ? "; corroborated by the source-grounded inventory lineage" : "");
  let unverifiable = false, invented = false;
  for (const emitted of input.emitted) {
    const n = normalizeReferenceText(emitted);
    if (n === null) {
      if (namedReferenceStated(emitted, authority)) { classifications.push({ emitted, normalized: null, classification: "EXACT_SOURCE_REFERENCE", statedRefs: [emitted], detail: "named reference stated verbatim in the operative or retrieved definition text" }); addAuth(emitted, { sourceText: emitted.trim(), kind: "NAMED_CONDITION", qualifierText: null }); }
      else { invented = true; classifications.push({ emitted, normalized: null, classification: "MODEL_INVENTED_REFERENCE", statedRefs: [], detail: "named reference does not occur in the operative text or retrieved definitions" }); excluded.push({ emitted, classification: "MODEL_INVENTED_REFERENCE", restoredTo: null }); }
      continue;
    }
    const sectionStated = stated.filter((s) => s.normalized !== null);
    const exact = sectionStated.find((s) => s.normalized === n);
    if (exact) {
      const textEqual = norm(exact.raw) === norm(emitted);
      classifications.push({ emitted, normalized: n, classification: textEqual ? "EXACT_SOURCE_REFERENCE" : "SOURCE_EQUIVALENT_NORMALIZATION", statedRefs: [exact.raw], detail: `${textEqual ? "the reference as drafted" : `identity normalization of the drafted reference "${exact.raw}"`}${corroboration(n)}` });
      addAuth(emitted, exact.selector);
      continue;
    }
    const parent = sectionStated.find((s) => n.startsWith(`${s.normalized}(`) || n.startsWith(`${s.normalized}.`));
    if (parent) {
      classifications.push({ emitted, normalized: n, classification: "MODEL_NARROWED_REFERENCE", statedRefs: [parent.raw], detail: `a sub-clause of the drafted reference "${parent.raw}"; the source states the whole reference - restored to it` });
      excluded.push({ emitted, classification: "MODEL_NARROWED_REFERENCE", restoredTo: parent.raw });
      addAuth(parent.raw, parent.selector);
      continue;
    }
    const children = sectionStated.filter((s) => s.normalized!.startsWith(`${n}(`) || s.normalized!.startsWith(`${n}.`));
    if (children.length > 0) {
      classifications.push({ emitted, normalized: n, classification: "MODEL_BROADENED_REFERENCE", statedRefs: children.map((c) => c.raw), detail: `wider than the drafted reference(s) ${children.map((c) => `"${c.raw}"`).join(", ")}; restored to them` });
      excluded.push({ emitted, classification: "MODEL_BROADENED_REFERENCE", restoredTo: children.map((c) => c.raw).join(" | ") });
      for (const c of children) addAuth(c.raw, c.selector);
      continue;
    }
    // SA-1: a section-shaped reference the (non-empty) source never states is INVENTED, however plausible - "the source
    // states no reference at all" is not a loophole. Only an absent operative text leaves a reference unverifiable.
    if (stated.length === 0 && input.operativeText.trim().length === 0) {
      unverifiable = true;
      classifications.push({ emitted, normalized: n, classification: "SOURCE_REFERENCE_UNVERIFIABLE", statedRefs: [], detail: `the operative text states no section-shaped reference; kept, not proven${lineage.has(n) ? " (a model inventory claim names it - a model claim is not source authority)" : ""}` });
      addAuth(emitted, { sourceText: emitted.trim(), kind: "UNRESOLVED_SELECTOR", qualifierText: null });
      continue;
    }
    invented = true;
    classifications.push({ emitted, normalized: n, classification: "MODEL_INVENTED_REFERENCE", statedRefs: [], detail: `related to none of the drafted references (${stated.map((s) => `"${s.raw}"`).join(", ")}); excluded` });
    excluded.push({ emitted, classification: "MODEL_INVENTED_REFERENCE", restoredTo: null });
  }
  return { version: SOURCE_REFERENCE_FIDELITY_VERSION, authoritativeRefs: authoritative, selectors, classifications, excluded, unverifiable, invented };
}
