/**
 * CONMED CURRENT-PIPELINE RESUME - budget calibration and execution manifest. ZERO PAID CALLS.
 *
 * Everything here is computed from artifacts on disk and from the deterministic, offline parts of
 * the harness (the sealed population, the rebuilt structural index, exact dedup, operative-span
 * measurement). No caller is ever constructed: the gateway credential is deleted from this process
 * before any import that could reach one, and nothing below imports the LLM caller.
 *
 * Inputs:
 *   - the sealed CONMED population fixture, through the same prepare()/dedupExact the runner uses;
 *   - the locked model's catalogue price (/tmp/claude-0/pilot/models.json, $0.13 / $0.26 per Mtok);
 *   - every LOCKED-MODEL paid call recorded in docs/ after the model was fixed: the candidate-span
 *     paid validation (15) and its continuation (17), and the Fix-B numeric-grounding validation
 *     (09 + paid-validation-evidence/summary.json). Nothing from -0731, Qwen, Mercury, GPT-nano, GLM,
 *     MiMo, Sonnet, the 402-refused pilot, or model-selection spend.
 *
 * Outputs: docs/phase-3-conmed-resume/01-calibration.json and 02-execution-manifest.json.
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import fs from "node:fs";
import path from "node:path";
import { prepare } from "./compile-run";
import { dedupExact } from "./dedup";
import { COMPANY_ID, INSTRUMENT_KEY, operativeTextFor } from "./pipeline";
import { OBSERVED_INPUT_TOKENS_PER_CANDIDATE, PREMIUM_MODEL_BUDGET_USD } from "./premium-lock";
import { DEFAULT_CANDIDATE_TIMEOUT_MS } from "./timeout-policy";
/** The output rate in force when this calibration was frozen (2026-09-24). timeout-policy.ts has since been recalibrated to 200 tok/s (benchmark recovery, 7.16); this document is a historical snapshot and keeps its own figure. */
const OBSERVED_OUTPUT_TOKENS_PER_SECOND = 125;

export const LOCKED_MODEL = "deepseek/deepseek-v4-flash";
const PRICE = { input: 0.13e-6, output: 0.26e-6 }; // per token, from /tmp/claude-0/pilot/models.json (checked below)

// ---------------------------------------------------------------------------
// 1. the real denominator, recomputed offline
// ---------------------------------------------------------------------------

export interface CandidateRow { discoveryId: string; ref: string; operativeChars: number; dual: boolean; nodeKeys: number; band: "SHORT" | "MID" | "LONG" | "EMPTY" }
/** Observed on the locked model: every completion had <= 776 operative chars; every timeout had >= 1,886. */
export const LONG_BAND_MIN_CHARS = 1886;
export const SHORT_BAND_MAX_CHARS = 776;
const bandOf = (n: number): CandidateRow["band"] => (n === 0 ? "EMPTY" : n <= SHORT_BAND_MAX_CHARS ? "SHORT" : n < LONG_BAND_MIN_CHARS ? "MID" : "LONG");

export async function denominator() {
  const { stages, pop, rehydrated, unresolved } = await prepare();
  const { keep, report } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const rows: CandidateRow[] = keep.map((c) => {
    const text = operativeTextFor(c, stages.index);
    return { discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), operativeChars: text.length, dual: (c.structuralNodeIds ?? []).length > 1, nodeKeys: (c.structuralNodeIds ?? []).length, band: bandOf(text.length) };
  }).sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : a.discoveryId < b.discoveryId ? -1 : 1));
  const bands = rows.reduce((a: Record<string, number>, r) => { a[r.band] = (a[r.band] ?? 0) + 1; return a; }, {});
  return {
    discovered: pop.all.length, eligible: pop.eligible.length, ineligible: pop.ineligible.length,
    unresolvedNodeKeys: unresolved.length, rehydrated: rehydrated.length,
    exactDuplicatesRemoved: report.exactDuplicatesRemoved, dedupDenominator: keep.length,
    emptyOperativeText: rows.filter((r) => r.band === "EMPTY").length,
    attemptable: rows.filter((r) => r.band !== "EMPTY").length,
    dual: rows.filter((r) => r.dual).length,
    bands, rows,
  };
}

// ---------------------------------------------------------------------------
// 2. the empirical cost table - locked-model calls only, from docs/
// ---------------------------------------------------------------------------

export interface CostRow { source: string; candidate: string; stage: "compile" | "verifier_layer2" | "amendment_pipeline" | "gateway_health"; outcome: string; elapsedMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number; costStatus: string; operativeChars: number | null }

export function historicalCostTable(): { included: CostRow[]; excluded: { source: string; why: string }[] } {
  const included: CostRow[] = [];
  const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
  const span15 = read("docs/phase-3-candidate-span-remediation-implementation/15-paid-validation-results.json");
  for (const r of span15.rows) included.push({ source: "span-validation-15", candidate: r.slot, stage: "compile", outcome: r.outcome, elapsedMs: r.wallClockMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, costStatus: r.costStatus, operativeChars: r.anchorChars ?? null });
  const span17 = read("docs/phase-3-candidate-span-remediation-implementation/17-validation-continuation-results.json");
  for (const r of span17.rows) included.push({ source: "span-validation-17", candidate: r.slot, stage: "compile", outcome: r.outcome, elapsedMs: r.wallClockMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, costStatus: r.costStatus, operativeChars: r.operativeChars ?? null });
  const ng = read("docs/phase-3-numeric-grounding/09-paid-validation-results.json");
  const ngSummary = read("docs/phase-3-numeric-grounding/paid-validation-evidence/summary.json");
  for (const [key, slot] of [["candidate_7_2_f", "7.2(f)"], ["candidate_7_1_d", "7.1(d)"]] as const) {
    const c = ng[key];
    included.push({ source: "numeric-grounding-09", candidate: slot, stage: "compile", outcome: "COMPLETED", elapsedMs: c.wallClockMs, inputTokens: c.tokens.input, outputTokens: c.tokens.output, costUsd: c.costUsd, costStatus: c.costStatus, operativeChars: c.anchorChars ?? null });
  }
  for (const s of ngSummary.sideCalls) included.push({ source: "numeric-grounding-summary", candidate: s.stage === "amendment_interpretation" ? "(run)" : "(verify)", stage: s.stage === "amendment_interpretation" ? "amendment_pipeline" : "verifier_layer2", outcome: "COMPLETED", elapsedMs: null, inputTokens: s.inputTokens, outputTokens: s.outputTokens, costUsd: s.costUsd, costStatus: "EXACT", operativeChars: null });
  included.push({ source: "numeric-grounding-09", candidate: "(run)", stage: "gateway_health", outcome: "COMPLETED", elapsedMs: null, inputTokens: 11 + 5353, outputTokens: 32 + 203, costUsd: ng.spend.gatewayHealthProbesUsd, costStatus: "EXACT", operativeChars: null });
  // re-derive every EXACT compile cost from tokens x catalogue price, so the table cannot carry a mis-priced row
  for (const r of included) if (r.costStatus === "EXACT" && r.inputTokens !== null && r.outputTokens !== null) {
    const recomputed = r.inputTokens * PRICE.input + r.outputTokens * PRICE.output;
    if (Math.abs(recomputed - r.costUsd) > 1e-6) throw new Error(`cost row ${r.source} ${r.candidate} does not reconstruct from tokens x price: ${r.costUsd} vs ${recomputed}`);
  }
  const excluded = [
    { source: "docs/phase-3-conmed-low-cost-pilot (137 candidates, $0.0434)", why: "tier-1 model was deepseek/deepseek-v4-flash-0731 (forbidden suffix) and 118/137 were HTTP 402 refusals with no provider work" },
    { source: "docs/phase-3-cheap-model-bakeoff", why: "model-selection spend across Qwen / Mercury / GPT-nano / GLM / MiMo; not population economics" },
    { source: "halted population run (9 completed, $0.04655, 32/137)", why: "per-candidate records were destroyed with the session scratch directory; only the aggregate survives in docs/phase-3-candidate-span-remediation/10 and it cannot be attributed to calls. Its mean ($0.00517) is reported as corroboration only, never as a row." },
    { source: "docs/phase-3-validation (Chewy, $13.96)", why: "anthropic/claude-sonnet-5 stage callers; a different instrument and a premium model" },
    { source: "F1 single check ($0.005653)", why: "recorded only as a cumulative figure in the numeric-grounding manifest; no call-level record with tokens survives, so it cannot enter a table that re-derives every row from tokens x price" },
  ];
  return { included, excluded };
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
  return { n: s.length, min: s[0] ?? null, median: s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null, p75: s.length >= 4 ? q(0.75) : null, max: s[s.length - 1] ?? null };
};
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// 3. scenarios and the ceiling
// ---------------------------------------------------------------------------

export function calibrate(den: Awaited<ReturnType<typeof denominator>>, table: ReturnType<typeof historicalCostTable>) {
  const compileExact = table.included.filter((r) => r.stage === "compile" && r.costStatus === "EXACT");
  const compileTimeouts = table.included.filter((r) => r.stage === "compile" && r.costStatus === "UNKNOWN_TIMEOUT_BILLED");
  const verify = table.included.filter((r) => r.stage === "verifier_layer2");
  const amendment = table.included.filter((r) => r.stage === "amendment_pipeline");
  const health = table.included.filter((r) => r.stage === "gateway_health");

  const compileAll = stats(compileExact.map((r) => r.costUsd));
  const compileShort = stats(compileExact.filter((r) => (r.operativeChars ?? 0) <= SHORT_BAND_MAX_CHARS).map((r) => r.costUsd));
  const compileMidLong = stats(compileExact.filter((r) => (r.operativeChars ?? 0) > SHORT_BAND_MAX_CHARS).map((r) => r.costUsd));
  const elapsedShort = stats(compileExact.filter((r) => (r.operativeChars ?? 0) <= SHORT_BAND_MAX_CHARS && r.elapsedMs !== null).map((r) => r.elapsedMs!));
  const verifyStats = stats(verify.map((r) => r.costUsd));

  // the standing reservation, exactly as the runner computes it
  const reservation = OBSERVED_INPUT_TOKENS_PER_CANDIDATE * PRICE.input + Math.ceil((DEFAULT_CANDIDATE_TIMEOUT_MS / 1000) * OBSERVED_OUTPUT_TOKENS_PER_SECOND) * PRICE.output;
  const observedRetainedPerTimeout = stats(compileTimeouts.map((r) => r.costUsd));

  // calls per candidate: compile 1 (multi-turn tool loop inside one accounted call), verifier 0-2, amendment 0 (once per run), health 0 (once per run)
  const verifyTypical = verifyStats.mean!;               // one Layer-2 review call, the observed typical
  const verifyConservative = 2 * verifyStats.max!;      // classifier + review, both at the observed maximum
  const oneTime = { amendmentPipelineUsd: amendment.reduce((s, r) => s + r.costUsd, 0), gatewayHealthUsd: health.reduce((s, r) => s + r.costUsd, 0) };
  const oneTimeUsd = oneTime.amendmentPipelineUsd + oneTime.gatewayHealthUsd;

  const N = den.attemptable, nShort = den.bands.SHORT ?? 0, nMid = den.bands.MID ?? 0, nLong = den.bands.LONG ?? 0;
  const timeoutRateObserved = compileTimeouts.length / (compileTimeouts.length + compileExact.length);

  const low = { formula: "N x (median exact compile) + N x (typical verify) + one-time", usd: r6(N * compileAll.median! + N * verifyTypical + oneTimeUsd) };
  const central = {
    formula: "SHORT x (mean short compile + typical verify) + MID x (mean mid/long compile + typical verify) + LONG x reservation + one-time  [LONG assumed to time out as every observed >= 1,886-char candidate did; MID has no observation and is priced as a completion here]",
    usd: r6(nShort * (compileShort.mean! + verifyTypical) + nMid * ((compileMidLong.mean ?? compileAll.max!) + verifyTypical) + nLong * reservation + oneTimeUsd),
  };
  const conservative = {
    formula: "SHORT x (p75 short compile + conservative verify) + (MID + LONG) x reservation + 10% of SHORT x reservation (a compile or verify timeout allowance among the short candidates) + one-time",
    usd: r6(nShort * (compileShort.p75! + verifyConservative) + (nMid + nLong) * reservation + Math.ceil(0.1 * nShort) * reservation + oneTimeUsd),
  };
  const hardWorst = {
    formula: "N x reservation (every compile charged the full timeout reservation) + N x conservative verify + one-time - the most the accounting policy can charge if every candidate hits the ceiling and every verifier call also runs",
    usd: r6(N * reservation + N * verifyConservative + oneTimeUsd),
  };
  // ceiling: the hard-worst figure rounded UP to the next $0.25; stop-at leaves one full reservation plus a verify pair in hand
  const ceiling = Math.ceil(hardWorst.usd / 0.25) * 0.25;
  const stopAt = r6(ceiling - (reservation + verifyConservative) * 2);

  return {
    price: { inputPerMtok: 0.13, outputPerMtok: 0.26, source: "/tmp/claude-0/pilot/models.json (gateway catalogue), reconciled against every EXACT row" },
    compileCost: { all: compileAll, shortBand: compileShort, midLongBand: compileMidLong, exactRows: compileExact.length, timeoutRows: compileTimeouts.length, observedTimeoutRate: r6(timeoutRateObserved), shortBandElapsedMs: elapsedShort },
    verifyCost: { layer2Review: verifyStats, calls: verify.length, typicalPerCandidateUsd: r6(verifyTypical), conservativePerCandidateUsd: r6(verifyConservative), note: "the condition-suspicion classifier was not invoked in either observed verification (deterministic evidence forced review), so its cost is bounded by the review call's maximum rather than measured" },
    oneTime,
    timeoutReservation: { perCallUsd: r6(reservation), formula: `${OBSERVED_INPUT_TOKENS_PER_CANDIDATE} input tokens x $0.13/Mtok + ceil(${DEFAULT_CANDIDATE_TIMEOUT_MS / 1000}s x ${OBSERVED_OUTPUT_TOKENS_PER_SECOND} tok/s) x $0.26/Mtok`, observedRetainedPerTimeout, note: "the observed $0.0182 retentions used 20,000 input tokens; the runner's constant is 29,408 and yields the larger figure, which is the one the manifest uses" },
    population: { attemptable: N, short: nShort, mid: nMid, long: nLong, empty: den.emptyOperativeText },
    scenarios: { LOW: low, CENTRAL: central, CONSERVATIVE: conservative, HARD_WORST_AUTHORIZED: hardWorst },
    recommended: { hardCeilingUsd: ceiling, stopAtUsd: stopAt, rule: "no call starts if committed + its reservation >= STOP_AT; the ceiling is never crossed because every dispatch reserves first and an unbilled timeout keeps its reservation" },
  };
}

// ---------------------------------------------------------------------------
// 4. benchmark cases in the population
// ---------------------------------------------------------------------------

export function benchmarkCases(rows: CandidateRow[]) {
  const corpus = JSON.parse(fs.readFileSync("docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json", "utf8"));
  const cases = (corpus.cases as { caseId: string; documentId: string; claimSectionRef: string; materiality: string; groundTruthUnitId: string; benchmarkIntegrityStatus: string; sourceExcerptResolution: string; propositions: unknown[] }[]).filter((c) => c.documentId === "conmed-doc-a-eighth-ar-credit-agreement");
  return {
    benchmarkContentHash: corpus.benchmarkContentHash, benchmarkVersion: corpus.benchmarkVersion,
    cases: cases.map((c) => {
      const direct = rows.filter((r) => r.ref === c.claimSectionRef);
      const children = rows.filter((r) => r.ref !== c.claimSectionRef && r.ref.startsWith(c.claimSectionRef + "("));
      return {
        caseId: c.caseId, claimSectionRef: c.claimSectionRef, groundTruthUnitId: c.groundTruthUnitId, materiality: c.materiality, propositions: c.propositions.length,
        benchmarkIntegrityStatus: c.benchmarkIntegrityStatus, sourceExcerptResolution: c.sourceExcerptResolution,
        directCandidates: direct.map((r) => ({ discoveryId: r.discoveryId, operativeChars: r.operativeChars, band: r.band })),
        childCandidates: children.length,
        inPopulation: direct.length > 0,
        alreadyCurrentPipelineComplete: false,
        stillNeedsExecution: direct.length > 0,
        evidenceSourceComplete: c.sourceExcerptResolution !== "UNRESOLVED_DESCRIPTION_ONLY",
      };
    }),
  };
}

if (process.argv[1]?.endsWith("resume-calibration.ts")) {
  void (async () => {
    const catalogue = JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/models.json", "utf8"));
    const m = (catalogue.data ?? catalogue).find((x: { id: string }) => x.id === LOCKED_MODEL);
    if (!m || Number(m.pricing.input) !== PRICE.input || Number(m.pricing.output) !== PRICE.output) throw new Error("locked model price in the catalogue does not match the calibration constants");
    const den = await denominator();
    const table = historicalCostTable();
    const cal = calibrate(den, table);
    const bench = benchmarkCases(den.rows);
    const dir = "docs/phase-3-conmed-resume";
    fs.mkdirSync(dir, { recursive: true });
    const { rows, ...denSummary } = den;
    fs.writeFileSync(path.join(dir, "01-calibration.json"), JSON.stringify({ mission: "HEADROOM PHASE-3 - CONMED current-pipeline resume: budget calibration", paidModelCalls: 0, lockedModel: LOCKED_MODEL, premiumModelBudgetUsd: PREMIUM_MODEL_BUDGET_USD, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, denominator: denSummary, candidates: rows, historicalCostTable: table, calibration: cal, benchmark: bench }, null, 2));
    console.log(JSON.stringify({ denominator: denSummary, calibration: cal, benchmark: bench.cases.map((c) => ({ caseId: c.caseId, ref: c.claimSectionRef, inPopulation: c.inPopulation, direct: c.directCandidates.length, children: c.childCandidates })) }, null, 1));
  })();
}
