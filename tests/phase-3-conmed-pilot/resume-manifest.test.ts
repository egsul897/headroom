/**
 * CONMED resume manifest - calibration and entry point, pinned. Zero paid calls: the credential is
 * removed from this process before anything is imported that could construct a caller, and the
 * runner is exercised only through its offline plan and its refusal paths.
 */
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { benchmarkCases, calibrate, denominator, historicalCostTable, LOCKED_MODEL as CAL_MODEL } from "../../scripts/p3-conmed-pilot/resume-calibration";
import { AUTO_RETRY, CONCURRENCY, FALLBACK_MODEL, FORBIDDEN_MODEL_SUFFIX, LOCKED_MODEL, main, SPEND_CEILING_USD, SPEND_STOP_AT_USD } from "../../scripts/p3-conmed-pilot/run-population-verified";
import { PREMIUM_MODEL_BUDGET_USD } from "../../scripts/p3-conmed-pilot/premium-lock";
import { DEFAULT_CANDIDATE_TIMEOUT_MS } from "../../scripts/p3-conmed-pilot/timeout-policy";

const manifest = JSON.parse(fs.readFileSync("docs/phase-3-conmed-resume/02-execution-manifest.json", "utf8"));
const calibrationFile = JSON.parse(fs.readFileSync("docs/phase-3-conmed-resume/01-calibration.json", "utf8"));
const stripped = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("model lock and execution policy", () => {
  it("the locked model has no suffix and the runner refuses -0731; no fallback, no retry, concurrency 1, premium budget zero", () => {
    expect(LOCKED_MODEL).toBe("deepseek/deepseek-v4-flash");
    expect(CAL_MODEL).toBe(LOCKED_MODEL);
    expect(LOCKED_MODEL.endsWith(FORBIDDEN_MODEL_SUFFIX)).toBe(false);
    expect(FALLBACK_MODEL).toBeNull();
    expect(AUTO_RETRY).toBe(false);
    expect(CONCURRENCY).toBe(1);
    expect(PREMIUM_MODEL_BUDGET_USD).toBe(0);
    expect(DEFAULT_CANDIDATE_TIMEOUT_MS).toBe(480_000);
    expect(manifest.modelLock.model).toBe(LOCKED_MODEL);
    expect(manifest.execution).toMatchObject({ timeoutMs: 480000, concurrency: 1, attemptsPerCandidate: 1, autoRetry: false, timeoutRaisedForLongParents: false });
  });
  it("the runner's source has no retry loop, no escalation path, no second model, and pins ANALYZER_MODEL before any caller", () => {
    const src = stripped("scripts/p3-conmed-pilot/run-population-verified.ts");
    expect(src).not.toMatch(/\battempt\s*<|retries?\s*[:=]\s*[1-9]|maxRetries|\.retry\(|escalat|fallback\s*=\s*"|sonnet|opus|CLEAN_RUNS_BEFORE_CONCURRENCY_2|runPool/i);
    expect(src).toMatch(/AUTO_RETRY = false as const/);
    expect(src).toMatch(/process\.env\.ANALYZER_MODEL = LOCKED_MODEL/);
    expect(src.indexOf("process.env.ANALYZER_MODEL = LOCKED_MODEL")).toBeLessThan(src.indexOf("getStageCaller()"));
    expect(src).toMatch(/withTimeout\(verifyCompiledCandidate/);
    expect(src).toMatch(/withTimeout\(compileCovenantToIR/);
    expect(src).toMatch(/snapshotUnitsForVerification\(result\)/);
    expect(src.indexOf("snapshotUnitsForVerification(result)")).toBeLessThan(src.indexOf("await withTimeout(verifyCompiledCandidate"));
    expect(src).toMatch(/persistCandidate\(/);
    expect(src).toMatch(/VerifiedUnitManifestWriter/);
    expect(src).not.toMatch(/writeCandidateEvidence\(/);
  });
  it("the runner refuses to start without explicit authorization, and refuses without a credential even when authorized", async () => {
    delete process.env.CONMED_RESUME_AUTHORIZED;
    await expect(main([])).rejects.toThrow(/not authorized/);
    process.env.CONMED_RESUME_AUTHORIZED = "1";
    await expect(main([])).rejects.toThrow(/no gateway credential/);
    delete process.env.CONMED_RESUME_AUTHORIZED;
  });
});

describe("the real denominator (offline, from the sealed population through the repaired pipeline)", () => {
  it("is 163 discovered -> 135 exact-dedup -> 133 attemptable, and the file says the same", async () => {
    const d = await denominator();
    expect(d).toMatchObject({ discovered: 163, eligible: 163, exactDuplicatesRemoved: 28, dedupDenominator: 135, emptyOperativeText: 2, attemptable: 133 });
    expect(d.bands).toEqual({ SHORT: 101, MID: 19, LONG: 13, EMPTY: 2 });
    expect(calibrationFile.denominator).toMatchObject({ discovered: 163, dedupDenominator: 135, attemptable: 133 });
    expect(calibrationFile.candidates).toHaveLength(135);
    expect(d.rows.filter((r) => r.band === "EMPTY").map((r) => r.ref)).toEqual(["7.4(a)(iii)", "7.4(a)(iv)"]);
    expect(d.rows.filter((r) => r.band === "LONG").every((r) => r.operativeChars >= 1886)).toBe(true);
    expect(d.rows.filter((r) => r.band === "SHORT").every((r) => r.operativeChars <= 776 && r.operativeChars > 0)).toBe(true);
  }, 120_000);
  it("the dry-run plan lists exactly the attemptable candidates in deterministic order and dispatches nothing", async () => {
    const p = await main(["--dry-run"]);
    expect(p).toBeDefined();
    expect(p!.attemptable).toBe(133);
    expect(p!.dedupDenominator).toBe(135);
    expect(p!.skippedEmpty.map((s) => s.ref)).toEqual(["7.4(a)(iii)", "7.4(a)(iv)"]);
    expect(p!.ceilingUsd).toBe(SPEND_CEILING_USD);
    expect(p!.stopAtUsd).toBe(SPEND_STOP_AT_USD);
    expect(p!.reservationPerCallUsd).toBeCloseTo(0.019423, 5);
    const refs = p!.order.map((o) => o.ref);
    expect([...refs].sort()).toEqual(refs);
    expect(refs).toContain("7.2(k)");
  }, 120_000);
});

describe("empirical cost table and scenarios", () => {
  const table = historicalCostTable();
  it("includes only locked-model calls, every EXACT row reconstructs from tokens x price, and the exclusions are named", () => {
    expect(table.included.every((r) => r.costStatus !== "EXACT" || r.inputTokens !== null)).toBe(true);
    expect(table.included.filter((r) => r.stage === "compile" && r.costStatus === "EXACT")).toHaveLength(17);
    expect(table.included.filter((r) => r.stage === "compile" && r.costStatus === "UNKNOWN_TIMEOUT_BILLED")).toHaveLength(9);
    expect(table.included.filter((r) => r.stage === "verifier_layer2")).toHaveLength(2);
    expect(table.included.filter((r) => r.stage === "amendment_pipeline")).toHaveLength(1);
    expect(table.excluded.map((e) => e.source).join(" ")).toMatch(/0731|bakeoff|halted population|Chewy/);
    for (const r of table.included.filter((x) => x.costStatus === "EXACT" && x.stage === "compile")) expect(r.inputTokens! * 0.13e-6 + r.outputTokens! * 0.26e-6).toBeCloseTo(r.costUsd, 6);
  });
  it("the timeout reservation is the runner's own formula, above the observed $0.0182 retentions, never cheaper", async () => {
    const cal = calibrate(await denominator(), table);
    expect(cal.timeoutReservation.perCallUsd).toBeCloseTo(29408 * 0.13e-6 + 60000 * 0.26e-6, 6);
    expect(cal.timeoutReservation.perCallUsd).toBeGreaterThan(cal.timeoutReservation.observedRetainedPerTimeout.max!);
    expect(cal.compileCost.all).toMatchObject({ n: 17 });
    expect(cal.compileCost.all.median).toBeCloseTo(0.006355, 5);
    expect(cal.scenarios.LOW.usd).toBeLessThan(cal.scenarios.CENTRAL.usd);
    expect(cal.scenarios.CENTRAL.usd).toBeLessThan(cal.scenarios.CONSERVATIVE.usd);
    expect(cal.scenarios.CONSERVATIVE.usd).toBeLessThan(cal.scenarios.HARD_WORST_AUTHORIZED.usd);
    expect(cal.scenarios.HARD_WORST_AUTHORIZED.usd).toBeLessThanOrEqual(cal.recommended.hardCeilingUsd);
    expect(cal.recommended.hardCeilingUsd).toBe(SPEND_CEILING_USD);
    expect(cal.recommended.stopAtUsd).toBeCloseTo(SPEND_STOP_AT_USD, 6);
    expect(manifest.budget.hardCeilingUsd).toBe(SPEND_CEILING_USD);
    expect(manifest.budget.stopAtUsd).toBeCloseTo(SPEND_STOP_AT_USD, 6);
    expect(calibrationFile.calibration.recommended.hardCeilingUsd).toBe(SPEND_CEILING_USD);
  }, 120_000);
});

describe("benchmark cases in the population", () => {
  it("all nine CONMED V3.1.1 cases map to exactly one direct candidate each; none is current-pipeline complete; scoring is deferred", async () => {
    const b = benchmarkCases((await denominator()).rows);
    expect(b.cases).toHaveLength(9);
    expect(b.cases.every((c) => c.inPopulation && c.directCandidates.length === 1 && !c.alreadyCurrentPipelineComplete && c.stillNeedsExecution)).toBe(true);
    expect(b.cases.map((c) => c.claimSectionRef).sort()).toEqual(["7.1", "7.10", "7.11", "7.13", "7.14", "7.16", "7.17", "7.2", "7.2(c)"]);
    expect(b.cases.filter((c) => c.directCandidates[0]!.band === "LONG").map((c) => c.claimSectionRef).sort()).toEqual(["7.1", "7.10", "7.2"]);
    expect(manifest.benchmark).toMatchObject({ conmedCases: 9, alreadyCurrentPipelineComplete: 0, stillNeedingExecution: 9, scoringDeferred: true });
    expect(manifest.postRunScoringPlan.notProducedHere).toBe(true);
  }, 120_000);
});

describe("zero-cost guarantee of the calibration itself", () => {
  it("neither the calibration script nor this test imports the LLM caller, and both delete the credential first", () => {
    for (const f of ["scripts/p3-conmed-pilot/resume-calibration.ts", "tests/phase-3-conmed-pilot/resume-manifest.test.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      expect(imports.some((i) => /llm-caller|gateway-health|probe-models/.test(i)), f).toBe(false);
      expect(src.indexOf("delete process.env.AI_GATEWAY_API_KEY")).toBeLessThan(src.indexOf("\nimport "));
    }
    expect(calibrationFile.paidModelCalls).toBe(0);
    expect(manifest.paidModelCallsThisMission).toBe(0);
  });
});
