/**
 * REQUIRED DEPENDENCY PREMATERIALIZATION.
 *
 * A paid revalidation failed with one shard ending SHARD_MISSING_CONTEXT although every dependency it
 * asked for resolved deterministically. The property that was missing was never RESOLVABILITY - it was DELIVERY:
 *
 *   - 25 dependencies the planner itself had derived, that were resolvable and that owned material items needed, were
 *     dropped from the initial evidence package because the read-only context budget ran out. Their delivery was left
 *     to an optional model tool call.
 *   - Four further defined terms were never derived at all: they sit two and three hops along a definition chain that
 *     starts at a term which DOES occur in the shard's own owned source, and the planner only modelled one hop from
 *     the Pass-A inventory's own edges.
 *
 * This module makes the dependency set a deterministic, provenance-carrying, transitively closed object computed
 * BEFORE any provider call, so the planner can guarantee delivery instead of hoping for retrieval. Tools remain for
 * genuinely unanticipated dependencies, ambiguity exploration, bounded verification and unexpected traversal.
 *
 * Nothing here is covenant-, section- or instrument-specific: every rule is a structural property of an indexed
 * document (a defined term that occurs in owned text, a section reference that resolves, a forwarding declaration,
 * an inventory edge, a parent clause).
 */
import { computeSourceContentHash } from "../hashing";
import { resolveReferenceTarget } from "../semantic-accountability/reference-resolver";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../semantic-accountability/types";
import type { StructuralIndex } from "../structural-index";
import type { DetectedDefinition } from "../structural-definitions";
import type { SemanticSourceUnit } from "./shard-types";

export const REQUIRED_DEPENDENCY_MODEL_VERSION = "required-dependency-delivery.v1";

/** Typed category of a prematerialized dependency (§8). Ownership is always READ_ONLY_CONTEXT. */
export type RequiredDependencyKind = "REQUIRED_DEFINITION" | "REQUIRED_REFERENCED_SECTION" | "REQUIRED_PARENT_CONTEXT" | "REQUIRED_OPERATIVE_STATE";

/** Why the dependency is deterministically required (§7). Every entry carries at least one. */
export type RequiredDependencyEvidence =
  | "DEFINED_TERM_OCCURRENCE_IN_OWNED_SOURCE"
  | "STRUCTURAL_CROSS_REFERENCE_IN_OWNED_SOURCE"
  | "INVENTORY_REFERENCED_TERM_EDGE"
  | "INVENTORY_REFERENCED_SECTION_EDGE"
  | "INVENTORY_PARENT_EDGE"
  | "FORWARDING_DEFINITION_TARGET"
  | "CROSS_REFERENCE_IN_REQUIRED_DEFINITION"
  | "TRANSITIVE_DEFINITION_CLOSURE";

export type RequiredDependencyDisposition =
  /** Full text is in the shard's initial evidence package, untruncated. */
  | "MATERIALIZED_IN_INITIAL_CONTEXT"
  /** The dependency IS this shard's own primary source - nothing to deliver. */
  | "OWNED_PRIMARY_SOURCE"
  /** Resolvable but larger than the required-entry bound: a provenance-carrying head excerpt is delivered and the
   *  partiality is disclosed in the entry's own reason. Its own closure is NOT expanded (this is what bounds the set). */
  | "BOUNDED_EXCERPT_DISCLOSED"
  /** Genuinely outside the package (another agreement/document). Never fabricated (§12). */
  | "EXTERNAL_REQUIRED_DEPENDENCY"
  /** Resolvable and deliverable, but NOT delivered (the shard's required budget ran out). This is a delivery failure
   *  and is the only disposition that may block a shard from being certified executable. */
  | "UNRESOLVED"
  /** Genuinely not deliverable: no such definition exists in the package, or the reference resolves to more than one
   *  substantive location. Disclosed to the model by name as a bounded limitation and never fabricated (§12/§22). */
  | "UNDELIVERABLE_DISCLOSED";

export interface RequiredDependency {
  /** Stable key, shared with the context entry that delivers it: `term:<normalized>` or `section:<normalized>`. */
  key: string;
  kind: RequiredDependencyKind;
  /** Display identity of the target (the exact defined term, or the section reference as cited). */
  target: string;
  documentId: string;
  sourceNodeId: string | null;
  /** The planner unit that OWNS this dependency's text, when the plan has one - so a required entry still carries cross-shard ownership provenance. */
  sourceUnitKey: string | null;
  absCharStart: number | null;
  absCharEnd: number | null;
  /** The complete dependency text, before any bounding. */
  fullText: string;
  fullTextChars: number;
  fullTextHash: string;
  evidence: RequiredDependencyEvidence[];
  /** Inventory item ids (and/or unit keys) whose semantics need it. */
  requiredBy: string[];
  /** 1 for a dependency evidenced directly by owned source or an owned item's edge; >1 through definition closure. */
  closureDepth: number;
  /** For a closure entry: the key it was reached through. */
  viaKey: string | null;
  disposition: RequiredDependencyDisposition;
  dispositionReason: string;
  /** Chars this dependency actually occupies in the shard's initial context. Set by the planner at admission; absent until then. */
  deliveredChars?: number;
}

export interface RequiredDependencyBudget {
  /** A required dependency at or under this size is delivered in FULL. Above it, a disclosed head excerpt is delivered. */
  maxRequiredEntryChars: number;
  /** Hard ceiling on how much of a shard's read-only context the required tier may consume. */
  maxRequiredContextChars: number;
  /** How far a definition->definition chain is followed. Only entries delivered in full are expanded. */
  maxClosureDepth: number;
  /** Defined terms shorter than this are ignored as occurrence evidence (initialisms/noise). */
  minTermChars: number;
  /**
   * Closure is expanded ONLY through a COMPOSITIONAL definition: one whose body is essentially a list of other
   * defined terms joined by connectives, so it carries no independent content and is meaningless without them
   * ("X means (a) the A Amount; plus (b) the B Amount; plus (c) the C Amount"). This is the share of the body's
   * non-whitespace characters covered by occurrences of other defined terms. A substantive definition that merely
   * mentions other terms (a metric, a long itemized basket) is NOT expanded - that is what bounds the closure.
   */
  compositionalCoverageThreshold: number;
  /** Characters of preceding text inspected for a limit-bearing construction when deciding whether to expand to a term. */
  limitLookbehindChars: number;
}

export const DEFAULT_REQUIRED_DEPENDENCY_BUDGET: RequiredDependencyBudget = {
  maxRequiredEntryChars: 4000,
  maxRequiredContextChars: 10000,
  maxClosureDepth: 3,
  minTermChars: 4,
  compositionalCoverageThreshold: 0.5,
  limitLookbehindChars: 90,
};

// ---------------------------------------------------------------------------
// Occurrence detection
// ---------------------------------------------------------------------------

/**
 * Whitespace-insensitive containment. A defined term's indexed spelling carries the source's own line breaks
 * ("Fixed\nIncremental Amount" is a real indexed term of a real agreement), so raw substring matching silently misses
 * exactly the dependencies that sit across a line wrap - one of the two mechanisms behind the observed failure.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Every defined term of `documentId` that occurs in `text`, whitespace-insensitively, longest spelling first. */
export function definedTermsOccurringIn(text: string, index: StructuralIndex, documentId: string, minTermChars = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.minTermChars): DetectedDefinition[] {
  const haystack = collapseWhitespace(text);
  const out = new Map<string, DetectedDefinition>();
  const defs = index.allDefinitions().filter((d) => d.documentId === documentId && typeof d.exactTerm === "string" && collapseWhitespace(d.exactTerm).length >= minTermChars);
  for (const d of [...defs].sort((a, b) => b.exactTerm.length - a.exactTerm.length || a.normalizedTerm.localeCompare(b.normalizedTerm))) {
    if (out.has(d.normalizedTerm)) continue;
    if (haystack.includes(collapseWhitespace(d.exactTerm))) out.set(d.normalizedTerm, d);
  }
  return [...out.values()];
}

/** Section references written in the owned source itself (e.g. "Section 4.03(a)", "§ 11.07(b)(2)"), normalized and de-duplicated. */
export function sectionReferencesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of collapseWhitespace(text).matchAll(/(?:§+\s*|\bSections?\s+)(\d+(?:\.\d+)+(?:\s*\([^()\s]{1,8}\))*)/gi)) {
    const ref = m[1]!.replace(/\s+/g, "");
    if (ref) out.add(ref);
  }
  return [...out];
}

/**
 * The OPERATIVE BODY of a definition: everything after its definitional verb. A definition's declaration ("“X” means")
 * is not part of what it says, and its length is a function of how long the drafter made the defined term's own name.
 * Measuring body shape over the declaration would therefore make the metric depend on naming, so a long name could
 * silently drop a dependency a short name keeps. Everything before the verb is stripped; a body with no recognisable
 * verb is used whole.
 */
export function definitionBody(text: string): string {
  const t = collapseWhitespace(text);
  const m = /\b(?:means|shall\s+mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|refers?\s+to)\b/i.exec(t);
  return m ? t.slice(m.index + m[0].length) : t;
}

/**
 * Share of a definition body's non-whitespace characters covered by occurrences of OTHER defined terms. High for an
 * aggregating definition that is nothing but a sum of other defined amounts; low for a substantive one. Computed over
 * the operative body only (see definitionBody), so it does not depend on the defined term's own name.
 */
export function compositionalCoverage(body: string, index: StructuralIndex, documentId: string, selfNormalizedTerm: string, minTermChars = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.minTermChars): number {
  const text = definitionBody(body);
  const dense = text.replace(/\s/g, "").length;
  if (dense === 0) return 0;
  let covered = 0;
  for (const d of definedTermsOccurringIn(text, index, documentId, minTermChars)) {
    if (d.normalizedTerm === selfNormalizedTerm) continue;
    const needle = collapseWhitespace(d.exactTerm);
    const dn = needle.replace(/\s/g, "").length;
    let i = 0, n = 0;
    while ((i = text.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
    covered += dn * n;
  }
  return Math.min(1, covered / dense);
}

/**
 * Standard drafting constructions that make the FOLLOWING defined term the operative limit, scope or measure of the
 * clause it sits in ("does not exceed ... the X Cap", "up to the Y Amount", "the greater of ... and the Z Amount").
 * Generic legal-English drafting, not tied to any covenant, section or instrument.
 */
const LIMIT_BEARING = /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|may\s+not\s+exceed|in\s+excess\s+of|up\s+to|greater\s+of|lesser\s+of|less\s+than|no\s+more\s+than|limited\s+to|within\s+the|subject\s+to\s+the|equal\s+to|incurred\s+within|capped\s+at|maximum\s+of)\b/i;

/** True when `term` occurs in `body` immediately after a limit-bearing construction. */
export function occursInLimitBearingPosition(body: string, term: string, lookbehind = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.limitLookbehindChars): boolean {
  const text = collapseWhitespace(body);
  const needle = collapseWhitespace(term);
  let i = 0;
  while ((i = text.indexOf(needle, i)) >= 0) {
    if (LIMIT_BEARING.test(text.slice(Math.max(0, i - lookbehind), i))) return true;
    i += needle.length;
  }
  return false;
}

const normTerm = (t: string) => collapseWhitespace(t).toLowerCase().trim();
const normSection = (r: string) => r.replace(/^\s*(?:§+|Sections?|Secs?\.?)\s*/i, "").replace(/\s+/g, "").toLowerCase();

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export interface DeriveRequiredDependenciesInput {
  shardUnits: SemanticSourceUnit[];
  /** Region-relative text of the units this shard owns, concatenated in source order. */
  ownedText: string;
  ownedItemIds: string[];
  inventory: FrozenSemanticInventory;
  index: StructuralIndex | null;
  documentId: string;
  sourceContext: SourceContextResult;
  itemOwnerUnit: Map<string, string>;
  ownedUnitKeys: Set<string>;
  /** Every unit in the plan (not just this shard's), so a delivered dependency can name the unit - and therefore the shard - that owns it. */
  allUnits?: SemanticSourceUnit[];
  budget?: RequiredDependencyBudget;
  /** Document ids the package actually contains; a reference outside them is EXTERNAL, never a planner defect (§12). */
  packageDocumentIds?: string[];
}

/**
 * The deterministic REQUIRED set for one shard, transitively closed and bounded. Pure: no model call, no I/O.
 */
export function deriveRequiredDependencies(input: DeriveRequiredDependenciesInput): RequiredDependency[] {
  const budget = input.budget ?? DEFAULT_REQUIRED_DEPENDENCY_BUDGET;
  const { index, documentId, ownedText } = input;
  const out = new Map<string, RequiredDependency>();
  if (!index) return [];

  const byId = new Map(input.inventory.items.map((i) => [i.inventoryItemId, i]));
  const ownedItems = input.ownedItemIds.map((id) => byId.get(id)).filter((x): x is SemanticInventoryItem => !!x);
  const ownedTermKeys = new Set(input.shardUnits.map((u) => u.normalizedTermName).filter((x): x is string => !!x));
  const ownedSectionKeys = new Set(input.shardUnits.map((u) => (u.sectionRef ? normSection(u.sectionRef) : null)).filter((x): x is string => !!x));
  const ownedNodeIds = new Set(input.shardUnits.map((u) => u.sourceNodeId).filter((x): x is string => !!x));
  const fullTextOf = (exactTerm: string) => index.getDefinitionFullText(exactTerm, documentId) ?? "";
  const allUnits = input.allUnits ?? input.shardUnits;
  const unitByTerm = new Map(allUnits.filter((u) => u.normalizedTermName).map((u) => [u.normalizedTermName!, u.unitKey]));
  const unitBySection = new Map(allUnits.filter((u) => u.sectionRef).map((u) => [normSection(u.sectionRef!), u.unitKey]));
  const unitByNode = new Map(allUnits.filter((u) => u.sourceNodeId).map((u) => [u.sourceNodeId!, u.unitKey]));

  const record = (d: Omit<RequiredDependency, "disposition" | "dispositionReason" | "fullTextChars" | "fullTextHash" | "sourceUnitKey"> & { sourceUnitKey?: string | null }): RequiredDependency => {
    const existing = out.get(d.key);
    if (existing) {
      for (const e of d.evidence) if (!existing.evidence.includes(e)) existing.evidence.push(e);
      for (const r of d.requiredBy) if (!existing.requiredBy.includes(r)) existing.requiredBy.push(r);
      existing.closureDepth = Math.min(existing.closureDepth, d.closureDepth);
      return existing;
    }
    const chars = d.fullText.length;
    const entry: RequiredDependency = {
      ...d,
      sourceUnitKey: d.sourceUnitKey ?? (d.key.startsWith("term:") ? unitByTerm.get(d.key.slice(5)) ?? null : d.key.startsWith("section:") ? unitBySection.get(d.key.slice(8)) ?? null : null) ?? (d.sourceNodeId ? unitByNode.get(d.sourceNodeId) ?? null : null),
      fullTextChars: chars, fullTextHash: computeSourceContentHash(d.fullText),
      disposition: chars === 0 ? "UNDELIVERABLE_DISCLOSED" : chars <= budget.maxRequiredEntryChars ? "MATERIALIZED_IN_INITIAL_CONTEXT" : "BOUNDED_EXCERPT_DISCLOSED",
      dispositionReason: chars === 0 ? "no resolvable text" : chars <= budget.maxRequiredEntryChars ? `delivered in full (${chars} chars <= required-entry bound ${budget.maxRequiredEntryChars})` : `${chars} chars exceeds the required-entry bound ${budget.maxRequiredEntryChars}: a provenance-carrying head excerpt is delivered and its partiality disclosed; its own closure is not expanded`,
    };
    out.set(d.key, entry);
    return entry;
  };

  const addSection = (ref: string, requiredBy: string[], evidence: RequiredDependencyEvidence, depth: number, viaKey: string | null) => {
    const key = normSection(ref);
    if (!key || ownedSectionKeys.has(key)) return;
    const existing = out.get(`section:${key}`);
    if (existing) { record({ ...existing, evidence: [evidence], requiredBy, closureDepth: depth, viaKey: existing.viaKey }); return; }
    const region = input.sourceContext.regions.find((r) => r.kind !== "OPERATIVE" && r.sectionRef && normSection(r.sectionRef) === key);
    if (region) { record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId: region.documentId, sourceNodeId: region.sourceNodeId ?? null, absCharStart: region.charStart, absCharEnd: region.charEnd, fullText: region.text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey }); return; }
    const referrerNodeId = input.shardUnits.find((u) => u.sourceNodeId)?.sourceNodeId ?? null;
    const r = resolveReferenceTarget(index, documentId, key, { fromNodeId: referrerNodeId });
    if (r.node) {
      if (ownedNodeIds.has(r.node.nodeId)) return;
      const text = index.getNodeText(r.node.nodeId, "DESCENDANTS");
      record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId, sourceNodeId: r.node.nodeId, absCharStart: r.node.charStart, absCharEnd: r.node.charStart + text.length, fullText: text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey });
      return;
    }
    const e = record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId, sourceNodeId: null, absCharStart: null, absCharEnd: null, fullText: "", evidence: [evidence], requiredBy, closureDepth: depth, viaKey });
    e.disposition = "UNDELIVERABLE_DISCLOSED";
    e.dispositionReason = r.status === "AMBIGUOUS" ? `section ${ref} matches ${r.candidateNodeIds.length} substantive physical locations - never guessed (${r.note})` : `section ${ref} has no structural occurrence in ${documentId}`;
  };

  const addTerm = (def: DetectedDefinition | undefined, cited: string, requiredBy: string[], evidence: RequiredDependencyEvidence, depth: number, viaKey: string | null) => {
    if (!def) {
      const key = `term:${normTerm(cited)}`;
      if (out.has(key) || ownedTermKeys.has(normTerm(cited))) return;
      const e = record({ key, kind: "REQUIRED_DEFINITION", target: cited, documentId, sourceNodeId: null, absCharStart: null, absCharEnd: null, fullText: "", evidence: [evidence], requiredBy, closureDepth: depth, viaKey });
      e.disposition = "UNDELIVERABLE_DISCLOSED";
      e.dispositionReason = `no detected definition of "${cited}" in ${documentId}`;
      return;
    }
    if (ownedTermKeys.has(def.normalizedTerm)) return;
    const text = fullTextOf(def.exactTerm);
    const entry = record({ key: `term:${def.normalizedTerm}`, kind: "REQUIRED_DEFINITION", target: def.exactTerm, documentId, sourceNodeId: def.sourceNodeId ?? null, absCharStart: def.charStart, absCharEnd: def.charStart + text.length, fullText: text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey });
    // A FORWARDING declaration carries no body: its target is required by the same items, one bounded hop.
    if (def.forwardingTarget?.kind === "SECTION") addSection(def.forwardingTarget.ref, requiredBy, "FORWARDING_DEFINITION_TARGET", depth + 1, entry.key);
    else if (def.forwardingTarget?.kind === "DEFINITION") addTerm(index.getDefinition(def.forwardingTarget.ref, documentId), def.forwardingTarget.ref, requiredBy, "FORWARDING_DEFINITION_TARGET", depth + 1, entry.key);
  };

  // (1) defined terms occurring verbatim in this shard's own owned source
  for (const def of definedTermsOccurringIn(ownedText, index, documentId, budget.minTermChars)) addTerm(def, def.exactTerm, input.ownedUnitKeys.size ? [...input.ownedUnitKeys] : input.ownedItemIds, "DEFINED_TERM_OCCURRENCE_IN_OWNED_SOURCE", 1, null);
  // (2) section references written in the owned source
  for (const ref of sectionReferencesIn(ownedText)) addSection(ref, [...input.ownedUnitKeys], "STRUCTURAL_CROSS_REFERENCE_IN_OWNED_SOURCE", 1, null);
  // (3) the inventory's own edges for the owned items
  for (const it of ownedItems) {
    for (const t of it.referencedTerms ?? []) addTerm(index.getDefinition(t, documentId), t, [it.inventoryItemId], "INVENTORY_REFERENCED_TERM_EDGE", 1, null);
    for (const s of it.referencedSections ?? []) addSection(s, [it.inventoryItemId], "INVENTORY_REFERENCED_SECTION_EDGE", 1, null);
    if (it.parentItemId) {
      const ownerUnit = input.itemOwnerUnit.get(it.parentItemId);
      const parent = byId.get(it.parentItemId);
      if (parent && ownerUnit && !input.ownedUnitKeys.has(ownerUnit)) {
        const text = `[${parent.semanticRole}/${parent.materiality}] ${parent.proposition} (${parent.sourceSpan.sourceCitation}: "${parent.sourceSpan.excerpt}")`;
        record({ key: `parent-item:${it.parentItemId}`, kind: "REQUIRED_PARENT_CONTEXT", target: it.parentItemId, documentId: parent.sourceSpan.documentId, sourceNodeId: parent.sourceSpan.sourceNodeId ?? null, sourceUnitKey: ownerUnit, absCharStart: null, absCharEnd: null, fullText: text, evidence: ["INVENTORY_PARENT_EDGE"], requiredBy: [it.inventoryItemId], closureDepth: 1, viaKey: null });
      }
    }
  }
  // (4) bounded transitive closure: only through dependencies delivered IN FULL, so the set cannot explode
  for (let depth = 2; depth <= budget.maxClosureDepth; depth++) {
    // Expand ONLY through a dependency delivered in full, and only along an edge that is itself required:
    //  - the parent is COMPOSITIONAL (it is nothing but a sum of other defined terms, so it is meaningless alone), or
    //  - the child occurs in the parent in a LIMIT-BEARING position (it IS the parent's operative ceiling/measure).
    // A substantive definition that merely mentions other terms is never expanded - that is what bounds the closure.
    const frontier = [...out.values()].filter((d) => d.closureDepth === depth - 1 && d.kind === "REQUIRED_DEFINITION" && d.disposition === "MATERIALIZED_IN_INITIAL_CONTEXT" && d.fullText.length > 0);
    for (const parent of frontier) {
      // An explicit section pointer written INSIDE a required definition is itself required: the definition cannot be
      // applied without the provision it points at. One hop, bounded like any other section entry, never expanded further.
      for (const ref of sectionReferencesIn(parent.fullText)) addSection(ref, parent.requiredBy, "CROSS_REFERENCE_IN_REQUIRED_DEFINITION", depth, parent.key);
      const parentIsCompositional = compositionalCoverage(parent.fullText, index, documentId, normTerm(parent.target), budget.minTermChars) >= budget.compositionalCoverageThreshold;
      for (const def of definedTermsOccurringIn(parent.fullText, index, documentId, budget.minTermChars)) {
        if (def.normalizedTerm === normTerm(parent.target)) continue;
        if (out.has(`term:${def.normalizedTerm}`)) continue;
        if (!parentIsCompositional && !occursInLimitBearingPosition(parent.fullText, def.exactTerm, budget.limitLookbehindChars)) continue;
        addTerm(def, def.exactTerm, parent.requiredBy, "TRANSITIVE_DEFINITION_CLOSURE", depth, parent.key);
      }
    }
  }
  // (5) external classification (§12): a dependency naming a document the package does not contain is not a planner defect
  const pkg = new Set(input.packageDocumentIds ?? [documentId]);
  for (const d of out.values()) {
    if (d.disposition !== "UNDELIVERABLE_DISCLOSED") continue;
    if (d.kind === "REQUIRED_DEFINITION" && /\b(?:agreement|indenture|credit facility|notes?)\b/i.test(d.target) && !pkg.has(d.target)) {
      d.disposition = "EXTERNAL_REQUIRED_DEPENDENCY";
      d.dispositionReason = `"${d.target}" names an instrument outside this package; represented explicitly as an external required dependency and never fabricated`;
    }
  }
  return [...out.values()].sort((a, b) => a.closureDepth - b.closureDepth || b.requiredBy.length - a.requiredBy.length || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Certificate (§11)
// ---------------------------------------------------------------------------

export type ShardDependencyCertificateStatus = "CERTIFIED_EXECUTABLE" | "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE";

export interface ShardDependencyCertificate {
  modelVersion: string;
  shardId: string;
  requiredDependenciesTotal: number;
  requiredDependenciesResolved: number;
  requiredDependenciesMaterialized: number;
  requiredDependenciesBoundedExcerpt: number;
  requiredDependenciesOwnedPrimarySource: number;
  requiredDependenciesExternal: number;
  /** Genuinely not deliverable (absent from the package / ambiguous), disclosed by name. Does NOT block executability. */
  requiredDependenciesUndeliverableDisclosed: number;
  /** Deliverable but NOT delivered. Must be 0 for a shard to be executable - this is the property the failure was about. */
  requiredDependenciesUnresolved: number;
  requiredDependencyChars: number;
  optionalContextChars: number;
  /** How the required tier was sized for this shard (§10): its capacity ceiling, the per-entry allowance water-filling settled on, and whether any reduction was needed at all. */
  requiredTierAllocation: { ceilingChars: number; perEntryAllowanceChars: number; waterFilled: boolean };
  /** Required dependencies whose delivery a tool call would otherwise have had to discover. Must be empty to certify. */
  undelivered: { key: string; disposition: RequiredDependencyDisposition; reason: string; requiredBy: number }[];
  certificateStatus: ShardDependencyCertificateStatus;
}

/** A required dependency counts as DELIVERED when its text is in the initial package (in full or as a disclosed bounded excerpt), it is the shard's own primary source, or it is explicitly external. A tool route alone never counts. */
export function isDelivered(d: RequiredDependency): boolean {
  return d.disposition === "MATERIALIZED_IN_INITIAL_CONTEXT" || d.disposition === "OWNED_PRIMARY_SOURCE" || d.disposition === "BOUNDED_EXCERPT_DISCLOSED" || d.disposition === "EXTERNAL_REQUIRED_DEPENDENCY" || d.disposition === "UNDELIVERABLE_DISCLOSED";
}

/** Dispositions that need no context entry: nothing to deliver, or the shard already owns the text. */
const NEEDS_NO_ENTRY = new Set<RequiredDependencyDisposition>(["OWNED_PRIMARY_SOURCE", "EXTERNAL_REQUIRED_DEPENDENCY", "UNDELIVERABLE_DISCLOSED"]);

export function buildShardDependencyCertificate(shardId: string, required: RequiredDependency[], deliveredKeys: Set<string>, optionalContextChars: number, requiredDependencyChars: number, requiredTierAllocation: { ceilingChars: number; perEntryAllowanceChars: number; waterFilled: boolean }): ShardDependencyCertificate {
  const count = (p: (d: RequiredDependency) => boolean) => required.filter(p).length;
  const undelivered = required.filter((d) => !NEEDS_NO_ENTRY.has(d.disposition) && !deliveredKeys.has(d.key)).map((d) => ({ key: d.key, disposition: d.disposition, reason: d.dispositionReason, requiredBy: d.requiredBy.length }));
  return {
    modelVersion: REQUIRED_DEPENDENCY_MODEL_VERSION,
    shardId,
    requiredDependenciesTotal: required.length,
    requiredDependenciesResolved: count((d) => d.disposition !== "UNRESOLVED" && d.disposition !== "UNDELIVERABLE_DISCLOSED"),
    requiredDependenciesMaterialized: count((d) => d.disposition === "MATERIALIZED_IN_INITIAL_CONTEXT" && deliveredKeys.has(d.key)),
    requiredDependenciesBoundedExcerpt: count((d) => d.disposition === "BOUNDED_EXCERPT_DISCLOSED" && deliveredKeys.has(d.key)),
    requiredDependenciesOwnedPrimarySource: count((d) => d.disposition === "OWNED_PRIMARY_SOURCE"),
    requiredDependenciesExternal: count((d) => d.disposition === "EXTERNAL_REQUIRED_DEPENDENCY"),
    requiredDependenciesUndeliverableDisclosed: count((d) => d.disposition === "UNDELIVERABLE_DISCLOSED"),
    requiredDependenciesUnresolved: undelivered.length,
    requiredDependencyChars,
    optionalContextChars,
    requiredTierAllocation,
    undelivered,
    certificateStatus: undelivered.length === 0 ? "CERTIFIED_EXECUTABLE" : "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE",
  };
}
