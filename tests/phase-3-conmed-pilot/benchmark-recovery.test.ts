/** CONMED benchmark recovery harness - pinned offline. Zero paid calls. */
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
process.env.CONMED_RECOVERY_OUT = "/tmp/claude-0/pilot/benchmark-recovery-test";

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { AttemptStatus } from "../../scripts/p3-conmed-pilot/population-loop";
import type { RecoveryOutcome } from "../../scripts/p3-conmed-pilot/run-benchmark-recovery";
const R = await import("../../scripts/p3-conmed-pilot/run-benchmark-recovery");

const status = (over: Partial<AttemptStatus> & { compileOutcome?: string; verifyOutcome?: string; verifyStatus?: string | null; pkg?: Partial<NonNullable<AttemptStatus["package"]>> | null; evidence?: string | null }): AttemptStatus => ({
  discoveryId: "discovery-candidate:x", ref: "7.x", operativeChars: 300,
  compile: { outcome: (over.compileOutcome ?? "COMPLETED") as AttemptStatus["compile"]["outcome"], status: "PARTIAL", failureReasons: [], wallClockMs: 1, inputTokens: 10, outputTokens: 10, costUsd: 0.001, costStatus: "EXACT" },
  verify: { outcome: (over.verifyOutcome ?? "COMPLETED") as AttemptStatus["verify"]["outcome"], status: over.verifyStatus === undefined ? "MATERIAL_DISCREPANCY" : over.verifyStatus, semanticReviewInvoked: true, findings: 1, sideCalls: [], costUsd: 0.001, costStatus: "EXACT", wallClockMs: 1 },
  package: over.pkg === null ? null : { complete: true, artifactsPersisted: 1, unitsMissingVerification: 0, problems: [], packageHash: "h", file: null, ...(over.pkg ?? {}) },
  evidenceFile: over.evidence === undefined ? "/nonexistent/evidence.json" : over.evidence, committedUsd: 0,
  ...(over.creditExhaustion ? { creditExhaustion: over.creditExhaustion } : {}),
});

describe("targets and policy constants", () => {
  it("exactly eight targets, 7.11 excluded, fresh $15 ledger with STOP_AT $14.90, two attempts maximum", () => {
    expect(R.TARGET_REFS).toEqual(["7.1", "7.2", "7.10", "7.2(c)", "7.13", "7.14", "7.16", "7.17"]);
    expect(R.TARGET_COUNT).toBe(8); expect(new Set(R.TARGET_REFS).size).toBe(8);
    expect(R.EXCLUDED_REF).toBe("7.11"); expect((R.TARGET_REFS as readonly string[]).includes("7.11")).toBe(false);
    expect(R.RECOVERY_CEILING_USD).toBe(15); expect(R.RECOVERY_STOP_AT_USD).toBe(14.9); expect(R.MAX_ATTEMPTS_PER_CASE).toBe(2);
    expect(R.EVIDENCE_LABEL).toBe("BENCHMARK_RECOVERY");
    expect(R.OUT).toBe("/tmp/claude-0/pilot/benchmark-recovery-test");
  });
  it("the offline plan resolves the eight population candidate ids in deterministic order and dispatches nothing", async () => {
    const p = await R.main(["--dry-run"]);
    expect(p!.targetCount).toBe(8);
    expect(p!.targets.map((t: { ref: string }) => t.ref)).toEqual(["7.1", "7.10", "7.13", "7.14", "7.16", "7.17", "7.2", "7.2(c)"]);
    const pop = JSON.parse(fs.readFileSync("docs/phase-3-conmed-population-verified/run-original/00-plan.json", "utf8")).order as { ref: string; discoveryId: string }[];
    for (const t of p!.targets as { ref: string; discoveryId: string }[]) expect(pop.find((o) => o.ref === t.ref)!.discoveryId).toBe(t.discoveryId);
    expect(p!.ceilingUsd).toBe(15); expect(p!.stopAtUsd).toBe(14.9); expect(p!.timeoutMs).toBe(480_000); expect(p!.concurrency).toBe(1); expect(p!.autoRetry).toBe(false); expect(p!.fallbackModel).toBeNull(); expect(p!.premiumModelBudgetUsd).toBe(0);
    expect(p!.reservationPolicy.compileShapeAtMaxChars.conversations).toBe(5);
    expect(p!.reservationPolicy.candidateMaxReservationUsd).toBeGreaterThan(1.39);
  }, 120_000);
  it("source pins: non-target and third-attempt dispatches are refused before any request; no retry/fallback/premium", () => {
    const src = fs.readFileSync("scripts/p3-conmed-pilot/run-benchmark-recovery.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).toMatch(/refusing to dispatch non-target candidate/);
    expect(src).toMatch(/refusing a third attempt/);
    expect(src).toMatch(/pre-flight health probes missing or failed - refusing to dispatch/);
    expect(src).toMatch(/callerFor\(LOCKED_MODEL, sentinel\.fetch\), inventoryCaller: stageCaller/);
    expect(src).toMatch(/reserveOrRefuse\("amendment"/);
    expect(src).not.toMatch(/sonnet|opus|fallbackModel: "|maxRetries|escalat/i);
    expect(src).toMatch(/new BudgetLedger\(RECOVERY_CEILING_USD, RECOVERY_STOP_AT_USD\)/);
  });
});

describe("§12 recovered definition and §13 retry eligibility", () => {
  it("RECOVERED requires compile completed, verifier result, evidence, complete package and valid hash - any verification status", () => {
    // build a real package + evidence pair so the hash re-validates
    const pkgDir = "/tmp/claude-0/pilot/benchmark-recovery-test/pkg"; fs.mkdirSync(pkgDir, { recursive: true });
    const pkgSrc = "docs/phase-3-conmed-population-verified/run-continuation-2/evidence/verified-units/";
    const file = fs.readdirSync(pkgSrc).find((f) => f.endsWith(".verified-units.json"))!;
    const pkg = JSON.parse(fs.readFileSync(pkgSrc + file, "utf8"));
    const evidence = `${pkgDir}/evidence.json`; fs.writeFileSync(evidence, "{}"); const pkgFile = `${pkgDir}/${file}`; fs.copyFileSync(pkgSrc + file, pkgFile);
    for (const st of ["MATERIAL_DISCREPANCY", "VERIFICATION_INCOMPLETE", "REVIEW_REQUIRED", "VERIFICATION_FAILED"]) {
      expect(R.classifyRecovery(status({ verifyStatus: st, evidence, pkg: { complete: pkg.complete, packageHash: pkg.packageHash, file: pkgFile } })).recovery).toBe(pkg.complete ? "RECOVERED" : "PERSISTENCE_INCOMPLETE");
    }
    expect(R.classifyRecovery(status({ evidence, pkg: { complete: true, packageHash: "wrong", file: pkgFile } }))).toMatchObject({ recovery: "PERSISTENCE_INCOMPLETE", packageHashValid: false });
    expect(R.classifyRecovery(status({ evidence, pkg: { complete: false, problems: ["VERIFICATION_WITHOUT_IR"], packageHash: pkg.packageHash, file: pkgFile } }))).toMatchObject({ recovery: "PERSISTENCE_INCOMPLETE", p1Occurrence: true });
    expect(R.classifyRecovery(status({ evidence: null })).recovery).toBe("PERSISTENCE_INCOMPLETE");
  });
  it("execution outcomes map to their recovery outcomes and only those earn the bounded second attempt", () => {
    expect(R.classifyRecovery(status({ compileOutcome: "TIMEOUT" })).recovery).toBe("TIMEOUT");
    expect(R.classifyRecovery(status({ compileOutcome: "SCHEMA_FAILURE" })).recovery).toBe("SCHEMA_FAILURE");
    expect(R.classifyRecovery(status({ compileOutcome: "PROVIDER_FAILURE" })).recovery).toBe("PROVIDER_FAILURE");
    expect(R.classifyRecovery(status({ compileOutcome: "OTHER_EXECUTION_FAILURE" })).recovery).toBe("OTHER_EXECUTION_FAILURE");
    expect(R.classifyRecovery(status({ verifyOutcome: "TIMEOUT" })).recovery).toBe("VERIFICATION_FAILURE");
    expect(R.classifyRecovery(status({ creditExhaustion: { detected: true, source: "RESPONSE_SENTINEL", httpStatus: 402, errorType: "insufficient_funds", message: null, at: "t" } })).recovery).toBe("CREDIT_EXHAUSTED");
    const el = (recovery: RecoveryOutcome, extra: Partial<Parameters<typeof R.retryEligibility>[0]> = {}) => R.retryEligibility({ recovery, p1Occurrence: false, evidenceFile: "/e", package: { complete: false, artifactsPersisted: 1, unitsMissingVerification: 0, problems: [], packageHash: "h", file: null }, ...extra });
    for (const r of ["TIMEOUT", "SCHEMA_FAILURE", "PROVIDER_FAILURE", "OTHER_EXECUTION_FAILURE", "VERIFICATION_FAILURE"] as const) expect(el(r).eligible).toBe(true);
    expect(el("RECOVERED").eligible).toBe(false);
    expect(el("CREDIT_EXHAUSTED").eligible).toBe(false);
    expect(el("PERSISTENCE_INCOMPLETE", { p1Occurrence: true }).eligible).toBe(false);
    expect(el("PERSISTENCE_INCOMPLETE", { evidenceFile: null }).eligible).toBe(true);
    expect(el("PERSISTENCE_INCOMPLETE").eligible).toBe(false);
  });
});

describe("§14 priority, §21 canonical selection, §22 variance", () => {
  it("pass-2 order: no evidence first, then SHORT < MID < LONG, then shorter span", () => {
    const o = R.pass2Order([
      { ref: "7.2", operativeChars: 8843, anyUnits: false }, { ref: "7.13", operativeChars: 1212, anyUnits: true }, { ref: "7.2(c)", operativeChars: 529, anyUnits: false },
      { ref: "7.17", operativeChars: 795, anyUnits: false }, { ref: "7.1", operativeChars: 3275, anyUnits: false }, { ref: "7.14", operativeChars: 1106, anyUnits: false },
    ]).map((x) => x.ref);
    expect(o).toEqual(["7.2(c)", "7.17", "7.14", "7.1", "7.2", "7.13"]);
  });
  it("canonical = the FIRST recovered attempt, never the second even when both recovered; none when neither", () => {
    const a1 = { ...status({}), attempt: 1 as const, pass: 1 as const, recovery: "RECOVERED" as const, retryEligible: false, retryIneligibleReason: null, p1Occurrence: false, packageHashValid: true };
    const a2 = { ...a1, attempt: 2 as const, pass: 2 as const, verify: { ...a1.verify, status: "VERIFICATION_INCOMPLETE" } };
    expect(R.canonicalAttempt([a2, a1])!.attempt).toBe(1);
    expect(R.canonicalAttempt([{ ...a1, recovery: "TIMEOUT" }, a2])!.attempt).toBe(2);
    expect(R.canonicalAttempt([{ ...a1, recovery: "TIMEOUT" }, { ...a2, recovery: "SCHEMA_FAILURE" }])).toBeNull();
  });
  it("variance rows exist only for cases with two completed attempts and compare structure, not semantics", () => {
    const ev = "docs/phase-3-conmed-population-verified/run-continuation-2/evidence/";
    const f = fs.readdirSync(ev).find((x) => x.startsWith("discovery-candidate:") && JSON.parse(fs.readFileSync(ev + x, "utf8")).compilation.status !== "FAILED")!;
    const a1 = { ...status({ evidence: ev + f }), attempt: 1 as const, pass: 1 as const, recovery: "RECOVERED" as const, retryEligible: false, retryIneligibleReason: null, p1Occurrence: false, packageHashValid: true };
    const rows = R.varianceReport(new Map([["7.x", [a1, { ...a1, attempt: 2 as const, pass: 2 as const }]], ["7.y", [a1]]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toHaveLength(2);
    expect(rows[0]!.structurallyIdentical).toBe(true);
    expect(Object.keys(rows[0]!.attempts[0]!).sort()).toEqual(["artifactHashes", "attempt", "definitions", "findings", "materialFindings", "outputHash", "packageHash", "rules", "verifyStatus"]);
    expect(JSON.stringify(rows)).not.toMatch(/CREDIT|SURFACED|score/i);
  });
});

describe("resume after a harness abort (segment 1 preserved in docs)", () => {
  const seg = "docs/phase-3-conmed-benchmark-recovery/run-segment-1";
  it("carries 7.1 forward re-accounted at the full retained reservation, consumes 7.10 as HARNESS_ABORTED_IN_FLIGHT, leaves six targets for pass 1, and seeds the ledger", async () => {
    const p = await R.main(["--dry-run", "--resume-from", seg]);
    const r = p!.resume!;
    expect(r.priorAttempts.map((a: { ref: string; attempt: number; recovery: string; costStatus: string; costUsd: number }) => [a.ref, a.attempt, a.recovery, a.costStatus])).toEqual([["7.1", 1, "TIMEOUT", "UNKNOWN_TIMEOUT_BILLED"], ["7.10", 1, "OTHER_EXECUTION_FAILURE", "UNKNOWN_TIMEOUT_BILLED"]]);
    expect(r.accountingCorrections).toHaveLength(1);
    expect(r.accountingCorrections[0]).toMatchObject({ ref: "7.1", was: { costStatus: "EXACT" }, now: { costStatus: "UNKNOWN_TIMEOUT_BILLED" } });
    expect(r.accountingCorrections[0].now.costUsd).toBeCloseTo(1.3513292, 7);
    expect(r.inFlightAborted).toMatchObject({ ref: "7.10" });
    expect(r.pass1Remaining).toEqual(["7.13", "7.14", "7.16", "7.17", "7.2", "7.2(c)"]);
    const b = r.seededPrior.breakdown;
    expect(r.seededPrior.exactUsd).toBeCloseTo(b.preflightProbesUsd + b.segmentAmendmentUsd + b.segmentAttemptsExactUsd, 8);
    expect(r.seededPrior.retainedUnknownUsd).toBeCloseTo(b.segmentAttemptsRetainedUsd + b.inFlightAbortedReservationUsd, 8);
    expect(r.seededPrior.retainedUnknownUsd).toBeCloseTo(2 * 1.3513292, 7);
    // the preserved segment's own row still shows the defective settlement; the correction is applied on resume, never by editing history
    const raw = JSON.parse(fs.readFileSync(`${seg}/01-attempts.json`, "utf8"));
    expect(raw[0].compile.costStatus).toBe("EXACT"); expect(raw[0].compile.passAUsage).toEqual({ inputTokens: 4914, outputTokens: 42396 });
  }, 120_000);
  it("the aborted attempt is retry-eligible as an execution failure and counts toward the two-attempt maximum; a normally terminated segment cannot be resumed", () => {
    const model = { id: "deepseek/deepseek-v4-flash", pricing: { input: "0.00000013", output: "0.00000026" }, max_tokens: 384000 } as unknown as Parameters<typeof R.deriveResumeState>[1];
    const plan = JSON.parse(fs.readFileSync(`${seg}/00-plan.json`, "utf8"));
    const st = R.deriveResumeState(seg, model, plan.targets);
    const aborted = st.priorAttempts.find((a) => a.ref === "7.10")!;
    expect(aborted.retryEligible).toBe(true); expect(aborted.evidenceFile).toBeNull(); expect(aborted.compile.failureReasons).toEqual(["HARNESS_ABORTED_IN_FLIGHT"]);
    expect(st.priorAttempts.find((a) => a.ref === "7.1")!.evidenceFile).toMatch(/^docs\/phase-3-conmed-benchmark-recovery\/run-segment-1\/evidence\/attempt-1\//);
    expect(fs.existsSync(st.priorAttempts.find((a) => a.ref === "7.1")!.evidenceFile!)).toBe(true);
    expect(() => R.deriveResumeState(seg, model, plan.targets.slice(1))).toThrow(/different targets/);
  });
});
