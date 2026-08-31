/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - unit coverage
 * for structural-ambiguity-classifier.ts itself (the second, bounded
 * semantic gate for STRUCTURE). Mirrors
 * tests/contract-model/condition-suspicion-classifier.test.ts's own
 * established "scripted-semantic tier" convention: every test below uses a
 * SCRIPTED fake caller to prove the ORCHESTRATION (status normalization,
 * failure handling, caching, tenant isolation) is correct. This sandbox
 * environment has no functioning AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY
 * (confirmed via probe) - the real no-credential path is exercised
 * separately in structural-ambiguity-resolution.test.ts via `getStageCaller()`'s
 * own SyntheticStageCaller, proving the fail-safe behavior this environment
 * can actually exercise honestly, never a claim that a real model reliably
 * classifies any particular candidate correctly.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  classifyStructuralAmbiguity,
  computeStructuralAmbiguityCacheKey,
  InMemoryStructuralAmbiguityCache,
  type StructuralAmbiguityClassifierInput,
} from "../../lib/contract-model/compiler/structural-ambiguity-classifier";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

function scriptedCaller(response: () => unknown, opts: { throws?: boolean; providerName?: string; model?: string } = {}): StageCaller & { callCount: number } {
  let calls = 0;
  return {
    providerName: opts.providerName ?? "test-provider",
    model: opts.model ?? "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      calls++;
      if (opts.throws) throw new Error("simulated transport failure");
      return schema.parse(response());
    },
    lastTelemetry: (): AnalyzerCallTelemetry | null => null,
    get callCount() {
      return calls;
    },
  } as StageCaller & { callCount: number };
}

const IDENTITY = { companyId: "co-1", instrumentKey: "inst-1", sourceDocumentId: "doc-1" };

function input(overrides: Partial<StructuralAmbiguityClassifierInput> = {}): StructuralAmbiguityClassifierInput {
  return {
    candidateType: "SECTION",
    candidateNumber: "6.09",
    candidateText: "Section 6.09 Limitation on Restricted Payments.",
    precedingWindow: "...as otherwise agreed.\n",
    followingWindow: "This citation refers to a limitation described elsewhere.",
    nearestConfidentHeadingBefore: "Section 6.08 Restricted Payments.",
    nearestConfidentHeadingAfter: "Section 6.10 Liens.",
    ...overrides,
  };
}

describe("structural-ambiguity-classifier - basic verdict normalization", () => {
  it("a scripted LIKELY_HEADING response round-trips cleanly", async () => {
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_HEADING", reason: "opens a new topic", relatedSourceSpans: ["Financial Covenants"] }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("LIKELY_HEADING");
    expect(result.failed).toBe(false);
    expect(result.isSynthetic).toBe(false);
    expect(result.fromCache).toBe(false);
  });

  it("a scripted LIKELY_PROSE_REFERENCE response round-trips cleanly", async () => {
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_PROSE_REFERENCE", reason: "grammatical object of a citing clause", relatedSourceSpans: [] }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("LIKELY_PROSE_REFERENCE");
  });

  it("an UNCERTAIN response round-trips cleanly", async () => {
    const caller = scriptedCaller(() => ({ verdict: "UNCERTAIN", reason: "plausible either way", relatedSourceSpans: [] }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("UNCERTAIN");
    expect(result.failed).toBe(false);
  });

  it("an out-of-vocabulary verdict string falls back to the conservative UNCERTAIN, never a silent LIKELY_HEADING", async () => {
    const caller = scriptedCaller(() => ({ verdict: "TOTALLY_MADE_UP_VERDICT", reason: "", relatedSourceSpans: [] }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("UNCERTAIN");
  });

  it("a lower/mixed-case verdict string is tolerantly normalized (upper-snake-case matching)", async () => {
    const caller = scriptedCaller(() => ({ verdict: "likely prose reference", reason: "", relatedSourceSpans: [] }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("LIKELY_PROSE_REFERENCE");
  });

  it("a missing reason/relatedSourceSpans defaults cleanly rather than crashing", async () => {
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_HEADING" }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("LIKELY_HEADING");
    expect(result.relatedSourceSpans).toEqual([]);
  });
});

describe("structural-ambiguity-classifier - failure handling (network error/timeout/malformed output simulation)", () => {
  it("a thrown transport error is caught and converted to UNCERTAIN + failed:true, never propagated as an uncaught exception", async () => {
    const caller = scriptedCaller(() => ({}), { throws: true });
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("UNCERTAIN");
    expect(result.failed).toBe(true);
    expect(result.failureDetail).toContain("simulated transport failure");
  });

  it("a malformed/schema-violating response (missing required verdict) is caught the same way", async () => {
    const caller = scriptedCaller(() => ({ reason: "no verdict field at all" }));
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(result.verdict).toBe("UNCERTAIN");
    expect(result.failed).toBe(true);
  });

  it("the no-credential SyntheticStageCaller shape (schema.parse({}) with no zod default on verdict) fails validation and is never mistaken for a real LIKELY_HEADING", async () => {
    const syntheticLikeCaller: StageCaller = {
      providerName: "synthetic",
      model: "synthetic-v1",
      isSynthetic: true,
      async call<T>(schema: ZodType<T>): Promise<T> {
        return schema.parse({});
      },
      lastTelemetry: () => null,
    };
    const result = await classifyStructuralAmbiguity(input(), IDENTITY, syntheticLikeCaller, new InMemoryStructuralAmbiguityCache());
    expect(result.failed).toBe(true);
    expect(result.isSynthetic).toBe(true);
    expect(result.verdict).toBe("UNCERTAIN");
  });

  it("a failed classification is NEVER cached - a retried call for the identical candidate gets a fresh real attempt, not a stuck failure", async () => {
    const cache = new InMemoryStructuralAmbiguityCache();
    let attempt = 0;
    const caller: StageCaller = {
      providerName: "test-provider",
      model: "test-model",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>): Promise<T> {
        attempt++;
        if (attempt === 1) throw new Error("transient");
        return schema.parse({ verdict: "LIKELY_HEADING", reason: "ok", relatedSourceSpans: [] });
      },
      lastTelemetry: () => null,
    };
    const first = await classifyStructuralAmbiguity(input(), IDENTITY, caller, cache);
    expect(first.failed).toBe(true);
    const second = await classifyStructuralAmbiguity(input(), IDENTITY, caller, cache);
    expect(second.failed).toBe(false);
    expect(second.verdict).toBe("LIKELY_HEADING");
    expect(attempt).toBe(2);
  });
});

describe("structural-ambiguity-classifier - caching behavior", () => {
  it("the same candidate + identity + version does NOT re-call the model a second time", async () => {
    const cache = new InMemoryStructuralAmbiguityCache();
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_HEADING", reason: "", relatedSourceSpans: [] }));
    const first = await classifyStructuralAmbiguity(input(), IDENTITY, caller, cache);
    const second = await classifyStructuralAmbiguity(input(), IDENTITY, caller, cache);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(caller.callCount).toBe(1);
  });

  it("a different candidate span (even one character of preceding/following window) is a cache miss", async () => {
    const cache = new InMemoryStructuralAmbiguityCache();
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_HEADING", reason: "", relatedSourceSpans: [] }));
    await classifyStructuralAmbiguity(input({ followingWindow: "A" }), IDENTITY, caller, cache);
    await classifyStructuralAmbiguity(input({ followingWindow: "B" }), IDENTITY, caller, cache);
    expect(caller.callCount).toBe(2);
  });

  it("computeStructuralAmbiguityCacheKey is a pure, deterministic function of its inputs", () => {
    const k1 = computeStructuralAmbiguityCacheKey(IDENTITY, input(), "anthropic::claude-x");
    const k2 = computeStructuralAmbiguityCacheKey(IDENTITY, input(), "anthropic::claude-x");
    expect(k1).toBe(k2);
  });

  it("a different provider/model identity produces a different cache key even for an identical candidate+tenant", () => {
    const k1 = computeStructuralAmbiguityCacheKey(IDENTITY, input(), "anthropic::claude-x");
    const k2 = computeStructuralAmbiguityCacheKey(IDENTITY, input(), "anthropic::claude-y");
    expect(k1).not.toBe(k2);
  });
});

describe("structural-ambiguity-classifier - tenant isolation (zero cross-tenant leakage)", () => {
  it("two different companyIds with byte-identical candidate text and instrument/document identity never share a cache entry", async () => {
    const cache = new InMemoryStructuralAmbiguityCache();
    const callerA = scriptedCaller(() => ({ verdict: "LIKELY_HEADING", reason: "", relatedSourceSpans: [] }));
    const callerB = scriptedCaller(() => ({ verdict: "LIKELY_PROSE_REFERENCE", reason: "", relatedSourceSpans: [] }));

    const resultA = await classifyStructuralAmbiguity(input(), { companyId: "tenant-A", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }, callerA, cache);
    const resultB = await classifyStructuralAmbiguity(input(), { companyId: "tenant-B", instrumentKey: "inst-1", sourceDocumentId: "doc-1" }, callerB, cache);

    expect(resultA.fromCache).toBe(false);
    expect(resultB.fromCache).toBe(false);
    expect(resultA.verdict).toBe("LIKELY_HEADING");
    expect(resultB.verdict).toBe("LIKELY_PROSE_REFERENCE");
    expect(callerA.callCount).toBe(1);
    expect(callerB.callCount).toBe(1);
  });

  it("a different instrumentKey for the SAME companyId also misses the cache", async () => {
    const cache = new InMemoryStructuralAmbiguityCache();
    const caller = scriptedCaller(() => ({ verdict: "LIKELY_HEADING", reason: "", relatedSourceSpans: [] }));
    await classifyStructuralAmbiguity(input(), { companyId: "co-1", instrumentKey: "inst-A", sourceDocumentId: "doc-1" }, caller, cache);
    await classifyStructuralAmbiguity(input(), { companyId: "co-1", instrumentKey: "inst-B", sourceDocumentId: "doc-1" }, caller, cache);
    expect(caller.callCount).toBe(2);
  });
});

describe("structural-ambiguity-classifier - source-only independence (runtime confirmation)", () => {
  it("the classifier's own call receives ONLY source-text windows and the candidate's own regex-captured number/label - never a parser accept/reject decision, an expected answer, or any IR-shaped content", async () => {
    const capturedUserContent: string[] = [];
    const caller: StageCaller = {
      providerName: "test-provider",
      model: "test-model",
      isSynthetic: false,
      async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, userContent: string): Promise<T> {
        capturedUserContent.push(userContent);
        return schema.parse({ verdict: "LIKELY_HEADING", reason: "", relatedSourceSpans: [] });
      },
      lastTelemetry: () => null,
    };
    await classifyStructuralAmbiguity(input(), IDENTITY, caller, new InMemoryStructuralAmbiguityCache());
    expect(capturedUserContent).toHaveLength(1);
    expect(capturedUserContent[0]).toContain("Section 6.09 Limitation on Restricted Payments.");
    expect(capturedUserContent[0]).not.toContain("CONFIDENT_HEADING");
    expect(capturedUserContent[0]).not.toContain("CONFIDENT_PROSE_REFERENCE");
    expect(capturedUserContent[0]).not.toContain("nodeId");
    expect(capturedUserContent[0]).not.toContain("benchmark");
    // The few-shot block's own "expectedAnswerShape" field illustrates
    // REASONING POSTURE on synthetic fact patterns (mirrors condition-
    // suspicion-classifier.ts's own established few-shot discipline) - it is
    // never this candidate's own real answer, so its presence is expected
    // and is not a leak of "what the parser/benchmark expects for THIS case".
  });
});
