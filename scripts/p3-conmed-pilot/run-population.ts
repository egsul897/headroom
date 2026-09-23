/**
 * CONMED sealed-population diagnostic run on the locked model.
 *
 * LOW_COST_DIAGNOSTIC_PIPELINE. Not a canonical production-model measurement.
 *
 * Execution policy is the authorized one and is enforced structurally, not by care:
 * 480s ceiling via PER_CANDIDATE_TIMEOUT_MS, no automatic retry, no premium path,
 * reserve-before-dispatch budgeting so an unbilled timeout still consumes the ceiling,
 * and concurrency 1 until ten consecutive clean executions have been observed.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { INSTRUMENT_KEY, operativeTextFor, sha256 } from "./pipeline";
import { dedupExact } from "./dedup";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, maxTokensFor, prepare, record, withTimeout, type CandidateRecord } from "./compile-run";
import { assertNotPremium, OBSERVED_INPUT_TOKENS_PER_CANDIDATE } from "./premium-lock";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest, type CostRecord } from "./timeout-policy";
import { buildCandidateEvidence, writeCandidateEvidence } from "./evidence";
import type { GatewayModel } from "./probe-models";

const OUT = "/tmp/claude-0/pilot/population";
export const LOCKED_MODEL = "deepseek/deepseek-v4-flash";
export const FORBIDDEN_MODEL = "deepseek/deepseek-v4-flash-0731";
export const SPEND_CEILING_USD = 5;
export const SPEND_STOP_AT_USD = 4.5;
/** §5 of the prior mission: not recompiled in this run. */
export const KNOWN_HARD_CASE_REFS = ["7.2(k)"] as const;
export const CLEAN_RUNS_BEFORE_CONCURRENCY_2 = 10;

export type Outcome = "COMPLETED" | "TIMEOUT" | "PROVIDER_FAILURE" | "SCHEMA_FAILURE" | "TOOL_FAILURE" | "KNOWN_HARD_CASE" | "OTHER_EXECUTION_FAILURE";

/**
 * One definitive outcome per candidate. An execution failure is never translated into a
 * semantic NO_CREDIT: that conversion is what makes a broken run look like a confident
 * negative finding.
 */
export function classifyOutcome(rec: CandidateRecord, timedOut: boolean): Outcome {
  if (timedOut) return "TIMEOUT";
  const billed = (rec.inputTokens ?? 0) + (rec.outputTokens ?? 0) > 0;
  if (rec.failureReasons.some((r) => ["PROVIDER_FAILURE", "TRANSPORT_OR_INTERNAL_ERROR", "HTTP_402", "HTTP_429", "ZERO_TOKEN_STALL"].includes(r)) && !billed) return "PROVIDER_FAILURE";
  if (rec.status === "FAILED" && !billed) return "PROVIDER_FAILURE";
  if (rec.failureReasons.some((r) => ["MODEL_SCHEMA_FAILURE", "REPEATED_INVALID_STRUCTURED_OUTPUT"].includes(r))) return "SCHEMA_FAILURE";
  if (rec.failureReasons.includes("MALFORMED_TOOL_CALL")) return "TOOL_FAILURE";
  if (rec.rules + rec.definitions > 0) return "COMPLETED";
  return "OTHER_EXECUTION_FAILURE";
}

function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

async function main() {
  const catalogue = JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/models-bakeoff.json", "utf8")).data as GatewayModel[];
  const raw = catalogue.find((m) => m.id === LOCKED_MODEL)!;
  if (raw.id === FORBIDDEN_MODEL) throw new Error("the excluded -0731 model must never be dispatched to");
  assertNotPremium(raw.id, raw.pricing);
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));

  const { stages, bundles, rehydrated } = await prepare();
  const { keep, report: dedupReport } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));

  const stageCaller = getStageCaller();
  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: stages.index, allEffects: amendment.effects });

  console.log(`model ${LOCKED_MODEL} @ $${Number(raw.pricing.input) * 1e6}/$${Number(raw.pricing.output) * 1e6} per Mtok`);
  console.log(`population ${rehydrated.length} -> after exact dedup ${keep.length} (removed ${dedupReport.exactDuplicatesRemoved})`);
  console.log(`timeout ${PER_CANDIDATE_TIMEOUT_MS / 1000}s, concurrency 1, ceiling $${SPEND_CEILING_USD}\n`);

  const ledger = new BudgetLedger(SPEND_CEILING_USD, SPEND_STOP_AT_USD);
  const reservation = BudgetLedger.reservationFor(raw, PER_CANDIDATE_TIMEOUT_MS, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
  const records: (CandidateRecord & { outcome: Outcome })[] = [];
  const costs: (CostRecord & { discoveryId: string })[] = [];
  const frozen: { discoveryId: string; result: SemanticCompilationResult }[] = [];
  let consecutiveClean = 0;
  let done = 0;

  for (const candidate of keep) {
    const ref = String(candidate.normalizedSourceRef);
    if ((KNOWN_HARD_CASE_REFS as readonly string[]).includes(ref)) {
      const rec = { ...record(candidate, buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects), { status: "FAILED", failureReasons: ["KNOWN_HARD_CASE_PENDING_COMPILER_ANALYSIS"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult, raw, 1, null), outcome: "KNOWN_HARD_CASE" as Outcome };
      records.push(rec);
      console.log(`  [${++done}/${keep.length}] ${ref.padEnd(14)} KNOWN_HARD_CASE (not recompiled)`);
      continue;
    }
    if (ledger.mustStop(reservation)) {
      console.log(`budget guard: $${ledger.committedUsd.toFixed(4)} committed; stopping before the $${SPEND_CEILING_USD} ceiling`);
      break;
    }

    const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects);
    const caller = callerFor(LOCKED_MODEL);
    const t0 = Date.now();
    ledger.reserve(candidate.discoveryId, reservation);
    let rec: CandidateRecord;
    let timedOut = false;
    try {
      const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
      frozen.push({ discoveryId: candidate.discoveryId, result });
      rec = record(candidate, input, result, raw, 1, null);
      // Complete forensic evidence for this execution - rawModelOutput, the tool log, the full
      // parsed IR and the exact input it came from. A summary row cannot answer "which stage first
      // emitted this value"; this can. Verification is null here because this runner compiles only
      // (verifying would mean two more model calls per candidate, which this run is not authorized
      // to spend) - recorded honestly rather than left for a reader to assume.
      writeCandidateEvidence(path.join(OUT, "evidence"), candidate.discoveryId, buildCandidateEvidence(input, result, null, { model: LOCKED_MODEL, tier: 1, wallClockMs: rec.wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: rec.actualCostUsd, costStatus: null, timedOut: false, notes: ["compile-only run; no verification performed"] }));
    } catch (err) {
      timedOut = err instanceof Error && err.name === "CandidateTimeoutError";
      rec = record(candidate, input, { status: "FAILED", failureReasons: [timedOut ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult, raw, 1, null);
    }
    if (rec.wallClockMs === null) rec.wallClockMs = Date.now() - t0;
    const billed = (rec.inputTokens ?? 0) + (rec.outputTokens ?? 0) > 0;
    const cost = accountForRequest({ model: raw, elapsedWallClockMs: rec.wallClockMs, timedOut, providerUsage: billed ? { inputTokens: rec.inputTokens ?? 0, outputTokens: rec.outputTokens ?? 0 } : null, streamedOutputTokensObserved: rec.outputTokens, reservationUsd: reservation, providerRefused: !timedOut && !billed });
    ledger.settle(candidate.discoveryId, cost);
    costs.push({ ...cost, discoveryId: candidate.discoveryId });

    const outcome = classifyOutcome(rec, timedOut);
    records.push({ ...rec, outcome });
    consecutiveClean = outcome === "COMPLETED" ? consecutiveClean + 1 : 0;
    console.log(`  [${++done}/${keep.length}] ${ref.padEnd(14)} ${outcome.padEnd(24)} rules=${String(rec.rules).padStart(2)} tools=${String(rec.toolCalls).padStart(2)} tok=${rec.inputTokens}/${rec.outputTokens} ${Math.round(rec.wallClockMs / 1000)}s committed=$${ledger.committedUsd.toFixed(4)}`);

    if (done % 20 === 0) { save("01-records", records); save("02-costs", { snapshot: ledger.snapshot(), perRequest: costs }); }
  }

  save("01-records", records);
  save("02-costs", { snapshot: ledger.snapshot(), perRequest: costs });
  save("03-frozen", frozen.map((f) => ({ ...f, resultHash: sha256(JSON.stringify(f.result)) })));
  const byOutcome = records.reduce((a: Record<string, number>, r) => { a[r.outcome] = (a[r.outcome] ?? 0) + 1; return a; }, {});
  save("04-meta", {
    evidenceLabel: "LOW_COST_DIAGNOSTIC_PIPELINE",
    model: LOCKED_MODEL,
    modelPrice: { inputPerMtok: Number(raw.pricing.input) * 1e6, outputPerMtok: Number(raw.pricing.output) * 1e6 },
    timeoutMs: PER_CANDIDATE_TIMEOUT_MS,
    concurrencyUsed: 1,
    concurrency2Tested: false,
    maxConsecutiveCleanObserved: consecutiveClean,
    population: rehydrated.length,
    afterDedup: keep.length,
    attempted: records.length,
    byOutcome,
    totalInputTokens: records.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
    totalOutputTokens: records.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
    budget: ledger.snapshot(),
  });
  console.log(`\nDONE ${records.length}/${keep.length}  ${JSON.stringify(byOutcome)}`);
  console.log(`committed $${ledger.committedUsd.toFixed(4)} (exact $${ledger.exactSpendUsd.toFixed(4)}, retained-unknown $${ledger.retainedUnknownUsd.toFixed(4)}) of $${SPEND_CEILING_USD}`);
}

if (process.argv[1]?.endsWith("run-population.ts")) void main();
