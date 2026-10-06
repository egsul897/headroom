/**
 * Pass A wire schema - BOUNDED (P3-E12). Every string and every array carries a maximum derived from the inventory
 * execution policy, and `items` carries the call's own derived maximum. The provider receives these bounds through the
 * structured-output JSON schema; the parser enforces them again. There is no free-form `overallNotes` field: Pass A's
 * authoritative information is slot, function, materiality, operative state, values, references, relationships,
 * ambiguity - not prose the system never reads.
 *
 * localRef reliability (Phase 3 reliability gate): Anthropic structured outputs fold maxLength into `description`
 * only (they do not constrain decoding). A model that emits a section-shaped or gap-shaped handle longer than the
 * prior 6-char ceiling used to fail the ENTIRE gap re-inventory parse (live §7.5(j)). The certified bound is now
 * 24 chars, the prompt states it, and over-long handles are coerced to a deterministic digest of the same length so
 * parentRef/relatedRefs that cite the same over-long string still resolve within the call. localRef never becomes
 * item identity (inventory.ts derives that).
 */
import { createHash } from "crypto";
import { z } from "zod";
import { CERTIFIED_INVENTORY_WIRE_BOUNDS, type InventoryWireBounds } from "./inventory-policy";

export const INVENTORY_WIRE_SCHEMA_VERSION = "semantic-inventory-wire.v3";

/**
 * Coerce a model-chosen within-call handle into the certified length. Short strings pass through; over-long ones
 * become a stable hex digest of length `maxChars` so cross-references that repeat the same over-long string still
 * match after coercion. Non-strings are left for Zod to reject.
 */
export function coerceInventoryLocalRef(value: unknown, maxChars: number): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= maxChars) return value;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, maxChars);
}

function localRefSchema(maxChars: number) {
  return z.preprocess((v) => coerceInventoryLocalRef(v, maxChars), z.string().max(maxChars));
}

function nullableLocalRefSchema(maxChars: number) {
  return z.preprocess((v) => {
    if (v === null || v === undefined) return null;
    return coerceInventoryLocalRef(v, maxChars);
  }, z.string().max(maxChars).nullable()).default(null);
}

export function buildWireInventoryValueSchema(b: InventoryWireBounds) {
  return z.object({
    kind: z.string().max(16).default("OTHER"),
    rawText: z.string().max(b.valueRawTextChars),
    normalizedValue: z.number().nullable().default(null),
    unit: z.string().max(b.valueUnitChars).nullable().default(null),
  });
}

export function buildWireInventoryItemSchema(b: InventoryWireBounds) {
  return z.object({
    /** Model-chosen short identifier unique within this ONE call - only so parentRef/relatedRefs can cross-reference; never the item's real identity (inventory.ts computes that). */
    localRef: localRefSchema(b.localRefChars),
    /** The deterministic slot this item's excerpt comes from. Required by the contract; a wrong id is recovered from the excerpt, never trusted alone. */
    slotId: z.string().max(b.slotIdChars).nullable().optional(),
    semanticRole: z.string().max(b.roleChars).default("OTHER"),
    additionalRoles: z.array(z.string().max(b.roleChars)).max(b.maxAdditionalRoles).optional(),
    /** Short label of the proposition (<= propositionChars). Not identity, not accountability - rendered to Pass B only. */
    proposition: z.string().max(b.propositionChars).default(""),
    /** VERBATIM substring of the slot's text (<= excerptChars) - verified before the item is trusted. */
    excerpt: z.string().max(b.excerptChars),
    regionId: z.string().max(96).nullable().default(null),
    quantitativeValues: z.array(buildWireInventoryValueSchema(b)).max(b.maxQuantitativeValues).default([]),
    referencedTerms: z.array(z.string().max(b.referencedTermChars)).max(b.maxReferencedTerms).default([]),
    referencedSections: z.array(z.string().max(b.referencedSectionChars)).max(b.maxReferencedSections).default([]),
    parentRef: nullableLocalRefSchema(b.localRefChars),
    relatedRefs: z.array(localRefSchema(b.localRefChars)).max(b.maxRelatedRefs).default([]),
    materiality: z.string().max(16).default("REVIEW_UNCERTAIN"),
    ambiguity: z.string().max(22).default("NONE"),
    ambiguityReason: z.string().max(b.ambiguityReasonChars).nullable().default(null),
    operative: z.string().max(12).default("UNKNOWN"),
  });
}

export function buildSubmitSemanticInventorySchema(b: InventoryWireBounds, maxItems: number) {
  return z.object({ items: z.array(buildWireInventoryItemSchema(b)).max(Math.max(1, maxItems)).default([]) });
}

/** Default-bounded instances (certified bounds, a generous item ceiling) for callers that build no per-call schema. */
export const WireInventoryValueSchema = buildWireInventoryValueSchema(CERTIFIED_INVENTORY_WIRE_BOUNDS);
export const WireInventoryItemSchema = buildWireInventoryItemSchema(CERTIFIED_INVENTORY_WIRE_BOUNDS);
export type WireInventoryItem = z.infer<typeof WireInventoryItemSchema>;
export const DEFAULT_MAX_WIRE_ITEMS = 400;
export const SubmitSemanticInventorySchema = buildSubmitSemanticInventorySchema(CERTIFIED_INVENTORY_WIRE_BOUNDS, DEFAULT_MAX_WIRE_ITEMS);
export type SubmitSemanticInventoryInput = z.infer<typeof SubmitSemanticInventorySchema>;
