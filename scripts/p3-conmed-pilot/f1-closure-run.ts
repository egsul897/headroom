/**
 * POST-F1 CLOSURE RUN - the six changed candidates that completed cleanly before F1.
 *
 * 7.2(k)(i) is deliberately absent: its post-F1 result is already on the record. The question here
 * is narrow - did retyping the linked parent from OPERATIVE_SOURCE to PARENT_SCOPE regress any of
 * the cases that were already behaving? Every substantive value the model emits is located against
 * each retrieval channel individually, so a contextual value informing interpretation is
 * distinguishable from a contextual value being claimed as the child's own.
 */
import fs from "node:fs";
import path from "node:path";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { buildConditionSuspicionInput } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest } from "./timeout-policy";
import { PER_CANDIDATE_TIMEOUT_MS, CandidateTimeoutError, buildInput, callerFor, loadModel, prepare, realCost, record, withTimeout } from "./compile-run";
import { classifyOutcome, LOCKED_MODEL, FORBIDDEN_MODEL } from "./run-population";

const OUT = "docs/phase-3-f1-linked-context-typing";
export const PRIOR_CUMULATIVE_USD = 0.276597;   // attempt 1 + continuation + the F1 single check
export const TOTAL_CEILING_USD = 0.40;
export const INCREMENTAL_CEILING_USD = 0.08;
const STOP_AT = 0.072;
const NUM_RE = /\$[\d,]{4,}|\b\d+(?:\.\d+)?%/g;

/** The six changed candidates. 7.2(k)(i) is excluded by design; Cohort C and the controls are out of scope. */
export const CLOSURE_SET: { cohort: "B" | "D"; slot: string; discoveryId?: string; ref: string; preR1Chars: number; preF1: string }[] = [
  { cohort: "B", slot: "7.2(e) long", ref: "7.2(e)", discoveryId: "discovery-candidate:62512247bce898548b6f9b63", preR1Chars: 9045, preF1: "COMPLETED / REVIEW_REQUIRED, 2 rules, 266s" },
  { cohort: "B", slot: "7.2(k)", ref: "7.2(k)", discoveryId: "discovery-candidate:c9999a82a8a6c1c3a9648e22", preR1Chars: 9621, preF1: "COMPLETED / REVIEW_REQUIRED, 1 rule, 266s" },
  { cohort: "B", slot: "7.2(k)(ii)", ref: "7.2(k)(ii)", discoveryId: "discovery-candidate:42316093889582e0874f69a6", preR1Chars: 9300, preF1: "COMPLETED / REVIEW_REQUIRED, 1 rule, 370s" },
  { cohort: "D", slot: "7.2(d)", ref: "7.2(d)", preR1Chars: 9095, preF1: "COMPLETED / REVIEW_REQUIRED, 1 rule, 207s" },
  { cohort: "D", slot: "7.2(g)", ref: "7.2(g)", preR1Chars: 9157, preF1: "COMPLETED / REVIEW_REQUIRED, 1 rule, 198s" },
  { cohort: "D", slot: "7.2(h)", ref: "7.2(h)", preR1Chars: 9312, preF1: "COMPLETED / REVIEW_REQUIRED, 1 rule, 267s" },
];

async function main() {
  if (LOCKED_MODEL !== "deepseek/deepseek-v4-flash") throw new Error("model lock violated");
  const model = loadModel(LOCKED_MODEL);
  if (model.id === FORBIDDEN_MODEL) throw new Error("forbidden model");
  const ledger = new BudgetLedger(INCREMENTAL_CEILING_USD, STOP_AT);
  const { stages, bundles, rehydrated } = await prepare();
  const rows: Record<string, unknown>[] = [];
  let halted: string | null = null;

  for (const spec of CLOSURE_SET) {
    const c = (spec.discoveryId
      ? rehydrated.find((x) => x.discoveryId === spec.discoveryId)
      : rehydrated.filter((x) => String(x.normalizedSourceRef) === spec.ref).sort((a, b) => a.discoveryId.localeCompare(b.discoveryId))[0])!;
    if (!c) throw new Error(`${spec.slot} did not resolve`);

    const reservation = BudgetLedger.reservationFor(model, PER_CANDIDATE_TIMEOUT_MS, 20000, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
    if (ledger.mustStop(reservation)) { halted = `INCREMENTAL_CEILING at $${ledger.committedUsd.toFixed(4)}`; break; }

    const bundle = bundles.get(c.discoveryId);
    const items = bundle?.items ?? [];
    const anchor = operativeSourceTextFor(c, stages.index);
    const ids = c.structuralNodeIds ?? [];
    const byType = (ts: string[]) => items.filter((i) => ts.includes(i.type)).map((i) => i.excerptText).join("\n");
    const chan = {
      ANCHOR_OPERATIVE: anchor,
      PARENT_SCOPE: byType(["PARENT_SCOPE"]),
      DEFINITION_CONTEXT: byType(["DEFINITION", "DEFINITION_DEPENDENCY"]),
      SIBLING_CONTEXT: byType(["SIBLING_CONTEXT", "UNVERIFIED_SIBLING_SIGNAL"]),
      CROSS_REFERENCE_CONTEXT: byType(["CROSS_REFERENCE", "CROSS_DOCUMENT_REFERENCE"]),
    };
    const classify = (v: string) => {
      const found = (Object.keys(chan) as (keyof typeof chan)[]).filter((k) => chan[k].includes(v));
      return { value: v, channels: found, support: found.length === 0 ? "UNSUPPORTED" : found[0]! };
    };
    const opItems = items.filter((i) => i.type === "OPERATIVE_SOURCE");
    const parentScopeChars = items.filter((i) => i.type === "PARENT_SCOPE").reduce((a, i) => a + i.excerptText.length, 0);

    const input = buildInput(c, bundle, stages, undefined as never, []);
    const gate2Chars = buildConditionSuspicionInput({ operativeSourceText: anchor, contextBundle: { items } } as unknown as SemanticCompilerInput).length;

    ledger.reserve(c.discoveryId, reservation);
    const t0 = Date.now();
    let result: SemanticCompilationResult | null = null, timedOut = false;
    try { result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL) }), PER_CANDIDATE_TIMEOUT_MS); }
    catch (e) { timedOut = e instanceof CandidateTimeoutError || (e instanceof Error && e.name === "CandidateTimeoutError"); }
    const wallClockMs = Date.now() - t0;
    const usage = result?.telemetry as { inputTokens?: number; outputTokens?: number } | undefined;
    const billed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) > 0;
    const cost = accountForRequest({ model, elapsedWallClockMs: wallClockMs, timedOut, providerUsage: billed ? { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 } : null, streamedOutputTokensObserved: usage?.outputTokens ?? null, reservationUsd: reservation, providerRefused: !timedOut && !billed });
    ledger.settle(c.discoveryId, cost);
    const rec = result ? record(c, input, result, model, 1, null) : null;
    if (rec) rec.wallClockMs = wallClockMs;

    const rules = (result?.rules ?? []).map((r, idx) => ({
      index: idx,
      sourceSection: (r as { sourceSectionRef?: string }).sourceSectionRef ?? null,
      operativeCitation: (r as { provenance?: { sourceCitation?: string } }).provenance?.sourceCitation ?? null,
      numericValues: [...new Set(JSON.stringify(r).match(NUM_RE) ?? [])].map(classify),
    }));
    const violations = rules.flatMap((r) => r.numericValues.filter((v) => !v.channels.includes("ANCHOR_OPERATIVE") && (v.channels.includes("PARENT_SCOPE") || v.channels.includes("SIBLING_CONTEXT"))).map((v) => ({ rule: r.index, value: v.value, channels: v.channels })));

    const row = {
      cohort: spec.cohort, slot: spec.slot, ref: String(c.normalizedSourceRef), discoveryId: c.discoveryId,
      preR1OperativeChars: spec.preR1Chars, postR1OperativeChars: anchor.length,
      preF1Result: spec.preF1,
      postF1Status: result?.status ?? (timedOut ? "TIMEOUT" : "ERROR"),
      postF1Outcome: rec ? classifyOutcome(rec, timedOut) : (timedOut ? "TIMEOUT" : "PROVIDER_FAILURE"),
      failureReasons: (result?.failureReasons ?? []) as string[],
      wallClockMs, toolCalls: rec?.toolCalls ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      exactCostUsd: result ? realCost(model, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0) : cost.chargedToBudgetUsd, costStatus: cost.costAccountingStatus,
      ruleCount: result?.rules?.length ?? 0, rules,
      numericAssertions: rules.reduce((a, r) => a + r.numericValues.length, 0),
      contextualEvidenceTypes: [...new Set(items.map((i) => i.type))],
      operativeSourceNodes: opItems.map((i) => i.structuralNodeId),
      operativeSourceIsAnchorOnly: opItems.length === 1 && opItems[0]!.structuralNodeId === ids[0],
      linkedParentStillPresent: ids.slice(1).every((id) => items.some((i) => i.structuralNodeId === id && i.type !== "OPERATIVE_SOURCE")),
      parentScopeChars, gate2InputChars: gate2Chars,
      attributionViolations: violations, contextRetentionViolations: ids.slice(1).filter((id) => !items.some((i) => i.structuralNodeId === id)).length,
    };
    rows.push(row);
    fs.writeFileSync("/tmp/claude-0/f1-closure-rows.json", JSON.stringify(rows, null, 2));
    console.log(`  [${spec.cohort}] ${spec.slot.padEnd(12)} ${String(row.postF1Status).padEnd(16)} ${String(row.postF1Outcome).padEnd(12)} rules=${row.ruleCount} nums=${row.numericAssertions} tools=${row.toolCalls ?? "-"} ${Math.round(wallClockMs / 1000)}s $${row.exactCostUsd.toFixed(5)} anchorOnly=${row.operativeSourceIsAnchorOnly} viol=${violations.length} ps=${parentScopeChars} g2=${gate2Chars} | inc $${ledger.committedUsd.toFixed(4)}`);
  }

  const snap = ledger.snapshot();
  const summary = {
    generatedBy: "scripts/p3-conmed-pilot/f1-closure-run.ts", model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, halted,
    budget: { totalCeilingUsd: TOTAL_CEILING_USD, priorCumulativeUsd: PRIOR_CUMULATIVE_USD, incrementalCeilingUsd: INCREMENTAL_CEILING_USD,
      incrementalExactUsd: snap.exactSpendUsd, incrementalReservedUnknownUsd: snap.retainedUnknownTimeoutUsd, incrementalCommittedUsd: snap.committedUsd,
      cumulativeCommittedUsd: Number((PRIOR_CUMULATIVE_USD + snap.committedUsd).toFixed(6)) },
    counts: { paid: rows.length, completed: rows.filter((r) => r.postF1Outcome === "COMPLETED").length,
      modelFailures: rows.filter((r) => r.postF1Outcome !== "COMPLETED").length,
      rules: rows.reduce((a, r) => a + (r.ruleCount as number), 0),
      numericAssertions: rows.reduce((a, r) => a + (r.numericAssertions as number), 0) },
    safety: { attributionViolations: rows.reduce((a, r) => a + (r.attributionViolations as unknown[]).length, 0),
      contextRetentionViolations: rows.reduce((a, r) => a + (r.contextRetentionViolations as number), 0),
      operativeSourceAnchorOnly: rows.filter((r) => r.operativeSourceIsAnchorOnly).length,
      linkedParentStillPresent: rows.filter((r) => r.linkedParentStillPresent).length },
    parentScopeObservation: Object.fromEntries(rows.map((r) => [r.slot as string, { parentScopeChars: r.parentScopeChars, gate2InputChars: r.gate2InputChars, wallClockSec: Math.round((r.wallClockMs as number) / 1000), outcome: r.postF1Outcome }])),
    rows,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "04-post-f1-closure-run.json"), JSON.stringify(summary, null, 2));
  console.log("\n", JSON.stringify({ ...summary, rows: undefined, parentScopeObservation: undefined }, null, 2));
}
if (process.argv[1]?.endsWith("f1-closure-run.ts")) void main();
