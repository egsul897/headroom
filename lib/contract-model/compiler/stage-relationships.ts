/**
 * Phase C Stage 6 - RELATIONSHIP EXTRACTION (task §24/§25). C0 flagged this
 * as UNTESTED/LIKELY WEAK (zero relationships extracted in the one real C0
 * run, which asked for them inside the same combined call as everything
 * else). This stage gives relationship extraction its OWN real LLM call,
 * given only the already-extracted rules' own citations/summaries (not the
 * full document again) - a direct, testable response to that finding, not
 * a repeat of the same under-attended request.
 */
import type { StageCaller } from "./llm-caller";
import { RelationshipStageSchema, type RelationshipStageOutput } from "./schemas";
import type { CandidateContractRule } from "../types";
import type { StageRunResult } from "./types";

const SYSTEM_PROMPT = [
  "You are identifying RELATIONSHIPS between already-extracted contract rules from the same financing package - you are given a list of rules (their source section, covenant family, and a short description), not the raw document text.",
  "For each pair of rules that interact, extract a relationship: STACKS_WITH, SHARES_CAPACITY_WITH, REDUCES, INCREASES, RECLASSIFIABLE_TO, CONDITIONED_ON, EXCEPTION_TO, BLOCKED_BY, REQUIRES, ALTERNATIVE_TO, REFINANCES, or SUPERSEDES - whichever is the closest real fit.",
  "Only extract a relationship you can point to real textual evidence for (one rule's exceptions/conditions referencing another, a shared defined-term capacity pool, an explicit cross-reference). Do not guess at relationships that are not evidenced.",
  "It is correct and expected to return zero relationships if the rules given do not actually interact.",
].join(" ");

function summarizeRule(rule: CandidateContractRule): string {
  return `${rule.sourceSectionRef} [${rule.covenantFamily}/${rule.ruleType}] action=${rule.action} threshold=${rule.thresholdValue ?? "n/a"}${rule.thresholdUnit ?? ""} formula=${rule.formulaRef ?? "n/a"} notes=${rule.notes ?? ""}`;
}

export async function runRelationshipsStage(caller: StageCaller, rules: CandidateContractRule[]): Promise<StageRunResult<RelationshipStageOutput>> {
  if (rules.length < 2) {
    return { status: "COMPLETED", output: { relationships: [] }, provider: caller.providerName, model: caller.model, telemetry: null, notes: ["Fewer than 2 rules extracted - no relationship pass attempted (nothing to relate)."] };
  }
  const content = `Extracted rules:\n${rules.map(summarizeRule).join("\n")}`;
  try {
    const output = await caller.call(RelationshipStageSchema, "relationship_extraction", SYSTEM_PROMPT, content);
    return { status: "COMPLETED", output, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry() };
  } catch (err) {
    return { status: "FAILED", output: { relationships: [] }, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), error: err instanceof Error ? err.message : String(err) };
  }
}
