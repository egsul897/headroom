/**
 * Phase 3E §156 - Layer C: bounded AI semantic inventory. A single,
 * schema-forced call PER ROUTER-ADMITTED REGION (never a whole-document
 * call, never a call for a region the router itself did not admit - this
 * layer must never expand the search universe the deterministic router
 * already bounded). Its job is to catch what Layer A/B's regex-based
 * signal detection structurally cannot: a basket described entirely in
 * prose with no "$"/"%" character ("an amount equal to the Available
 * Amount"), a condition or cross-reference too syntactically varied for a
 * fixed pattern, or a genuinely novel drafting construction Layer A/B's
 * keyword list has never seen.
 *
 * ANTI-HALLUCINATION GATE (mirrors Phase 3B/3C's own "AI may never invent
 * evidence" discipline): every proposed unit must include a verbatim
 * sourceQuote; any quote that does not appear as a real substring of the
 * region's own text is dropped before it ever becomes a MaterialSemanticUnit
 * - never trusted merely because the response was schema-valid JSON
 * (Architecture Invariants #16).
 *
 * INDEPENDENCE: reuses lib/contract-model/compiler/llm-caller.ts's
 * provider-abstract StageCaller/getStageCaller directly - the same generic,
 * covenant-agnostic call primitive Phase 3C's own Layer 2 reviewer uses,
 * NOT the compiler's own tool-use loop (semantic/caller.ts, off-limits).
 * This file never imports discovery/*, context-retrieval/*, semantic/
 * compile.ts, semantic/caller.ts, semantic-verification/verify.ts, or
 * semantic-precedent/* - enforced by
 * tests/contract-model/semantic-coverage-independence.test.ts.
 */
import { z } from "zod";
import type { StageCaller } from "../llm-caller";
import { getStageCaller } from "../llm-caller";
import { computeSemanticUnitId } from "./identity";
import { classifyFamily } from "./unit-hypothesis";
import type { AnalyzerCallTelemetry } from "../../analyzer/telemetry";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION, SEMANTIC_COVERAGE_PROMPT_VERSION, type MaterialSemanticUnit, type RoutedRegion, type SemanticUnitMateriality } from "./types";

// ---------------------------------------------------------------------------
// Wire schema - every enum-shaped field a tolerant string (Phase 2F.2's
// established lesson: an out-of-vocabulary model value degrades to an
// honest normalization fallback, never a client-side schema crash).
// ---------------------------------------------------------------------------

const WireProposedUnitSchema = z.object({
  /** Verbatim substring of the region text this unit is grounded in - verified against the real region text before being trusted; never invented. */
  sourceQuote: z.string(),
  /** One of PROHIBITION_SIGNAL/PERMISSION_SIGNAL/OBLIGATION_SIGNAL/CONDITION_ONLY_SIGNAL/DEFINITIONAL_SIGNAL/CALCULATION_SIGNAL/AMENDMENT_MECHANIC_SIGNAL/UNCLEAR_SIGNAL, tolerant string. */
  postureSignal: z.string().default("UNCLEAR_SIGNAL"),
  /** One of CRITICAL/MATERIAL/REVIEW_UNCERTAIN/INFORMATIONAL, tolerant string. */
  materiality: z.string().default("REVIEW_UNCERTAIN"),
  /** Why the deterministic Layer A/B pass would plausibly have missed this unit - required, forces the model to justify novelty rather than restate an already-obvious signal. */
  whyDeterministicLayerMightMiss: z.string(),
  reasoning: z.string(),
});
export type WireProposedUnit = z.infer<typeof WireProposedUnitSchema>;

const SubmitAiInventorySchema = z.object({
  proposedUnits: z.array(WireProposedUnitSchema).default([]),
  overallNotes: z.array(z.string()).default([]),
});

const VALID_POSTURE_SIGNALS = ["PROHIBITION_SIGNAL", "PERMISSION_SIGNAL", "OBLIGATION_SIGNAL", "CONDITION_ONLY_SIGNAL", "DEFINITIONAL_SIGNAL", "CALCULATION_SIGNAL", "AMENDMENT_MECHANIC_SIGNAL", "UNCLEAR_SIGNAL"] as const;
const VALID_MATERIALITIES = ["CRITICAL", "MATERIAL", "REVIEW_UNCERTAIN", "INFORMATIONAL"] as const;

function matchEnum<T extends string>(raw: string, valid: readonly T[], fallback: T): T {
  if ((valid as readonly string[]).includes(raw)) return raw as T;
  const upperSnake = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((valid as readonly string[]).includes(upperSnake)) return upperSnake as T;
  return fallback;
}

// ---------------------------------------------------------------------------
// Prompt (task §156's own "router-admitted region only, never expand the
// search universe" - the prompt states this constraint explicitly rather
// than merely relying on the caller never supplying more text).
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    `You are an independent second-opinion reviewer for a contract semantic-coverage auditor (version ${SEMANTIC_COVERAGE_PROMPT_VERSION}).`,
    "You will be shown ONE bounded region of a debt/credit document's real source text, plus a list of material semantic units a deterministic (non-AI) pass already identified in that SAME text.",
    "Your job: identify any ADDITIONAL material contractual semantic unit in this region's text that the deterministic pass plausibly missed - a basket, permission, exception, condition, cross-reference, or economic term described in prose without a distinctive keyword or symbol a fixed pattern would catch.",
    "Do NOT restate a unit already listed as already-found. Do NOT propose anything outside the text you were given - you have no access to any other part of this document or package, and must never guess at content you were not shown.",
    "Every proposed unit MUST include an exact verbatim quote (sourceQuote) copied character-for-character from the region text you were given. A quote that does not appear in the source text will be discarded and will not help - never paraphrase, translate, or reconstruct a quote from memory.",
    "If you find nothing the deterministic pass missed, return an empty proposedUnits array - this is a common, entirely valid, and expected outcome. Do not manufacture a unit merely to have something to report.",
  ].join("\n");
}

function buildUserContent(region: RoutedRegion, fullText: string, alreadyFoundExcerpts: string[]): string {
  return [
    `Region source citation: ${region.structuralNodeKey ? `${region.documentId}::${region.sectionRef}` : `${region.documentId}::raw[${region.charStart}-${region.charEnd}]`}`,
    "",
    "Region full text:",
    fullText,
    "",
    "Semantic units the deterministic pass ALREADY found in this exact region (do not restate these):",
    alreadyFoundExcerpts.length > 0 ? alreadyFoundExcerpts.map((e) => `- ${e.slice(0, 200)}`).join("\n") : "(none - the deterministic pass found nothing here)",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface AiInventoryResult {
  units: MaterialSemanticUnit[];
  rejectedUnverifiableQuotes: number;
  overallNotes: string[];
  provider: string;
  model: string;
  telemetry: AnalyzerCallTelemetry | null;
  failed: boolean;
  failureDetail: string | null;
}

interface AiInventoryContext {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  operativeVersionRef: string | null;
  headingHint: string | null;
}

/**
 * Runs ONE bounded AI inventory call for ONE router-admitted region.
 * `alreadyFoundUnits` should be the Layer A/B units hypothesizeUnitsForRegion
 * already produced for this exact region (never units from elsewhere in the
 * document - keeping this call's own context bounded to the region, task
 * §156's own scope discipline).
 */
export async function runBoundedAiInventoryForRegion(region: RoutedRegion, fullText: string, alreadyFoundUnits: MaterialSemanticUnit[], ctx: AiInventoryContext, caller: StageCaller = getStageCaller()): Promise<AiInventoryResult> {
  const systemPrompt = buildSystemPrompt();
  const userContent = buildUserContent(region, fullText, alreadyFoundUnits.map((u) => u.excerptText));

  try {
    const wireResult = await caller.call(SubmitAiInventorySchema, "semantic_coverage_ai_inventory", systemPrompt, userContent);
    const units: MaterialSemanticUnit[] = [];
    let rejectedUnverifiableQuotes = 0;

    for (const proposed of wireResult.proposedUnits) {
      // The anti-hallucination gate: a quote that is not a real substring of the text the
      // model was actually shown is dropped, never trusted merely because the JSON validated.
      if (!proposed.sourceQuote || !fullText.includes(proposed.sourceQuote)) {
        rejectedUnverifiableQuotes += 1;
        continue;
      }
      const postureSignal = matchEnum(proposed.postureSignal, VALID_POSTURE_SIGNALS, "UNCLEAR_SIGNAL");
      const materiality = matchEnum(proposed.materiality, VALID_MATERIALITIES, "REVIEW_UNCERTAIN") as SemanticUnitMateriality;
      const { family, evidence } = classifyFamily(proposed.sourceQuote, ctx.headingHint);
      const quoteStart = fullText.indexOf(proposed.sourceQuote);

      units.push({
        semanticUnitId: computeSemanticUnitId(
          [
            {
              documentId: region.documentId,
              structuralNodeKey: region.structuralNodeKey,
              sectionRef: region.sectionRef,
              charStart: region.charStart + quoteStart,
              charEnd: region.charStart + quoteStart + proposed.sourceQuote.length,
              sourceCitation: region.structuralNodeKey ? `${region.documentId}::${region.sectionRef}` : `${region.documentId}::raw[${region.charStart}-${region.charEnd}]`,
            },
          ],
          `ai-proposed:${postureSignal}:${proposed.sourceQuote}`
        ),
        companyId: ctx.companyId,
        packageKey: ctx.packageKey,
        instrumentKey: ctx.instrumentKey,
        operativeVersionRef: ctx.operativeVersionRef,
        granularity: "SEMANTIC_UNIT",
        anchors: [
          {
            documentId: region.documentId,
            structuralNodeKey: region.structuralNodeKey,
            sectionRef: region.sectionRef,
            charStart: region.charStart + quoteStart,
            charEnd: region.charStart + quoteStart + proposed.sourceQuote.length,
            sourceCitation: region.structuralNodeKey ? `${region.documentId}::${region.sectionRef}` : `${region.documentId}::raw[${region.charStart}-${region.charEnd}]`,
          },
        ],
        family,
        familyEvidence: evidence,
        postureSignal,
        materiality,
        materialityReasoning: proposed.reasoning,
        excerptText: proposed.sourceQuote.slice(0, 500),
        detectedSignals: [],
        fromRawSourceFallback: region.fromRawSourceFallback,
        detectionMethod: "BOUNDED_AI_INVENTORY",
        aiInventoryPromptVersion: SEMANTIC_COVERAGE_PROMPT_VERSION,
        confidence: "MEDIUM",
        uncertaintyReasons: [proposed.whyDeterministicLayerMightMiss],
        inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
        provenance: `bounded Layer C AI inventory over router-admitted region - quote verified against real region text - no discovery/context-retrieval/compiler/verifier/precedent output consulted`,
      });
    }

    return { units, rejectedUnverifiableQuotes, overallNotes: wireResult.overallNotes, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), failed: false, failureDetail: null };
  } catch (err) {
    return { units: [], rejectedUnverifiableQuotes: 0, overallNotes: [], provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), failed: true, failureDetail: err instanceof Error ? err.message : String(err) };
  }
}
