/**
 * CANDIDATE-SPAN R1+R2+R3 PAID VALIDATION - the sealed 22-candidate manifest.
 *
 * Cohorts run A -> B -> C -> D against the unchanged production compiler on the locked model.
 * Nothing here selects or reshapes the cohort: membership comes from the sealed manifest, resolved
 * to real discovery ids. The run enforces the authorized ceiling, the 480 s timeout and the
 * concurrency ramp, and records the semantic-safety checks the mission makes blocking:
 * operative attribution (no rule may cite an economic term that is not in its anchor's own text)
 * and context retention (the linked parent must still be reachable as typed PARENT_SCOPE).
 */
import fs from "node:fs";
import path from "node:path";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest } from "./timeout-policy";
import { PER_CANDIDATE_TIMEOUT_MS, CandidateTimeoutError, buildInput, callerFor, loadModel, prepare, realCost, record, withTimeout } from "./compile-run";
import { classifyOutcome, LOCKED_MODEL, FORBIDDEN_MODEL, CLEAN_RUNS_BEFORE_CONCURRENCY_2 } from "./run-population";

const OUT = "docs/phase-3-candidate-span-remediation-implementation";
const RUN = "/tmp/claude-0/pilot/span-validation";
export const CEILING_USD = 0.40;
export const STOP_AT_USD = 0.36;

/** The sealed manifest's cohorts, resolved to unambiguous discovery ids where a ref is shared. */
export const COHORTS: { cohort: "A" | "B" | "C" | "D"; name: string; members: { slot: string; ref: string; discoveryId?: string }[] }[] = [
  { cohort: "A", name: "previously-successful single-key controls", members: [
    { slot: "7.1(a)", ref: "7.1(a)" }, { slot: "7.1", ref: "7.1" }, { slot: "7.1(b)", ref: "7.1(b)" },
    { slot: "7.1(c)", ref: "7.1(c)" }, { slot: "7.1(d)", ref: "7.1(d)" }, { slot: "7.2(a)", ref: "7.2(a)" },
    { slot: "7.2(b)", ref: "7.2(b)" }, { slot: "7.2(e) short", ref: "7.2(e)", discoveryId: "discovery-candidate:31223fa50581f12fb594ec0d" },
    { slot: "7.2(f)", ref: "7.2(f)" } ] },
  { cohort: "B", name: "manufactured-long targets", members: [
    { slot: "7.2(e) long", ref: "7.2(e)", discoveryId: "discovery-candidate:62512247bce898548b6f9b63" },
    { slot: "7.2(k)", ref: "7.2(k)", discoveryId: "discovery-candidate:c9999a82a8a6c1c3a9648e22" },
    { slot: "7.2(k)(i)", ref: "7.2(k)(i)", discoveryId: "discovery-candidate:abc8af03ac51f922f06ded82" },
    { slot: "7.2(k)(ii)", ref: "7.2(k)(ii)", discoveryId: "discovery-candidate:42316093889582e0874f69a6" } ] },
  { cohort: "C", name: "parent section controls", members: [
    { slot: "7.2", ref: "7.2" }, { slot: "7.3", ref: "7.3" }, { slot: "7.4", ref: "7.4" },
    { slot: "7.5", ref: "7.5" }, { slot: "7.8", ref: "7.8" }, { slot: "7.9", ref: "7.9" } ] },
  { cohort: "D", name: "dual-key before/after", members: [
    { slot: "7.2(d)", ref: "7.2(d)" }, { slot: "7.2(g)", ref: "7.2(g)" }, { slot: "7.2(h)", ref: "7.2(h)" } ] },
];

/** Cohort A's pre-change figures, from the halted population run's log. The per-candidate artifact
 *  was in the session scratch directory a container reclaim destroyed, so these are the recorded
 *  numbers, not a re-read file - stated as such wherever they are compared. */
export const COHORT_A_BASELINE: Record<string, { status: string; chars: number; inTok: number; outTok: number; costUsd: number; wallMs: number; toolCalls: number }> = {
  "7.1(a)": { status: "COMPLETED", chars: 712, inTok: 18182, outTok: 15044, costUsd: 0.00628, wallMs: 203585, toolCalls: 3 },
  "7.1": { status: "COMPLETED", chars: 3275, inTok: 26528, outTok: 14366, costUsd: 0.00718, wallMs: 456410, toolCalls: 3 },
  "7.1(b)": { status: "COMPLETED", chars: 1886, inTok: 16991, outTok: 23635, costUsd: 0.00835, wallMs: 392852, toolCalls: 0 },
  "7.1(c)": { status: "COMPLETED", chars: 234, inTok: 13265, outTok: 2700, costUsd: 0.00243, wallMs: 145222, toolCalls: 0 },
  "7.1(d)": { status: "COMPLETED", chars: 399, inTok: 17487, outTok: 11831, costUsd: 0.00535, wallMs: 175620, toolCalls: 0 },
  "7.2(a)": { status: "COMPLETED", chars: 66, inTok: 16092, outTok: 7204, costUsd: 0.00396, wallMs: 61715, toolCalls: 4 },
  "7.2(b)": { status: "COMPLETED", chars: 138, inTok: 21411, outTok: 8662, costUsd: 0.00504, wallMs: 87400, toolCalls: 2 },
  "7.2(e) short": { status: "COMPLETED", chars: 200, inTok: 19281, outTok: 6902, costUsd: 0.00430, wallMs: 65047, toolCalls: 2 },
  "7.2(f)": { status: "COMPLETED", chars: 149, inTok: 16337, outTok: 5912, costUsd: 0.00366, wallMs: 63681, toolCalls: 2 },
};

const AMOUNT_RE = /\$[\d,]{4,}|\b\d+(?:\.\d+)?%/g;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every economic term a compiled result asserts, from the whole serialized IR. */
export function assertedAmounts(result: SemanticCompilationResult): string[] {
  const blob = JSON.stringify({ rules: result.rules ?? [], definitions: result.definitions ?? [] });
  return [...new Set(blob.match(AMOUNT_RE) ?? [])];
}

/** §CRITICAL SAFETY: a rule may only assert an economic term its ANCHOR text contains. A term that
 *  exists solely in the linked parent/sibling material is an operative-attribution violation. */
export function attributionCheck(result: SemanticCompilationResult, anchorText: string, parentText: string) {
  const anchor = norm(anchorText);
  const parent = norm(parentText);
  const asserted = assertedAmounts(result);
  const notInAnchor = asserted.filter((a) => !anchor.includes(a));
  return {
    assertedAmounts: asserted,
    supportedByAnchor: asserted.filter((a) => anchor.includes(a)),
    violations: notInAnchor.filter((a) => parent.includes(a)), // present in parent/sibling material only
    unsourced: notInAnchor.filter((a) => !parent.includes(a)), // in neither - a separate, non-span concern
  };
}

interface Row {
  cohort: string; slot: string; ref: string; discoveryId: string; role: string;
  anchorChars: number; preChangeChars: number; dual: boolean;
  status: string; outcome: string; failureReasons: string[]; rules: number; definitions: number;
  sufficiency: Record<string, number>; citations: string[]; toolCalls: number | null;
  inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string;
  wallClockMs: number; timedOut: boolean;
  attribution: ReturnType<typeof attributionCheck>; parentScopeRefs: string[]; parentScopeRetained: boolean;
}

async function main() {
  if (LOCKED_MODEL !== "deepseek/deepseek-v4-flash") throw new Error("model lock violated");
  const model = loadModel(LOCKED_MODEL);
  if (model.id === FORBIDDEN_MODEL) throw new Error("forbidden model");
  const ledger = new BudgetLedger(CEILING_USD, STOP_AT_USD);
  const { stages, bundles, rehydrated } = await prepare();
  fs.mkdirSync(RUN, { recursive: true });

  // ---- resolve the sealed cohort membership to real candidates -------------------------------
  const resolved: { cohort: string; slot: string; c: DiscoveredCandidate }[] = [];
  for (const co of COHORTS) for (const m of co.members) {
    const matches = rehydrated.filter((c) => (m.discoveryId ? c.discoveryId === m.discoveryId : String(c.normalizedSourceRef) === m.ref));
    const pick = m.discoveryId ? matches[0] : matches.sort((a, b) => a.discoveryId.localeCompare(b.discoveryId))[0];
    if (!pick) throw new Error(`manifest slot ${co.cohort}/${m.slot} did not resolve`);
    resolved.push({ cohort: co.cohort, slot: m.slot, c: pick });
  }
  const ids = new Set(resolved.map((r) => r.c.discoveryId));
  if (ids.size !== 22) throw new Error(`expected 22 distinct candidates, resolved ${ids.size}`);
  console.log(`resolved ${resolved.length} manifest slots to ${ids.size} distinct candidates`);

  const rows: Row[] = [];
  let cleanStreak = 0, concurrency = 1, halted: string | null = null;

  const runOne = async (entry: { cohort: string; slot: string; c: DiscoveredCandidate }): Promise<Row> => {
    const { c, cohort, slot } = entry;
    const bundle = bundles.get(c.discoveryId);
    const input = buildInput(c, bundle, stages, undefined as never, []);
    const anchorText = operativeSourceTextFor(c, stages.index);
    const ids2 = c.structuralNodeIds ?? [];
    const parentText = ids2.slice(1).map((id) => stages.index.getNodeText(id, "DESCENDANTS")).join("\n\n");
    const preChangeChars = ids2.map((id) => stages.index.getNodeText(id, "DESCENDANTS")).join("\n\n").length;
    const scopes = (bundle?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");

    const reservation = BudgetLedger.reservationFor(model, PER_CANDIDATE_TIMEOUT_MS, 20000, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
    ledger.reserve(c.discoveryId, reservation);
    const t0 = Date.now();
    let result: SemanticCompilationResult | null = null, timedOut = false, err: string | null = null;
    try {
      result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(LOCKED_MODEL) }), PER_CANDIDATE_TIMEOUT_MS);
    } catch (e) {
      if (e instanceof CandidateTimeoutError || (e instanceof Error && e.name === "CandidateTimeoutError")) timedOut = true;
      err = e instanceof Error ? e.message : String(e);
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
    const attribution = result ? attributionCheck(result, anchorText, parentText) : { assertedAmounts: [], supportedByAnchor: [], violations: [], unsourced: [] };

    const row: Row = {
      cohort, slot, ref: String(c.normalizedSourceRef), discoveryId: c.discoveryId, role: String(c.role),
      anchorChars: anchorText.length, preChangeChars, dual: ids2.length > 1,
      status: result?.status ?? (timedOut ? "TIMEOUT" : "ERROR"), outcome,
      failureReasons: (result?.failureReasons ?? []) as string[],
      rules: result?.rules?.length ?? 0, definitions: result?.definitions?.length ?? 0,
      sufficiency: rec?.sufficiencySummary ?? {},
      citations: (result?.rules ?? []).map((r) => (r as { provenance?: { sourceCitation?: string } }).provenance?.sourceCitation ?? "(none)"),
      toolCalls: rec?.toolCalls ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      costUsd: result ? realCost(model, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0) : cost.chargedToBudgetUsd,
      costStatus: cost.costAccountingStatus, wallClockMs, timedOut,
      attribution, parentScopeRefs: scopes.map((i) => i.normalizedRef), parentScopeRetained: ids2.length > 1 ? scopes.length > 0 : true,
    };
    if (err && !result) row.failureReasons = [err.slice(0, 200)];
    console.log(`  [${cohort}] ${slot.padEnd(13)} ${row.status.padEnd(16)} ${outcome.padEnd(12)} rules=${row.rules} tools=${row.toolCalls ?? "-"} ${Math.round(wallClockMs / 1000)}s $${row.costUsd.toFixed(5)} anchor=${row.anchorChars} viol=${attribution.violations.length} | spent $${ledger.committedUsd.toFixed(4)}`);
    return row;
  };

  for (const co of COHORTS) {
    if (halted) break;
    const entries = resolved.filter((r) => r.cohort === co.cohort);
    console.log(`\n=== COHORT ${co.cohort} - ${co.name} (${entries.length}) concurrency=${concurrency} ===`);
    for (const e of entries) {
      if (ledger.mustStop(BudgetLedger.reservationFor(model, PER_CANDIDATE_TIMEOUT_MS, 20000, OBSERVED_OUTPUT_TOKENS_PER_SECOND))) { halted = `SPEND_CEILING at $${ledger.committedUsd.toFixed(4)}`; break; }
      const row = await runOne(e);
      rows.push(row);
      if (row.outcome === "COMPLETED") { cleanStreak++; if (cleanStreak >= CLEAN_RUNS_BEFORE_CONCURRENCY_2) concurrency = 2; } else cleanStreak = 0;
      fs.writeFileSync(path.join(RUN, "rows.json"), JSON.stringify(rows, null, 2));
    }
    if (halted) break;
    const done = rows.filter((r) => r.cohort === co.cohort && r.outcome === "COMPLETED").length;
    const viol = rows.filter((r) => r.cohort === co.cohort && r.attribution.violations.length > 0);
    if (co.cohort === "A" && (done < 9 || viol.length > 0)) { halted = `COHORT_A_REGRESSION completed=${done}/9 attributionViolations=${viol.length}`; break; }
    if (viol.length > 0) { halted = `ATTRIBUTION_VIOLATION in cohort ${co.cohort}`; break; }
    console.log(`=== COHORT ${co.cohort}: ${done}/${entries.length} completed ===`);
  }

  const snap = ledger.snapshot();
  const summary = {
    generatedBy: "scripts/p3-conmed-pilot/span-validation.ts", model: LOCKED_MODEL, timeoutMs: PER_CANDIDATE_TIMEOUT_MS,
    ceilingUsd: CEILING_USD, halted,
    spend: { exactUsd: snap.exactSpendUsd, retainedUnknownTimeoutUsd: snap.retainedUnknownTimeoutUsd, outstandingReservedUsd: snap.outstandingReservedUsd, committedUsd: snap.committedUsd },
    counts: {
      total: rows.length,
      completed: rows.filter((r) => r.outcome === "COMPLETED").length,
      timeouts: rows.filter((r) => r.outcome === "TIMEOUT").length,
      providerFailures: rows.filter((r) => r.outcome === "PROVIDER_FAILURE").length,
      schemaFailures: rows.filter((r) => r.outcome === "SCHEMA_FAILURE").length,
      toolFailures: rows.filter((r) => r.outcome === "TOOL_FAILURE").length,
      other: rows.filter((r) => !["COMPLETED", "TIMEOUT", "PROVIDER_FAILURE", "SCHEMA_FAILURE", "TOOL_FAILURE"].includes(r.outcome)).length,
      totalRules: rows.reduce((a, r) => a + r.rules, 0),
    },
    byCohort: Object.fromEntries(COHORTS.map((co) => [co.cohort, {
      n: rows.filter((r) => r.cohort === co.cohort).length,
      completed: rows.filter((r) => r.cohort === co.cohort && r.outcome === "COMPLETED").length,
      rules: rows.filter((r) => r.cohort === co.cohort).reduce((a, r) => a + r.rules, 0),
    }])),
    safety: {
      operativeAttributionViolations: rows.reduce((a, r) => a + r.attribution.violations.length, 0),
      candidatesWithViolations: rows.filter((r) => r.attribution.violations.length > 0).map((r) => r.slot),
      contextRetentionViolations: rows.filter((r) => !r.parentScopeRetained).length,
      unsourcedAmounts: rows.reduce((a, r) => a + r.attribution.unsourced.length, 0),
    },
    rows,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "15-paid-validation-results.json"), JSON.stringify(summary, null, 2));
  console.log("\n", JSON.stringify({ ...summary, rows: undefined }, null, 2));
}
if (process.argv[1]?.endsWith("span-validation.ts")) void main();
