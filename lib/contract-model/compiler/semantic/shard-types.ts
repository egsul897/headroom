/**
 * F-7A (Phase 3 Chewy remediation 7, part A) - BOUNDED COMPILATION SHARDS: shared types.
 *
 * The finding this architecture answers (F-7): the semantic compiler (Pass B) sends ONE compilation unit - the whole
 * discovered section, e.g. Chewy Section 1.01 at 353,523 chars / 379 definitions - as ONE model conversation, so
 * input tokens, output tokens, stream-failure risk and cost concentrate in a single atomic call, and one provider
 * failure loses the entire unit's result (docs/phase-3-remediation-f7a/00-current-large-unit-shape.json).
 *
 * A COMPILATION SHARD is NOT a new Pass A discovery boundary: Pass A (frozen inventory, F-5 ensemble) is unchanged
 * and already established what the source contains. A shard only bounds how much ALREADY-ACCOUNTABLE source is
 * compiled in one model interaction. Shard boundaries are owned by the source and the frozen inventory
 * (structural definitions, structural nodes, inventory spans, parent/child and shared-capacity links) - never by a
 * model and never by a token count that could cut a semantic proposition in half.
 *
 * Nothing in this module family is specific to any agreement, term, section or covenant family.
 */
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../ir/types";
import type { FrozenSemanticInventory, SemanticAccountabilityResult, SemanticInventoryItem, SourceContextResult, SourceContextState } from "../semantic-accountability/types";
import type { SemanticCompilerFailureReason, SemanticCompilerInput } from "./types";

export const SHARD_PLANNER_ALGORITHM_VERSION = "semantic-compilation-shards.v1";

/**
 * Deterministic token estimate for a rendered compiler conversation: tokens per rendered character, CALIBRATED on the
 * three recorded Chewy first turns (cost-ledger compile:turn input tokens vs. the byte-exact first turn re-rendered
 * by current code: 1.01 -> 0.351, 6.08 -> 0.396, 9.04 -> 0.382). The conservative (maximum) ratio is used so every
 * estimate errs high. Evidence: docs/phase-3-remediation-f7a/00-current-large-unit-shape.json.
 */
export const CALIBRATED_TOKENS_PER_CHAR = 0.3957;
/** Fixed per-call overhead measured on the current caller: system prompt (12,943) + few-shot block (12,283) + tool schemas JSON (16,080) = 41,306 chars; the ~2.5k chars of first-turn scaffolding/labels are added on top. */
export const FIXED_CALL_OVERHEAD_CHARS = 41_306 + 2_500;

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars * CALIBRATED_TOKENS_PER_CHAR);
}

/**
 * Output burden: recorded successful compilations emitted ~1.25k output tokens per compiled object (Chewy 6.08: 44
 * rules+definitions in 54,960 tokens) and 3.2k-5.3k per definition for the definition-heavy holdout fixtures (e.g.
 * 5 definitions in 21,229 tokens; 1 large EBITDA definition in 17,853). The estimate uses 2,500 tokens per owned
 * unit plus a 1,500-token envelope - deliberately above the mixed-object average - so a shard's output stays far
 * under the caller's 128k ceiling by construction rather than by luck. Evidence: 01-defect-classification-and-budget-evidence.json.
 */
export const OUTPUT_TOKENS_PER_UNIT_ESTIMATE = 2_500;
export const OUTPUT_TOKENS_BASE_ESTIMATE = 1_500;
export function estimateOutputTokens(unitCount: number): number {
  return OUTPUT_TOKENS_BASE_ESTIMATE + unitCount * OUTPUT_TOKENS_PER_UNIT_ESTIMATE;
}

/** How the planner derived a region's semantic source units. */
export type UnitDerivationMethod =
  /** the region is a definitions corpus (>= 2 detected structural definitions covering most of it): one unit per detected definition span, plus the lead-in */
  | "STRUCTURAL_DEFINITIONS"
  /** the region's structural node hierarchy: one unit per node's own contiguous text (chapeau / residue), children as their own units */
  | "STRUCTURAL_NODES"
  /** no structural information: independent sentence/line segments */
  | "INDEPENDENT_SEGMENTS";

export type SemanticUnitKind = "LEAD_IN" | "DEFINITION" | "NODE_OWN_TEXT" | "SEGMENT" | "EXPANSION_REGION";

/**
 * A semantic SOURCE unit: the smallest stretch of source the packer may never split. Owned inventory items are the
 * items whose PRIMARY span starts inside it. Offsets are region-relative (SourceContextRegion.text) unless stated.
 */
export interface SemanticSourceUnit {
  /** Deterministic, source-derived: `${regionId}:${kind}:${anchor}` (definition term / section ref / ordinal) - never model output. */
  unitKey: string;
  kind: SemanticUnitKind;
  regionId: string;
  documentId: string;
  /** Region-relative, half-open. Units of one region tile its content in order. */
  charStart: number;
  charEnd: number;
  /** Absolute document offsets (region.charStart + relative) when the region has a real document anchor; null otherwise. */
  absCharStart: number | null;
  absCharEnd: number | null;
  sectionRef: string | null;
  sourceNodeId: string | null;
  /** For DEFINITION units: the detected term (exact spelling). */
  termName: string | null;
  normalizedTermName: string | null;
  /** For NODE_OWN_TEXT units: the unit holding the parent node's own lead-in (chapeau), when it exists. */
  parentUnitKey: string | null;
  /** sha256 of the unit's text - part of every shard's freeze identity. */
  textHash: string;
  chars: number;
  ownedItemIds: string[];
  ownedMaterialItemIds: string[];
  /** Position in the plan's unit order (source order; expansion regions after the operative region). */
  ordinal: number;
}

export type ShardContextKind = "CHAPEAU" | "PARENT_ITEM" | "REFERENCED_TERM" | "REFERENCED_SECTION" | "EXPANSION_REGION";

/** Bounded, READ-ONLY dependency context handed to a shard. Carries provenance; never transfers semantic ownership. */
export interface ShardContextEntry {
  contextKey: string;
  kind: ShardContextKind;
  /** The unit this text belongs to (and therefore the shard that OWNS its semantics), when it is a unit of this plan. */
  sourceUnitKey: string | null;
  ownerShardId: string | null;
  documentId: string;
  absCharStart: number | null;
  absCharEnd: number | null;
  /** Head/tail-capped text (see ShardBudget.maxContextEntryChars); `truncated` says whether anything was cut. */
  text: string;
  truncated: boolean;
  fullTextHash: string;
  chars: number;
  /** Which owned items/units required it. */
  requiredBy: string[];
  reason: string;
}

export interface UnresolvedShardContext {
  kind: ShardContextKind;
  key: string;
  reason: "BUDGET" | "NOT_FOUND" | "AMBIGUOUS";
  detail: string;
  requiredBy: string[];
}

export interface ShardBudget {
  /** Primary (owned) source chars the packer aims for per shard - several complete units are packed up to this. */
  targetPrimaryChars: number;
  /** A single block (one unit, or a must-link group) larger than this still forms its own shard, flagged `oversized`. */
  maxPrimaryChars: number;
  /** Total read-only context chars per shard. */
  maxContextChars: number;
  /** Per context entry cap (head + tail). */
  maxContextEntryChars: number;
  /** Most complete units one shard may own (bounds OUTPUT concentration: each unit is at least one emitted object). A must-link block larger than this still stays together, flagged `oversized`. */
  maxUnitsPerShard: number;
}

export interface MustLinkGroup {
  /** Unit keys forced into one shard, in source order (the forced block covers the whole contiguous range). */
  unitKeys: string[];
  /** Every link that caused the grouping. */
  links: { kind: "SHARED_CAP" | "ITEM_SPAN_CROSSES_UNITS" | "EXPANSION_ATTACHED_TO_REFERRER"; itemId: string | null; fromUnitKey: string; toUnitKey: string; reason: string }[];
}

export interface CompilationShard {
  /** Packing-set identity: hash of candidateRef + the ordered owned unit keys. Stable across reruns with the same units. */
  shardId: string;
  /** FREEZE identity (mission §15): candidate/source identity + frozen inventory hash + owned unit spans/text hashes + owned item ids + context hashes + algorithm/prompt generation. Any relevant change invalidates it. */
  shardHash: string;
  ordinal: number;
  regionId: string;
  ownedUnitKeys: string[];
  /** Region-relative contiguous primary span. */
  primaryCharStart: number;
  primaryCharEnd: number;
  primaryChars: number;
  ownedItemIds: string[];
  ownedMaterialItemIds: string[];
  context: ShardContextEntry[];
  contextChars: number;
  unresolvedContext: UnresolvedShardContext[];
  /** True when one block alone exceeded ShardBudget.maxPrimaryChars (an irreducible unit / must-link group). */
  oversized: boolean;
  /** Estimates for the FIRST turn of this shard's conversation (see estimateTokensFromChars). */
  estimate: { primaryChars: number; contextChars: number; inventoryRenderedChars: number; fixedOverheadChars: number; totalChars: number; inputTokens: number; outputTokens: number };
}

export interface ShardPlan {
  algorithmVersion: string;
  candidateRef: string;
  documentId: string;
  frozenContentHash: string;
  sourceContextState: SourceContextState;
  budget: ShardBudget;
  derivation: Record<string, UnitDerivationMethod>;
  units: SemanticSourceUnit[];
  mustLinkGroups: MustLinkGroup[];
  shards: CompilationShard[];
  /** inventoryItemId -> unitKey (every item has exactly one). */
  itemOwnerUnit: Record<string, string>;
  /** inventoryItemId -> shardId (every item has exactly one PRIMARY shard). */
  itemOwnerShard: Record<string, string>;
  /** unitKey -> shardId. */
  unitOwnerShard: Record<string, string>;
  /** Items whose primary span could not be placed in any unit (a span outside every unit) - always empty for a well-formed frozen inventory; disclosed, never silently dropped. */
  unplacedItemIds: string[];
  ownershipProof: { materialItems: number; ownedOnce: number; unowned: number; multiplyOwned: number };
  totals: { shardCount: number; primaryChars: number; contextChars: number; contextDuplicationChars: number; estimatedInputTokens: number; maxShardInputTokens: number; medianShardInputTokens: number; p95ShardInputTokens: number; maxShardOutputTokens: number; largestShardPrimaryChars: number; largestShardOwnedItems: number; largestShardUnits: number; oversizedShards: number };
  /** Identity of the whole plan (hash of every shard hash, in order). */
  planHash: string;
}

export type ShardStatus = "SHARD_COMPLETE" | "SHARD_PARTIAL" | "SHARD_PROVIDER_FAILURE" | "SHARD_MISSING_CONTEXT" | "SHARD_SCHEMA_FAILURE";

/** What one bounded per-shard compilation produced - the SAME normalized IR shape compile.ts produces for a unit. */
export interface ShardComposition {
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
  inventoryDispositions: { inventoryItemId: string; disposition: string; note: string }[];
}

export interface ShardExecutionResult {
  shardId: string;
  shardHash: string;
  status: ShardStatus;
  composition: ShardComposition | null;
  failureReasons: SemanticCompilerFailureReason[];
  unresolvedIssues: string[];
  /** Whether this result was served from a prior execution with the same shardHash (mission §14/§15) rather than a new call. */
  reusedFromHash: boolean;
  attempts: number;
  telemetry: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null } | null;
}

export type ShardCollisionKind = "DEFINITION_EMITTED_BY_NON_OWNER" | "DEFINITION_DUPLICATE_CONSISTENT" | "DEFINITION_CONFLICT" | "RULE_EMITTED_OUT_OF_SCOPE" | "RULE_DUPLICATE_CONSISTENT" | "RULE_POSSIBLE_DUPLICATE" | "SHARED_CAP_EMITTED_OUT_OF_SCOPE" | "LINEAGE_CLAIM_ON_UNOWNED_ITEM" | "DISPOSITION_ON_UNOWNED_ITEM" | "DANGLING_RULE_REFERENCE";

export interface ShardCollision {
  kind: ShardCollisionKind;
  shardId: string;
  /** The shard that owns the semantics in question (when different). */
  ownerShardId: string | null;
  objectId: string;
  irPath: string | null;
  itemId: string | null;
  /** True when the collision makes the stitched result require review (a conflict / an unowned emission that cannot be credited). */
  requiresReview: boolean;
  detail: string;
}

export type StitchedCandidateStatus = "COMPLETED" | "REVIEW_REQUIRED" | "PARTIAL" | "FAILED";

export interface StitchedCompilation {
  candidateRef: string;
  planHash: string;
  status: StitchedCandidateStatus;
  failureReasons: SemanticCompilerFailureReason[];
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
  inventoryDispositions: { inventoryItemId: string; disposition: string; note: string }[];
  /** Emissions kept OUT of the stitched IR because their semantics are owned elsewhere (never credited), for review. */
  contextualEmissions: { shardId: string; kind: "RULE" | "DEFINITION" | "SHARED_CAP"; objectId: string; ownerShardId: string | null }[];
  collisions: ShardCollision[];
  /** old (shard-local) id -> stitched id, for rules and shared capacities. */
  idMap: Record<string, string>;
  shards: { shardId: string; shardHash: string; status: ShardStatus; ownedMaterialItems: number; rules: number; definitions: number; sharedCapacities: number; failureReasons: SemanticCompilerFailureReason[] }[];
  /** Material items whose owner shard did not complete - explicitly unresolved, never hidden by a sibling's success. */
  unresolvedOwnedItems: { inventoryItemId: string; shardId: string; shardStatus: ShardStatus }[];
  /** The GLOBAL Pass C reconciliation of the full frozen inventory against the stitched IR - the only authority on completeness. */
  accountability: SemanticAccountabilityResult;
  /** Lineage / disposition ids cited in bare-digest form and mapped to the known `inv-item:` id before ownership scoping (mirrors Pass C). */
  canonicalizedLineageReferences: number;
  unresolvedIssues: string[];
}

export interface ShardPlanInput {
  candidateRef: string;
  companyId: string;
  instrumentKey: string;
  documentId: string;
  sourceContext: SourceContextResult;
  frozenInventory: FrozenSemanticInventory;
  /** The verifier-shared structural index (definitions + node hierarchy) - the source of unit boundaries. Null degrades to INDEPENDENT_SEGMENTS. */
  structuralIndex: import("../structural-index").StructuralIndex | null;
  budget?: Partial<ShardBudget>;
  /** Generation identity folded into every shard hash (defaults to the compiler algorithm/prompt versions of the base input). */
  generation?: { algorithmVersion: string; promptVersion: string };
}

export type { FrozenSemanticInventory, SemanticInventoryItem, SemanticCompilerInput, SourceContextResult };
