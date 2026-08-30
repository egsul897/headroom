/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F7 - no log-only failure). Proves that
 * a genuine failure occurring BEFORE runContractAnalysis has claimed a real
 * AnalysisRun row (the one class of failure a prior audit found could
 * previously reach app/'s own runExtractionAction with no durable trace
 * anywhere except a console.error) now always leaves a durable Postgres
 * row (AnalysisFailureLog), and runContractAnalysis itself never lets such
 * a failure escape as an uncaught exception.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getAnalysisFailureLogsForCompany } from "../../lib/contract-model/analysis/service";

const COMPANY_ID = "no-log-only-failure-test";

async function cleanup() {
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "No log-only failure test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanup();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanup();
});

describe("pre-identity failure durability (AUDIT-F7)", () => {
  it("a failure inside the initial Document query itself is durably recorded (AnalysisFailureLog) and the function returns a structured FAILED result - it never throws uncaught", async () => {
    const spy = vi.spyOn(prisma.document, "findMany").mockRejectedValueOnce(new Error("INJECTED: simulated DB connectivity failure"));

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID, triggeringDocumentId: "doc-xyz" });
    } catch (err) {
      thrown = err;
    }

    // The single most important assertion in this file: runContractAnalysis
    // must NEVER let this escape uncaught to its caller (app/'s own
    // runExtractionAction) - if it did, that caller's own try/catch would be
    // the ONLY thing standing between a real failure and a totally silent
    // one, which is exactly the gap this audit closes.
    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.runId).toBeNull(); // no AnalysisRun row could exist - failure happened before one was claimed
    expect(result!.fatalError).not.toBeNull();
    expect(result!.fatalError!.stage).toBe("PRE_RUN_IDENTITY");
    expect(result!.fatalError!.message).toContain("INJECTED");

    // --- Reload from Postgres: a durable trace exists, not merely a console.error ---
    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(1);
    expect(logs[0]!.stage).toBe("PRE_RUN_IDENTITY");
    expect(logs[0]!.errorClass).toBe("Error");
    expect(logs[0]!.message).toContain("INJECTED");
    expect(logs[0]!.triggeringDocumentId).toBe("doc-xyz");

    spy.mockRestore();
  });

  it("a failure inside startOrResumeAnalysisRun's own claim attempt (after documents are found, before a runId exists) is also durably recorded", async () => {
    await prisma.document.create({ data: { companyId: COMPANY_ID, name: "doc-1.txt", type: "CREDIT_AGREEMENT", source: "test", storageRef: "test-ref", typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true } });

    const spy = vi.spyOn(prisma.analysisRun, "create").mockRejectedValueOnce(new Error("INJECTED: simulated claim-attempt DB failure"));
    // The create-branch fails; the update-branch (P2002 fallback) would also
    // need to be prevented from silently succeeding for this test to
    // reliably reach the outer catch - updateMany against a non-existent
    // row simply matches zero rows (not an error), so findUniqueOrThrow
    // right after it is what actually throws in that fallback path. Either
    // way, SOME exception occurs before a runId is ever obtained.

    let thrown: unknown = null;
    let result: Awaited<ReturnType<typeof runContractAnalysis>> | null = null;
    try {
      result = await runContractAnalysis({ companyId: COMPANY_ID });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("FAILED");
    expect(result!.runId).toBeNull();

    const logs = await getAnalysisFailureLogsForCompany(COMPANY_ID);
    expect(logs.length).toBe(1);
    expect(logs[0]!.stage).toBe("PRE_RUN_IDENTITY");

    spy.mockRestore();
  });
});
