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

/**
 * Above this size, a single-ARTICLE (or whole-document, when no article
 * boundary exists) segment is further subdivided by its own SECTION nodes.
 * Real evidence this threshold matters (docs/phase-c-contract-compiler-v1.md):
 * the FWRG package has exactly one ARTICLE (its entire Negative Covenants
 * article), so ARTICLE-only batching degenerated to a single ~104K-character
 * call and failed a structured-output validation check partway through a
 * very long rules[] array - reproducing C0's own "single call doesn't
 * scale" finding one level down. LSB's own ARTICLE VI batch (~16.8K chars,
 * under this threshold) succeeded whole. This is a real, measured data
 * point informing the threshold, not an arbitrary guess.
 */
const SECTION_SPLIT_THRESHOLD_CHARS = 25_000;

/** Splits a document's text into bounded batches using the STRUCTURE stage's own ARTICLE/SECTION nodes: ARTICLE-level first, then further split by SECTION when an article (or the whole document, if no article boundary exists) exceeds SECTION_SPLIT_THRESHOLD_CHARS. Any lead-in text before the first section (a chapeau like "The Loan Parties will not...") is prepended to that first section's own batch, never dropped. */
export function buildRuleExtractionBatches(documents: CompilerDocumentInput[], structuralNodes: StructuralNode[], definedTerms: CandidateDefinedTerm[]): RuleExtractionBatch[] {
  const batches: RuleExtractionBatch[] = [];
  for (const doc of documents) {
    const articles = structuralNodes.filter((n) => n.documentId === doc.documentId && n.nodeType === "ARTICLE").sort((a, b) => a.charStart - b.charStart);
    const sections = structuralNodes.filter((n) => n.documentId === doc.documentId && n.nodeType === "SECTION").sort((a, b) => a.charStart - b.charStart);

    const segments: { start: number; end: number; label: string }[] =
      articles.length === 0
        ? [{ start: 0, end: doc.text.length, label: doc.label }]
        : articles.map((article, i) => ({ start: article.charStart, end: articles[i + 1] ? articles[i + 1]!.charStart : doc.text.length, label: `${doc.label} / ${article.heading || article.sectionRef}` }));

    for (const segment of segments) {
      const segmentText = doc.text.slice(segment.start, segment.end);
      if (segmentText.trim().length === 0) continue;

      const innerSections = sections.filter((s) => s.charStart >= segment.start && s.charStart < segment.end);
      if (segmentText.length <= SECTION_SPLIT_THRESHOLD_CHARS || innerSections.length < 2) {
        batches.push({ documentId: doc.documentId, label: segment.label, text: segmentText, relevantDefinedTerms: definedTerms });
        continue;
      }

      for (let i = 0; i < innerSections.length; i++) {
        const section = innerSections[i]!;
        const chunkStart = i === 0 ? segment.start : section.charStart; // first sub-batch also carries the segment's own lead-in/chapeau text.
        const chunkEnd = innerSections[i + 1] ? innerSections[i + 1]!.charStart : segment.end;
        const text = doc.text.slice(chunkStart, chunkEnd);
        if (text.trim().length === 0) continue;
        batches.push({ documentId: doc.documentId, label: `${segment.label} / ${section.heading || section.sectionRef}`, text, relevantDefinedTerms: definedTerms });
      }
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
