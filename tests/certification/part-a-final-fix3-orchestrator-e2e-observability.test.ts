/**
 * HEADROOM - FINAL 3F.1 CLOSURE, Workstream FIX-3.
 *
 * Required end-to-end failure-observability proof (governing spec section
 * 20): forces, SIMULTANEOUSLY, in one single runContractAnalysis call:
 *
 *   1. the original analysis operation to fail (prisma.document.findMany
 *      rejects before any AnalysisRun row is even claimed - the
 *      PRE_RUN_IDENTITY span, which has no runId yet to attach a durable
 *      fatalError to and is therefore this system's own failure-
 *      observability floor - see orchestrator.ts's own header comment on
 *      that span);
 *   2. the durable failure-log DB write (recordAnalysisFailureLog, i.e.
 *      prisma.analysisFailureLog.create) to ALSO fail;
 *   3. the last-resort console.error fallback to ALSO fail (mocked to
 *      throw);
 *   4. the ORIGINAL thrown value itself to be hostile - an adversarial
 *      value from the matrix in
 *      tests/certification/part-a-final-fix3-error-totality.test.ts, one
 *      per test case below, so this file does not merely repeat that unit
 *      matrix but exercises it THROUGH the real, fully-degraded orchestrator
 *      call path.
 *
 * Required outcome (non-negotiable): runContractAnalysis must NEVER throw
 * uncaught under any of these four simultaneous conditions, and must always
 * return a structured FAILED result - never a false SUCCESS. The originally
 * reported message may safely degrade to a generic placeholder string if the
 * hostile value truly cannot be inspected; that degradation is acceptable,
 * an uncaught throw or a false SUCCESS is not.
 *
 * Infrastructure-safety: one exact, fixed, unique companyId; every delete
 * scoped to that exact id; never a broad/global delete. Mirrors the
 * established convention in
 * tests/contract-model/part-b-terminal-recert-open6-independent.test.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

const COMPANY_ID = "fix3-e2e-total-degradation-observability-test";
const COMPANY_NAME = "FIX-3 e2e total-degradation observability test co";

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

/** Hostile values, one per case - each individually proven in the unit
 * matrix to have previously been capable of making classifyError itself
 * throw. Reused here THROUGH the real orchestrator call path rather than
 * re-derived, per the file header's own note. */
function poisonedNonErrorValue(label: string): unknown {
  return {
    toString() {
      throw new Error(`INJECTED (poisoned toString, ${label})`);
    },
    [Symbol.toPrimitive]() {
      throw new Error(`INJECTED (poisoned Symbol.toPrimitive, ${label})`);
    },
  };
}

class PoisonedMessageError extends Error {
  constructor(label: string) {
    super("never read");
    this.name = "PoisonedMessageError";
    Object.defineProperty(this, "message", {
      get() {
        throw new Error(`INJECTED (poisoned message getter, ${label})`);
      },
      configurable: true,
    });
  }
}

function poisonedConstructorGetterValue(label: string): unknown {
  const obj: Record<string, unknown> = { label };
  Object.defineProperty(obj, "constructor", {
    get() {
      throw new Error(`INJECTED (poisoned constructor getter, ${label})`);
    },
    configurable: true,
  });
  return obj;
}

function throwsOnAnyGetProxy(label: string): unknown {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`INJECTED (proxy get trap throws for ANY property, ${label})`);
      },
      getPrototypeOf() {
        throw new Error(`INJECTED (proxy getPrototypeOf trap throws too, ${label})`);
      },
    },
  );
}

/**
 * Runs one full "all four failures at once" scenario and asserts the
 * required outcome. `hostileOriginalValue` is thrown from
 * prisma.document.findMany (condition 1 + 4); the durable failure-log write
 * is made to fail (condition 2); console.error is mocked to throw
 * (condition 3).
 */
async function runQuadrupleDegradationScenario(label: string, hostileOriginalValue: unknown) {
  const findManySpy = vi.spyOn(prisma.document, "findMany").mockImplementationOnce((async () => {
    throw hostileOriginalValue;
  }) as unknown as typeof prisma.document.findMany);
  const createLogSpy = vi.spyOn(prisma.analysisFailureLog, "create").mockRejectedValueOnce(new Error(`INJECTED: durable failure-log write also fails (${label})`));
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
    throw new Error(`INJECTED: console.error last-resort fallback itself throws (${label})`);
  });

  let thrown: unknown = null;
  let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
  try {
    result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: `doc-${label}` });
  } catch (err) {
    thrown = err;
  }

  // The non-negotiable outcome: runContractAnalysis NEVER throws uncaught,
  // even with all three fallback tiers simultaneously destroyed and a
  // hostile original thrown value on top.
  expect(thrown, `runContractAnalysis threw uncaught for scenario: ${label}`).toBeNull();
  expect(result, `runContractAnalysis returned no result for scenario: ${label}`).not.toBeNull();

  // Never a false SUCCESS under these conditions.
  expect(result!.outcome, `scenario ${label} must report FAILED, never a success outcome`).toBe("FAILED");
  expect(result!.status).toBeNull();
  expect(result!.fatalError, `scenario ${label} must carry a structured fatalError`).not.toBeNull();
  expect(typeof result!.fatalError!.message).toBe("string");
  expect(typeof result!.fatalError!.errorClass).toBe("string");
  expect(result!.fatalError!.stage).toBe("PRE_RUN_IDENTITY");

  // The durable write genuinely failed (condition 2 took effect) and that
  // degradation is honestly reported, not masked as success.
  expect(result!.failureRecordPersisted, `scenario ${label}: failureRecordPersisted must be false (the DB write was made to fail)`).toBe(false);
  expect(result!.failureRecordError, `scenario ${label}: failureRecordError must be populated`).not.toBeNull();
  expect(typeof result!.failureRecordError!.message).toBe("string");
  expect(typeof result!.failureRecordError!.errorClass).toBe("string");

  // The console.error fallback was ALSO made to throw (condition 3) - the
  // true bottom of the fallback hierarchy - so failureRecordFallbackLogged
  // must honestly report false, not true and not null.
  expect(result!.failureRecordFallbackLogged, `scenario ${label}: failureRecordFallbackLogged must be false (console.error itself was made to throw)`).toBe(false);

  // No durable AnalysisFailureLog row exists (the write was made to fail),
  // and no AnalysisRun row was ever created (failure predates the claim).
  const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
  expect(logs.length, `scenario ${label}: no durable AnalysisFailureLog row should exist`).toBe(0);
  const runs = await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } });
  expect(runs, `scenario ${label}: no AnalysisRun row should exist`).toBe(0);

  expect(consoleErrorSpy).toHaveBeenCalled();
  void findManySpy;
  void createLogSpy;
}

describe("FIX-3 end-to-end proof: runContractAnalysis survives original+recording+console ALL failing with a hostile thrown value", () => {
  it("hostile non-Error value (poisoned toString AND Symbol.toPrimitive)", async () => {
    await runQuadrupleDegradationScenario("poisoned-nonerror", poisonedNonErrorValue("e2e-poisoned-nonerror"));
  });

  it("real Error instance with a poisoned .message getter", async () => {
    await runQuadrupleDegradationScenario("poisoned-message-getter", new PoisonedMessageError("e2e-poisoned-message"));
  });

  it("object with a poisoned .constructor getter", async () => {
    await runQuadrupleDegradationScenario("poisoned-constructor-getter", poisonedConstructorGetterValue("e2e-poisoned-constructor"));
  });

  it("Proxy that throws on ANY property get trap access", async () => {
    await runQuadrupleDegradationScenario("throws-on-any-get-proxy", throwsOnAnyGetProxy("e2e-proxy"));
  });

  it("circular object thrown as the original value", async () => {
    const circular: Record<string, unknown> = { note: "circular" };
    circular.self = circular;
    await runQuadrupleDegradationScenario("circular-object", circular);
  });

  it("bigint thrown as the original value", async () => {
    await runQuadrupleDegradationScenario("bigint", 12345678901234567890n);
  });
});
