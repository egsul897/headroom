/**
 * Phase C Stage 3 - INDEPENDENT MATERIAL-PROVISION INVENTORY (task §13/§14).
 * Answers "what appears to require analysis?" - deliberately NOT dependent
 * on whether rule extraction later succeeds (task §13's own "must not
 * depend on successful detailed rule extraction"). This is what COVERAGE
 * (stage-coverage.ts) diffs against modeled output; it is a separate real
 * LLM call from RULE_EXTRACTION, over the same structural node list, asking
 * a narrower and cheaper question (classify, don't extract).
 */
import type { StageCaller } from "./llm-caller";
import { InventoryStageSchema, type InventoryStageOutput } from "./schemas";
import type { CompilerDocumentInput, StageRunResult, StructuralNode } from "./types";

const SYSTEM_PROMPT = [
  "You are building a material-provision inventory for a real financing document, given its own real section headers.",
  "For EVERY section listed, classify it as exactly one of: MATERIAL_RULE_CANDIDATE (looks like it imposes/permits/restricts something a covenant-capacity system would need to model), DEFINITION (a defined-terms section), QUALITATIVE_OBLIGATION (a real obligation that is not a quantitative rule - e.g. reporting, notice), BOILERPLATE_NOT_APPLICABLE (headings, general provisions, miscellaneous, governing law, etc - not material), UNCERTAIN (you cannot tell from the heading/section alone), UNHANDLED (a real section that does not fit any of the above).",
  "This is an inventory pass, not a rule-extraction pass - do not extract thresholds, formulas, or conditions here. Only classify and give a one-sentence summary and, where MATERIAL_RULE_CANDIDATE, your best-guess CovenantFamily name (or null if unsure).",
  "Classify every section given - do not silently omit one.",
].join(" ");

export async function runInventoryStage(caller: StageCaller, documents: CompilerDocumentInput[], structuralNodes: StructuralNode[]): Promise<StageRunResult<InventoryStageOutput>> {
  const sectionList = structuralNodes
    .filter((n) => n.nodeType === "SECTION")
    .map((n) => `${n.documentId} | ${n.sectionRef}: ${n.heading}`)
    .join("\n");
  const content = `Real section list (documentId | sectionRef: heading):\n${sectionList}\n\nFull document text for context:\n${documents.map((d) => `--- ${d.label} ---\n${d.text}`).join("\n\n")}`;
  try {
    const output = await caller.call(InventoryStageSchema, "material_provision_inventory", SYSTEM_PROMPT, content);
    return { status: "COMPLETED", output, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry() };
  } catch (err) {
    return { status: "FAILED", output: { items: [] }, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), error: err instanceof Error ? err.message : String(err) };
  }
}
