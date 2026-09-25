/**
 * CONMED population continuation harness - pinned. Zero paid calls: the credential is removed from
 * this process before any import that could construct a caller, and the runner is exercised only
 * through its offline plan and its refusal paths.
 */
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
process.env.CONMED_RUN_OUT = "/tmp/claude-0/pilot/population-continuation-test";

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { continuationScratchDir, deriveContinuationSet, ORIGINAL_RUN_DIR, ORIGINAL_SCRATCH_DIR, preservedContinuationSegments } from "../../scripts/p3-conmed-pilot/run-population-continuation";
import { PREMIUM_MODEL_BUDGET_USD } from "../../scripts/p3-conmed-pilot/premium-lock";
// The runner fixes OUT at module load and static imports are hoisted above the env assignment, so the
// runner is imported dynamically here - exactly as the continuation entry does.
const { AUTO_RETRY, CONCURRENCY, FALLBACK_MODEL, LOCKED_MODEL, main, OUT, SPEND_CEILING_USD, SPEND_STOP_AT_USD } = await import("../../scripts/p3-conmed-pilot/run-population-verified");

const stripped = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const validation = JSON.parse(fs.readFileSync("docs/phase-3-conmed-population-verified/01-run-validation.json", "utf8"));

describe("continuation set is derived from the preserved artifacts (original run only)", () => {
  const set = deriveContinuationSet(ORIGINAL_RUN_DIR, []);
  it("104 prior terminal attempts, 1 in-flight unknown, 28 never attempted, 2 empty skips - reconciling to 133 and 135", () => {
    expect(set.segment).toBe(1);
    expect(set.priorTerminal).toHaveLength(104);
    expect(set.inFlightUnknown).toEqual([{ discoveryId: "discovery-candidate:e9236b1dc9d46e13db1b7678", ref: "7.6(f)(i)", source: "original" }]);
    expect(set.neverAttempted).toHaveLength(28);
    expect(set.emptySkips.map((e) => e.ref)).toEqual(["7.4(a)(iii)", "7.4(a)(iv)"]);
    expect(set.skipDiscoveryIds.size).toBe(105);
    expect(set.priorTerminal.length + 1 + set.neverAttempted.length).toBe(133);
    expect(set.priorTerminal.length + 1 + set.neverAttempted.length + set.emptySkips.length).toBe(135);
    for (const t of set.priorTerminal) expect(set.skipDiscoveryIds.has(t.discoveryId)).toBe(true);
    expect(set.skipDiscoveryIds.has(set.inFlightUnknown[0]!.discoveryId)).toBe(true);
    for (const n of set.neverAttempted) expect(set.skipDiscoveryIds.has(n.discoveryId)).toBe(false);
    expect(new Set(set.neverAttempted.map((n) => n.discoveryId)).size).toBe(28);
  });
  it("the in-flight candidate has no local trace of any kind, so it is INDETERMINATE and never rerun", () => {
    const id = set.inFlightUnknown[0]!.discoveryId;
    expect(fs.existsSync(`${ORIGINAL_RUN_DIR}/evidence/${id}.json`)).toBe(false);
    expect(fs.readdirSync(`${ORIGINAL_RUN_DIR}/evidence/verified-units`).some((f) => f.includes(id))).toBe(false);
    expect(fs.readFileSync(`${ORIGINAL_RUN_DIR}/run.log`, "utf8")).not.toMatch(/7\.6\(f\)\(i\) /);
    const costs = JSON.parse(fs.readFileSync(`${ORIGINAL_RUN_DIR}/02-costs.json`, "utf8"));
    expect(costs.perRequest.some((r: { discoveryId: string }) => r.discoveryId === id)).toBe(false);
    expect(costs.sideCalls.some((r: { discoveryId: string | null }) => r.discoveryId === id)).toBe(false);
    expect(set.neverAttempted.some((n) => n.discoveryId === id)).toBe(false);
  });
  it("prior spend is seeded from the validated ledger, the in-flight reservation, the probes and the possible aborted-launch call - never reset", () => {
    expect(set.priorSpend.breakdown).toMatchObject({ originalExactUsd: validation.ledger.exactUsd, originalTimeoutReservationsUsd: validation.ledger.timeoutReservationsRetainedUsd, originalInFlightReservationUsd: validation.ledger.inFlightAtTermination.chargedUsd, originalPreflightProbesUsd: validation.preflight.spendUsd, abortedFirstLaunchPossibleAmendmentUsd: 0.0004 });
    expect(set.priorSpend.exactUsd + set.priorSpend.retainedUnknownUsd).toBeCloseTo(1.68461318, 6);
    expect(set.priorSpend.exactUsd + set.priorSpend.retainedUnknownUsd).toBeGreaterThan(validation.ledger.committedIncludingInFlightUsd);
  });
});

describe("the continuation runner (same runner, harness durability only)", () => {
  it("policy constants are unchanged and the output directory is the continuation's, never the original's", () => {
    expect(LOCKED_MODEL).toBe("deepseek/deepseek-v4-flash");
    expect(AUTO_RETRY).toBe(false); expect(FALLBACK_MODEL).toBeNull(); expect(CONCURRENCY).toBe(1); expect(PREMIUM_MODEL_BUDGET_USD).toBe(0);
    expect(SPEND_CEILING_USD).toBe(3.5); expect(SPEND_STOP_AT_USD).toBe(3.450577);
    expect(OUT).toBe("/tmp/claude-0/pilot/population-continuation-test");
    for (const n of [1, 2, 3]) expect(continuationScratchDir(n)).not.toBe(ORIGINAL_SCRATCH_DIR);
    expect(new Set([1, 2, 3].map(continuationScratchDir)).size).toBe(3);
  });
  it("the offline plan dispatches exactly the 28 never-attempted candidates, skips 105, seeds the ledger, and flushes after every candidate", async () => {
    const set = deriveContinuationSet(ORIGINAL_RUN_DIR, []);
    const p = await main(["--dry-run"], { skipDiscoveryIds: set.skipDiscoveryIds, priorSpend: set.priorSpend, flushEvery: 1, runLabel: "conmed-continuation-test" });
    expect(p).toBeDefined();
    expect(p!.toDispatch).toBe(28);
    expect(p!.skippedPriorAttempts).toHaveLength(105);
    expect(p!.flushEvery).toBe(1);
    expect(p!.priorSpend).toEqual(set.priorSpend);
    expect(p!.order.map((o) => o.ref)).toEqual(set.neverAttempted.map((n) => n.ref));
    expect(p!.order.some((o) => set.skipDiscoveryIds.has(o.discoveryId))).toBe(false);
    expect(p!.ceilingUsd).toBe(3.5); expect(p!.stopAtUsd).toBe(3.450577);
    expect(p!.dedupDenominator).toBe(135); expect(p!.attemptable).toBe(133);
  }, 120_000);
  it("pre-flight assertion: a skip set that does not reconcile to the population is refused before any provider contact", async () => {
    const set = deriveContinuationSet(ORIGINAL_RUN_DIR, []);
    const bogus = new Set([...set.skipDiscoveryIds, "discovery-candidate:not-in-population"]);
    await expect(main(["--dry-run"], { skipDiscoveryIds: bogus, flushEvery: 1 })).rejects.toThrow(/pre-flight: skip set names/);
  }, 120_000);
  it("the runner refuses without authorization or credential, and the loop itself refuses a skipped id", () => {
    const src = stripped("scripts/p3-conmed-pilot/run-population-verified.ts");
    expect(src).toMatch(/refusing to dispatch previously attempted candidate/);
    expect(src).toMatch(/if \(done % flushEvery === 0\) flush\(\);/);
    expect(src).toMatch(/const flushEvery = opts\.flushEvery \?\? 1;/);
    expect(src).not.toMatch(/done % 10 === 0/);
    // compile / verify / persist call shapes are the original ones
    expect(src).toMatch(/withTimeout\(compileCovenantToIR\(input, \{ caller: callerFor\(LOCKED_MODEL\) \}\), PER_CANDIDATE_TIMEOUT_MS\)/);
    expect(src).toMatch(/withTimeout\(verifyCompiledCandidate\(\{ compilerInput: input, compilationResult: result \}, \{ reviewCaller: stageCaller, conditionSuspicionCaller: stageCaller \}\), PER_CANDIDATE_TIMEOUT_MS\)/);
    expect(src).toMatch(/persistCandidate\(\{ dir: path\.join\(OUT, "evidence"\)/);
    expect(src).not.toMatch(/\battempt\s*<|retries?\s*[:=]\s*[1-9]|maxRetries|\.retry\(|escalat|sonnet|opus/i);
  });
  it("the continuation entry imports the runner only after fixing the output directory, and never names the original scratch directory as its output", () => {
    const src = fs.readFileSync("scripts/p3-conmed-pilot/run-population-continuation.ts", "utf8");
    expect(src).toMatch(/process\.env\.CONMED_RUN_OUT = out;\s*\n\s*const runner = await import\("\.\/run-population-verified"\)/);
    expect(src).not.toMatch(/^import .* from "\.\/run-population-verified"/m);
  });
});

describe("continuation segments: every preserved segment extends the skip set and the seeded spend", () => {
  const segments = preservedContinuationSegments();
  it("with the preserved segments, terminal + in-flight + never attempted still reconcile to 133, and nothing is in two sets", () => {
    const set = deriveContinuationSet(ORIGINAL_RUN_DIR, segments);
    expect(set.segment).toBe(segments.length + 1);
    expect(set.priorTerminal.length + set.inFlightUnknown.length + set.neverAttempted.length).toBe(133);
    expect(set.skipDiscoveryIds.size).toBe(set.priorTerminal.length + set.inFlightUnknown.length);
    const base = deriveContinuationSet(ORIGINAL_RUN_DIR, []);
    for (const id of base.skipDiscoveryIds) expect(set.skipDiscoveryIds.has(id)).toBe(true);
    expect(set.priorSpend.exactUsd + set.priorSpend.retainedUnknownUsd).toBeGreaterThanOrEqual(base.priorSpend.exactUsd + base.priorSpend.retainedUnknownUsd);
    for (const [i, dir] of segments.entries()) {
      const statuses = JSON.parse(fs.readFileSync(`${dir}/01-statuses.json`, "utf8")) as { discoveryId: string }[];
      for (const s of statuses) { expect(set.skipDiscoveryIds.has(s.discoveryId)).toBe(true); expect(base.neverAttempted.some((n) => n.discoveryId === s.discoveryId)).toBe(true); }
      expect(set.priorSpend.breakdown[`continuation${i + 1}ExactUsd`]).toBeDefined();
    }
  });
  it("a segment's in-flight candidate is the first undispatched one of its order, has no trace, and is never rerun", () => {
    const set = deriveContinuationSet(ORIGINAL_RUN_DIR, segments);
    for (const f of set.inFlightUnknown.filter((x) => x.source !== "original")) {
      const dir = segments[Number(f.source.replace("continuation", "")) - 1]!;
      expect(fs.existsSync(`${dir}/03-run-manifest.json`)).toBe(false);
      expect(fs.existsSync(`${dir}/evidence/${f.discoveryId}.json`)).toBe(false);
      const costs = JSON.parse(fs.readFileSync(`${dir}/02-costs.json`, "utf8"));
      expect(costs.perRequest.some((r: { discoveryId: string }) => r.discoveryId === f.discoveryId)).toBe(false);
      expect(set.neverAttempted.some((n) => n.discoveryId === f.discoveryId)).toBe(false);
      expect(set.skipDiscoveryIds.has(f.discoveryId)).toBe(true);
    }
  });
});
