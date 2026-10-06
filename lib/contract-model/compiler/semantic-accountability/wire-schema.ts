/**
 * Pass A wire schema - BOUNDED (P3-E12). Every string and every array carries a maximum derived from the inventory
 * execution policy, and `items` carries the call's own derived maximum. The provider receives these bounds through the
 * structured-output JSON schema; the parser enforces them again. There is no free-form `overallNotes` field: Pass A's
 * authoritative information is slot, function, materiality, operative state, values, references, relationships,
 * ambiguity - not prose the system never reads.
 */
import { z } from "zod";
import { CERTIFIED_INVENTORY_WIRE_BOUNDS, type InventoryWireBounds } from "./inventory-policy";

export const INVENTORY_WIRE_SCHEMA_VERSION = "semantic-inventory-wire.v2";

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
    localRef: z.string().max(b.localRefChars),
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
    parentRef: z.string().max(b.localRefChars).nullable().default(null),
    relatedRefs: z.array(z.string().max(b.localRefChars)).max(b.maxRelatedRefs).default([]),
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
