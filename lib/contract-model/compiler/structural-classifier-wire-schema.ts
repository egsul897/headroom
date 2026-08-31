/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - wire schema
 * for the bounded structural-ambiguity classifier
 * (structural-ambiguity-classifier.ts). Kept in its own file, mirroring
 * semantic-verification/wire-schema.ts's own one-schema-per-classifier
 * discipline, so this new classifier never needs to touch (or be coupled
 * to) condition-suspicion's own wire-schema.ts file - the two classifiers
 * are independent at the type level, exactly as the governing spec
 * requires ("independence at the type level ... already used elsewhere in
 * this codebase for the condition-suspicion classifier").
 */
import { z } from "zod";

/** Loosely typed on the wire (plain strings) - tolerant-matched against the real enum by the classifier module itself, never trusted verbatim. Mirrors SubmitConditionSuspicionSchema's own "status is a bare string" discipline. */
export const SubmitStructuralAmbiguityClassificationSchema = z.object({
  verdict: z.string(),
  reason: z.string().default(""),
  /** Real, verbatim substrings of the source windows the model was shown - never fabricated. Bounded to a handful of short spans; this is a routing signal, not an evidentiary report. */
  relatedSourceSpans: z.array(z.string()).default([]),
});
export type SubmitStructuralAmbiguityClassificationInput = z.infer<typeof SubmitStructuralAmbiguityClassificationSchema>;
