/**
 * F-5.3B PAID CERTIFICATION PAIR - exactly TWO new independent Pass A executions over the frozen Chewy section 6.08
 * unit, run THROUGH THE PRODUCTION DUAL-PASS ORCHESTRATION (runDualPassSemanticInventory -> STRICT ensemble), with a
 * gateway-balance precheck that ABORTS before any paid call and a hard incremental spend cap.
 *
 *   npx tsx scripts/f5-3b-certification-pair.ts precheck            # $0: balance, estimate, preconditions, go/no-go
 *   npx tsx scripts/f5-3b-certification-pair.ts run                  # the pair (cert-pass-1, cert-pass-2) -> E2
 *
 * Never: a third pass, whole-document discovery, compiler, verifier, 3E, other sections. Neither pass receives any
 * prior paid output or the frozen human reference set - each receives the source context only (the same bounded
 * first pass + bounded gap pass as every Pass A run). Outputs are preserved under
 * tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
import { runDualPassSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { batchSlots, partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../lib/contract-model/compiler/semantic-accountability/prompt";
import { computePartitionHash, computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const E1_DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b";
const DOCS = "docs/phase-3-remediation-f5-3b";
const HARD_INCREMENTAL_CAP_USD = 8.0;
const CHARS_PER_TOKEN = 3.2;
const ASSUMED_OUTPUT_TOKENS_PER_CALL = 16_000;
const PASS_IDS: [string, string] = ["cert-pass-1", "cert-pass-2"];
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

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
/** Hard-cap guard around the real caller: refuses BEFORE a call whose estimate would breach the cap, and ledgers every call. */
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
  const { index, sourceContext, candidateRef } = buildUnit();
  const stage = getStageCaller();
  if (stage.isSynthetic) throw new Error("no real AI_GATEWAY_API_KEY - refusing to proceed");
  const runA = JSON.parse(readFileSync(`${E1_DIR}/run-A.json`, "utf-8")) as FrozenSemanticInventory;
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  const operative = sourceContext.regions[0]!.regionId;
  const batches = batchSlots({ slots: partition.slots.filter((s) => s.regionId === operative), methods: partition.methods }, sourceContext);
  const inputTokens = batches.reduce((n, b) => n + Math.ceil((buildInventorySystemPrompt().length + buildInventoryUserContent(sourceContext, b).length) / CHARS_PER_TOKEN), 0);
  const perRunCallsUpper = batches.length * 2;
  const perRunEstimate = calculateCostUsd(inputTokens * 2, ASSUMED_OUTPUT_TOKENS_PER_CALL * perRunCallsUpper, stage.model) ?? 0;
  const pairEstimate = perRunEstimate * 2;
  const observedF51PairUsd = (() => { try { const l = JSON.parse(readFileSync(`${E1_DIR}/ledger.json`, "utf-8")) as { spent: number }; return l.spent; } catch { return null; } })();
  const credits = await gatewayCredits();
  const e1Final = existsSync(`${DOCS}/06-e1-rebuilt-final-code.json`) ? (JSON.parse(readFileSync(`${DOCS}/06-e1-rebuilt-final-code.json`, "utf-8")) as { e1: { reproduced: boolean; observed: { frozenContentHash: string } } }) : null;
  const prereg = existsSync(`${DOCS}/03-scorer-preregistration.json`) ? (JSON.parse(readFileSync(`${DOCS}/03-scorer-preregistration.json`, "utf-8")) as { scorerSha256: string }) : null;
  const scorerHashNow = sha("scripts/f5-3b-ensemble-certification-score.py");
  const preconditions = {
    e1Reproduced: e1Final?.e1.reproduced === true,
    e1Hash: e1Final?.e1.observed.frozenContentHash ?? null,
    scorerFrozen: prereg !== null && prereg.scorerSha256 === scorerHashNow,
    scorerSha256: scorerHashNow,
    sameModelAsE1: stage.model === runA.model && stage.providerName === runA.provider,
    e1Model: `${runA.provider}/${runA.model}`,
    thisModel: `${stage.providerName}/${stage.model}`,
    sameSourceAsE1: computeSourceContextHash(sourceContext) === (JSON.parse(readFileSync(`${DOCS}/e1-final.json`, "utf-8")) as FrozenSemanticInventory).sourceContextHash,
    sameSlotsAsE1: partition.slots.length === (runA.partition?.slots.length ?? -1) && computePartitionHash(partition) === computePartitionHash(runA.partition!),
  };
  const record = { at: new Date().toISOString(), model: stage.model, provider: stage.providerName, versions: { accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION }, unit: { sectionRef: "6.08", chars: sourceContext.regions[0]!.text.length, regions: sourceContext.regions.length, state: sourceContext.state, sourceContextHash: computeSourceContextHash(sourceContext) }, partition: { slots: partition.slots.length, batches: batches.length, methods: partition.methods, partitionHash: computePartitionHash(partition) }, estimate: { inputTokensPerRun: inputTokens, assumedOutputTokensPerCall: ASSUMED_OUTPUT_TOKENS_PER_CALL, callsPerRunUpperBound: perRunCallsUpper, perRunUsdUpperBound: Number(perRunEstimate.toFixed(4)), pairUsdUpperBound: Number(pairEstimate.toFixed(4)), observedF51PairUsd: observedF51PairUsd }, hardIncrementalCapUsd: HARD_INCREMENTAL_CAP_USD, gatewayCredits: credits, preconditions, decision: "" as string };
  const failedPre = Object.entries(preconditions).filter(([k, v]) => typeof v === "boolean" && !v).map(([k]) => k);
  const worstCase = Math.max(pairEstimate, observedF51PairUsd ?? 0);
  if (failedPre.length > 0) record.decision = `ABORT: preconditions failed: ${failedPre.join(", ")}`;
  else if (!credits) record.decision = "ABORT: gateway credits could not be read";
  else if (worstCase > HARD_INCREMENTAL_CAP_USD) record.decision = `ABORT: pair estimate $${worstCase.toFixed(2)} exceeds the $${HARD_INCREMENTAL_CAP_USD} cap`;
  else if (credits.balance < worstCase) record.decision = `ABORT: gateway balance $${credits.balance.toFixed(4)} is below the pair estimate $${worstCase.toFixed(2)} - no paid call made`;
  else record.decision = "GO";
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(`${DOCS}/04-paid-pair-precheck.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 1));
  if (mode === "precheck" || record.decision !== "GO") {
    if (record.decision !== "GO") console.log("NOT RUNNING - see decision");
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const before = credits!;
  const callers: [StageCaller, StageCaller] = [new GuardedStageCaller(getStageCaller(), PASS_IDS[0]), new GuardedStageCaller(getStageCaller(), PASS_IDS[1])];
  // THE PRODUCTION PATH: two independent Pass A executions -> deterministic STRICT ensemble. No prior output, no reference set.
  const dual = await runDualPassSemanticInventory({ candidateRef, documentId: "doc-a", sourceContext, structuralIndex: index, passCallers: callers, passIds: PASS_IDS });
  writeFileSync(`${OUT_DIR}/run-C.json`, JSON.stringify(dual.passes[0]!.inventory, null, 1));
  writeFileSync(`${OUT_DIR}/run-D.json`, JSON.stringify(dual.passes[1]!.inventory, null, 1));
  writeFileSync(`${OUT_DIR}/e2.json`, JSON.stringify(dual.inventory, null, 1));
  for (const p of dual.passes) console.log(`${p.passId}: ${p.inventory.inventoryStatus} items=${p.inventory.items.length} calls=${(p.inventory.partition?.firstPassCalls ?? 0) + (p.inventory.partition?.gapCalls ?? 0)} cost=$${(p.inventory.telemetryCostUsd ?? 0).toFixed(4)}`);
  console.log(`ensembleBuilt=${dual.ensembleBuilt} ${dual.ensembleRefusal ?? ""} status=${dual.inventory.inventoryStatus} items=${dual.inventory.items.length} spent=$${ledger.spent.toFixed(4)}`);
  const after = await gatewayCredits();
  writeFileSync(`${OUT_DIR}/ledger.json`, JSON.stringify({ ...ledger, creditsBefore: before, creditsAfter: after, gatewayReportedSpendUsd: after ? after.totalUsed - before.totalUsed : null, passIds: PASS_IDS, ensembleBuilt: dual.ensembleBuilt, ensembleRefusal: dual.ensembleRefusal }, null, 2));
  writeFileSync(`${OUT_DIR}/pair.json`, JSON.stringify({ regionText: sourceContext.regions[0]!.text, run1: dual.passes[0]!.inventory, run2: dual.passes[1]!.inventory }, null, 1));
  console.log(`preserved under ${OUT_DIR}; spent $${ledger.spent.toFixed(4)} (rate card)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
