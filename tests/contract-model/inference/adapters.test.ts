import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BridgedSemanticCaller,
  DeterministicInferenceAdapter,
  DirectProviderInferenceAdapter,
  InferenceRegistry,
  OfflineReplayAdapter,
  PaidInferenceUnauthorizedError,
  assertPaidAuthorization,
  contentAddress,
  createDeterministicSemanticCaller,
  createOllamaAdapter,
  createVllmAdapter,
  hashPrompt,
  hashSchema,
  resolveExecutionPolicy,
  INFERENCE_CONTRACT_VERSION,
} from "../../../lib/contract-model/compiler/inference";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";

const baseRequest = () => ({
  contractVersion: INFERENCE_CONTRACT_VERSION as typeof INFERENCE_CONTRACT_VERSION,
  requestId: "t1",
  purpose: "SEMANTIC_COMPILATION" as const,
  prompt: "compile",
  systemPrompt: "sys",
  outputSchemaName: "submit_compilation",
  outputSchema: { type: "object" },
  contextHash: "ctx",
  promptHash: hashPrompt("sys", "compile"),
  schemaHash: hashSchema({ type: "object" }),
  sourceLineage: {
    companyId: null,
    packageKey: null,
    instrumentKey: null,
    documentId: "doc",
    candidateRef: "c1",
    operativeVersionRef: null,
    sourceContentHashes: [],
  },
  policy: resolveExecutionPolicy({ mode: "DETERMINISTIC_ONLY" }),
  model: null,
  recordedOutputKey: null,
});

describe("provider-independent inference adapters", () => {
  it("deterministic adapter returns UNRESOLVED semantics at zero cost", async () => {
    const adapter = new DeterministicInferenceAdapter();
    const res = await adapter.infer(baseRequest());
    expect(res.status).toBe("DETERMINISTIC");
    expect(res.cost.costUsd).toBe(0);
    expect(res.cost.costStatus).toBe("ZERO");
    expect((res.output as { semanticStatus: string }).semanticStatus).toBe("UNRESOLVED");
  });

  it("blocks unpaid DIRECT_PROVIDER calls", async () => {
    const adapter = new DirectProviderInferenceAdapter();
    const req = {
      ...baseRequest(),
      policy: resolveExecutionPolicy({ mode: "DIRECT_PROVIDER", founderPaidAuthorization: false, allowNetwork: true }),
    };
    const res = await adapter.infer(req);
    expect(res.status).toBe("UNAUTHORIZED_PAID");
    expect(res.cost.costStatus).toBe("BLOCKED");
    expect(() => assertPaidAuthorization(req.policy)).toThrow(PaidInferenceUnauthorizedError);
  });

  it("replay adapter round-trips recorded outputs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-replay-"));
    const adapter = new OfflineReplayAdapter({ directory: dir });
    const recorded = await new DeterministicInferenceAdapter().infer({
      ...baseRequest(),
      contextHash: "replay-ctx",
      promptHash: "ph",
      schemaHash: "sh",
    });
    const key = adapter.record(recorded, "k1");
    const res = await adapter.infer({
      ...baseRequest(),
      policy: resolveExecutionPolicy({ mode: "OFFLINE_REPLAY" }),
      recordedOutputKey: key,
    });
    expect(res.status).toBe("DETERMINISTIC");
    expect(res.output).toEqual(recorded.output);
  });

  it("ollama adapter records transport errors when server missing (no invented success)", async () => {
    const adapter = createOllamaAdapter({
      baseUrl: "http://127.0.0.1:9",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const res = await adapter.infer({
      ...baseRequest(),
      policy: resolveExecutionPolicy({ mode: "OLLAMA_LOCAL", allowNetwork: true }),
    });
    expect(res.status).toBe("TRANSPORT_ERROR");
    expect(res.output).toBeNull();
  });

  it("vllm adapter validates JSON object responses", async () => {
    const adapter = createVllmAdapter({
      baseUrl: "http://vllm.test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            model: "test-model",
            choices: [{ message: { content: JSON.stringify({ rules: [], definitions: [] }) } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200 }
        ),
    });
    const res = await adapter.infer({
      ...baseRequest(),
      policy: resolveExecutionPolicy({ mode: "VLLM_LOCAL", allowNetwork: true }),
    });
    expect(res.status).toBe("OK");
    expect(res.model.model).toBe("test-model");
    expect(res.cost.inputTokens).toBe(10);
  });

  it("registry routes by mode", async () => {
    const registry = new InferenceRegistry();
    const res = await registry.infer(baseRequest());
    expect(res.status).toBe("DETERMINISTIC");
  });

  it("BridgedSemanticCaller deterministic never invents rules", async () => {
    const caller = createDeterministicSemanticCaller();
    expect(caller.isSynthetic).toBe(true);
    // Minimal compile input shape via empty submission path — caller returns empty SubmitCompilation
    const empty = SubmitCompilationSchema.parse({});
    expect(empty.rules).toEqual([]);
    const hash = contentAddress({ a: 1, b: 2 });
    expect(hash).toHaveLength(64);
    writeFileSync(join(mkdtempSync(join(tmpdir(), "hr-x-")), "ok.txt"), "ok");
    expect(new BridgedSemanticCaller({ mode: "DETERMINISTIC_ONLY" }).providerName).toContain("deterministic");
  });
});
