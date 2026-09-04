/**
 * SEMANTIC ACCOUNTABILITY (Phase 3 closure architecture) - shared types.
 *
 * The accountability chain this module family implements:
 *
 *   SOURCE -> SEMANTIC INVENTORY (Pass A) -> COMPOSED IR (Pass B, the existing
 *   General Covenant IR + additive lineage) -> DETERMINISTIC RECONCILIATION
 *   (Pass C) -> INDEPENDENT VERIFICATION (Phase 3C, untouched) -> TRUST STATUS.
 *
 * NOT A SECOND COVENANT MODEL (mission §2): the inventory is deliberately
 * FLATTER and SIMPLER than the IR. It enumerates material source components
 * and accounts for them; it never carries IRExpression/IRRule/IRDefinition/
 * IRCondition/IRException/IRSharedCapacity shape, and it never computes.
 *
 * INDEPENDENCE CONTRACT (mission §4, §28):
 *  - Pass A (inventory.ts, quantitative.ts, source-context.ts, prompt.ts,
 *    wire-schema.ts) derives ONLY from source text + resolved source context.
 *    Those files may not import semantic/compile, semantic/normalize,
 *    semantic/caller, semantic-verification/*, semantic-precedent/*, or
 *    ir/types - enforced by tests/contract-model/semantic-accountability-
 *    independence.test.ts (static import-boundary check, the same technique
 *    every other independent layer in this codebase uses).
 *  - Pass C (reconciliation.ts, rollup.ts) may read the final compiled IR
 *    (type-only) as a COMPARISON TARGET, never as a discovery input.
 *  - The independent verifier (semantic-verification/*) is not modified and
 *    never consumes this module's conclusions.
 *
 * FREEZE-BEFORE-COMPOSE: a FrozenSemanticInventory is content-hashed before
 * Pass B ever sees it, so reconciliation can never be circular.
 */

/**
 * v3 (source-coverage repair): the eligibility filters of v2 are gone. Coverage now runs over EVERY region of the
 * semantic unit, every character is assigned a deterministic disposition, and the default is UNACCOUNTED_SOURCE -
 * no vocabulary, length floor, coverage threshold or region label can make material text ineligible for scrutiny.
 * Item-id derivation is unchanged in shape but carries this version, so ids are re-keyed relative to v2/v1
 * evidence (cross-run comparison is semantic, never by exact id).
 */
/**
 * v4 (F-5, Phase 3 Chewy remediation 4): Pass A inventories deterministic SOURCE SLOTS (slots.ts) instead of
 * one free-form pass over the whole unit; item identity is keyed by slot + coordination sub-index + role +
 * values rather than by the model's own excerpt boundaries; same-key items merge deterministically; the gap
 * pass re-presents whole slots. Ids are re-keyed relative to v3 evidence (cross-run comparison is semantic).
 */
export const SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION = "semantic-accountability.v4";
export const SEMANTIC_INVENTORY_PROMPT_VERSION = "semantic-inventory-prompt.v4";

// ---------------------------------------------------------------------------
// Semantic roles (mission §3) - compact semantic PRIMITIVES, never covenant
// templates. A new drafting shape is a new instance of one of these, never a
// new role.
// ---------------------------------------------------------------------------

export const SEMANTIC_ROLES = ["VALUE", "FORMULA_COMPONENT", "THRESHOLD", "CONDITION", "EXCEPTION", "PERMISSION", "PROHIBITION", "REQUIREMENT", "ALTERNATIVE", "TRIGGER", "TIME_PERIOD", "DEPENDENCY", "REFERENCE", "RECLASSIFICATION", "SHARED_CAP", "CURE", "OTHER"] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

export const INVENTORY_MATERIALITIES = ["CRITICAL", "MATERIAL", "INFORMATIONAL", "REVIEW_UNCERTAIN"] as const;
export type InventoryMateriality = (typeof INVENTORY_MATERIALITIES)[number];

export const INVENTORY_AMBIGUITIES = ["NONE", "AMBIGUOUS_DRAFTING", "AMBIGUOUS_REFERENCE", "UNCERTAIN_MATERIALITY"] as const;
export type InventoryAmbiguity = (typeof INVENTORY_AMBIGUITIES)[number];

export const OPERATIVE_FLAGS = ["OPERATIVE", "DEFINITIONAL", "UNKNOWN"] as const;
export type OperativeFlag = (typeof OPERATIVE_FLAGS)[number];

// ---------------------------------------------------------------------------
// Quantitative values (mission §6) - explicit source accounting for every
// material number. Kinds are generic units, never covenant concepts.
// ---------------------------------------------------------------------------

export const QUANTITATIVE_KINDS = ["MONEY", "PERCENT", "RATIO", "DAYS", "DATE", "PERIOD", "MULTIPLIER", "NUMBER", "OTHER"] as const;
export type QuantitativeKind = (typeof QUANTITATIVE_KINDS)[number];

export interface QuantitativeValue {
  kind: QuantitativeKind;
  /** Exactly as written in the source ("$50,000,000", "15%", "4.50 to 1.00", "ninety (90) days"). */
  rawText: string;
  /** Safely normalized where possible (money as a plain number in stated currency units; percent as a fraction; ratio as x-to-one; days as a count); null when normalization is not safe. */
  normalizedValue: number | null;
  /** "USD", "%", "x", "days", ISO date, etc. - or null when the unit is not determinable. */
  unit: string | null;
  /** Offsets into the SourceSpan.regionId's own text. -1 when the value could not be located verbatim. */
  charStart: number;
  charEnd: number;
}

// ---------------------------------------------------------------------------
// Source spans / provenance (mission §1: "where did this proposition come from")
// ---------------------------------------------------------------------------

export interface InventorySourceSpan {
  /** Which source-context region this span lives in (see SourceContextRegion.regionId; "operative" for the unit's own operative text). */
  regionId: string;
  documentId: string;
  /** Real physical structural occurrence identity when the region is node-anchored; null for a raw-offset region. */
  sourceNodeId: string | null;
  sectionRef: string | null;
  /** Offsets into that region's own text. */
  charStart: number;
  charEnd: number;
  sourceCitation: string;
  /** Verbatim excerpt - verified to be a real substring of the region text before an item is ever trusted. */
  excerpt: string;
}

// ---------------------------------------------------------------------------
// The inventory item (mission §3)
// ---------------------------------------------------------------------------

export interface SemanticInventoryItem {
  /** Deterministic, content-derived (candidateRef + role + verbatim span + normalized values) - never array position, never the model's free-text proposition. */
  inventoryItemId: string;
  sourceSpan: InventorySourceSpan;
  semanticRole: SemanticRole;
  /** Plain-language statement of the single atomic proposition this item carries. */
  proposition: string;
  quantitativeValues: QuantitativeValue[];
  referencedTerms: string[];
  /** Explicit section/clause references the proposition depends on ("Section 6.01(b)", "clause (x)"). */
  referencedSections: string[];
  parentItemId: string | null;
  relatedItemIds: string[];
  materiality: InventoryMateriality;
  ambiguity: InventoryAmbiguity;
  ambiguityReason: string | null;
  operative: OperativeFlag;
  detectionMethod: "MODEL" | "DETERMINISTIC_VALUE_SCAN";
  /** F-5 (v4): the deterministic source slot (slots.ts) this item's primary span starts in - its identity anchor. Absent on v3-and-earlier evidence. */
  slotId?: string;
  /** F-5 (v4): how many same-key wire items were merged into this one (0 when none). */
  mergedDuplicates?: number;
}

/** INVENTORY_COVERAGE_GAP (v3): the inventory ran, but after the bounded gap re-inventory at least one stretch of source in the semantic unit is still UNACCOUNTED_SOURCE - no item anchors it, no structural parent/child or external-ownership link discharges it, and no deterministic rule classifies it as non-semantic. Accountability for that text is NOT established; the residual spans are listed in unaccountedSource. Never treated as INVENTORY_OK. */
export type InventoryStatus = "INVENTORY_OK" | "INVENTORY_COVERAGE_GAP" | "INVENTORY_EMPTY_SUSPECT" | "INVENTORY_FAILED" | "INVENTORY_SKIPPED_NO_PROVIDER";

/**
 * A stretch of source in ANY region of the semantic unit that nothing accounts for: no CRITICAL/MATERIAL
 * inventory item anchors it, no structural parent/child relationship discharges it, no other semantic unit owns
 * it by a recorded link, and no deterministic rule classifies it as non-semantic (punctuation, connective glue,
 * a heading, a bare citation, a defined-term label, page furniture). Surfaced with verified offsets, never
 * dropped, never auto-declared material and never auto-declared immaterial.
 */
export interface UnaccountedSourceSpan {
  regionId: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  /** Deterministic explanation of why nothing accounts for this text. */
  reason: string;
  /** Quantitative values inside it - present or absent, they never gate whether the span is reported. */
  values: QuantitativeValue[];
}

/** Whole-unit source-coverage accounting: how much of each region's source reached which disposition. */
export interface SourceCoverageSummary {
  regionsConsidered: string[];
  countsByDisposition: Record<string, number>;
  charsByDisposition: Record<string, number>;
  /** Non-whitespace characters that reached an accounted disposition, over all non-whitespace characters. */
  accountedCharFraction: number;
  /** Regions discharged by an explicit external-ownership link (§9 option A), with their owners. */
  externallyAccountedRegions: { regionId: string; ownerCandidateRef: string; ownerInventoryHash: string }[];
}

/** Disclosure of the bounded gap re-inventory step (v2). `attempted` is false when the first pass left no uncovered segment (no second call was made). */
export interface GapReinventoryRecord {
  attempted: boolean;
  segmentsBefore: number;
  itemsAdded: number;
  duplicatesDropped: number;
  unverifiableDropped: number;
  segmentsAfter: number;
  costUsd: number | null;
  error: string | null;
}

export interface FrozenSemanticInventory {
  candidateRef: string;
  items: SemanticInventoryItem[];
  /** Quantitative values the deterministic scanner found in the source that NO model-inventoried item covers - surfaced, never dropped, never auto-declared material (mission §6). */
  uninventoriedValues: (QuantitativeValue & { regionId: string })[];
  /** Operative-text segments still uncovered after the gap re-inventory (v2) - the inventory's own disclosure of what it did not account for. Empty when coverage accounting found no residual gap. */
  /** Every stretch of source in the unit that nothing accounts for. Empty is the only value compatible with semantic completeness. */
  unaccountedSource: UnaccountedSourceSpan[];
  /** Whole-unit coverage accounting, for disclosure and for the freeze hash. */
  sourceCoverage: SourceCoverageSummary;
  gapReinventory: GapReinventoryRecord | null;
  inventoryStatus: InventoryStatus;
  inventoryStatusReason: string;
  /** Model-proposed items whose excerpt was not a real substring of any region text - discarded, counted (anti-hallucination gate). */
  rejectedUnverifiableItems: number;
  /** Model-proposed items dropped because they duplicated an already-accepted item's role + span. */
  rejectedDuplicateItems: number;
  sourceContextState: SourceContextState;
  frozenContentHash: string;
  frozenAt: string;
  algorithmVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  telemetryCostUsd: number | null;
  /** F-5 (v4): the deterministic slot partition Pass A inventoried against, and how many bounded calls it took. Absent on v3-and-earlier evidence. */
  partition?: { methods: Record<string, string>; slots: { slotId: string; regionId: string; sectionRef: string | null; charStart: number; charEnd: number }[]; batches: number; batchChars: number; gapBatches: number; firstPassCalls: number; gapCalls: number };
}

// ---------------------------------------------------------------------------
// Source-context sufficiency (mission §12/§13)
// ---------------------------------------------------------------------------

export type SourceContextState = "COMPLETE_LOCAL_SOURCE" | "DEPENDENCY_EXPANDED_SOURCE" | "TRUNCATED_SOURCE" | "STRUCTURALLY_INCOMPLETE_SOURCE" | "UNKNOWN_SOURCE_COMPLETENESS";

export type SourceContextRegionKind = "OPERATIVE" | "CROSS_REFERENCE_EXPANSION" | "ENCLOSING_NODE_EXPANSION";

export interface SourceContextRegion {
  regionId: string;
  kind: SourceContextRegionKind;
  documentId: string;
  sourceNodeId: string | null;
  sectionRef: string | null;
  charStart: number;
  charEnd: number;
  text: string;
  /** For an expansion: the exact reference text in the operative unit that justified it, and how it was resolved. */
  expandedFor: { referenceText: string; resolution: ReferenceResolutionStatus; note: string } | null;
  truncatedAtBudget: boolean;
  /** For the OPERATIVE region (mission §13 compilation-unit strategy): when the supplied window was extended to its real unit boundary, the original window and the boundary kind that justified the extension. Null when the region is exactly what was supplied. */
  unitExtension: { originalCharStart: number; originalCharEnd: number; unitBoundary: "ANCHOR_NODE" | "DEFINITION_SPAN"; note: string } | null;
}

export type ReferenceResolutionStatus = "UNIQUE" | "UNIQUE_AFTER_DEGENERATE_EXCLUSION" | "RESOLVED_VIA_ENCLOSING_NODE" | "AMBIGUOUS" | "NOT_FOUND" | "OUT_OF_SCOPE";

export interface UnresolvedSourceReference {
  referenceText: string;
  normalizedRef: string;
  status: ReferenceResolutionStatus;
  reason: string;
  candidateNodeIds: string[];
}

export interface SourceContextResult {
  state: SourceContextState;
  regions: SourceContextRegion[];
  unresolvedReferences: UnresolvedSourceReference[];
  /** Evidence for TRUNCATED_SOURCE / STRUCTURALLY_INCOMPLETE_SOURCE, always populated when the state is one of those. */
  reasons: string[];
  /** Total characters handed to Pass A/Pass B across all regions. */
  totalChars: number;
  budgetChars: number;
}

// ---------------------------------------------------------------------------
// Pass C - deterministic reconciliation (mission §9/§10)
// ---------------------------------------------------------------------------

export const INVENTORY_DISPOSITIONS = ["REPRESENTED", "INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED", "AMBIGUOUS", "MISSING_FROM_COMPOSITION"] as const;
export type InventoryDisposition = (typeof INVENTORY_DISPOSITIONS)[number];

export type QuantitativeDisposition = "VALUE_PRESENT_IN_IR" | "VALUE_DISPOSITIONED" | "VALUE_MISSING_FROM_COMPOSITION";

export interface ReconciliationItem {
  inventoryItemId: string;
  semanticRole: SemanticRole;
  materiality: InventoryMateriality;
  disposition: InventoryDisposition;
  /** IR paths whose lineage claims this item (rules[i].capacityExpression..., definitions[j], sharedCapacities[k], rules[i].unresolvedDependencies[n]). */
  lineageIrPaths: string[];
  /** The composition's own explicit disposition for this item, if it gave one (tolerant string, normalized). */
  modelDisposition: string | null;
  quantitative: { value: QuantitativeValue; disposition: QuantitativeDisposition; irPaths: string[] }[];
  reason: string;
}

export interface SemanticAccountabilityResult {
  candidateRef: string;
  inventoryStatus: InventoryStatus;
  sourceContextState: SourceContextState;
  items: ReconciliationItem[];
  counts: {
    inventoried: number;
    material: number;
    represented: number;
    intentionallyNonComputational: number;
    unsupported: number;
    ambiguous: number;
    missingFromComposition: number;
    materialMissingFromComposition: number;
    criticalMissingFromComposition: number;
    materialQuantitativeValues: number;
    materialQuantitativeValuesMissing: number;
    uninventoriedValues: number;
    /** Stretches of source Pass A itself could not account for (FrozenSemanticInventory.unaccountedSource) - disclosed here so a unit's accountability result carries its own inventory gap, never only a status string. */
    unaccountedSource: number;
    /** IR lineage references to inventoryItemIds that do not exist in the frozen inventory - a composition claiming credit for a component the inventory never had. */
    danglingLineageReferences: number;
    /** A lineage/disposition reference the composition gave WITHOUT its "tag:" prefix but whose content digest matched a real frozen item - resolved, not counted as dangling, but disclosed for audit (mission independence: canonicalization is deterministic string matching on the item's own stable content hash, never a model judgment). */
    canonicalizedLineageReferences: number;
  },
  /** True only when: inventory ran (INVENTORY_OK), source context is not TRUNCATED/STRUCTURALLY_INCOMPLETE/UNKNOWN, every material item has a non-MISSING disposition, every material value is present or dispositioned, and no dangling lineage. */
  semanticallyComplete: boolean;
  reasons: string[];
  algorithmVersion: string;
}

// ---------------------------------------------------------------------------
// Agreement-level rollup (mission §26)
// ---------------------------------------------------------------------------

export type AgreementSemanticStatus = "SEMANTICALLY_COMPLETE" | "SEMANTICALLY_INCOMPLETE" | "REVIEW_REQUIRED";

export interface AgreementUnitInput {
  candidateRef: string;
  compileStatus: string;
  verifyStatus: string | null;
  accountability: SemanticAccountabilityResult | null;
  /** Operative-state uncertainty for this unit (OPERATIVE_STATE_UNRESOLVED / CONFLICTED / REVIEW_REQUIRED), when known. */
  operativeStateUncertain: boolean;
  unresolvedCrossReferences: number;
}

export interface AgreementLevelResult {
  status: AgreementSemanticStatus;
  reasons: string[];
  units: { candidateRef: string; unitStatus: AgreementSemanticStatus; reasons: string[] }[];
  counts: { units: number; complete: number; incomplete: number; reviewRequired: number; materialMissingFromComposition: number; unresolvedCrossReferences: number };
}
