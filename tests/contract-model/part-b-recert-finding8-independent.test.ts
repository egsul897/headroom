/**
 * Phase 3F.1.6.RX-FINAL Part B (independent recertification) - FINDING-8
 * (AUDIT-F7 residual: recordAnalysisFailureLog can itself throw uncaught).
 *
 * UPDATED for Phase 3F.1-terminal, OPEN-6 (this finding's own remaining
 * open item, docs/phase-3f1-6-rx-final-terminal-closure/20-part-b-finding8-
 * recertification.json): construction 3 below originally FALSIFIED
 * Workstream G's fix - a bare, unguarded `console.error` fallback call
 * (orchestrator.ts) could itself throw uncaught out of runContractAnalysis
 * when console.error is wrapped/instrumented. OPEN-6's fix wraps that call
 * in its own try/catch (see orchestrator.ts's own comment at the call
 * site) and extends `RunContractAnalysisResult` with `failureRecordError`
 * (the SECONDARY tier - both the original and the persistence failure,
 * returned to the caller, not just logged) and
 * `failureRecordFallbackLogged` (the TERTIARY/true-bottom tier's own
 * success signal). Construction 3 is now re-run against the FIXED code and
 * asserts the invariant holds; constructions 1, 2, and the regression
 * sanity case are unchanged and still independently exercise the PRIMARY
 * tier (recordAnalysisFailureLog's own write) against real, unmocked
 * Postgres failures, never rerunning or importing Part A's own test file:
 * tests/contract-model/part-b-recert-auditf3-f6-f7-nolog-onlyfailure.test.ts
 * (Part A's own test, which only exercises MOCKED plain `Error` rejections
 * for BOTH the original failure and the recording failure). Every
 * construction below is deliberately different:
 *
 *   1. Forces a REAL, unmocked Postgres FK constraint violation
 *      (PrismaClientKnownRequestError code P2003) on the
 *      recordAnalysisFailureLog write itself, by deleting the owning
 *      Company row as a side effect of the mocked original failure. This
 *      proves classifyError()/the fallback actually handle a genuine Prisma
 *      exception class, not just a hand-authored `new Error(...)` - Part A's
 *      own test never exercised a real driver-shaped error at this call
 *      site.
 *   2. Repeats the same real-constraint-violation construction but through
 *      a DIFFERENT original-failure call site
 *      (`prisma.analysisRun.create` inside `startOrResumeAnalysisRun`,
 *      never `prisma.document.findMany`) - broadening which upstream
 *      failure this fallback chain is proven robust against.
 *   3. Directly attacks the design document's own explicit claim that
 *      "a call to console.error does not throw under this runtime's own
 *      semantics" and that "nothing after [the console.error fallback] is
 *      wrapped in try/catch, because nothing after it exists" - by reading
 *      lib/contract-model/analysis/orchestrator.ts's own source, the
 *      console.error call inside the nested catch block has NO try/catch of
 *      its own. This test makes console.error itself throw (a realistic
 *      production scenario: many logging setups monkey-patch/wrap
 *      console.error - Sentry, Winston/pino console transports, Next.js's
 *      own edge-runtime console interception - and such a wrapper's own
 *      write can fail) and observes whether that exception is truly
 *      swallowed or escapes runContractAnalysis uncaught, which would
 *      reproduce the exact "log-only failure path with no visibility"
 *      defect FINDING-8 exists to eliminate, one tier deeper than Part A
 *      ever probed.
 *
 * Infrastructure-safety: uses one exact, fixed, unique companyId; every
 * delete is scoped to that exact id; never a broad/global delete.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

const COMPANY_ID = "part-b-finding8-independent-recert-test";
const COMPANY_NAME = "Part B independent FINDING-8 recert test co";

// Defensive against an already-documented flakiness in this codebase's own
// test suite (see part-b-recert-auditf3-f6-f7-nolog-onlyfailure.test.ts's
// own comment): vi.spyOn(...).mockRestore()/vi.restoreAllMocks() on a
// Prisma-generated model delegate method has been empirically observed to
// leave the property `undefined` for a LATER test in the SAME file rather
// than genuinely restored, for certain (model, method) pairings. Captured
// once, up front, and defensively reassigned in afterEach below if a
// restore did not fully take - this is test-harness hygiene, unrelated to
// the production code under test.
const originalDocumentFindMany = prisma.document.findMany.bind(prisma.document);
const originalAnalysisRunCreate = prisma.analysisRun.create.bind(prisma.analysisRun);
const originalAnalysisFailureLogCreate = prisma.analysisFailureLog.create.bind(prisma.analysisFailureLog);

async function ensureCompanyExists() {
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    create: { id: COMPANY_ID, name: COMPANY_NAME, onboardingStatus: "ONBOARDING" },
    update: {},
  });
}

async function cleanupChildRows() {
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  // Scoped to this exact id only - never a broad delete.
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await ensureCompanyExists();
});

afterAll(async () => {
  await cleanupChildRows();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await ensureCompanyExists();
  await cleanupChildRows();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (typeof prisma.document.findMany !== "function") prisma.document.findMany = originalDocumentFindMany as typeof prisma.document.findMany;
  if (typeof prisma.analysisRun.create !== "function") prisma.analysisRun.create = originalAnalysisRunCreate as typeof prisma.analysisRun.create;
  if (typeof prisma.analysisFailureLog.create !== "function") prisma.analysisFailureLog.create = originalAnalysisFailureLogCreate as typeof prisma.analysisFailureLog.create;
  // Belt-and-suspenders: some tests below intentionally delete the Company
  // row as part of the adversarial construction. Guarantee it exists again
  // before the next test / the afterAll cleanup runs.
  await ensureCompanyExists();
});

describe("Part B independent recertification - FINDING-8 (recordAnalysisFailureLog can itself throw)", () => {
  it("construction 1: a REAL (unmocked) Postgres FK constraint violation on recordAnalysisFailureLog's own write - never a hand-authored Error", async () => {
    // The ORIGINAL failure is mocked (we still need a deterministic trigger
    // for the pre-identity catch block), but as a side effect of that same
    // mock we delete the owning Company row for real, so the SUBSEQUENT,
    // completely unmocked `prisma.analysisFailureLog.create` call inside
    // recordAnalysisFailureLog performs a genuine INSERT against a
    // now-nonexistent companyId - a real Postgres FK violation
    // (PrismaClientKnownRequestError, code P2003), not a mocked rejection.
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
      await prisma.company.delete({ where: { id: COMPANY_ID } });
      throw new Error("INJECTED (Part B independent): original document-query failure, company row now genuinely gone");
    }) as unknown as typeof prisma.document.findMany);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-real-fk-check" });
    } catch (err) {
      thrown = err;
    }

    // (a) the original fatal error is still surfaced/observable, never
    // silently swallowed.
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.stage).toBe("PRE_RUN_IDENTITY");
    expect(result!.fatalError!.message).toContain("original document-query failure");
    // The original is never replaced by the recording write's own (real,
    // Prisma-driver-shaped) failure text.
    expect(result!.fatalError!.errorClass).toBe("Error");

    // (b) exactly one console.error fires.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, logPayload] = consoleErrorSpy.mock.calls[0]!;
    expect(String(logMessage)).toContain("AUDIT-F7 fallback");
    const payloadJson = JSON.stringify(logPayload);
    expect(payloadJson).toContain("original document-query failure");
    // Prove this is a REAL Prisma driver exception, not a synthetic `Error`
    // like Part A's own test used - the errorClass must be Prisma's own
    // generated class name, and the message must carry Postgres's own FK
    // violation vocabulary (foreign key constraint), which no hand-authored
    // test double can fabricate by accident.
    expect(payloadJson).toContain("PrismaClientKnownRequestError");
    expect((logPayload as { failureRecordError: { message: string; errorClass: string } }).failureRecordError.errorClass).toBe("PrismaClientKnownRequestError");
    expect((logPayload as { failureRecordError: { message: string } }).failureRecordError.message.toLowerCase()).toMatch(/foreign key|constraint/);

    // (c) failureRecordPersisted correctly reflects false.
    expect(result!.failureRecordPersisted).toBe(false);

    // OPEN-6 fix: the SECONDARY tier - the result object itself (not just
    // the console line) carries BOTH the original failure (fatalError,
    // asserted above) and the failure-persistence failure.
    expect(result!.failureRecordError).not.toBeNull();
    expect(result!.failureRecordError!.errorClass).toBe("PrismaClientKnownRequestError");
    expect(result!.failureRecordError!.message.toLowerCase()).toMatch(/foreign key|constraint/);
    // The last-resort console.error itself succeeded here (an ordinary,
    // unwrapped console) - the TERTIARY tier's own signal is honestly true.
    expect(result!.failureRecordFallbackLogged).toBe(true);

    // No AnalysisFailureLog row exists (the write genuinely failed) - and
    // critically, this must be provable even though the Company row itself
    // is gone (cascade-delete concerns do not apply here since the insert
    // never committed in the first place).
    const rawCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint as count FROM analysis_failure_logs WHERE "companyId" = ${COMPANY_ID}`;
    expect(Number(rawCount[0]!.count)).toBe(0);

    // Deliberately NOT calling .mockRestore() here - this codebase's own
    // Part A test (part-b-recert-auditf3-f6-f7-nolog-onlyfailure.test.ts)
    // documents that redundant manual mockRestore() ON TOP OF this file's
    // own afterEach(vi.restoreAllMocks()) can leave a Prisma model
    // delegate's method corrupted (undefined) for a LATER test in this same
    // file, rather than genuinely restored. A single restore path
    // (afterEach below) avoids that double-restore hazard entirely.
    void findManySpy;
    void consoleErrorSpy;
  });

  it("construction 2: the SAME real FK-violation construction, but the original failure originates from a DIFFERENT call site (prisma.analysisRun.create inside startOrResumeAnalysisRun, never document.findMany)", async () => {
    // Need a real Document row so the function proceeds past the
    // zero-documents short-circuit and actually reaches
    // startOrResumeAnalysisRun.
    await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "construction-2.txt", type: "CREDIT_AGREEMENT", source: "test", storageRef: "test-ref", typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true },
    });

    const createSpy = vi.spyOn(prisma.analysisRun, "create").mockImplementationOnce((async () => {
      await prisma.company.delete({ where: { id: COMPANY_ID } });
      throw new Error("INJECTED (Part B independent): original AnalysisRun-claim failure at a call site Part A never exercised for this fallback");
    }) as unknown as typeof prisma.analysisRun.create);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-construction-2" });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.message).toContain("original AnalysisRun-claim failure");
    expect(result!.failureRecordPersisted).toBe(false);
    expect(result!.failureRecordError).not.toBeNull();
    expect(result!.failureRecordError!.errorClass).toBe("PrismaClientKnownRequestError");
    expect(result!.failureRecordFallbackLogged).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, logPayload] = consoleErrorSpy.mock.calls[0]!;
    expect((logPayload as { failureRecordError: { errorClass: string } }).failureRecordError.errorClass).toBe("PrismaClientKnownRequestError");

    void createSpy;
    void consoleErrorSpy;
  });

  it("OPEN-6 fix: construction 3 (formerly a falsification, now FIXED) - the console.error fallback itself throwing no longer escapes runContractAnalysis, and never reports false success", async () => {
    // Both the original failure and the recording failure are mocked here
    // (deliberately, to isolate this one variable): the point of this test
    // is NOT the recording write's own failure mode (already covered by
    // constructions 1-2 and by Part A), it is whether the LAST-RESORT
    // console.error call - now its own try/catch, per OPEN-6's fix - truly
    // cannot propagate an exception out of the surrounding catch block, even
    // when console.error itself throws (a wrapped/instrumented console, a
    // realistic production condition - Sentry's console integration,
    // Winston/pino console transports, Next.js edge-runtime console
    // interception).
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED (Part B independent): original failure, construction 3"));
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED (Part B independent): recording write also fails, construction 3"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("INJECTED (Part B independent): the console.error transport itself throws (e.g. a broken logging sink)");
    });

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-construction-3" });
    } catch (err) {
      thrown = err;
    }

    // THE CENTRAL QUESTION for invariant (d): "no code path anywhere in this
    // fallback chain can itself throw uncaught." Prior to the OPEN-6 fix,
    // this construction FALSIFIED that invariant (see git history / this
    // finding's own recertification doc for the pre-fix measured result:
    // thrown!==null, result===null, stack bottoming out at orchestrator.ts's
    // bare console.error call site). The fix wraps that call in its own
    // try/catch with an empty catch body - nothing else. Re-measured here
    // against the SAME adversarial construction:
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();

    // Never success-shaped in any field, even at this deepest tier.
    expect(result!.outcome).toBe("FAILED");
    expect(result!.status).toBeNull();

    // The ORIGINAL failure is still fully surfaced (SECONDARY tier: the
    // result carries both the original failure AND the persistence
    // failure - never masked by the deeper console.error failure either).
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.message).toContain("original failure, construction 3");
    expect(result!.failureRecordPersisted).toBe(false);
    expect(result!.failureRecordError).not.toBeNull();
    expect(result!.failureRecordError!.message).toContain("recording write also fails, construction 3");

    // TERTIARY tier: the last-resort console.error fallback itself failed -
    // this is honestly reported, never conflated with the ordinary
    // (failureRecordFallbackLogged === true) degraded case.
    expect(result!.failureRecordFallbackLogged).toBe(false);

    // No recursive logger call: console.error was attempted exactly once
    // (the single call this catch block ever makes), and critically
    // recordAnalysisFailureLog/prisma.analysisFailureLog.create was ALSO
    // called exactly once - the console.error failure never triggers a
    // second attempt to write through the same (already-failing) DB
    // abstraction, nor a second console.error call of any kind.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(createLogSpy).toHaveBeenCalledTimes(1);

    void findManySpy;
  });

  it("regression sanity: the ordinary pre-identity failure path (recordAnalysisFailureLog healthy) is unaffected by this file's own adversarial constructions", async () => {
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED (Part B independent): ordinary path sanity check"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-sanity" });

    expect(result.outcome).toBe("FAILED");
    expect(result.failureRecordPersisted).toBe(true);
    expect(result.failureRecordError).toBeNull();
    expect(result.failureRecordFallbackLogged).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(1);
    expect(logs[0]!.message).toContain("ordinary path sanity check");

    void findManySpy;
    void consoleErrorSpy;
  });
});
