/**
 * Phase 3F.1 Workstream D (F6) - compile-failure observability. The DSGR
 * first-blind run preserved only `{candidateRef, status: "FAILED"}` for 2
 * real compile failures, with no way to diagnose either without re-running
 * outside the frozen-run discipline. Root cause: compileCovenantToIR had no
 * try/catch around `caller.compile(input)` itself, so a genuine thrown
 * exception propagated out uncaught and the caller's own try/catch
 * discarded its content. This file exercises the fix: compileCovenantToIR
 * now NEVER throws, converting any exception into the same structured
 * SemanticCompilationResult shape every other failure path already returns,
 * with a new errorDetail field (bounded, sanitized, classified).
 *
 * Task §43's required points (41-48), mapped to tests below.
 */
import { describe, expect, it } from "vitest";
import { classifyFailureCategory, compileCovenantToIR, sanitizeErrorMessage } from "../../lib/contract-model/compiler/semantic/compile";
import { compilePackageToIR } from "../../lib/contract-model/compiler/semantic/package-compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

function throwingCaller(build: () => never): SemanticCaller & { callCount: number } {
  let callCount = 0;
  return {
    providerName: "fake",
    model: "fake-model",
    isSynthetic: false,
    get callCount() {
      return callCount;
    },
    async compile() {
      callCount++;
      return build();
    },
  } as SemanticCaller & { callCount: number };
}

function successResult(): SemanticCallerResult {
  const rule = { localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], capacityExpression: { kind: "MONEY", amount: 1 }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null };
  return { submission: { rules: [rule], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
}

function discoveredCandidate(discoveryId: string): DiscoveredCandidate {
  return {
    discoveryId,
    documentId: "sem-test-doc",
    structuralNodeKeys: [],
    normalizedSourceRef: "9.01",
    families: [],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test candidate",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "§9.01",
    discoveryRunVersion: "test-v1",
  } as DiscoveredCandidate;
}

describe("Phase 3F.1 F6 - compile-failure observability", () => {
  it("41/model failure: a thrown transport/model exception is converted to a structured FAILED result, never left to propagate", async () => {
    const caller = throwingCaller(() => {
      throw new Error("connection reset by peer");
    });
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("FAILED");
    expect(result.failureReasons).toEqual(["TRANSPORT_OR_INTERNAL_ERROR"]);
    expect(result.errorDetail).not.toBeNull();
    expect(result.errorDetail!.errorClass).toBe("Error");
    expect(result.errorDetail!.sanitizedMessage).toContain("connection reset by peer");
    expect(result.errorDetail!.failureCategory).toBe("TRANSPORT");
  });

  it("42/schema failure: a structured MODEL_SCHEMA_FAILURE (no submission, no throw) still carries no errorDetail - that field is reserved for the thrown-exception path only, never duplicating information the existing failureReasons/unresolvedIssues already carry", async () => {
    const caller: SemanticCaller = { providerName: "fake", model: "fake-model", isSynthetic: false, async compile() { return { submission: null, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: "MODEL_SCHEMA_FAILURE", failureDetail: "malformed tool call" }; } };
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("FAILED");
    expect(result.failureReasons).toEqual(["MODEL_SCHEMA_FAILURE"]);
    expect(result.errorDetail).toBeNull();
    expect(result.unresolvedIssues).toContain("malformed tool call");
  });

  it("43/output truncation: OUTPUT_TRUNCATED with no recoverable content still preserves its own diagnostic (pre-existing behavior, reconfirmed unaffected by the F6 change)", async () => {
    const caller: SemanticCaller = { providerName: "fake", model: "fake-model", isSynthetic: false, async compile() { return { submission: null, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: "OUTPUT_TRUNCATED", failureDetail: "no valid rule/definition prefix could be recovered" }; } };
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("FAILED");
    expect(result.failureReasons).toEqual(["OUTPUT_TRUNCATED"]);
    expect(result.unresolvedIssues[0]).toContain("no valid rule/definition prefix could be recovered");
  });

  it("44/tool failure: a thrown exception during the tool-use loop itself is caught the same way as any other transport exception, classified TOOL when the message names a tool", async () => {
    const caller = throwingCaller(() => {
      throw new Error("tool_use dispatch failed: unknown tool retrieve_schedule");
    });
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("FAILED");
    expect(result.errorDetail!.failureCategory).toBe("TOOL");
  });

  it("45/fault isolation preserved: one candidate throwing does not abort the package - the sibling still completes, and the failed entry's result now carries structured errorDetail (not just a bare status)", async () => {
    const goodCandidate = discoveredCandidate("good-1");
    const badCandidate = discoveredCandidate("bad-1");
    const mixedCaller: SemanticCaller = {
      providerName: "fake",
      model: "fake-model",
      isSynthetic: false,
      async compile(input) {
        if (input.candidateRef === "bad-1") throw new TypeError("unexpected null in response body");
        return successResult();
      },
    };
    const summary = await compilePackageToIR("sem-test-co", "sem-test-instrument", [
      { candidate: goodCandidate, compilerInput: testCompilerInput({ candidateRef: "good-1" }) },
      { candidate: badCandidate, compilerInput: testCompilerInput({ candidateRef: "bad-1" }) },
    ], { caller: mixedCaller });

    expect(summary.results).toHaveLength(2);
    expect(summary.failedCount).toBe(1);
    const badEntry = summary.results.find((r) => r.discoveryId === "bad-1")!;
    expect(badEntry.result.status).toBe("FAILED");
    expect(badEntry.result.errorDetail).not.toBeNull();
    expect(badEntry.result.errorDetail!.errorClass).toBe("TypeError");
    expect(badEntry.result.errorDetail!.sanitizedMessage).toContain("unexpected null in response body");
    const goodEntry = summary.results.find((r) => r.discoveryId === "good-1")!;
    expect(goodEntry.result.status).not.toBe("FAILED");
  });

  it("46/source identity preserved: the failed entry's own discoveryId is preserved alongside the structured failure, so a caller can always trace a failure back to its candidate without re-running", async () => {
    const badCandidate = discoveredCandidate("trace-me-1");
    const alwaysThrows: SemanticCaller = { providerName: "fake", model: "fake-model", isSynthetic: false, async compile() { throw new Error("boom"); } };
    const summary = await compilePackageToIR("co", "inst", [{ candidate: badCandidate, compilerInput: testCompilerInput({ candidateRef: "trace-me-1" }) }], { caller: alwaysThrows });
    expect(summary.results[0]!.discoveryId).toBe("trace-me-1");
    expect(summary.results[0]!.result.errorDetail).not.toBeNull();
  });

  it("47/no secret leakage: a bearer token or API-key-shaped substring in a thrown error message is redacted before storage, and an overlong message is bounded", async () => {
    const caller = throwingCaller(() => {
      throw new Error("request failed with Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz0123456789 - please retry");
    });
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.errorDetail!.sanitizedMessage).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(result.errorDetail!.sanitizedMessage).toContain("[REDACTED]");

    const overlong = throwingCaller(() => {
      throw new Error("x".repeat(10000));
    });
    const overlongResult = await compileCovenantToIR(testCompilerInput({ candidateRef: "overlong" }), { caller: overlong, cache: new InMemorySemanticCompilationCache() });
    expect(overlongResult.errorDetail!.sanitizedMessage.length).toBeLessThan(600);
    expect(overlongResult.errorDetail!.sanitizedMessage).toContain("[truncated]");
  });

  it("classification helpers are pure and directly testable (used identically by compile.ts and package-compile.ts's own defense-in-depth catch)", () => {
    expect(classifyFailureCategory("Error", "ETIMEDOUT while connecting")).toBe("TRANSPORT");
    expect(classifyFailureCategory("Error", "invalid JSON in response")).toBe("SCHEMA");
    expect(classifyFailureCategory("Error", "rate limited by provider")).toBe("MODEL");
    expect(classifyFailureCategory("Error", "totally unrelated message")).toBe("INTERNAL");
    expect(sanitizeErrorMessage("api_key: sk-live-1234567890abcdef and more text")).toContain("[REDACTED]");
  });

  it("a thrown exception is never cached - a transient failure does not permanently poison the cache key for this run", async () => {
    const cache = new InMemorySemanticCompilationCache();
    let attempt = 0;
    const flakyThenSuccess: SemanticCaller = {
      providerName: "fake",
      model: "fake-model",
      isSynthetic: false,
      async compile() {
        attempt++;
        if (attempt === 1) throw new Error("transient network blip");
        return successResult();
      },
    };
    const input = testCompilerInput();
    const first = await compileCovenantToIR(input, { caller: flakyThenSuccess, cache });
    expect(first.status).toBe("FAILED");
    const second = await compileCovenantToIR(input, { caller: flakyThenSuccess, cache });
    expect(attempt).toBe(2); // the failed first attempt was NOT cached, so the retry actually re-invoked the caller
    expect(second.status).not.toBe("FAILED");
  });

  it("hadPartialOutput is true when the exception occurs after a submission was already received (during normalize/validate), false when it occurs before any submission exists", async () => {
    // Before-submission throw (the caller.compile() call itself fails).
    const beforeSubmission = throwingCaller(() => {
      throw new Error("network error before any response");
    });
    const beforeResult = await compileCovenantToIR(testCompilerInput(), { caller: beforeSubmission, cache: new InMemorySemanticCompilationCache() });
    expect(beforeResult.errorDetail!.hadPartialOutput).toBe(false);

    // After-submission throw (a malformed submission that crashes deterministic post-processing).
    const afterSubmission: SemanticCaller = {
      providerName: "fake",
      model: "fake-model",
      isSynthetic: false,
      async compile() {
        // Deliberately malformed shape to trigger an exception inside normalizeSubmission/validateCompilationUnit rather than returning a clean null-submission failure.
        return { submission: { rules: null as unknown as [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
      },
    };
    const afterResult = await compileCovenantToIR(testCompilerInput({ candidateRef: "after" }), { caller: afterSubmission, cache: new InMemorySemanticCompilationCache() });
    expect(afterResult.status).toBe("FAILED");
    expect(afterResult.errorDetail!.hadPartialOutput).toBe(true);
  });
});
