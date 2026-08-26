/**
 * Phase C Stage 4 - BOUNDED RULE EXTRACTION (task §15/§16). The direct fix
 * for C0's own central finding: "never send an entire 300-page financing
 * package and request all structured rules" - this stage batches by real
 * structural boundary (ARTICLE, falling back to the whole document only
 * when no article boundary was found), one real LLM call per batch, each
 * given only that batch's own source text plus the already-inventoried
 * defined terms (task §16 - "avoid enormous irrelevant context").
 */
import type { StageCaller } from "./llm-caller";
import { RuleExtractionStageSchema, type RuleExtractionStageOutput } from "./schemas";
import type { CandidateDefinedTerm } from "../types";
import type { CompilerDocumentInput, StageRunResult, StructuralNode } from "./types";

const SYSTEM_PROMPT = [
  "You are extracting structured ContractRule candidates from ONE bounded batch of a real financing document - not the whole document.",
  "Extract every material provision in this batch as a structured rule: covenant family, rule type, evaluation class, action, entity scope, threshold value/unit, formula kind, conditions, exceptions, exact source section reference, and the defined terms it relies on.",
  "Be exact about numbers: if a basket is 'the greater of a fixed dollar amount and a percentage of a defined metric,' both numbers and the metric name must appear.",
  "Be exact about conditions: an unconditional permission should say so; a ratio-gated, no-default, entity-type, or time-limited condition must be included explicitly, never omitted.",
  "Never invent a source section reference. If a provision does not map cleanly onto the ontology, extract it anyway with evaluationClass JUDGMENT_REQUIRED or action OTHER rather than dropping it - a flagged, honest guess beats a confident, wrong, unflagged extraction, which is the one outcome this system must never produce.",
].join(" ");

export interface RuleExtractionBatch {
  documentId: string;
  label: string;
  text: string;
  relevantDefinedTerms: CandidateDefinedTerm[];
}

/** Splits a document's text into per-ARTICLE batches using the STRUCTURE stage's own nodes; a document with no detected articles becomes one whole-document batch. */
export function buildRuleExtractionBatches(documents: CompilerDocumentInput[], structuralNodes: StructuralNode[], definedTerms: CandidateDefinedTerm[]): RuleExtractionBatch[] {
  const batches: RuleExtractionBatch[] = [];
  for (const doc of documents) {
    const articles = structuralNodes.filter((n) => n.documentId === doc.documentId && n.nodeType === "ARTICLE").sort((a, b) => a.charStart - b.charStart);
    if (articles.length === 0) {
      batches.push({ documentId: doc.documentId, label: doc.label, text: doc.text, relevantDefinedTerms: definedTerms });
      continue;
    }
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]!;
      const next = articles[i + 1];
      const start = article.charStart;
      const end = next ? next.charStart : doc.text.length;
      const text = doc.text.slice(start, end);
      if (text.trim().length === 0) continue;
      batches.push({ documentId: doc.documentId, label: `${doc.label} / ${article.heading || article.sectionRef}`, text, relevantDefinedTerms: definedTerms });
    }
  }
  return batches;
}

export async function runRuleExtractionStage(caller: StageCaller, batches: RuleExtractionBatch[]): Promise<StageRunResult<RuleExtractionStageOutput>> {
  const allRules: RuleExtractionStageOutput["rules"] = [];
  let anyFailed = false;
  const errors: string[] = [];
  let lastTelemetry = null as StageRunResult<RuleExtractionStageOutput>["telemetry"];

  for (const batch of batches) {
    const termsBlock = batch.relevantDefinedTerms.map((t) => `${t.termName}${t.sourceSectionRef ? ` (${t.sourceSectionRef})` : ""}: ${t.definitionExcerpt ?? "(excerpt not captured)"}`).join("\n");
    const content = `Batch: ${batch.label} (documentId=${batch.documentId})\n\nRelevant already-inventoried defined terms:\n${termsBlock}\n\nBatch source text:\n${batch.text}`;
    try {
      const output = await caller.call(RuleExtractionStageSchema, `rule_extraction:${batch.label}`, SYSTEM_PROMPT, content);
      allRules.push(...output.rules);
      lastTelemetry = caller.lastTelemetry();
    } catch (err) {
      anyFailed = true;
      errors.push(`${batch.label}: ${err instanceof Error ? err.message : String(err)}`);
      lastTelemetry = caller.lastTelemetry();
    }
  }

  return {
    status: anyFailed ? (allRules.length > 0 ? "REVIEW_REQUIRED" : "FAILED") : "COMPLETED",
    output: { rules: allRules },
    provider: caller.providerName,
    model: caller.model,
    telemetry: lastTelemetry,
    error: errors.length > 0 ? errors.join("; ") : undefined,
    notes: anyFailed ? [`${errors.length}/${batches.length} batch(es) failed; successful batches' rules were preserved per task §74 (partial failure must not destroy successful work).`] : undefined,
  };
}
