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
 * The stated references come from two authenticated places: a deterministic scan of the candidate's own operative text
 * (absolute "Section X" / "§ X" references, explicit lists, relative "clause (x) of this Section" references, and
 * ranges "clauses (a) through (d)" when the structural index resolves the range deterministically), and the frozen
 * Pass A inventory's `referencedSections` lineage - admitted only where it agrees with the text scan, or where the text
 * carries no section-shaped reference at all. Every model-emitted target is classified against that set:
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

export const SOURCE_REFERENCE_FIDELITY_VERSION = "source-reference-fidelity.v1";

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
  origin: "OPERATIVE_TEXT" | "INVENTORY_LINEAGE";
  charStart: number | null;
}

export interface EmittedReferenceClassification {
  emitted: string;
  normalized: string | null;
  classification: ReferenceFidelityClass;
  /** The stated reference(s) the emitted one maps to (one for EXACT/EQUIVALENT/NARROWED; one or more for BROADENED). */
  statedRefs: string[];
  detail: string;
}

export interface ReferenceFidelityOutcome {
  version: typeof SOURCE_REFERENCE_FIDELITY_VERSION;
  /** The references that are authoritative for the field, in order, deduplicated. Exactly the drafted references. */
  authoritativeRefs: string[];
  classifications: EmittedReferenceClassification[];
  /** Raw emitted references removed from the authoritative set (expansion / broadening / invention), with the reason. */
  excluded: { emitted: string; classification: ReferenceFidelityClass; restoredTo: string | null }[];
  /** True when at least one emitted reference could not be classified against any stated reference (field stays non-authoritative-for-certainty). */
  unverifiable: boolean;
  invented: boolean;
}

const SECTION_TOKEN = /\d+(?:\.\d+)*[A-Za-z]?(?:\s*\([^)\s]{1,6}\))*/y;
const CLAUSE_TOKEN = /(?:\(\s*[^)\s]{1,6}\s*\))+/y;
const SEP = /\s*(?:,|and|or|and\/or|,\s*and|,\s*or|through|to)\s*/y;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const sectionBase = (n: string) => n.replace(/\(.*$/, "");
const clauseLabels = (n: string): string[] => n.match(/\([^)]+\)/g) ?? [];

/** Explicit section-shaped references stated in `text`: "Section 9.1", "Sections 9.1(a), 9.1(c) and 9.1(d)", "§ 9.2(b)", "clause (b) of Section 9.1", "clauses (a) through (d) of this Section 9.1". */
export function statedSectionReferencesInText(text: string, opts: { baseSectionRef?: string | null; index?: StructuralIndex | null; documentId?: string | null } = {}): StatedSourceReference[] {
  const out: StatedSourceReference[] = [];
  const push = (raw: string, normalized: string, charStart: number) => { if (!out.some((o) => o.normalized === normalized)) out.push({ raw, normalized, origin: "OPERATIVE_TEXT", charStart }); };
  const base = opts.baseSectionRef ? sectionBase(norm(opts.baseSectionRef.replace(/^(?:Section|§)\s*/i, ""))) : null;
  const expandRange = (section: string, from: string, to: string): string[] | null => {
    if (!opts.index || !opts.documentId) return null;
    const res = opts.index.resolveUniqueNodeByRef(opts.documentId, section);
    if (res.status !== "UNIQUE") return null;
    const kids = opts.index.getChildren(res.node.nodeId).map((k) => norm(k.sectionRef)).filter((k) => k.startsWith(`${section}(`));
    const a = kids.indexOf(`${section}${from}`), b = kids.indexOf(`${section}${to}`);
    if (a < 0 || b < 0 || b < a) return null;
    return kids.slice(a, b + 1);
  };
  // 1. relative references first ("clause (b) of this Section 9.1", "clauses (a) through (d) of this Section", "paragraph (c) above");
  //    their spans are masked from the absolute scan so "of this Section 9.1" is not read a second time as a whole-section reference
  const masked: [number, number][] = [];
  const rel = /\b(?:clauses?|paragraphs?|subsections?|sub-clauses?)\s+((?:\([^)\s]{1,6}\)(?:\s*(?:,|and|or|through|to)\s*)?)+)(?:\s+(?:of|under)\s+this\s+Section(?:\s+(\d+(?:\.\d+)*[A-Za-z]?))?|\s+(?:above|below|hereof))?/gi;
  let m: RegExpExecArray | null;
  while ((m = rel.exec(text)) !== null) {
    const explicit = m[2] ? norm(m[2]) : null;
    const section = explicit ?? base;
    if (!section) continue;
    masked.push([m.index, m.index + m[0].length]);
    const labels = (m[1]!.match(/\([^)]+\)/g) ?? []).map(norm);
    if (/\b(?:through|to)\b/.test(m[1]!) && labels.length === 2) {
      const members = expandRange(section, labels[0]!, labels[1]!);
      if (members) for (const x of members) push(`Section ${x}`, x, m.index); else push(m[0], `${section}${labels[0]}..${labels[1]}`, m.index);
    } else for (const l of labels) push(`Section ${section}${l}`, `${section}${l}`, m.index);
  }
  const isMasked = (i: number) => masked.some(([a, b]) => i >= a && i < b);
  // 2. absolute references: Section(s) / § followed by a token list ("Section 9.1", "Sections 9.1(a), 9.1(c) and 9.1(d)", "§ 9.2(b)", "Sections 9.1(a) and (c)")
  const head = /(?:\bSections?|§§?)\s*/g;
  while ((m = head.exec(text)) !== null) {
    if (isMasked(m.index)) continue;
    let cursor = m.index + m[0].length;
    let lastSection: string | null = null;
    let pendingRange: { section: string; from: string } | null = null;
    for (;;) {
      SECTION_TOKEN.lastIndex = cursor;
      const st = SECTION_TOKEN.exec(text);
      if (st && st[0].trim().length > 0 && /^\d/.test(st[0])) {
        const n = norm(st[0]);
        if (pendingRange && sectionBase(n) === pendingRange.section) {
          const members = expandRange(pendingRange.section, pendingRange.from, clauseLabels(n).join(""));
          if (members) for (const x of members) push(`Section ${x}`, x, st.index); else push(`Section ${st[0].trim()}`, n, st.index);
          pendingRange = null;
        } else push(`Section ${st[0].trim()}`, n, st.index);
        lastSection = sectionBase(n);
        cursor = st.index + st[0].length;
      } else {
        CLAUSE_TOKEN.lastIndex = cursor;
        const ct = CLAUSE_TOKEN.exec(text);
        if (ct && lastSection) {
          const label = norm(ct[0]);
          if (pendingRange) {
            const members = expandRange(pendingRange.section, pendingRange.from, label);
            if (members) for (const x of members) push(`Section ${x}`, x, ct.index); else push(`Section ${lastSection}${label}`, `${lastSection}${label}`, ct.index);
            pendingRange = null;
          } else push(`Section ${lastSection}${label}`, `${lastSection}${label}`, ct.index);
          cursor = ct.index + ct[0].length;
        } else break;
      }
      SEP.lastIndex = cursor;
      const sep = SEP.exec(text);
      if (!sep || sep[0].trim().length === 0) break;
      if (/\b(?:through|to)\b/.test(sep[0]) && lastSection) {
        const last = out[out.length - 1];
        if (last && last.normalized && sectionBase(last.normalized) === lastSection) pendingRange = { section: lastSection, from: clauseLabels(last.normalized).join("") };
      }
      cursor = sep.index + sep[0].length;
    }
  }
  return out.sort((a, b) => (a.charStart ?? 0) - (b.charStart ?? 0));
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
  /** Pass A lineage: the referencedSections (normalized) of the inventory items the node consumes. */
  lineageRefs?: readonly string[] | null;
  baseSectionRef?: string | null;
  index?: StructuralIndex | null;
  documentId?: string | null;
}

/** The authenticated stated-reference set for a node: the text scan, plus lineage refs that agree with it (or stand alone when the text carries none). */
export function statedReferencesFor(input: Omit<ClassifyReferencesInput, "emitted">): StatedSourceReference[] {
  const text = statedSectionReferencesInText(input.operativeText, { baseSectionRef: input.baseSectionRef, index: input.index, documentId: input.documentId });
  const out = [...text];
  for (const l of input.lineageRefs ?? []) {
    const n = normalizeReferenceText(l) ?? norm(l);
    if (!n) continue;
    if (out.some((o) => o.normalized === n)) continue;
    if (text.length === 0) out.push({ raw: l, normalized: n, origin: "INVENTORY_LINEAGE", charStart: null });
  }
  return out;
}

export function classifyEmittedReferences(input: ClassifyReferencesInput): ReferenceFidelityOutcome {
  const stated = statedReferencesFor(input);
  const classifications: EmittedReferenceClassification[] = [];
  const authoritative: string[] = [];
  const excluded: ReferenceFidelityOutcome["excluded"] = [];
  const addAuth = (ref: string) => { if (!authoritative.some((a) => (normalizeReferenceText(a) ?? norm(a)) === (normalizeReferenceText(ref) ?? norm(ref)))) authoritative.push(ref); };
  let unverifiable = false, invented = false;
  for (const emitted of input.emitted) {
    const n = normalizeReferenceText(emitted);
    if (n === null) {
      if (namedReferenceStated(emitted, input.operativeText)) { classifications.push({ emitted, normalized: null, classification: "EXACT_SOURCE_REFERENCE", statedRefs: [emitted], detail: "named reference stated verbatim in the operative text" }); addAuth(emitted); }
      else { invented = true; classifications.push({ emitted, normalized: null, classification: "MODEL_INVENTED_REFERENCE", statedRefs: [], detail: "named reference does not occur in the operative text" }); excluded.push({ emitted, classification: "MODEL_INVENTED_REFERENCE", restoredTo: null }); }
      continue;
    }
    const sectionStated = stated.filter((s) => s.normalized !== null);
    const exact = sectionStated.find((s) => s.normalized === n);
    if (exact) {
      const textEqual = norm(exact.raw) === norm(emitted);
      classifications.push({ emitted, normalized: n, classification: textEqual ? "EXACT_SOURCE_REFERENCE" : "SOURCE_EQUIVALENT_NORMALIZATION", statedRefs: [exact.raw], detail: textEqual ? "the reference as drafted" : `identity normalization of the drafted reference "${exact.raw}"` });
      addAuth(emitted);
      continue;
    }
    const parent = sectionStated.find((s) => n.startsWith(`${s.normalized}(`) || n.startsWith(`${s.normalized}.`));
    if (parent) {
      classifications.push({ emitted, normalized: n, classification: "MODEL_NARROWED_REFERENCE", statedRefs: [parent.raw], detail: `a sub-clause of the drafted reference "${parent.raw}"; the source states the whole reference - restored to it` });
      excluded.push({ emitted, classification: "MODEL_NARROWED_REFERENCE", restoredTo: parent.raw });
      addAuth(parent.raw);
      continue;
    }
    const children = sectionStated.filter((s) => s.normalized!.startsWith(`${n}(`) || s.normalized!.startsWith(`${n}.`));
    if (children.length > 0) {
      classifications.push({ emitted, normalized: n, classification: "MODEL_BROADENED_REFERENCE", statedRefs: children.map((c) => c.raw), detail: `wider than the drafted reference(s) ${children.map((c) => `"${c.raw}"`).join(", ")}; restored to them` });
      excluded.push({ emitted, classification: "MODEL_BROADENED_REFERENCE", restoredTo: children.map((c) => c.raw).join(" | ") });
      for (const c of children) addAuth(c.raw);
      continue;
    }
    if (stated.length === 0) {
      unverifiable = true;
      classifications.push({ emitted, normalized: n, classification: "SOURCE_REFERENCE_UNVERIFIABLE", statedRefs: [], detail: "the operative text states no section-shaped reference and no inventory lineage names one; kept, not proven" });
      addAuth(emitted);
      continue;
    }
    invented = true;
    classifications.push({ emitted, normalized: n, classification: "MODEL_INVENTED_REFERENCE", statedRefs: [], detail: `related to none of the drafted references (${stated.map((s) => `"${s.raw}"`).join(", ")}); excluded` });
    excluded.push({ emitted, classification: "MODEL_INVENTED_REFERENCE", restoredTo: null });
  }
  return { version: SOURCE_REFERENCE_FIDELITY_VERSION, authoritativeRefs: authoritative, classifications, excluded, unverifiable, invented };
}
