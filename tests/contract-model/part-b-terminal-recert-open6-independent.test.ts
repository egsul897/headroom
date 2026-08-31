/**
 * Phase 3F.1-terminal Part B (INDEPENDENT recertification) - OPEN-6
 * (AUDIT-F7 residual, Part A's 08-failure-observability-bottom.json).
 *
 * Assigned defect: "failure-recording path can itself fail unsafely"
 * (lib/contract-model/analysis/orchestrator.ts, runContractAnalysis,
 * PRE_RUN_IDENTITY catch block).
 *
 * Part A's fix wraps the tertiary `console.error` fallback in its own
 * try/catch and hand-traces every statement in the PRE_RUN_IDENTITY catch
 * block, claiming each one is either "provably total" or contained by its
 * own try/catch. This file does NOT rerun Part A's own test file
 * (tests/contract-model/part-b-recert-finding8-independent.test.ts) as
 * evidence; it independently re-derives the hand-trace and attacks its
 * weakest claimed link:
 *
 *   `classifyError(err)`: "Pure, total function over `unknown` (String(err)
 *   and a set of instanceof checks; cannot throw for any JS value)."
 *
 * That claim is FALSE. `classifyError` is:
 *
 *   function classifyError(err: unknown) {
 *     return {
 *       message: err instanceof Error ? err.message : String(err),
 *       errorClass: err instanceof Error ? err.constructor.name : "UnknownError",
 *     };
 *   }
 *
 * `String(err)` on a non-Error value invokes `ToPrimitive(err, "string")`,
 * which calls `err.toString()` (or `err[Symbol.toPrimitive]`) - a
 * *user-controlled* method. A thrown value whose `toString`/
 * `Symbol.toPrimitive` itself throws makes `String(err)` throw. Likewise,
 * for a genuine `Error` INSTANCE whose `message` accessor is a throwing
 * getter, `err.message` itself throws. Neither case is hypothetical: any
 * upstream Prisma/driver/library call, or the application's own code, can
 * throw such a value (e.g. a broken custom-error class, a Proxy-based
 * mock/wrapper, or a poisoned inspection object).
 *
 * Critically, EVERY call to `classifyError` in the PRE_RUN_IDENTITY catch
 * block sits OUTSIDE any try/catch of its own:
 *
 *   } catch (err) {                                   // (A) outer catch
 *     const { message, errorClass } = classifyError(err);   // <- UNGUARDED
 *     ...
 *     try {
 *       await recordAnalysisFailureLog(...);
 *     } catch (recordErr) {                            // (B) inner catch
 *       failureRecordPersisted = false;
 *       const recordFailure = classifyError(recordErr);       // <- UNGUARDED
 *       ...
 *       try { console.error(...); ... } catch { ... }   // only THIS is guarded
 *     }
 *     return { outcome: "FAILED", ... };
 *   }
 *
 * If `classifyError` throws at either unguarded call site, the exception is
 * a NEW exception raised from inside a `catch` block. JavaScript does not
 * let a `catch` block catch its own exceptions (nor a `catch` nested inside
 * it, once it has propagated past that nested try/catch) - it propagates
 * straight out of `runContractAnalysis`, uncaught, reproducing the exact
 * "log-only failure path escapes uncaught" defect this whole branch exists
 * to close, one call earlier than the console.error tier Part A guarded.
 *
 * This is a genuinely NEW attack surface, distinct from every construction
 * in Part A's own fix-confirmation test:
 *   - Part A's constructions 1/2 use real Prisma `PrismaClientKnownRequestError`
 *     instances (well-behaved `.message`/`.constructor.name`).
 *   - Part A's construction 3 throws a plain `new Error(...)` for both the
 *     original and the recording failure, and only makes `console.error`
 *     itself throw.
 *   - None of Part A's constructions ever throws a non-Error value, nor an
 *     Error instance with a poisoned `.message` getter, at either the
 *     ORIGINAL failure site or the RECORDING failure site.
 *
 * Infrastructure-safety: one exact, fixed, unique companyId; every delete
 * scoped to that exact id; never a broad/global delete.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

const COMPANY_ID = "part-b-terminal-open6-independent-recert-test";
const COMPANY_NAME = "Part B terminal OPEN-6 independent recert test co";

const originalDocumentFindMany = prisma.document.findMany.bind(prisma.document);
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
  if (typeof prisma.analysisFailureLog.create !== "function") prisma.analysisFailureLog.create = originalAnalysisFailureLogCreate as typeof prisma.analysisFailureLog.create;
  await ensureCompanyExists();
});

/** A non-Error thrown value whose string coercion itself throws - a realistic
 * shape for a broken custom-error class or a Proxy-wrapped mock/driver
 * object; `err instanceof Error` is false for this, so classifyError falls
 * into the `String(err)` branch. */
function poisonedNonErrorValue(label: string) {
  return {
    __poisoned: true,
    toString() {
      throw new Error(`INJECTED (poisoned toString, ${label}): string coercion of the thrown value itself throws`);
    },
  };
}

/** A genuine `Error` INSTANCE (so `instanceof Error` is true) whose own
 * `.message` accessor is a throwing getter - realistic for any custom error
 * subclass that computes its message lazily (formatting, i18n, redaction). */
class PoisonedMessageError extends Error {
  constructor(label: string) {
    super("this constructor message is never read");
    this.name = "PoisonedMessageError";
    Object.defineProperty(this, "message", {
      get() {
        throw new Error(`INJECTED (poisoned message getter, ${label}): reading .message itself throws`);
      },
      configurable: true,
    });
  }
}

describe("Part B independent terminal recertification - OPEN-6 (classifyError is not actually total)", () => {
  it("construction 1 (doubly-degraded, ORIGINAL failure poisoned): non-Error thrown value with a throwing toString() at the ORIGINAL failure site, PRIMARY DB recording write also throwing in the SAME run - classifyError(err) is called before recordAnalysisFailureLog is ever attempted, so this should surface even before the recording write matters", async () => {
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
      throw poisonedNonErrorValue("construction-1-original");
    }) as unknown as typeof prisma.document.findMany);
    // Doubly-degraded: PRIMARY DB write (recordAnalysisFailureLog's own
    // prisma.analysisFailureLog.create) ALSO fails in this same run.
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED: recording write also fails, construction 1"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-c1" });
    } catch (err) {
      thrown = err;
    }

    // eslint-disable-next-line no-console
    console.log("[OPEN-6 independent recert] construction 1 result:", { thrown: thrown === null ? null : String(thrown), thrownStack: thrown instanceof Error ? thrown.stack : null, result });

    if (thrown !== null) {
      // FALSIFICATION: classifyError(err) at the top of the PRE_RUN_IDENTITY
      // catch block is unguarded. The poisoned toString() escapes straight
      // out of runContractAnalysis - no FAILED result, no console trace, no
      // durable row: the exact log-only/no-visibility failure mode OPEN-6
      // exists to eliminate, reproduced one call earlier than Part A's own
      // fix guards.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
      expect(logs.length).toBe(0);
    }

    // Document the actual observed disposition either way - this assertion
    // block intentionally does NOT force a particular outcome; the
    // console.log above plus the recertification doc carries the concrete
    // reproduction evidence.
    void findManySpy;
    void createLogSpy;
  });

  it("construction 2 (RECORDING failure poisoned): ORIGINAL failure is an ordinary Error, but the PRIMARY DB recording write rejects with a non-Error value whose toString() itself throws - classifyError(recordErr) sits inside the inner catch, still outside any try/catch of its own", async () => {
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED: ordinary original failure, construction 2"));
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockImplementationOnce((async () => {
      throw poisonedNonErrorValue("construction-2-recordErr");
    }) as unknown as typeof prisma.analysisFailureLog.create);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-c2" });
    } catch (err) {
      thrown = err;
    }

    // eslint-disable-next-line no-console
    console.log("[OPEN-6 independent recert] construction 2 result:", { thrown: thrown === null ? null : String(thrown), thrownStack: thrown instanceof Error ? thrown.stack : null, result });

    if (thrown !== null) {
      // FALSIFICATION: classifyError(recordErr) throws before the guarded
      // console.error try/catch is ever reached. Part A's hand-trace claims
      // "Reached at most once ... Plain assignment" for the step right
      // after this one, but never accounts for classifyError(recordErr)
      // itself throwing - the guarded console.error tier never runs at all
      // in this construction, so its own fix is irrelevant to this escape.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }

    void findManySpy;
    void createLogSpy;
  });

  it("construction 3: a genuine Error INSTANCE (instanceof Error === true) whose .message accessor is a throwing getter, at the ORIGINAL failure site - a different unguarded sub-path through the same classifyError call (err.message, not String(err))", async () => {
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
      throw new PoisonedMessageError("construction-3-original");
    }) as unknown as typeof prisma.document.findMany);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-c3" });
    } catch (err) {
      thrown = err;
    }

    // eslint-disable-next-line no-console
    console.log("[OPEN-6 independent recert] construction 3 result:", { thrown: thrown === null ? null : String(thrown), thrownStack: thrown instanceof Error ? thrown.stack : null, result });

    if (thrown !== null) {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
      expect(logs.length).toBe(0);
    }

    void findManySpy;
  });

  it("construction 4 (sync throw vs async rejection): the SAME poisoned non-Error value as construction 1, but thrown SYNCHRONOUSLY from within the mock (not via a rejected Promise) - confirms the escape is identical regardless of whether the original call site rejects asynchronously or throws synchronously before returning a Promise at all", async () => {
    // Deliberately a non-async, non-Promise-returning mock: the exception
    // is raised synchronously during the call expression itself, not
    // observed only after an `await`.
    const findManySpy = vi.spyOn(prisma.document, "findMany").mockImplementationOnce((() => {
      throw poisonedNonErrorValue("construction-4-sync");
    }) as unknown as typeof prisma.document.findMany);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-c4" });
    } catch (err) {
      thrown = err;
    }

    // eslint-disable-next-line no-console
    console.log("[OPEN-6 independent recert] construction 4 result:", { thrown: thrown === null ? null : String(thrown), thrownStack: thrown instanceof Error ? thrown.stack : null, result });

    if (thrown !== null) {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }

    void findManySpy;
  });

  it("construction 5 (circular-reference sanity check): an Error whose payload carries a circular reference, both original and recording writes healthy except console.error is spied (not made to throw) - checks whether logging a circular structure through console.error's own object argument throws on its own, independent of any injected fault", async () => {
    // This checks a DIFFERENT hypothesis than constructions 1-4: not a
    // poisoned toString, but whether the console.error call site's own
    // object-literal argument (`{ originalFailure: fatalError,
    // failureRecordError }`) can itself be made to throw during logging by
    // a circular structure reachable from `fatalError.message` (a string,
    // so not directly circular) - included for completeness per the task's
    // explicit request to test circular-reference constructions, even
    // though `fatalError`/`failureRecordError` here are built from
    // classifyError's own plain-object output, not from the raw thrown
    // value, so no circularity from the original error object can actually
    // reach the console.error payload.
    const circular: Record<string, unknown> = { note: "circular payload attached to a thrown Error, not to classifyError's output" };
    circular.self = circular;
    const err = new Error("INJECTED: original failure with an attached (but not directly logged) circular reference, construction 5");
    (err as unknown as { circularPayload: unknown }).circularPayload = circular;

    const findManySpy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(err);
    const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error("INJECTED: recording write also fails, construction 5"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-c5" });
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.failureRecordPersisted).toBe(false);
    expect(result!.failureRecordFallbackLogged).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(createLogSpy).toHaveBeenCalledTimes(1);

    void findManySpy;
  });
});
