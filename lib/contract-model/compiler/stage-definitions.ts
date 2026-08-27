/**
 * Phase C Stage 2 - DEFINED-TERM INVENTORY (task §10). A real, separate LLM
 * call from rule extraction - "inventory first" (task §12), never folded
 * into the same call, so a definition backlog exists before any rule tries
 * to depend on it. Deliberately scoped to ONLY the document's own
 * Definitions article/section where the caller can isolate one (bounded
 * context, task §16) - falls back to the whole document text if no
 * Definitions-shaped section was found structurally, which is the honest,
 * generalized behavior for a package where definitions are not in one place.
 */
import type { StageCaller } from "./llm-caller";
import { DefinitionsStageSchema, type DefinitionsStageOutput } from "./schemas";
import type { CompilerDocumentInput, StageRunResult } from "./types";

const SYSTEM_PROMPT = [
  "You are extracting the defined-term inventory from a real financing document.",
  "For every term that is formally defined (capitalized term followed by a definition, or referenced as '(as defined below)'/'(as defined in Section X)'), extract it as a DefinedTerm candidate with its exact source section reference and a faithful excerpt of its definition text.",
  "Do not attempt to fully resolve nested term dependencies here - that is a separate stage. Just build the inventory: what terms exist, and where each is defined.",
  "Never invent a term that does not appear in the text.",
].join(" ");

export async function runDefinitionsStage(caller: StageCaller, documents: CompilerDocumentInput[]): Promise<StageRunResult<DefinitionsStageOutput>> {
  const content = documents.map((d) => `--- ${d.label} (documentId=${d.documentId}) ---\n${d.text}`).join("\n\n");
  try {
    const output = await caller.call(DefinitionsStageSchema, "definitions_inventory", SYSTEM_PROMPT, content);
    return { status: "COMPLETED", output, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry() };
  } catch (err) {
    return { status: "FAILED", output: { definedTerms: [] }, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), error: err instanceof Error ? err.message : String(err) };
  }
}
