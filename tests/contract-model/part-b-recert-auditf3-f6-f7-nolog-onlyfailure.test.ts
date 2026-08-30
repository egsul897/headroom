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
 *    log-only failure mode. Finding: YES - the fix's own pre-identity catch
 *    block in lib/contract-model/analysis/orchestrator.ts calls
 *    recordAnalysisFailureLog(...) with NO try/catch of its own around that
 *    call. If THAT SECOND write itself fails for any reason (not a full
 *    outage - a single transient error, e.g. a serialization failure, a
 *    momentary connection-pool exhaustion for that one statement, or a
 *    foreign-key violation if companyId does not reference a real Company
 *    row), the second exception propagates UNCAUGHT out of
 *    runContractAnalysis entirely - past every durability mechanism this
 *    fix built - and is caught ONLY by app/'s own runExtractionAction
 *    catch block, which does nothing but console.error it. This is exactly
 *    the log-only failure mode AUDIT-F7 was chartered to eliminate,
 *    reproduced here with Postgres otherwise fully healthy (every other
 *    query in this same test file succeeds against the real database) -
 *    i.e. a materially CHEAPER trigger than the disclosed "total Postgres
 *    outage" residual.
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

  it("REAL GAP BEYOND THE DISCLOSED RESIDUAL: if recordAnalysisFailureLog's OWN write fails (Postgres otherwise fully healthy), the original failure is lost with no durable trace anywhere, and the exception propagates uncaught out of runContractAnalysis - reproducible far more cheaply than a total DB outage", async () => {
    // Trigger the ordinary, already-proven PRE_RUN_IDENTITY path (the
    // initial Document query throwing) ...
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED (Part B recert): the ORIGINAL failure this run should have recorded"));
    // ... but ALSO fail the one write meant to durably record it - a single
    // failed statement, not a full outage. Every OTHER real query in this
    // same test file (see the sibling test above, and every other Part B
    // suite) succeeds against this exact same live Postgres instance in
    // this same test run, proving the database itself is healthy.
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED (Part B recert): a single transient failure on the failure-recording write itself"));

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-gap-check" });
    } catch (err) {
      thrown = err;
    }

    // THIS IS THE GAP: runContractAnalysis's own pre-identity catch block
    // (lib/contract-model/analysis/orchestrator.ts) awaits
    // recordAnalysisFailureLog(...) with no try/catch of its own around
    // that specific call. When that write itself throws, the exception is
    // NOT the original "Document query failed" error being durably
    // recorded and structurally returned - it propagates straight out of
    // runContractAnalysis as an UNCAUGHT exception instead of the
    // structured {outcome: "FAILED", ...} result AUDIT-F7 promises for
    // every pre-identity failure.
    expect(thrown).not.toBeNull();
    expect(result).toBeNull();

    // Confirm the ORIGINAL failure (the actual, real problem an operator
    // would want to know about) left NO durable trace anywhere - not in
    // AnalysisFailureLog (the write itself failed), not in AnalysisRun (no
    // runId was ever obtained), i.e. exactly the "log-only" failure mode
    // (caught only by app/'s own runExtractionAction console.error) that
    // AUDIT-F7's own fix was chartered to eliminate - reproduced here with
    // a single failed write, not a total outage.
    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(0);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);

    findManySpy.mockRestore();
    createLogSpy.mockRestore();
  });
});
