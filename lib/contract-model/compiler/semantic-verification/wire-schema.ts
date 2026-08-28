/**
 * Phase 3C Layer 2 - tolerant external wire schema for the adversarial
 * semantic reviewer's own structured output. Every enum-shaped field is a
 * tolerant `string` (never a closed z.enum()), mirroring semantic/wire-schema.ts's
 * own explicit Phase 2F.2 lesson: an out-of-vocabulary model value degrades
 * to an honest normalization fallback, never a client-side schema crash.
 */
import { z } from "zod";

export const WireVerificationFindingSchema = z.object({
  /** One of SemanticVerificationFindingType, tolerant string - normalized in reviewer.ts. */
  findingType: z.string(),
  /** One of MATERIAL/NON_MATERIAL/UNCERTAIN, tolerant string. */
  severity: z.string().default("UNCERTAIN"),
  /** The specific ruleId/definitionId this finding concerns, when applicable - a localRef the reviewer copies from the proposed IR it was shown, never invented. */
  ruleOrDefinitionId: z.string().nullable().default(null),
  irPath: z.string().nullable().default(null),
  /** The real source text this finding is grounded in - the reviewer must quote real text, never fabricate. */
  sourceEvidence: z.string().default(""),
  sourceCitation: z.string().default(""),
  proposedIrEvidence: z.string().default(""),
  /** The reviewer's own real reasoning - required, non-empty (task §2's own "must not merely produce a confidence score"). */
  reasoning: z.string(),
});
export type WireVerificationFinding = z.infer<typeof WireVerificationFindingSchema>;

export const SubmitVerificationFindingsSchema = z.object({
  findings: z.array(WireVerificationFindingSchema).default([]),
  /** The reviewer's own overall assessment notes - never treated as proof of correctness on its own (Independence Contract), only logged for audit. */
  overallNotes: z.array(z.string()).default([]),
});
export type SubmitVerificationFindingsInput = z.infer<typeof SubmitVerificationFindingsSchema>;
