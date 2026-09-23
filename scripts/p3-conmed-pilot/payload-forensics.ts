/**
 * Long-provision compiler payload forensics. DETERMINISTIC AND FREE — no model call.
 *
 * Builds the exact payloads the compiler would send for representative candidates and
 * measures every component, so the question "why does a 9,045-char provision time out
 * when a 200-char one completes in 65s" is answered from measured context behaviour
 * rather than from speculation about the model.
 *
 * Tokens use the project's own CALIBRATED_TOKENS_PER_CHAR, the same constant the shard
 * planner budgets with, so these figures are commensurable with production's own limits.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSystemPrompt, buildFewShotExamplesBlock } from "../../lib/contract-model/compiler/semantic/prompt";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import { CALIBRATED_TOKENS_PER_CHAR, FIXED_CALL_OVERHEAD_CHARS } from "../../lib/contract-model/compiler/semantic/shard-types";
import { DEFAULT_SHARD_BUDGET, MAX_FIRST_TURN_INPUT_TOKENS } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { operativeTextFor } from "./pipeline";
import { buildInput, prepare } from "./compile-run";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";

const OUT = "docs/phase-3-long-provision-forensics";
export const tok = (chars: number) => Math.ceil(chars * CALIBRATED_TOKENS_PER_CHAR);

/** The four representative candidates, chosen structurally by source length. */
export const CASES = [
  { slot: "SHORT_CONTROL", ref: "7.2(e)", approxChars: 200 },
  { slot: "MEDIUM", ref: null, approxChars: 3500 },
  { slot: "LONG", ref: "7.2(e)", approxChars: 9045 },
  { slot: "HARD", ref: "7.2(k)", approxChars: 9621 },
] as const;

export interface ComponentBreakdown {
  slot: string;
  sourceSectionRef: string;
  sourceChars: number;
  sourceTokens: number;
  systemPromptChars: number;
  fewShotChars: number;
  toolSchemaChars: number;
  contextBundleChars: number;
  contextItemCount: number;
  contextItemChars: number;
  operativeTextInBundleChars: number;
  accountabilityChars: number;
  initialPromptChars: number;
  initialPromptTokens: number;
  expansionRatio: number;
  fixedOverheadShare: number;
}

/** The context bundle the caller actually sends, rebuilt from the same input object. */
function bundleText(input: SemanticCompilerInput): string {
  // Mirrors summarizeContextBundle's structure without importing a private symbol.
  const items = input.contextBundle.items.map((i) => JSON.stringify(i)).join("\n");
  const unresolved = input.contextBundle.unresolvedDependencies.map((u) => JSON.stringify(u)).join("\n");
  return [`Operative source text (${input.sourceSectionRef ?? ""}):`, input.operativeSourceText, "", items, unresolved].join("\n");
}

export function measure(slot: string, input: SemanticCompilerInput): ComponentBreakdown {
  const system = buildSystemPrompt({ irSchemaVersion: IR_SCHEMA_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION });
  const fewShot = buildFewShotExamplesBlock();
  const tools = buildToolSet(input.toolAccess, input.sourceDocumentId, { current: 0 }, DEFAULT_TOOL_BUDGET);
  const toolSchemaChars = JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))).length;
  const bundle = bundleText(input);
  const itemChars = input.contextBundle.items.reduce((s, i) => s + JSON.stringify(i).length, 0);

  const sourceChars = input.operativeSourceText.length;
  const initialPromptChars = system.length + fewShot.length + toolSchemaChars + bundle.length;
  const fixed = system.length + fewShot.length + toolSchemaChars;
  return {
    slot,
    sourceSectionRef: String(input.sourceSectionRef ?? "?"),
    sourceChars,
    sourceTokens: tok(sourceChars),
    systemPromptChars: system.length,
    fewShotChars: fewShot.length,
    toolSchemaChars,
    contextBundleChars: bundle.length,
    contextItemCount: input.contextBundle.items.length,
    contextItemChars: itemChars,
    operativeTextInBundleChars: sourceChars,
    accountabilityChars: bundle.length - sourceChars - itemChars,
    initialPromptChars,
    initialPromptTokens: tok(initialPromptChars),
    expansionRatio: Number((tok(initialPromptChars) / Math.max(1, tok(sourceChars))).toFixed(1)),
    fixedOverheadShare: Number((fixed / initialPromptChars).toFixed(3)),
  };
}

/**
 * Deterministic context growth across the tool loop. Every turn resends the ENTIRE prior
 * conversation — that is how the Messages API works — so the per-turn cost is cumulative,
 * and the compiler's own budget caps only the NEW evidence, never the resend.
 */
export function projectToolLoop(b: ComponentBreakdown, budget = DEFAULT_TOOL_BUDGET) {
  const rows: { turn: number; newEvidenceChars: number; cumulativeContextChars: number; cumulativeTokens: number; billedTokensIfResent: number }[] = [];
  const perCallEvidence = Math.floor(budget.maxAdditionalSourceChars / budget.maxToolCalls);
  let cumulative = b.initialPromptChars;
  let billed = 0;
  for (let turn = 0; turn <= budget.maxToolCalls; turn++) {
    const newEvidence = turn === 0 ? 0 : perCallEvidence;
    cumulative += newEvidence;
    billed += tok(cumulative);
    rows.push({ turn, newEvidenceChars: newEvidence, cumulativeContextChars: cumulative, cumulativeTokens: tok(cumulative), billedTokensIfResent: billed });
  }
  return rows;
}

async function main() {
  const { stages, bundles, rehydrated } = await prepare();
  const withText = rehydrated.map((c) => ({ c, chars: operativeTextFor(c, stages.index).length })).filter((x) => x.chars > 0);

  const pick = (slot: string, ref: string | null, target: number) => {
    const pool = ref ? withText.filter((x) => String(x.c.normalizedSourceRef) === ref) : withText;
    const best = pool.sort((a, b) => Math.abs(a.chars - target) - Math.abs(b.chars - target))[0]!;
    return { slot, cand: best.c, chars: best.chars };
  };
  const chosen = CASES.map((c) => pick(c.slot, c.ref, c.approxChars));

  const breakdowns: ComponentBreakdown[] = [];
  for (const { slot, cand } of chosen) {
    const input = buildInput(cand, bundles.get(cand.discoveryId), stages, undefined as never, []);
    breakdowns.push(measure(slot, input));
  }

  console.log("=== PER-COMPONENT PAYLOAD (chars, and tokens at the project's own calibration) ===");
  for (const b of breakdowns) {
    console.log(`\n${b.slot}  ${b.sourceSectionRef}  source ${b.sourceChars} chars / ${b.sourceTokens} tok`);
    console.log(`  system prompt      ${String(b.systemPromptChars).padStart(7)} ch  ${String(tok(b.systemPromptChars)).padStart(6)} tok`);
    console.log(`  few-shot examples  ${String(b.fewShotChars).padStart(7)} ch  ${String(tok(b.fewShotChars)).padStart(6)} tok`);
    console.log(`  tool schemas       ${String(b.toolSchemaChars).padStart(7)} ch  ${String(tok(b.toolSchemaChars)).padStart(6)} tok`);
    console.log(`  context bundle     ${String(b.contextBundleChars).padStart(7)} ch  ${String(tok(b.contextBundleChars)).padStart(6)} tok  (${b.contextItemCount} items, ${b.contextItemChars} ch)`);
    console.log(`  INITIAL PROMPT     ${String(b.initialPromptChars).padStart(7)} ch  ${String(b.initialPromptTokens).padStart(6)} tok   expansion x${b.expansionRatio}  fixed share ${(b.fixedOverheadShare * 100).toFixed(1)}%`);
  }

  console.log("\n=== TOOL-LOOP CONTEXT GROWTH (cumulative resend per turn) ===");
  for (const b of breakdowns) {
    const rows = projectToolLoop(b);
    const last = rows[rows.length - 1]!;
    console.log(`${b.slot.padEnd(14)} turn0 ${String(rows[0]!.cumulativeTokens).padStart(6)} tok -> turn${last.turn} ${String(last.cumulativeTokens).padStart(6)} tok | TOTAL BILLED if all ${DEFAULT_TOOL_BUDGET.maxToolCalls} calls used: ${last.billedTokensIfResent.toLocaleString()} tok`);
  }

  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), OUT, "01-component-breakdown.json"), JSON.stringify({
    calibration: { tokensPerChar: CALIBRATED_TOKENS_PER_CHAR, fixedCallOverheadChars: FIXED_CALL_OVERHEAD_CHARS, maxFirstTurnInputTokens: MAX_FIRST_TURN_INPUT_TOKENS },
    toolBudget: DEFAULT_TOOL_BUDGET,
    shardBudget: DEFAULT_SHARD_BUDGET,
    breakdowns,
    toolLoop: Object.fromEntries(breakdowns.map((b) => [b.slot, projectToolLoop(b)])),
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/01-component-breakdown.json`);
}

if (process.argv[1]?.endsWith("payload-forensics.ts")) void main();
