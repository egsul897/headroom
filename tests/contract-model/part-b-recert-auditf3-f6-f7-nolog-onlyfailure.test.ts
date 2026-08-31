/**
 * Phase 3F.1.6.RX Part B (independent, PRODUCTION-FROZEN recertification) -
 * AUDIT-F7 (no log-only failure).
 *
 * Two DELIBERATELY DIFFERENT adversarial constructions from Workstream H's
 * own test (tests/contract-model/no-log-only-failure.test.ts, which mocks
 * prisma.document.findMany and prisma.analysisRun.create):
 *
 * 1. Targets the OTHER branch inside startOrResumeAnalysisRun - the
 *    reclaim-an-existing-row path (prisma.analysisRun.updateMany), reached
 *    only once a row for this identity already exists (i.e. AFTER a real,
 *    successful prior run) - a code path the existing suite's own P2002
 *    fallback comment acknowledges but does not directly exercise via
 *    updateMany itself throwing.
 *
 * 2. Independently investigates the disclosed residual in
 *    docs/phase-3f1-6-rx-final-blocker-closure/16-no-log-only-failure.json
 *    ("a total Postgres outage would still defeat this") by asking whether
 *    anything CHEAPER than a full outage can reproduce the same silent
 *    log-only failure mode. Finding: YES (see AUDIT_F7 in
 *    docs/phase-3f1-6-rx-final-blocker-closure/
 *    29-part-b-auditf3-f6-f7-recertification.json) - the fix's own
 *    pre-identity catch block in lib/contract-model/analysis/orchestrator.ts
 *    called recordAnalysisFailureLog(...) with NO try/catch of its own
 *    around that call, so a failure of that SECOND write alone (Postgres
 *    otherwise fully healthy) propagated UNCAUGHT out of
 *    runContractAnalysis, reproducing the exact log-only failure mode
 *    AUDIT-F7 exists to eliminate, via a materially CHEAPER trigger than
 *    the disclosed "total Postgres outage" residual.
 *
 *    Phase 3F.1.6.RX-FINAL Workstream G (FINDING-8) closes this gap: the
 *    call is now wrapped in its own try/catch with a deliberately
 *    non-recursive fallback (a structured console.error - see the call
 *    site's own comment for why that is the genuine, terminal bottom of
 *    this fallback hierarchy). The tests below now assert the FIXED
 *    behavior: the ORIGINAL failure is never masked, runContractAnalysis
 *    still never throws uncaught, the caller receives a real structured
 *    FAILED result, and `failureRecordPersisted: false` on that result
 *    separately (and honestly) reports that no durable Postgres trace of
 *    the original failure exists - never conflated with success.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

const COMPANY_ID = "part-b-recert-auditf7-nolog-test";

async function cleanup() {
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B recert AUDIT-F7 no-log-only-failure test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanup();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanup();
});

describe("Part B recertification - AUDIT-F7 no-log-only-failure, alternate constructions", () => {
  it("a failure inside startOrResumeAnalysisRun's RECLAIM path (updateMany on an already-existing row) is durably recorded - a different branch than the existing suite's own create()-failure test", async () => {
    // Establish a REAL, already-existing AnalysisRun row for this identity
    // first (a genuine prior successful/skippable run), so the SECOND call
    // below is forced down the P2002 -> updateMany reclaim branch of
        // startOrResumeAnalysisRun, never the plain-INSERT branch.
    const doc = await prisma.document.create({ data: { companyId: COMPANY_ID, name: "reclaim-path.txt", type: "CREDIT_AGREEMENT", source: "test", storageRef: "test-ref", typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true } });

    const first = await runContractAnalysis({ companyId: COMPANY_ID });
    // This first call legitimately fails further downstream (no real storage
    // bytes behind "test-ref"), which is fine and irrelevant to this test -
    // what matters is that a real AnalysisRun row now exists for this exact
    // (companyId, packageKey, analysisAlgorithmVersion) identity, so the
    // NEXT call is forced through the reclaim branch, not the create branch.
    expect(first.runId).not.toBeNull();
    const existingRunCountBefore = await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } });
    expect(existingRunCountBefore).toBe(1);

    const spy = vi.spyOn(prisma.analysisRun, "updateMany").mockRejectedValueOnce(new Error("INJECTED (Part B recert): simulated reclaim-path DB failure"));

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID });
    } catch (err) {
      thrown = err;
    }

    // The central AUDIT-F7 claim: this must never escape uncaught.
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.stage).toBe("PRE_RUN_IDENTITY");
    expect(result!.fatalError!.message).toContain("INJECTED");

    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(1);
    expect(logs[0]!.stage).toBe("PRE_RUN_IDENTITY");
    expect(logs[0]!.message).toContain("INJECTED");

    // The PRE-EXISTING AnalysisRun row from the first call is untouched by
    // this second, failed reclaim attempt (no phantom/partial mutation).
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(1);

    spy.mockRestore();
    void doc;
  });

  it("FINDING-8 FIX: if recordAnalysisFailureLog's OWN write fails (Postgres otherwise fully healthy), the ORIGINAL failure is still returned as a structured FAILED result (never masked, never thrown uncaught), and the persistence gap is separately, honestly reported via failureRecordPersisted:false plus a non-recursive console.error fallback", async () => {
    // Trigger the ordinary, already-proven PRE_RUN_IDENTITY path (the
    // initial Document query throwing) ...
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED (Part B recert): the ORIGINAL failure this run should have recorded"));
    // ... but ALSO fail the one write meant to durably record it - a single
    // failed statement, not a full outage. Every OTHER real query in this
    // same test file (see the sibling test above, and every other Part B
    // suite) succeeds against this exact same live Postgres instance in
    // this same test run, proving the database itself is healthy.
    //
    // Captured explicitly (belt-and-suspenders alongside createLogSpy's own
    // mockRestore() below): Prisma's generated model delegate exposes
    // `create` via a non-own accessor, and this codebase has empirically
    // observed vi.spyOn(...).mockRestore() on this specific
    // (model, "create") pairing leave the property `undefined` for a LATER
    // test in this same file rather than genuinely restored - unlike the
    // other spied methods in this file (document.findMany,
    // analysisRun.updateMany), which restore cleanly. Reassigning the
    // original bound implementation directly after the test sidesteps that
    // without masking it (mockRestore() below is still called first; this
    // is only a defensive fallback if it did not fully take).
    const originalAnalysisFailureLogCreate = prisma.analysisFailureLog.create.bind(prisma.analysisFailureLog);
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED (Part B recert): a single transient failure on the failure-recording write itself"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-gap-check" });
    } catch (err) {
      thrown = err;
    }

    // FINDING-8 FIX: runContractAnalysis's own pre-identity catch block now
    // wraps recordAnalysisFailureLog(...) in its own try/catch. When that
    // write itself throws, the function still never throws uncaught - it
    // returns the SAME structured {outcome: "FAILED", ...} result AUDIT-F7
    // promises for every pre-identity failure, carrying the ORIGINAL
    // "Document query failed" error, not the recording write's own error.
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.runId).toBeNull();
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.stage).toBe("PRE_RUN_IDENTITY");
    // The ORIGINAL error, never the recording write's own error.
    expect(result!.fatalError!.message).toContain("the ORIGINAL failure this run should have recorded");
    expect(result!.fatalError!.message).not.toContain("failure-recording write itself");

    // The persistence gap is separately, honestly observable - never
    // conflated with the ordinary durably-persisted case.
    expect(result!.failureRecordPersisted).toBe(false);

    // A single, non-recursive last-resort console.error fallback ran -
    // exactly once (proving no "log failure -> log logging failure" loop),
    // carrying both the original failure and the recording failure.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, logPayload] = consoleErrorSpy.mock.calls[0]!;
    expect(String(logMessage)).toContain("AUDIT-F7 fallback");
    expect(JSON.stringify(logPayload)).toContain("the ORIGINAL failure this run should have recorded");
    expect(JSON.stringify(logPayload)).toContain("failure-recording write itself");

    // Confirm the ORIGINAL failure left NO durable Postgres trace this time
    // (the recording write itself failed) - this is the disclosed,
    // honestly-reported residual (failureRecordPersisted:false above), NOT
    // a silent log-only failure: the caller still gets the real failure
    // result and the gap is visible in that result, never hidden.
    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(0);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);

    findManySpy.mockRestore();
    createLogSpy.mockRestore();
    if (typeof prisma.analysisFailureLog.create !== "function") {
      prisma.analysisFailureLog.create = originalAnalysisFailureLogCreate;
    }
    consoleErrorSpy.mockRestore();
  });

  it("FINDING-8 FIX regression check: the ORDINARY (non-nested-failure) pre-identity path is unchanged - recordAnalysisFailureLog succeeds, no console.error fallback fires, and failureRecordPersisted:true honestly reports the durable write", async () => {
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED (Part B recert): ordinary single failure, recording write itself is healthy"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-ordinary-check" });

    expect(result.outcome).toBe("FAILED");
    expect(result.fatalError).not.toBeNull();
    expect(result.fatalError!.message).toContain("ordinary single failure");
    expect(result.failureRecordPersisted).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(1);
    expect(logs[0]!.message).toContain("ordinary single failure");

    findManySpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
