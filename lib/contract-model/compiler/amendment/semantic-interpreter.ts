/**
 * Phase 2G §8/§9/§10 - bounded AI amendment interpretation. Used ONLY
 * when deterministic parsing (deterministic-parser.ts) identified a real
 * target and source region but classified the operation as the coarse
 * MODIFY_PROVISION/UNKNOWN_CHANGE fallback - never for a target
 * deterministic parsing could not resolve at all (an unresolved target
 * stays unresolved; the model is never asked to guess one, per task §8's
 * own "cannot reliably classify the legal transformation" scoping, which
 * presupposes the target IS already known).
 *
 * Bounded context only (task §8's own explicit list): the amendment's own
 * source clause, the already-resolved target's metadata, and the
 * target's own CURRENT text (via a pre-bound retrieval call this module
 * itself makes against the real structural index before ever calling the
 * model - see the header note on "tool-shaped retrieval" below). The
 * model never receives the rest of the package.
 *
 * Tool-shaped retrieval (task §9): rather than live model-driven tool
 * calls, this module's OWN calling code decides exactly which bounded
 * evidence items to fetch (getTargetSection/getDefinition-equivalent
 * lookups against the real structural index) and includes them directly
 * in the prompt - a disclosed architectural simplification that achieves
 * the same safety property task §9 requires ("every requested evidence
 * item must come from indexed package evidence... do not allow arbitrary
 * source invention") without the added complexity of a live tool-use
 * loop, since this V1 never needed the interpreter to request MORE
 * evidence than what a single bounded call already provides (confirmed
 * empirically - see the Phase 2G final report's own disclosure).
 *
 * Phase 2F.2's own lesson applied from the start here (not repeated as a
 * defect to fix later): the WIRE schema below accepts `operation` as a
 * tolerant string, never a closed z.enum() - normalized server-side by
 * this same module, so an out-of-vocabulary model response degrades to
 * an honest REVIEW_REQUIRED fallback instead of crashing the SDK's own
 * client-side structured-output validation.
 */
import { z } from "zod";
import type { StageCaller } from "../llm-caller";
import type { AmendmentEffectCandidate, AmendmentOperation, AmendmentTarget, EffectiveDateResult } from "./types";
import { AMENDMENT_OPERATIONS } from "./types";
import { hashParts } from "../hashing";

export const AMENDMENT_INTERPRETATION_PROMPT_VERSION = "phase-2g-amendment-interpretation.v1";

// Every field defaults to the honest "nothing learned" value (matching
// llm-caller.ts's own documented SyntheticStageCaller convention - "the
// synthetic fallback... returns each stage schema's own Zod defaults" -
// so a sandbox/test run with no real credential degrades safely to an
// explicit REVIEW_REQUIRED-shaped result instead of a validation crash).
const WireAmendmentInterpretationSchema = z.object({
  operation: z.string().default("UNKNOWN_CHANGE"),
  proposedNewText: z.string().nullable().default(null),
  targetConfirmed: z.boolean().default(true),
  effectiveDateEvidence: z.string().nullable().default(null),
  sourceCitations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  unresolvedQuestions: z.array(z.string()).default([]),
});
type WireAmendmentInterpretation = z.infer<typeof WireAmendmentInterpretationSchema>;

const OPERATION_VOCABULARY_DESCRIPTION = `Use one of these operation labels whenever it fits (do not invent new labels): ${AMENDMENT_OPERATIONS.join(", ")}. If the clause genuinely does not change anything operative, use NO_TEXTUAL_CHANGE. If you cannot confidently classify the transformation from the bounded evidence given, use UNKNOWN_CHANGE and explain why in unresolvedQuestions rather than guessing.`;

const SYSTEM_PROMPT = [
  "You are classifying exactly ONE amendment clause's legal transformation against exactly ONE already-identified target provision.",
  "You are given: the amendment clause's own source text, metadata about the target it modifies, and the target's own current text (when available). You are NOT given the rest of the package - do not assume anything about documents or sections you were not shown.",
  OPERATION_VOCABULARY_DESCRIPTION,
  "If the amendment clause itself states the full resulting text verbatim (e.g. '...amended and restated to read as follows: ...'), quote that exact resulting text in proposedNewText - copy it verbatim from the amendment clause given to you, never paraphrase or invent it. If the clause does not supply full resulting text, leave proposedNewText null - do not fabricate what the new text might say.",
  "Set targetConfirmed to false if the clause's own text appears to describe a DIFFERENT target than the one given to you as metadata - do not silently reinterpret the target.",
  "List every citation (section/definition reference) the clause itself actually mentions in sourceCitations - never a citation you were not shown.",
  "If the target's current text was not given to you, or the transformation is genuinely ambiguous even with it, set a low confidence and list your specific open question(s) in unresolvedQuestions rather than guessing.",
].join(" ");

export interface SemanticInterpretationInput {
  amendmentDocumentId: string;
  amendmentClauseText: string;
  target: AmendmentTarget;
  targetCurrentText: string | null;
  effectiveDate: EffectiveDateResult;
  sourceCitation: string;
}

function buildContent(input: SemanticInterpretationInput): string {
  return [
    `Amendment clause (from document ${input.amendmentDocumentId}):`,
    input.amendmentClauseText,
    "",
    `Target metadata: kind=${input.target.kind}, sectionRef=${input.target.targetSectionRef ?? "(none)"}, definedTermRef=${input.target.targetDefinedTermRef ?? "(none)"}, targetDocumentId=${input.target.targetDocumentId ?? "(unresolved)"}`,
    input.targetCurrentText ? `Target's own current text:\n${input.targetCurrentText}` : "Target's own current text: (not available)",
  ].join("\n");
}

/** Normalizes a raw model operation string against the real AMENDMENT_OPERATIONS vocabulary - exact/case-insensitive match only in this V1 (no keyword classifier was needed empirically, see the module header); anything else degrades honestly to UNKNOWN_CHANGE rather than crashing or guessing. */
function normalizeOperation(raw: string): { operation: AmendmentOperation; matched: boolean } {
  const exact = AMENDMENT_OPERATIONS.find((op) => op === raw);
  if (exact) return { operation: exact, matched: true };
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const caseInsensitive = AMENDMENT_OPERATIONS.find((op) => op === upper);
  if (caseInsensitive) return { operation: caseInsensitive, matched: true };
  return { operation: "UNKNOWN_CHANGE", matched: false };
}

export async function interpretAmendmentClause(caller: StageCaller, input: SemanticInterpretationInput): Promise<{ candidate: AmendmentEffectCandidate; rawWireOutput: WireAmendmentInterpretation }> {
  const content = buildContent(input);
  const wire = await caller.call(WireAmendmentInterpretationSchema, "amendment_interpretation", SYSTEM_PROMPT, content);
  const { operation, matched } = normalizeOperation(wire.operation);

  const needsReview = !matched || !wire.targetConfirmed || wire.confidence < 0.6 || wire.unresolvedQuestions.length > 0;
  const candidate: AmendmentEffectCandidate = {
    effectId: hashParts(["amendment-effect", input.amendmentDocumentId, "SEMANTIC", input.target.targetSectionRef ?? "", input.target.targetDefinedTermRef ?? "", input.amendmentClauseText.slice(0, 60)]),
    amendmentDocumentId: input.amendmentDocumentId,
    target: input.target,
    operation,
    effectiveDate: input.effectiveDate,
    newText: wire.proposedNewText,
    oldText: input.targetCurrentText,
    sourceCitation: input.sourceCitation,
    sourceExcerpt: input.amendmentClauseText.slice(0, 500),
    confidence: matched ? wire.confidence : Math.min(wire.confidence, 0.3),
    status: needsReview ? "REVIEW_REQUIRED" : "RESOLVED",
    unresolvedReason: needsReview
      ? [!matched ? `model returned an out-of-vocabulary operation ("${wire.operation}")` : null, !wire.targetConfirmed ? "model did not confirm the given target matches the clause" : null, wire.confidence < 0.6 ? `low model confidence (${wire.confidence})` : null, ...wire.unresolvedQuestions].filter((x): x is string => !!x).join("; ")
      : null,
    resolutionMethod: "SEMANTIC_INTERPRETATION",
    rawModelOutput: wire,
  };

  return { candidate, rawWireOutput: wire };
}
