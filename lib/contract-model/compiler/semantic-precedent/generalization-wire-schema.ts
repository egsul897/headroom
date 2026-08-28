/**
 * Phase 3D - tolerant external wire schema for the AI-assisted
 * generalization proposal (task §22-§26). Every enum-shaped field is a
 * tolerant `string` (never a closed z.enum()), mirroring
 * semantic-verification/wire-schema.ts's own Phase 2F.2 lesson - an
 * out-of-vocabulary model value degrades to an honest normalization
 * fallback in generalization.ts, never a schema crash.
 */
import { z } from "zod";

function wirePatternSlotSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    mode: z.string(),
    value: valueSchema.optional(),
    description: z.string().optional(),
    /** Required for a slot the model wants to mark FIXED (task §26's own "unless the value itself is conceptually load-bearing, rare - e.g. a well-known regulatory percentage threshold") - generalization.ts treats an absent/empty whyFixed as a mechanical override back to VARIABLE, never trusting the model's FIXED claim on its own. */
    whyFixed: z.string().optional(),
  });
}

export interface WireExpressionPatternNode {
  kind: string;
  operatorSlot?: z.infer<ReturnType<typeof wirePatternSlotSchema<z.ZodString>>> | null;
  numericSlot?: z.infer<ReturnType<typeof wirePatternSlotSchema<z.ZodNumber>>> | null;
  textSlot?: z.infer<ReturnType<typeof wirePatternSlotSchema<z.ZodString>>> | null;
  children: WireExpressionPatternNode[];
}

export const WireExpressionPatternNodeSchema: z.ZodType<WireExpressionPatternNode> = z.lazy(() =>
  z.object({
    kind: z.string(),
    operatorSlot: wirePatternSlotSchema(z.string()).nullable().optional(),
    numericSlot: wirePatternSlotSchema(z.number()).nullable().optional(),
    textSlot: wirePatternSlotSchema(z.string()).nullable().optional(),
    children: z.array(WireExpressionPatternNodeSchema).default([]),
  })
);

export const GeneralizationProposalSchema = z.object({
  /** The reusable LESSON in plain language - never a restatement of one company's specific clause (task §0's own "never a list of clauses to memorize"). */
  lessonDescription: z.string(),
  dimensions: z.array(z.string()).default([]),
  granularity: z.string().default("EXPRESSION_PATTERN"),
  expressionPattern: WireExpressionPatternNodeSchema.nullable().default(null),
  /** Structural lessons (task §26's own "trailing proviso applies to multiple sibling clauses" example) - plain-language, never a new enum value. */
  structuralLessons: z.array(z.string()).default([]),
  dependencyLessons: z.array(z.string()).default([]),
  /** Task §27's own "support negative precedent" - the model may propose that the reviewed instances actually demonstrate a superficially-similar-but-NOT-equivalent pattern rather than a positive lesson. */
  isNegativePrecedent: z.boolean().default(false),
  negativeContrastNote: z.string().nullable().default(null),
});
export type GeneralizationProposal = z.infer<typeof GeneralizationProposalSchema>;
