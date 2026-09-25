/**
 * CANDIDATE-SPAN VALIDATION - continuation: one-shot control recheck + cohorts B, C, D.
 *
 * The first attempt halted at the Cohort A gate (7/9) on two SINGLE-KEY controls whose compiler
 * input is byte-identical before and after the remediation. This run re-tries those two exactly
 * once - to measure stochastic reliability, never to manufacture a passing cohort - and then runs
 * the cohorts that actually exercise the changed spans.
 *
 * Budget is CUMULATIVE across both attempts against the original $0.40 ceiling.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest } from "./timeout-policy";
import { PER_CANDIDATE_TIMEOUT_MS, CandidateTimeoutError, buildInput, callerFor, loadModel, prepare, realCost, record, withTimeout } from "./compile-run";
import { classifyOutcome, LOCKED_MODEL, FORBIDDEN_MODEL } from "./run-population";
import { emptyForensicGrounding, groundCompiledResult, type ForensicGroundingResult } from "./forensic-grounding";

const OUT = "docs/phase-3-candidate-span-remediation-implementation";
const RUN = "/tmp/claude-0/pilot/span-validation-b2";
export const ALREADY_SPENT_USD = 0.065275;          // attempt 1, committed
export const TOTAL_CEILING_USD = 0.40;              // unchanged across both attempts
export const REMAINING_CEILING_USD = Number((TOTAL_CEILING_USD - ALREADY_SPENT_USD).toFixed(6));
const STOP_AT_USD = Number((REMAINING_CEILING_USD * 0.9).toFixed(6));
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

export const PLAN: { group: string; slot: string; ref: string; discoveryId?: string }[] = [
  { group: "CONTROL_RECHECK", slot: "7.1", ref: "7.1" },
  { group: "CONTROL_RECHECK", slot: "7.1(b)", ref: "7.1(b)" },
  { group: "B", slot: "7.2(e) long", ref: "7.2(e)", discoveryId: "discovery-candidate:62512247bce898548b6f9b63" },
  { group: "B", slot: "7.2(k)", ref: "7.2(k)", discoveryId: "discovery-candidate:c9999a82a8a6c1c3a9648e22" },
  { group: "B", slot: "7.2(k)(i)", ref: "7.2(k)(i)", discoveryId: "discovery-candidate:abc8af03ac51f922f06ded82" },
  { group: "B", slot: "7.2(k)(ii)", ref: "7.2(k)(ii)", discoveryId: "discovery-candidate:42316093889582e0874f69a6" },
  { group: "C", slot: "7.2", ref: "7.2" }, { group: "C", slot: "7.3", ref: "7.3" }, { group: "C", slot: "7.4", ref: "7.4" },
  { group: "C", slot: "7.5", ref: "7.5" }, { group: "C", slot: "7.8", ref: "7.8" }, { group: "C", slot: "7.9", ref: "7.9" },
  { group: "D", slot: "7.2(d)", ref: "7.2(d)" }, { group: "D", slot: "7.2(g)", ref: "7.2(g)" }, { group: "D", slot: "7.2(h)", ref: "7.2(h)" },
];

/** Pre-remediation operative span, kept only so the run can prove what did and did not change. */
const preChangeSpan = (c: DiscoveredCandidate, index: { getNodeText: (id: string, m: "DESCENDANTS") => string }) =>
  c.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\n\n");

async function main() {
  if (LOCKED_MODEL !== "deepseek/deepseek-v4-flash") throw new Error("model lock violated");
  const model = loadModel(LOCKED_MODEL);
  if (model.id === FORBIDDEN_MODEL) throw new Error("forbidden model");
  const ledger = new BudgetLedger(REMAINING_CEILING_USD, STOP_AT_USD);
  const { stages, bundles, rehydrated } = await prepare();
  fs.mkdirSync(RUN, { recursive: true });
  console.log(`cumulative ceiling $${TOTAL_CEILING_USD}; already spent $${ALREADY_SPENT_USD}; this run may commit $${REMAINING_CEILING_USD}`);

  // R1: `grounding` is typed rather than lost in the loose row bag, so the summary below reads
  // the production verdict directly instead of casting its way back to it.
  const rows: (Record<string, unknown> & { slot: string; grounding: ForensicGroundingResult })[] = [];
  let halted: string | null = null;

  for (const p of PLAN) {
    const matches = rehydrated.filter((c) => (p.discoveryId ? c.discoveryId === p.discoveryId : String(c.normalizedSourceRef) === p.ref));
    const c = (p.discoveryId ? matches[0] : matches.sort((a, b) => a.discoveryId.localeCompare(b.discoveryId))[0])!;
    if (!c) throw new Error(`slot ${p.slot} did not resolve`);

    const reservation = BudgetLedger.reservationFor(model, PER_CANDIDATE_TIMEOUT_MS, 20000, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
    if (ledger.mustStop(reservation)) { halted = `SPEND_CEILING at $${(ALREADY_SPENT_USD + ledger.committedUsd).toFixed(4)} cumulative`; break; }

    const bundle = bundles.get(c.discoveryId);
    const input = buildInput(c, bundle, stages, undefined as never, []);
    const anchorText = operativeSourceTextFor(c, stages.index);
    const ids = c.structuralNodeIds ?? [];
    const parentText = ids.slice(1).map((id) => stages.index.getNodeText(id, "DESCENDANTS")).join("\n\n");
    const scopes = (bundle?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");
    const contextTypes: Record<string, number> = {};
    for (const i of bundle?.items ?? []) contextTypes[i.type] = (contextTypes[i.type] ?? 0) + 1;

    ledger.reserve(c.discoveryId, reservation);
    const t0 = Date.now();
    let result: SemanticCompilationResult | null = null, timedOut = false, errMsg: string | null = null;
    try {
      result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL) }), PER_CANDIDATE_TIMEOUT_MS);
    } catch (e) {
      timedOut = e instanceof CandidateTimeoutError || (e instanceof Error && e.name === "CandidateTimeoutError");
      errMsg = e instanceof Error ? e.message : String(e);
    }
    const wallClockMs = Date.now() - t0;
    const usage = result?.telemetry as { inputTokens?: number; outputTokens?: number } | undefined;
    const billed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) > 0;
    const cost = accountForRequest({ model, elapsedWallClockMs: wallClockMs, timedOut,
      providerUsage: billed ? { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 } : null,
      streamedOutputTokensObserved: usage?.outputTokens ?? null, reservationUsd: reservation, providerRefused: !timedOut && !billed });
    ledger.settle(c.discoveryId, cost);

    const rec = result ? record(c, input, result, model, 1, null) : null;
    if (rec) rec.wallClockMs = wallClockMs;
    const outcome = rec ? classifyOutcome(rec, timedOut) : (timedOut ? "TIMEOUT" : "PROVIDER_FAILURE");
    // R1: the production grounder decides, not a substring test local to this harness.
    const grounding = result ? groundCompiledResult(input, result) : emptyForensicGrounding(c.discoveryId);

    const row = {
      group: p.group, slot: p.slot, ref: String(c.normalizedSourceRef), discoveryId: c.discoveryId, role: String(c.role),
      dual: ids.length > 1,
      operativeChars: anchorText.length, preChangeChars: preChangeSpan(c, stages.index).length,
      contextualParentChars: parentText.length, parentScopeChars: scopes.reduce((a, i) => a + i.excerptText.length, 0),
      operativeTextHash: sha(anchorText), preChangeTextHash: sha(preChangeSpan(c, stages.index)),
      compilerInputHash: sha(JSON.stringify({ doc: input.sourceDocumentId, ref: input.sourceSectionRef, text: input.operativeSourceText, items: (bundle?.items ?? []).map((i) => [i.itemId, i.type, i.excerptText.length]) })),
      status: result?.status ?? (timedOut ? "TIMEOUT" : "ERROR"), outcome,
      failureReasons: (result?.failureReasons ?? (errMsg ? [errMsg.slice(0, 160)] : [])) as string[],
      rules: result?.rules?.length ?? 0, definitions: result?.definitions?.length ?? 0,
      sufficiency: rec?.sufficiencySummary ?? {},
      citations: (result?.rules ?? []).map((r) => (r as { provenance?: { sourceCitation?: string } }).provenance?.sourceCitation ?? "(none)"),
      toolCalls: rec?.toolCalls ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      costUsd: result ? realCost(model, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0) : cost.chargedToBudgetUsd,
      costStatus: cost.costAccountingStatus, wallClockMs, timedOut,
      grounding, parentScopeRefs: scopes.map((i) => i.normalizedRef),
      parentScopeRetained: ids.length > 1 ? scopes.length > 0 : true, contextTypes,
    };
    rows.push(row);
    fs.writeFileSync(path.join(RUN, "rows.json"), JSON.stringify(rows, null, 2));
    console.log(`  [${p.group}] ${p.slot.padEnd(13)} ${row.status.padEnd(16)} ${outcome.padEnd(24)} rules=${row.rules} tools=${row.toolCalls ?? "-"} ${Math.round(wallClockMs / 1000)}s $${row.costUsd.toFixed(5)} op=${row.operativeChars}(was ${row.preChangeChars}) notAnchorOwned=${grounding.notAnchorOwned.length} | cum $${(ALREADY_SPENT_USD + ledger.committedUsd).toFixed(4)}`);
  }

  const snap = ledger.snapshot();
  const by = (g: string) => rows.filter((r) => r.group === g);
  const done = (g: string) => by(g).filter((r) => r.outcome === "COMPLETED").length;
  const summary = {
    generatedBy: "scripts/p3-conmed-pilot/span-validation-b2.ts", model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS, halted,
    budget: { totalCeilingUsd: TOTAL_CEILING_USD, alreadySpentUsd: ALREADY_SPENT_USD, thisRunExactUsd: snap.exactSpendUsd, thisRunRetainedUnknownUsd: snap.retainedUnknownTimeoutUsd, thisRunCommittedUsd: snap.committedUsd, cumulativeCommittedUsd: Number((ALREADY_SPENT_USD + snap.committedUsd).toFixed(6)) },
    controlRecheck: { completed: done("CONTROL_RECHECK"), of: by("CONTROL_RECHECK").length,
      inputsByteIdenticalToPreRemediation: by("CONTROL_RECHECK").every((r) => r.operativeTextHash === r.preChangeTextHash) },
    cohortB: { completed: done("B"), of: by("B").length }, cohortC: { completed: done("C"), of: by("C").length }, cohortD: { completed: done("D"), of: by("D").length },
    safety: {
      operativeAttributionViolations: rows.reduce((a, r) => a + r.grounding.legacy.violations.length, 0),
      candidatesWithViolations: rows.filter((r) => r.grounding.legacy.violations.length > 0).map((r) => r.slot),
      contextRetentionViolations: rows.filter((r) => !r.parentScopeRetained).length,
      unsourcedAssertions: rows.filter((r) => r.grounding.legacy.unsourced.length > 0).map((r) => ({ slot: r.slot, values: r.grounding.legacy.unsourced })),
      groundingCountsByStatus: rows.reduce((acc: Record<string, number>, r) => { for (const [k, v] of Object.entries(r.grounding.countsByStatus)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {}),
    },
    rows,
  };
  fs.writeFileSync(path.join(OUT, "17-validation-continuation-results.json"), JSON.stringify(summary, null, 2));
  console.log("\n", JSON.stringify({ ...summary, rows: undefined }, null, 2));
}
if (process.argv[1]?.endsWith("span-validation-b2.ts")) void main();
