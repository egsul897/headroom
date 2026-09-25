/**
 * Benchmark-recovery pre-flight - RED BASELINES for P-6 and P-7, recorded against the harness as it
 * stood after the population continuation. Zero paid calls: every fact comes from the preserved
 * population artifacts and the harness's own pure functions.
 *
 * P-6: a gateway HTTP 402 insufficient_funds response is absorbed as an ordinary PROVIDER_FAILURE and
 *      the candidate loop keeps dispatching (10 unserved rows in run-continuation-2).
 * P-7: the per-call reservation ($0.019423) under-reserved candidate 7.8 ($0.209447) by an order of
 *      magnitude; the guard would have admitted that request with only $0.10 of ceiling left.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { classifyOutcome } from "./run-population";
import { accountForRequest, BudgetLedger, DEFAULT_CANDIDATE_TIMEOUT_MS, OBSERVED_OUTPUT_TOKENS_PER_SECOND } from "./timeout-policy";
import { OBSERVED_INPUT_TOKENS_PER_CANDIDATE } from "./premium-lock";
import type { CandidateRecord } from "./compile-run";
import type { GatewayModel } from "./probe-models";

const DOCS = "docs/phase-3-conmed-population-verified";
const OUT = "docs/phase-3-conmed-benchmark-recovery-preflight";

/** Source text of a harness file at a commit (the immutable pre-fix harness) or in the working tree. */
function harnessSource(file: string, sha: string | null): string {
  if (!sha) return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  try { return execFileSync("git", ["show", `${sha}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; }
}

export function p6RedBaseline(harnessSha: string | null = null) {
  const statuses = JSON.parse(fs.readFileSync(path.join(DOCS, "run-continuation-2/01-statuses.json"), "utf8")) as { ref: string; discoveryId: string; compile: { outcome: string; failureReasons: string[]; inputTokens: number | null; outputTokens: number | null; wallClockMs: number; costStatus: string; costUsd: number }; evidenceFile: string }[];
  const first = statuses.find((s) => s.ref === "7.9(a)(i)")!;
  const ev = JSON.parse(fs.readFileSync(path.join(DOCS, "run-continuation-2/evidence", `${first.discoveryId}.json`), "utf8"));
  const issue = (ev.compilation.unresolvedIssues as string[])[0]!;
  // the exact failure shape as the runner receives it: a FAILED compilation, failureReasons PROVIDER_FAILURE,
  // and the provider's 402 body only as text under unresolvedIssues (errorDetail null; telemetry zero tokens)
  const rec = { status: ev.compilation.status, failureReasons: ev.compilation.failureReasons, inputTokens: ev.run.inputTokens, outputTokens: ev.run.outputTokens, rules: 0, definitions: 0, toolCalls: 0 } as unknown as CandidateRecord;
  const outcome = classifyOutcome(rec, false);
  const runnerSrc = harnessSource("scripts/p3-conmed-pilot/run-population-verified.ts", harnessSha) + harnessSource("scripts/p3-conmed-pilot/population-loop.ts", harnessSha);
  const after = statuses.slice(statuses.indexOf(first) + 1);
  return {
    observedSignal: { httpStatusPrefix: issue.slice(0, 3), body: JSON.parse(issue.slice(4)), whereItSurfaces: "compilation.unresolvedIssues[0] as the string `402 {json}` (the SDK APIError message); compilation.errorDetail is null; telemetry inputTokens/outputTokens 0", sdkErrorFieldsDestroyedAt: "lib/contract-model/compiler/semantic/caller.ts:373-376 - `err.message` only; `.status` and `.error` of the APIError are dropped before the result reaches the harness" },
    currentClassification: { classifyOutcome: outcome, costStatus: first.compile.costStatus, chargedUsd: first.compile.costUsd },
    loopContinued: { candidatesDispatchedAfterFirst402: after.length, allUnserved402: after.every((s) => s.compile.outcome === "PROVIDER_FAILURE" && (s.compile.inputTokens ?? 0) === 0), refs: after.map((s) => s.ref) },
    runnerHasNoCreditStop: !/GATEWAY_CREDIT_EXHAUSTED/.test(runnerSrc),
    red: outcome === "PROVIDER_FAILURE" && after.length === 9 && !/GATEWAY_CREDIT_EXHAUSTED/.test(runnerSrc),
  };
}

export function p7RedBaseline(model: GatewayModel) {
  const statuses = JSON.parse(fs.readFileSync(path.join(DOCS, "run-continuation-2/01-statuses.json"), "utf8")) as { ref: string; compile: { costUsd: number; inputTokens: number; outputTokens: number; wallClockMs: number } }[];
  const s78 = statuses.find((s) => s.ref === "7.8")!;
  const reservation = BudgetLedger.reservationFor(model, DEFAULT_CANDIDATE_TIMEOUT_MS, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
  const exact = s78.compile.costUsd;
  // the guard with $0.10 of ceiling left: the old reservation says "dispatch", the request would then bill $0.2094
  const ledger = new BudgetLedger(1.0, 1.0);
  ledger.reserve("prior", 0.90); ledger.settle("prior", accountForRequest({ model, elapsedWallClockMs: 0, timedOut: false, providerUsage: { inputTokens: Math.round(0.90 / Number(model.pricing.input)), outputTokens: 0 }, streamedOutputTokensObserved: null, reservationUsd: 0 }));
  const wouldDispatch = !ledger.mustStop(reservation);
  ledger.reserve("7.8", reservation);
  ledger.settle("7.8", accountForRequest({ model, elapsedWallClockMs: s78.compile.wallClockMs, timedOut: false, providerUsage: { inputTokens: s78.compile.inputTokens, outputTokens: s78.compile.outputTokens }, streamedOutputTokensObserved: null, reservationUsd: reservation }));
  return {
    historicalReservationUsd: reservation, reservationInputs: { observedInputTokensPerCandidate: OBSERVED_INPUT_TOKENS_PER_CANDIDATE, timeoutMs: DEFAULT_CANDIDATE_TIMEOUT_MS, outputTokensPerSecond: OBSERVED_OUTPUT_TOKENS_PER_SECOND, reservedOutputTokens: Math.ceil(DEFAULT_CANDIDATE_TIMEOUT_MS / 1000 * OBSERVED_OUTPUT_TOKENS_PER_SECOND) },
    candidate78: { exactUsd: exact, inputTokens: s78.compile.inputTokens, outputTokens: s78.compile.outputTokens, wallClockMs: s78.compile.wallClockMs },
    coverageRatio: reservation / exact, underReservationFactor: exact / reservation,
    syntheticGuard: { ceilingUsd: 1.0, remainingBeforeUsd: 0.10, nextReservationUsd: reservation, oldGuardWouldDispatch: wouldDispatch, committedAfterCandidate78Usd: ledger.committedUsd, ceilingExceededByUsd: Number((ledger.committedUsd - 1.0).toFixed(6)) },
    red: wouldDispatch && ledger.committedUsd > 1.0,
  };
}

if (process.argv[1]?.endsWith("recovery-preflight-baseline.ts")) {
  const model = JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/models.json", "utf8")).data.find((m: GatewayModel) => m.id === "deepseek/deepseek-v4-flash") as GatewayModel;
  const sha = process.argv[2] ?? null;
  const out = { recordedAt: new Date().toISOString(), harnessSha: sha, harnessSourceReadFrom: sha ? `git show ${sha}:<file>` : "working tree", p6: p6RedBaseline(sha), p7: p7RedBaseline(model) };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "01-red-baselines.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
}
