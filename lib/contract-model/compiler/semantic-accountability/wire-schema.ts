/**
 * SEMANTIC ACCOUNTABILITY - Pass A's tolerant AI-facing wire schema
 * (mission §3/§16-style tolerance): every enum-shaped field is a plain
 * string (never a closed z.enum()) so an out-of-vocabulary model value
 * degrades to an honest normalization fallback rather than a client-side
 * schema crash - the same Phase 2F.2 lesson semantic/wire-schema.ts applies.
 * Deliberately FLAT: one item shape, no nested expression tree, no IR
 * structure (mission §2: the inventory is not a second covenant model).
 */
import { z } from "zod";

export const WireInventoryValueSchema = z.object({
  /** MONEY | PERCENT | RATIO | DAYS | DATE | PERIOD | MULTIPLIER | NUMBER | OTHER (tolerant). */
  kind: z.string().default("OTHER"),
  /** Exactly as written in the source text. */
  rawText: z.string(),
  normalizedValue: z.number().nullable().default(null),
  unit: z.string().nullable().default(null),
});

export const WireInventoryItemSchema = z.object({
  /** Model-chosen short identifier unique within this ONE inventory call (e.g. "i1") - used only so parentRef/relatedRefs can cross-reference each other; never the item's real identity (computed deterministically by inventory.ts). */
  localRef: z.string(),
  /** The proposition's primary semantic role, one of the roles listed in the prompt (tolerant). */
  semanticRole: z.string().default("OTHER"),
  /** v5 (F-5.1): every OTHER role the same proposition genuinely also serves (e.g. an alternative branch that is also a formula addend lists ["FORMULA_COMPONENT"]). Tolerant; unknown values are ignored; identity never depends on it. */
  additionalRoles: z.array(z.string()).optional(),
  proposition: z.string().default(""),
  /** VERBATIM, character-for-character substring of one region's text - verified before the item is ever trusted. */
  excerpt: z.string(),
  /** The regionId the excerpt was copied from (defaults to the operative region when omitted). */
  regionId: z.string().nullable().default(null),
  /** F-5 (v4): the SLOT id the excerpt was copied from (slots.ts). Tolerant: a missing or unknown slotId is recovered from the located excerpt, never trusted on its own. */
  slotId: z.string().nullable().optional(),
  quantitativeValues: z.array(WireInventoryValueSchema).default([]),
  referencedTerms: z.array(z.string()).default([]),
  referencedSections: z.array(z.string()).default([]),
  parentRef: z.string().nullable().default(null),
  relatedRefs: z.array(z.string()).default([]),
  /** CRITICAL | MATERIAL | INFORMATIONAL | REVIEW_UNCERTAIN (tolerant). */
  materiality: z.string().default("REVIEW_UNCERTAIN"),
  /** NONE | AMBIGUOUS_DRAFTING | AMBIGUOUS_REFERENCE | UNCERTAIN_MATERIALITY (tolerant). */
  ambiguity: z.string().default("NONE"),
  ambiguityReason: z.string().nullable().default(null),
  /** OPERATIVE | DEFINITIONAL | UNKNOWN (tolerant). */
  operative: z.string().default("UNKNOWN"),
});
export type WireInventoryItem = z.infer<typeof WireInventoryItemSchema>;

export const SubmitSemanticInventorySchema = z.object({
  items: z.array(WireInventoryItemSchema).default([]),
  overallNotes: z.array(z.string()).default([]),
});
export type SubmitSemanticInventoryInput = z.infer<typeof SubmitSemanticInventorySchema>;
