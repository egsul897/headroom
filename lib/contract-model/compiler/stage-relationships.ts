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
  // Real, closed ContractRuleRelationshipType enum values ONLY
  // (prisma/schema.prisma) - real evidence this list previously included
  // several invalid values (STACKS_WITH, REDUCES, INCREASES, CONDITIONED_ON,
  // EXCEPTION_TO, BLOCKED_BY, REFINANCES, SUPERSEDES caused a real Prisma
  // write failure on the LSB run) motivated both this correction and the
  // schema-level zodEnumFromPrismaEnum fix in lib/contract-model/types.ts.
  "For each pair of rules that interact, extract a relationship of exactly one of these real types: ALTERNATIVE_TO, CONCURRENT_COUNTED, CONCURRENT_DISREGARDED, INDEPENDENT_REQUIREMENT, SHARES_CAPACITY_WITH, REQUIRES, LIMITED_BY, AUTOMATIC_LINKED_PERMISSION, BASKET_FEEDING, COMBINABLE, RECLASSIFIABLE_TO, REDESIGNATES_TO, EXCLUDED_FROM, OVERRIDES, ACTIVATES, DEACTIVATES, PARAMETER_ADJUSTMENT_TRIGGER, SOURCE_PRECEDENCE - whichever is the closest real fit. A general prohibition and one of its own enumerated exceptions is best represented as EXCLUDED_FROM (the exception is excluded from the prohibition's scope).",
  "Only extract a relationship you can point to real textual evidence for (one rule's exceptions/conditions referencing another, a shared defined-term capacity pool, an explicit cross-reference). Do not guess at relationships that are not evidenced.",
  "It is correct and expected to return zero relationships if the rules given do not actually interact.",
  // Real evidence this exact instruction was missing and mattered (LSB run,
  // docs/phase-c-contract-compiler-v1.md): without it, the model correctly
  // found 66 real relationships but echoed back the full bracketed summary
  // line (e.g. 'Section 6.01(a) [INDEBTEDNESS/EXCEPTION]') as fromRuleRef/
  // toRuleRef instead of the bare citation, so 100% failed to resolve
  // against the real persisted rule set - a parsing-contract bug, not a
  // semantic one.
  "CRITICAL: fromRuleRef and toRuleRef must be EXACTLY the bare source section citation as given below (e.g. '6.01(a)' or 'Section 6.01(a)', copied verbatim from the line's own leading citation) - never include the bracketed family/type annotation or any other text from that line in these two fields.",
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
