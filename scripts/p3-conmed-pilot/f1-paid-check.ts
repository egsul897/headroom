/**
 * F1 single paid validation: 7.2(k)(i) only (§13/§14).
 * The question is not whether a rule appears, but whether the model can still treat the parent's
 * $150,000,000 / 10.0% as operative evidence owned by a 54-character clause. Every numeric value in
 * the output is located against each source channel.
 */
import fs from "node:fs";
import path from "node:path";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest } from "./timeout-policy";
import { PER_CANDIDATE_TIMEOUT_MS, CandidateTimeoutError, buildInput, callerFor, loadModel, prepare, realCost, record, withTimeout } from "./compile-run";
import { classifyOutcome, LOCKED_MODEL, FORBIDDEN_MODEL } from "./run-population";

const OUT = "docs/phase-3-f1-linked-context-typing";
const K_I = "discovery-candidate:abc8af03ac51f922f06ded82";
const CEILING = 0.05, STOP_AT = 0.045;
const NUM_RE = /\$[\d,]{4,}|\b\d+(?:\.\d+)?%/g;

async function main() {
  if (LOCKED_MODEL !== "deepseek/deepseek-v4-flash") throw new Error("model lock violated");
  const model = loadModel(LOCKED_MODEL);
  if (model.id === FORBIDDEN_MODEL) throw new Error("forbidden model");
  const { stages, bundles, rehydrated } = await prepare();
  const c = rehydrated.find((x) => x.discoveryId === K_I)!;
  const bundle = bundles.get(K_I);
  const items = bundle?.items ?? [];
  const anchor = operativeSourceTextFor(c, stages.index);

  // the channels a value can legitimately come from, established BEFORE the call
  const chan = {
    anchorOperative: anchor,
    parentScope: items.filter((i) => i.type === "PARENT_SCOPE").map((i) => i.excerptText).join("\n"),
    siblingContext: items.filter((i) => i.type === "SIBLING_CONTEXT").map((i) => i.excerptText).join("\n"),
    definition: items.filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").map((i) => i.excerptText).join("\n"),
    otherContext: items.filter((i) => !["PARENT_SCOPE", "SIBLING_CONTEXT", "DEFINITION", "DEFINITION_DEPENDENCY", "OPERATIVE_SOURCE"].includes(i.type)).map((i) => i.excerptText).join("\n"),
  };
  const locate = (v: string) => ({ anchorOperative: chan.anchorOperative.includes(v), parentScope: chan.parentScope.includes(v), siblingContext: chan.siblingContext.includes(v), definition: chan.definition.includes(v), otherContext: chan.otherContext.includes(v) });

  const ledger = new BudgetLedger(CEILING, STOP_AT);
  const reservation = BudgetLedger.reservationFor(model, PER_CANDIDATE_TIMEOUT_MS, 20000, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
  const input = buildInput(c, bundle, stages, undefined as never, []);
  ledger.reserve(K_I, reservation);
  const t0 = Date.now();
  let result: SemanticCompilationResult | null = null, timedOut = false;
  try { result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL) }), PER_CANDIDATE_TIMEOUT_MS); }
  catch (e) { timedOut = e instanceof CandidateTimeoutError || (e instanceof Error && e.name === "CandidateTimeoutError"); }
  const wallClockMs = Date.now() - t0;
  const usage = result?.telemetry as { inputTokens?: number; outputTokens?: number } | undefined;
  const billed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) > 0;
  const cost = accountForRequest({ model, elapsedWallClockMs: wallClockMs, timedOut, providerUsage: billed ? { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 } : null, streamedOutputTokensObserved: usage?.outputTokens ?? null, reservationUsd: reservation, providerRefused: !timedOut && !billed });
  ledger.settle(K_I, cost);
  const rec = result ? record(c, input, result, model, 1, null) : null;
  if (rec) rec.wallClockMs = wallClockMs;

  const rules = (result?.rules ?? []).map((r, idx) => {
    const blob = JSON.stringify(r);
    const values = [...new Set(blob.match(NUM_RE) ?? [])];
    return {
      index: idx,
      sourceSection: (r as { sourceSectionRef?: string }).sourceSectionRef ?? null,
      operativeCitation: (r as { provenance?: { sourceCitation?: string } }).provenance?.sourceCitation ?? null,
      sufficiency: (r as { representationSufficiency?: string }).representationSufficiency ?? null,
      numericValues: values.map((v) => ({ value: v, foundIn: locate(v) })),
    };
  });
  const violations = rules.flatMap((r) => r.numericValues.filter((v) => !v.foundIn.anchorOperative && (v.foundIn.parentScope || v.foundIn.siblingContext)).map((v) => ({ rule: r.index, value: v.value })));

  const out = {
    generatedBy: "scripts/p3-conmed-pilot/f1-paid-check.ts", candidate: "7.2(k)(i)", discoveryId: K_I,
    model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, paidCalls: 1,
    spend: { exactUsd: ledger.snapshot().exactSpendUsd, retainedUnknownTimeoutUsd: ledger.snapshot().retainedUnknownTimeoutUsd, committedUsd: ledger.snapshot().committedUsd, ceilingUsd: CEILING, costStatus: cost.costAccountingStatus },
    bundleShape: items.map((i) => ({ type: i.type, ref: i.normalizedRef, chars: i.excerptText.length, has150M: i.excerptText.includes("$150,000,000"), has10pct: i.excerptText.includes("10.0%") })),
    operativeText: anchor, operativeChars: anchor.length,
    execution: { status: result?.status ?? (timedOut ? "TIMEOUT" : "ERROR"), outcome: rec ? classifyOutcome(rec, timedOut) : (timedOut ? "TIMEOUT" : "PROVIDER_FAILURE"),
      failureReasons: (result?.failureReasons ?? []) as string[], rules: result?.rules?.length ?? 0, definitions: result?.definitions?.length ?? 0,
      toolCalls: rec?.toolCalls ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      costUsd: result ? realCost(model, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0) : cost.chargedToBudgetUsd, wallClockMs },
    rules,
    attributionViolations: violations,
    verdict: violations.length === 0 ? "NO_PARENT_VALUE_CLAIMED_AS_CHILD_OWNED_OPERATIVE_EVIDENCE" : "PARENT_VALUE_STILL_CLAIMED",
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "02-f1-paid-check-7-2-k-i.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, bundleShape: out.bundleShape, operativeText: out.operativeText }, null, 2));
}
if (process.argv[1]?.endsWith("f1-paid-check.ts")) void main();
