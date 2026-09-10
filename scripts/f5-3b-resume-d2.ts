/**
 * F-5.3B RESUME - exactly ONE fresh independent Pass A execution (Run D2) over the identical frozen Chewy section 6.08
 * input, then E2 = buildEnsembleInventory(preserved Run C, fresh Run D2) under STRICT compatibility. The preserved Run C
 * is read from its committed artifact and never regenerated; the old failed cert-pass-2 artifact is never read for
 * content, appended to, or combined. No retry on transport failure. Hard incremental cap $4.50; the whole pass must fit
 * BEFORE the first paid call or nothing is called.
 *
 *   npx tsx scripts/f5-3b-resume-d2.ts precheck
 *   npx tsx scripts/f5-3b-resume-d2.ts run
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
import { runSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/inventory";
import { buildEnsembleInventory, canonicalEnsembleJson, checkEnsembleCompatibility } from "../lib/contract-model/compiler/semantic-accountability/ensemble";
import { batchSlots, partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../lib/contract-model/compiler/semantic-accountability/prompt";
import { computePartitionHash, computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const RUN_C = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b/run-C.json";
const RUN_C_EXPECTED_HASH = "b8cf5f54be8bab7f431cdc0f330fd9df3c9cd8918f4c3091ca8d6c597b92cead";
const E1 = "docs/phase-3-remediation-f5-3b/e1-final.json";
const E1_EXPECTED_HASH = "6f648e724520fdc9071c93d80860a5dbb37b5c03f9ae939a16ce2983b3e6d8ed";
const SCORER = "scripts/f5-3b-ensemble-certification-score.py";
const SCORER_EXPECTED_SHA = "0ac56e31fb6c0554583aa3cb7edb54f890011d7496145d2cc7a353522a634995";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b-resume";
const DOCS = "docs/phase-3-remediation-f5-3b-resume";
const HARD_INCREMENTAL_CAP_USD = 4.5;
const CHARS_PER_TOKEN = 3.2;
const ASSUMED_OUTPUT_TOKENS_PER_CALL = 16_000;
/** Generic pass ids for the ensemble (semantics never key on them); the audit attempt identifier is the ledger label. */
const PASS_IDS: [string, string] = ["cert-pass-1", "cert-pass-2"];
const ATTEMPT_LABEL = "cert-pass-2-attempt-2";
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
const ledger: { attempt: string; cap: number; spent: number; calls: LedgerEntry[]; refusals: { stage: string; estimatedUsd: number; spentUsd: number; at: string }[]; failures: { stage: string; error: string; at: string }[] } = { attempt: ATTEMPT_LABEL, cap: HARD_INCREMENTAL_CAP_USD, spent: 0, calls: [], refusals: [], failures: [] };
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
    let out: T;
    try { out = await this.inner.call(schema, stage, systemPrompt, userContent); }
    catch (err) { ledger.failures.push({ stage: `${this.label}:${stage}`, error: err instanceof Error ? err.message.slice(0, 500) : String(err), at: new Date().toISOString() }); throw err; }
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
  if (section.charStart !== recorded.charStart || section.charEnd !== recorded.charEnd) throw new Error("6.08 anchor drifted");
  const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
  if (sourceContext.regions[0]!.text !== recorded.text) throw new Error("operative text differs from the frozen paid-run unit");
  return { index, sourceContext, candidateRef: unit.candidateRef as string };
}

async function main() {
  const mode = process.argv[2] ?? "precheck";
  const { index, sourceContext, candidateRef } = buildUnit();
  const stage = getStageCaller();
  if (stage.isSynthetic) throw new Error("no real AI_GATEWAY_API_KEY - refusing to proceed");
  const runC = JSON.parse(readFileSync(RUN_C, "utf-8")) as FrozenSemanticInventory;
  const e1 = JSON.parse(readFileSync(E1, "utf-8")) as FrozenSemanticInventory;
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  const operative = sourceContext.regions[0]!.regionId;
  const batches = batchSlots({ slots: partition.slots.filter((s) => s.regionId === operative), methods: partition.methods }, sourceContext);
  const inputTokens = batches.reduce((n, b) => n + Math.ceil((buildInventorySystemPrompt().length + buildInventoryUserContent(sourceContext, b).length) / CHARS_PER_TOKEN), 0);
  const perRunCallsUpper = batches.length * 2;
  const perRunEstimate = calculateCostUsd(inputTokens * 2, ASSUMED_OUTPUT_TOKENS_PER_CALL * perRunCallsUpper, stage.model) ?? 0;
  const observedRunCUsd = runC.telemetryCostUsd ?? 0;
  const worstCase = Math.max(perRunEstimate, observedRunCUsd);
  const credits = await gatewayCredits();
  const sourceContextHash = computeSourceContextHash(sourceContext);
  const partitionHash = computePartitionHash(partition);
  const identity = {
    candidateRef, sourceContextHash, partitionHash, slots: partition.slots.length, batches: batches.length, documentId: "doc-a", chewySourceSha256: sha(SRC), frozenUnitSha256: sha(UNIT),
    accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, provider: stage.providerName, model: stage.model,
    runC: { candidateRef: runC.candidateRef, sourceContextHash: runC.sourceContextHash ?? null, partitionHash: runC.sourceIdentity?.partitionHash ?? null, documentId: runC.documentId ?? null, algorithm: runC.algorithmVersion, prompt: runC.promptVersion, provider: runC.provider, model: runC.model, frozenContentHash: runC.frozenContentHash, fileSha256: sha(RUN_C) },
  };
  const preconditions = {
    runCContentHashVerified: runC.frozenContentHash === RUN_C_EXPECTED_HASH,
    runCIdentityMatchesFrozenInput: runC.candidateRef === candidateRef && runC.sourceContextHash === sourceContextHash && runC.sourceIdentity?.partitionHash === partitionHash && runC.documentId === "doc-a",
    runCContractMatchesThisRun: runC.algorithmVersion === SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION && runC.promptVersion === SEMANTIC_INVENTORY_PROMPT_VERSION && runC.provider === stage.providerName && runC.model === stage.model,
    e1HashVerified: e1.frozenContentHash === E1_EXPECTED_HASH && e1.sourceContextHash === sourceContextHash,
    scorerHashVerified: sha(SCORER) === SCORER_EXPECTED_SHA,
    noResumeArtifactsYet: !existsSync(`${OUT_DIR}/run-D2.json`),
  };
  const record = { at: new Date().toISOString(), attempt: ATTEMPT_LABEL, identity, estimate: { inputTokensPerRun: inputTokens, assumedOutputTokensPerCall: ASSUMED_OUTPUT_TOKENS_PER_CALL, callsUpperBound: perRunCallsUpper, estimatorUsdUpperBound: Number(perRunEstimate.toFixed(4)), observedRunCUsd: Number(observedRunCUsd.toFixed(4)), worstCaseUsd: Number(worstCase.toFixed(4)) }, hardIncrementalCapUsd: HARD_INCREMENTAL_CAP_USD, gatewayCredits: credits, preconditions, decision: "" as string };
  const failedPre = Object.entries(preconditions).filter(([, v]) => !v).map(([k]) => k);
  if (failedPre.length > 0) record.decision = `ABORT: preconditions failed: ${failedPre.join(", ")}`;
  else if (!credits) record.decision = "ABORT: gateway credits could not be read";
  else if (worstCase > HARD_INCREMENTAL_CAP_USD) record.decision = `ABORT: one full pass (worst case $${worstCase.toFixed(2)}) does not fit the $${HARD_INCREMENTAL_CAP_USD} cap`;
  else if (credits.balance < worstCase) record.decision = `ABORT: gateway balance $${credits.balance.toFixed(4)} below the pass estimate $${worstCase.toFixed(2)}`;
  else record.decision = "GO";
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(`${DOCS}/01-resume-precheck.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 1));
  if (mode === "precheck" || record.decision !== "GO") { if (record.decision !== "GO") console.log("NOT RUNNING - see decision"); return; }

  mkdirSync(OUT_DIR, { recursive: true });
  const before = credits!;
  // ONE fresh Pass A. Source context only; no prior output, no reference set. No retry on failure.
  const caller = new GuardedStageCaller(getStageCaller(), ATTEMPT_LABEL);
  const runD2 = await runSemanticInventory({ candidateRef, documentId: "doc-a", sourceContext, structuralIndex: index, caller });
  writeFileSync(`${OUT_DIR}/run-D2.json`, JSON.stringify(runD2, null, 1));
  console.log(`${ATTEMPT_LABEL}: ${runD2.inventoryStatus} items=${runD2.items.length} calls=${ledger.calls.length} spent=$${ledger.spent.toFixed(4)}`);
  const after = await gatewayCredits();
  const ok = runD2.inventoryStatus === "INVENTORY_OK" || runD2.inventoryStatus === "INVENTORY_COVERAGE_GAP";
  let ensembleRecord: Record<string, unknown> = { built: false, reason: ok ? null : `D2 ${runD2.inventoryStatus}: ${runD2.inventoryStatusReason}` };
  if (ok) {
    const input = { candidateRef, sourceContext, structuralIndex: index, partition, compatibility: { mode: "STRICT" as const } };
    const compat = checkEnsembleCompatibility({ ...input, passes: [{ passId: PASS_IDS[0], inventory: runC }, { passId: PASS_IDS[1], inventory: runD2 }] });
    const CD = buildEnsembleInventory({ ...input, passes: [{ passId: PASS_IDS[0], inventory: runC }, { passId: PASS_IDS[1], inventory: runD2 }] });
    const DC = buildEnsembleInventory({ ...input, passes: [{ passId: PASS_IDS[1], inventory: runD2 }, { passId: PASS_IDS[0], inventory: runC }] });
    // label independence: relabelled passes yield the same canonical propositions/support statuses (hash differs only by label)
    const XY = buildEnsembleInventory({ ...input, passes: [{ passId: "x", inventory: runC }, { passId: "y", inventory: runD2 }] });
    const sig = (e: FrozenSemanticInventory) => e.items.map((i) => `${i.inventoryItemId}|${i.support?.supportStatus}|${i.sourceSpan.charStart}-${i.sourceSpan.charEnd}`).sort().join("\n");
    writeFileSync(`${OUT_DIR}/e2.json`, JSON.stringify(CD, null, 1));
    ensembleRecord = { built: true, passIds: PASS_IDS, compatibilityAdmitted: compat.admitted, compatibilityFailures: compat.failures, orderIndependent: canonicalEnsembleJson(CD) === canonicalEnsembleJson(DC) && CD.frozenContentHash === DC.frozenContentHash, labelIndependent: sig(CD) === sig(XY), frozenContentHash: CD.frozenContentHash, counts: CD.ensemble.counts, supportReviewFraction: CD.ensemble.supportReviewFraction, inventoryStatus: CD.inventoryStatus, unaccountedSource: CD.unaccountedSource.length };
    console.log(JSON.stringify(ensembleRecord, null, 1));
  }
  writeFileSync(`${OUT_DIR}/ledger.json`, JSON.stringify({ ...ledger, creditsBefore: before, creditsAfter: after, gatewayReportedSpendUsd: after ? after.totalUsed - before.totalUsed : null, passIds: PASS_IDS, runD2Status: runD2.inventoryStatus, ensemble: ensembleRecord }, null, 2));
  writeFileSync(`${OUT_DIR}/pair.json`, JSON.stringify({ regionText: sourceContext.regions[0]!.text, run1: runC, run2: runD2 }, null, 1));
  console.log(`preserved under ${OUT_DIR}; spent $${ledger.spent.toFixed(4)} (rate card)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
