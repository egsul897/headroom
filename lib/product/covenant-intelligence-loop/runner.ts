/**
 * Exercise runner — executes declarative library scenarios against persisted summaries.
 * Uses Ask retrieve + summary items; does not invent numerical capacity.
 */

import { answerFromSummaryItems, type AskRetrieveAnswer } from "../covenant-intelligence/ask-retrieve";
import {
  summarizeFromStoredMetadata,
  type CovenantSummaryItem,
  type DocumentCovenantSummary,
} from "../covenant-intelligence/summarize";
import { detectPatternsInText } from "../../knowledge-factory/patterns/library";
import { diagnoseExerciseResult } from "./diagnose";
import { getExercise, listExercises } from "./exercise-library";
import type { AnalyticalGap, ExerciseDefinition, ExerciseExecutionResult } from "./types";

export interface SourceExerciseContext {
  sourceId: string;
  summary: DocumentCovenantSummary;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  hasFinancialSnapshot: boolean;
  financialInputsPresent?: string[];
}

function extractDefinitions(items: Array<CovenantSummaryItem & { sourceId: string }>): string[] {
  const out: string[] = [];
  for (const item of items) {
    for (const d of item.applicableDefinitions ?? []) {
      if (d.term) {
        const label = d.excerpt
          ? `${d.term}: ${d.excerpt.slice(0, 160)}${d.resolved === false ? " (unresolved)" : ""}`
          : `${d.term}${d.resolved === false ? " (unresolved)" : ""}`;
        out.push(label);
      }
    }
    for (const t of item.relatedDefinedTerms ?? []) {
      if (!out.some((x) => x === t || x.startsWith(`${t}:`) || x.startsWith(`${t} (`))) out.push(t);
    }
    // Surface definitional cues from baskets / plain English when structured defs are sparse.
    for (const b of item.materialBasketsThresholds ?? []) {
      const m = b.match(/\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\b/g);
      if (m) {
        for (const term of m) {
          if (/Consolidated|EBITDA|Indebtedness|Lien|Available Amount|Total Assets|Net Income/i.test(term)) {
            if (!out.some((x) => x.includes(term))) out.push(term);
          }
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 24);
}

function missingFinancials(
  exercise: ExerciseDefinition,
  present: string[] | undefined,
  hasSnapshot: boolean,
): string[] {
  if (!exercise.requiredFinancialInputs.length) return [];
  if (!hasSnapshot) return [...exercise.requiredFinancialInputs];
  const set = new Set((present ?? []).map((s) => s.toLowerCase()));
  return exercise.requiredFinancialInputs.filter((i) => !set.has(i.toLowerCase()));
}

function conditionalFormula(exercise: ExerciseDefinition, answer: AskRetrieveAnswer): string | undefined {
  const baskets = (answer.permissions ?? []).filter((p) =>
    /\$|greater of|ratio|leverage|available amount|basket|not to exceed/i.test(p),
  );
  if (exercise.amountMillions != null) {
    const amt = `$${exercise.amountMillions} million`;
    if (baskets.length) {
      return `Supported amount for ${amt} is CONDITIONAL: apply cited baskets [${baskets.slice(0, 3).join("; ")}] after confirming operative language, counsel-selected interpretation, financial inputs (${exercise.requiredFinancialInputs.join(", ") || "none listed"}), and ledger utilization.`;
    }
    return `Supported amount for ${amt} is CONDITIONAL pending identification of operative baskets/thresholds and required financial inputs (${exercise.requiredFinancialInputs.join(", ") || "n/a"}).`;
  }
  if (baskets.length) {
    return `Conditional pathway: ${baskets[0]}`;
  }
  return undefined;
}

function classifyOutcome(params: {
  answer: AskRetrieveAnswer;
  missingInputs: string[];
  itemCount: number;
  availableCategories: string[];
  requiredCategories: string[];
}): ExerciseExecutionResult["outcome"] {
  if (params.answer.kind === "refused") return "FAILED";
  if (params.itemCount === 0) {
    const anyRequired = params.requiredCategories.some((c) => params.availableCategories.includes(c));
    return anyRequired ? "FAILED" : "UNSUPPORTED";
  }
  if (params.answer.kind === "insufficient_evidence") return "UNSUPPORTED";
  if (params.missingInputs.length > 0) return "CONDITIONAL";
  if (/conditional|NOT DETERMINABLE|not capacity/i.test(params.answer.detail)) return "CONDITIONAL";
  return "SUBSTANTIVE";
}

export function executeExerciseOnSource(params: {
  exercise: ExerciseDefinition;
  ctx: SourceExerciseContext;
  runId: string;
}): ExerciseExecutionResult {
  const { exercise, ctx, runId } = params;
  const availableCategories = Object.keys(ctx.summary.countsByCategory ?? {});
  const answer = answerFromSummaryItems({
    question: exercise.question,
    items: ctx.items,
    researchOnly: true,
    limit: 8,
  });

  const matched = answer.citations.length;
  // Approximate matched item count from citations + permissions presence
  const itemCountMatched = Math.max(
    matched,
    ctx.items.filter((i) =>
      exercise.requiredCategories.length
        ? exercise.requiredCategories.includes(i.category)
        : true,
    ).length > 0
      ? Math.min(ctx.items.length, matched || 1)
      : 0,
  );

  const missingInputs = missingFinancials(
    exercise,
    ctx.financialInputsPresent,
    ctx.hasFinancialSnapshot,
  );

  const baskets = (answer.permissions ?? []).filter((p) =>
    /basket|\$|greater of|ratio|available amount|not to exceed|incremental/i.test(p),
  );
  const citedItems = ctx.items.filter((i) =>
    answer.citations.some((c) => c.sectionRef === i.sectionRef && c.sourceId === i.sourceId),
  );
  const categoryItems = ctx.items.filter((i) => exercise.requiredCategories.includes(i.category));
  let definitions = extractDefinitions(citedItems.length ? citedItems : categoryItems.slice(0, 8));
  if (definitions.length === 0 && ctx.summary.definedTermsSample?.length) {
    definitions = ctx.summary.definedTermsSample
      .slice(0, 12)
      .map((d) => `${d.term}: ${(d.excerpt ?? "").slice(0, 160)}`);
  }
  if (definitions.length === 0) {
    // Last resort: harvest capitalized contractual terms from the composed answer.
    const termHits = answer.detail.match(
      /\b(?:Consolidated (?:Total Assets|EBITDA|Net Income)|(?:Total|First Lien|Secured) Leverage Ratio|Available Amount|Permitted Liens?|Indebtedness)\b/g,
    );
    if (termHits?.length) definitions = [...new Set(termHits)].slice(0, 12);
  }

  const conditions = [
    ...new Set(
      ctx.items
        .filter((i) => answer.citations.some((c) => c.sectionRef === i.sectionRef))
        .flatMap((i) => i.conditions ?? [])
        .slice(0, 12),
    ),
  ];

  const alternatives = [
    ...new Set(
      ctx.items
        .filter((i) => answer.citations.some((c) => c.sectionRef === i.sectionRef))
        .flatMap((i) => i.alternativeInterpretations ?? i.analysis?.alternativeInterpretations ?? [])
        .slice(0, 8),
    ),
  ];

  const assumptions = [
    ...new Set(
      ctx.items
        .filter((i) => answer.citations.some((c) => c.sectionRef === i.sectionRef))
        .flatMap((i) => i.assumptions ?? i.analysis?.assumptions ?? [])
        .slice(0, 8),
    ),
  ];
  if (missingInputs.length) {
    assumptions.push(`Missing financial inputs: ${missingInputs.join(", ")}`);
  }

  const formula = conditionalFormula(exercise, answer);
  const outcome = classifyOutcome({
    answer,
    missingInputs,
    itemCount: itemCountMatched,
    availableCategories,
    requiredCategories: exercise.requiredCategories,
  });

  const earlyGaps: AnalyticalGap[] = [];
  if (answer.kind === "insufficient_evidence") {
    earlyGaps.push({
      category: "RETRIEVAL_MISS",
      origin: "SOFTWARE",
      message: "Ask returned insufficient evidence for this exercise question",
      exerciseId: exercise.exerciseId,
      sourceId: ctx.sourceId,
    });
  }

  const result: ExerciseExecutionResult = {
    exerciseId: exercise.exerciseId,
    sourceId: ctx.sourceId,
    runId,
    executedAt: new Date().toISOString(),
    outcome,
    headline: answer.headline,
    analysis: answer.detail,
    citations: answer.citations.map((c) => ({
      sectionRef: c.sectionRef,
      excerpt: c.excerpt,
      posture: c.posture,
    })),
    restrictions: answer.restrictions ?? [],
    permissions: answer.permissions ?? [],
    baskets,
    definitions,
    conditions,
    assumptions,
    alternatives,
    requiredInputs: [...exercise.requiredFinancialInputs],
    missingInputs,
    conditionalFormula: formula,
    supportedAmountNote:
      exercise.amountMillions != null
        ? outcome === "SUBSTANTIVE"
          ? `Textual pathway identified for $${exercise.amountMillions}M; numerical capacity not asserted without executable rules + inputs.`
          : formula
        : undefined,
    gaps: earlyGaps,
    itemCountMatched,
  };

  result.gaps = diagnoseExerciseResult({
    exercise,
    result,
    availableCategories,
    hasFinancialSnapshot: ctx.hasFinancialSnapshot,
  });

  return result;
}

export function buildContextFromSummary(params: {
  sourceId: string;
  summary: DocumentCovenantSummary;
  hasFinancialSnapshot?: boolean;
  financialInputsPresent?: string[];
}): SourceExerciseContext {
  return {
    sourceId: params.sourceId,
    summary: params.summary,
    items: params.summary.items.map((i) => ({ ...i, sourceId: params.sourceId })),
    hasFinancialSnapshot: params.hasFinancialSnapshot ?? false,
    financialInputsPresent: params.financialInputsPresent,
  };
}

export function buildContextFromMetadata(params: {
  sourceId: string;
  metadata: unknown;
  hasFinancialSnapshot?: boolean;
  financialInputsPresent?: string[];
}): SourceExerciseContext | null {
  const summary = summarizeFromStoredMetadata(params.metadata);
  if (!summary) return null;
  return buildContextFromSummary({
    sourceId: params.sourceId,
    summary,
    hasFinancialSnapshot: params.hasFinancialSnapshot,
    financialInputsPresent: params.financialInputsPresent,
  });
}

export function detectPatternsFromResult(result: ExerciseExecutionResult): string[] {
  const hay = [result.analysis, ...result.permissions, ...result.baskets, ...result.restrictions].join(
    "\n",
  );
  return detectPatternsInText(hay);
}

export function resolveExercises(filter?: {
  family?: ExerciseDefinition["family"];
  tag?: string;
  ids?: string[];
  verticalSliceOnly?: boolean;
}): ExerciseDefinition[] {
  if (filter?.verticalSliceOnly) {
    return listExercises({ ids: ["debt.secured.100"] });
  }
  if (filter?.ids?.length || filter?.family || filter?.tag) {
    return listExercises(filter);
  }
  return listExercises();
}

export function getExerciseOrThrow(exerciseId: string): ExerciseDefinition {
  const e = getExercise(exerciseId);
  if (!e) throw new Error(`Unknown exercise: ${exerciseId}`);
  return e;
}
