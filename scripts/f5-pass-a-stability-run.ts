/**
 * F-5 PAID VALIDATION HARNESS - Pass A run A + run B on ONE real unit (Chewy §6.08) through the v4 slot-scoped
 * inventory, with a hard incremental spend cap and a gateway-balance precheck that ABORTS before any paid call.
 *
 *   npx tsx scripts/f5-pass-a-stability-run.ts precheck              # $0: balance, estimate, go/no-go record
 *   npx tsx scripts/f5-pass-a-stability-run.ts run <label>           # two independent Pass A runs (A, B), preserved
 *
 * Never: whole-document discovery, compiler, verifier, 3E Layer C, other sections. Outputs are preserved under
 * tests/fixtures/unseen-packages/phase-3-remediation-f5-run/<label>/ (run-A.json, run-B.json, ledger.json, pair.json).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ZodType } from "zod";
if (!process.env.AI_GATEWAY_API_KEY) {
  try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no local env */ }
}
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import { calculateCostUsd } from "../lib/contract-model/analyzer/telemetry";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { batchSlots, partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../lib/contract-model/compiler/semantic-accountability/prompt";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const OUT_ROOT = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run";
const HARD_INCREMENTAL_CAP_USD = 8.0;
const CHARS_PER_TOKEN = 3.2;
/** Observed on the frozen runs: ~100k output tokens per whole-unit first pass at v3. Per bounded v4 call the ceiling assumed for the go/no-go estimate is proportional to the batch's share of the unit, floored generously. */
const ASSUMED_OUTPUT_TOKENS_PER_CALL = 16_000;

async function gatewayCredits(): Promise<{ balance: number; totalUsed: number } | null> {
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { balance: string; total_used: string };
    return { balance: Number(j.balance), totalUsed: Number(j.total_used) };
  } catch { return null; }
}

interface LedgerEntry { n: number; stage: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; estimatedBeforeCallUsd: number; at: string }
const ledger: { cap: number; spent: number; calls: LedgerEntry[]; refusals: { stage: string; estimatedUsd: number; spentUsd: number; at: string }[] } = { cap: HARD_INCREMENTAL_CAP_USD, spent: 0, calls: [], refusals: [] };
class BudgetExhaustedError extends Error {}
class GuardedStageCaller implements StageCaller {
  providerName: string; model: string; isSynthetic = false;
  constructor(private inner: StageCaller, private label: string) { this.providerName = inner.providerName; this.model = inner.model; }
  async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    const est = calculateCostUsd(Math.ceil((systemPrompt.length + userContent.length) / CHARS_PER_TOKEN), ASSUMED_OUTPUT_TOKENS_PER_CALL, this.model) ?? 0;
    if (ledger.spent + est > ledger.cap) {
      ledger.refusals.push({ stage: `${this.label}:${stage}`, estimatedUsd: est, spentUsd: ledger.spent, at: new Date().toISOString() });
      throw new BudgetExhaustedError(`BUDGET_EXHAUSTED before ${this.label}:${stage}: spent $${ledger.spent.toFixed(4)} + est $${est.toFixed(4)} > cap $${ledger.cap.toFixed(2)}`);
    }
    const out = await this.inner.call(schema, stage, systemPrompt, userContent);
    const t = this.inner.lastTelemetry();
    const cost = calculateCostUsd((t?.inputTokens ?? 0) + (t?.cachedInputTokens ?? 0) + (t?.cacheCreationInputTokens ?? 0), t?.outputTokens ?? ASSUMED_OUTPUT_TOKENS_PER_CALL, this.model) ?? 0;
    ledger.spent += cost;
    ledger.calls.push({ n: ledger.calls.length + 1, stage: `${this.label}:${stage}`, model: this.model, inputTokens: t?.inputTokens ?? 0, outputTokens: t?.outputTokens ?? 0, costUsd: cost, estimatedBeforeCallUsd: est, at: new Date().toISOString() });
    return out;
  }
  lastTelemetry(): AnalyzerCallTelemetry | null { return this.inner.lastTelemetry(); }
}

function buildUnit() {
  const text = readFileSync(SRC, "utf-8");
  const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
  const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
  const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
  const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
  const recorded = unit.compile.sourceContext.regions[0];
  if (section.charStart !== recorded.charStart || section.charEnd !== recorded.charEnd) throw new Error(`6.08 anchor drifted: ${section.charStart}-${section.charEnd} vs recorded ${recorded.charStart}-${recorded.charEnd}`);
  const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
  if (sourceContext.regions[0]!.text !== recorded.text) throw new Error("operative text differs from the frozen paid-run unit");
  return { index, sourceContext, candidateRef: unit.candidateRef as string };
}

async function main() {
  const mode = process.argv[2] ?? "precheck";
  const label = process.argv[3] ?? new Date().toISOString().replace(/[:.]/g, "-");
  const { index, sourceContext, candidateRef } = buildUnit();
  const stage = getStageCaller();
  if (stage.isSynthetic) throw new Error("no real AI_GATEWAY_API_KEY - refusing to proceed");
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  const batches = batchSlots(partition.slots.length ? { slots: partition.slots.filter((s) => s.regionId === sourceContext.regions[0]!.regionId), methods: partition.methods } : partition, sourceContext);
  const inputTokens = batches.reduce((n, b) => n + Math.ceil((buildInventorySystemPrompt().length + buildInventoryUserContent(sourceContext, b).length) / CHARS_PER_TOKEN), 0);
  const perRunCallsUpper = batches.length * 2; // first pass + up to one gap call per batch
  const perRunEstimate = (calculateCostUsd(inputTokens * 2, ASSUMED_OUTPUT_TOKENS_PER_CALL * perRunCallsUpper, stage.model) ?? 0);
  const pairEstimate = perRunEstimate * 2;
  const credits = await gatewayCredits();
  const record = { at: new Date().toISOString(), model: stage.model, versions: { accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION }, unit: { sectionRef: "6.08", chars: sourceContext.regions[0]!.text.length, regions: sourceContext.regions.length, state: sourceContext.state }, partition: { slots: partition.slots.length, batches: batches.length, methods: partition.methods }, estimate: { inputTokensPerRun: inputTokens, assumedOutputTokensPerCall: ASSUMED_OUTPUT_TOKENS_PER_CALL, callsPerRunUpperBound: perRunCallsUpper, perRunUsdUpperBound: Number(perRunEstimate.toFixed(4)), pairUsdUpperBound: Number(pairEstimate.toFixed(4)) }, hardIncrementalCapUsd: HARD_INCREMENTAL_CAP_USD, gatewayCredits: credits, decision: "" as string };
  if (!credits) record.decision = "ABORT: gateway credits could not be read";
  else if (pairEstimate > HARD_INCREMENTAL_CAP_USD) record.decision = `ABORT: pair estimate $${pairEstimate.toFixed(2)} exceeds the $${HARD_INCREMENTAL_CAP_USD} cap`;
  else if (credits.balance < pairEstimate) record.decision = `ABORT: gateway balance $${credits.balance.toFixed(4)} is below the pair estimate $${pairEstimate.toFixed(2)} - no paid call made`;
  else record.decision = "GO";
  mkdirSync("docs/phase-3-remediation-f5", { recursive: true });
  writeFileSync("docs/phase-3-remediation-f5/07-paid-run-precheck.json", JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 1));
  if (mode === "precheck" || record.decision !== "GO") {
    if (record.decision !== "GO") console.log("NOT RUNNING - see decision");
    return;
  }
  const dir = `${OUT_ROOT}/${label}`;
  mkdirSync(dir, { recursive: true });
  const before = credits!;
  const runs: Record<string, unknown> = {};
  for (const tag of ["A", "B"]) {
    const caller = new GuardedStageCaller(getStageCaller(), `passA-${tag}`);
    const inv = await runSemanticInventory({ candidateRef, documentId: "doc-a", sourceContext, structuralIndex: index, caller });
    runs[tag] = inv;
    writeFileSync(`${dir}/run-${tag}.json`, JSON.stringify(inv, null, 1));
    console.log(`run ${tag}: ${inv.inventoryStatus} items=${inv.items.length} calls=${(inv.partition?.firstPassCalls ?? 0) + (inv.partition?.gapCalls ?? 0)} spent=$${ledger.spent.toFixed(4)}`);
  }
  const after = await gatewayCredits();
  writeFileSync(`${dir}/ledger.json`, JSON.stringify({ ...ledger, creditsBefore: before, creditsAfter: after, gatewayReportedSpendUsd: after ? after.totalUsed - before.totalUsed : null }, null, 2));
  writeFileSync(`${dir}/pair.json`, JSON.stringify({ regionText: sourceContext.regions[0]!.text, run1: runs.A, run2: runs.B }, null, 1));
  console.log(`preserved under ${dir}; spent $${ledger.spent.toFixed(4)} (rate card)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
