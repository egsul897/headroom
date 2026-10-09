/**
 * Bridges InferenceAdapter → SemanticCaller so compileCovenantToIR can run
 * without Vercel AI Gateway. Local/replay callers use single-shot structured
 * output (no Anthropic tool loop). Deterministic mode never invents rules.
 *
 * This does NOT replace RealSemanticCaller; inject via compileCovenantToIR(..., { caller }).
 */
import { z } from "zod";
import { SubmitCompilationSchema, type SubmitCompilationInput } from "../semantic/wire-schema";
import type { SemanticCaller, SemanticCallerResult, SemanticCompileCallOptions } from "../semantic/caller";
import type { SemanticCompilerInput } from "../semantic/types";
import { hashCompilationContext, hashPrompt, hashSchema } from "./hash";
import { InferenceRegistry } from "./registry";
import { resolveExecutionPolicy } from "./policy";
import type { InferenceAdapter, InferenceExecutionMode, InferenceExecutionPolicy, SourceLineage } from "./types";
import { INFERENCE_CONTRACT_VERSION } from "./types";

const LocalCompileOutputSchema = SubmitCompilationSchema;

function lineageFromInput(input: SemanticCompilerInput): SourceLineage {
  return {
    companyId: input.companyId ?? null,
    packageKey: null,
    instrumentKey: input.instrumentKey ?? null,
    documentId: input.sourceDocumentId ?? null,
    candidateRef: input.candidateRef ?? null,
    operativeVersionRef: null,
    sourceContentHashes: [],
  };
}

function buildPrompt(input: SemanticCompilerInput): { system: string; user: string } {
  const system = [
    "You are a covenant semantic compiler. Propose structured IR only from the supplied source text.",
    "Never invent permission from a numerical threshold alone.",
    "Never invent operative authority from structural recognition alone.",
    "Unknown or ambiguous semantics must remain unresolved (sufficiency UNSUPPORTED or MISSING_CONTEXT).",
    "Every material claim needs an exact source citation and excerpt.",
    "Return JSON matching the submit_compilation schema: { rules, definitions, sharedCapacities, inventoryDispositions }.",
  ].join(" ");
  const user = [
    `Candidate: ${input.candidateRef}`,
    `Document: ${input.sourceDocumentId}`,
    "",
    "OPERATIVE SOURCE:",
    input.operativeSourceText,
    "",
    "CONTEXT ITEMS:",
    ...(input.contextBundle?.items ?? []).slice(0, 40).map((i) => `- [${i.itemId}] (${i.type}) ${i.sourceCitation}: ${i.excerptText}`),
  ].join("\n");
  return { system, user };
}

export interface BridgedSemanticCallerOptions {
  mode: InferenceExecutionMode;
  registry?: InferenceRegistry;
  adapter?: InferenceAdapter;
  policy?: Partial<InferenceExecutionPolicy>;
  model?: string;
  providerName?: string;
}

/**
 * SemanticCaller backed by the provider-independent inference layer.
 * Suitable for DETERMINISTIC_ONLY, OLLAMA_LOCAL, VLLM_LOCAL, OFFLINE_REPLAY,
 * and authorized DIRECT_PROVIDER experimentation — not a substitute for the
 * certified Anthropic tool-loop caller on certification gates.
 */
export class BridgedSemanticCaller implements SemanticCaller {
  readonly providerName: string;
  readonly model: string;
  readonly isSynthetic: boolean;
  private readonly mode: InferenceExecutionMode;
  private readonly registry: InferenceRegistry;
  private readonly adapter: InferenceAdapter | null;
  private readonly policy: InferenceExecutionPolicy;

  constructor(options: BridgedSemanticCallerOptions) {
    this.mode = options.mode;
    this.registry = options.registry ?? new InferenceRegistry();
    this.adapter = options.adapter ?? null;
    this.policy = resolveExecutionPolicy({ mode: options.mode, ...options.policy });
    this.providerName = options.providerName ?? `inference:${options.mode.toLowerCase()}`;
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? process.env.VLLM_MODEL ?? "local";
    this.isSynthetic = options.mode === "DETERMINISTIC_ONLY";
  }

  async compile(input: SemanticCompilerInput, _options?: SemanticCompileCallOptions): Promise<SemanticCallerResult> {
    const { system, user } = buildPrompt(input);
    const schemaJson = z.toJSONSchema(LocalCompileOutputSchema) as Record<string, unknown>;
    const contextHash = hashCompilationContext({
      operativeSourceText: input.operativeSourceText,
      dependencyRefs: (input.contextBundle?.items ?? []).map((i) => i.itemId),
      compilerVersion: input.compilerAlgorithmVersion ?? "bridged",
      promptVersion: input.compilerPromptVersion ?? "bridged",
      schemaVersion: input.irSchemaVersion ?? "bridged",
      governingScopeHash: input.governingScope?.contentHash ?? null,
    });
    const request = {
      contractVersion: INFERENCE_CONTRACT_VERSION as typeof INFERENCE_CONTRACT_VERSION,
      requestId: `bridge:${input.candidateRef}:${contextHash.slice(0, 12)}`,
      purpose: "SEMANTIC_COMPILATION" as const,
      prompt: user,
      systemPrompt: system,
      outputSchemaName: "submit_compilation",
      outputSchema: schemaJson,
      contextHash,
      promptHash: hashPrompt(system, user),
      schemaHash: hashSchema(schemaJson),
      sourceLineage: lineageFromInput(input),
      policy: this.policy,
      model: { provider: this.providerName, model: this.model, modelVersion: null, endpoint: null },
      recordedOutputKey: null,
    };

    const response = this.adapter ? await this.adapter.infer(request) : await this.registry.infer(request);

    if (response.status === "DETERMINISTIC") {
      const empty = SubmitCompilationSchema.parse({});
      return { submission: empty, rawSubmission: response.output, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
    }

    if (response.status !== "OK" || response.output == null) {
      return {
        submission: null,
        rawSubmission: response.rawText,
        toolCallLog: [],
        telemetry: null,
        failureReason: response.status === "NOT_FOUND" ? "MODEL_SCHEMA_FAILURE" : "MODEL_SCHEMA_FAILURE",
        failureDetail: response.error ?? `inference status ${response.status}`,
      };
    }

    const parsed = SubmitCompilationSchema.safeParse(response.output);
    if (!parsed.success) {
      return {
        submission: null,
        rawSubmission: response.output,
        toolCallLog: [],
        telemetry: null,
        failureReason: "MODEL_SCHEMA_FAILURE",
        failureDetail: parsed.error.message,
      };
    }
    return {
      submission: parsed.data,
      rawSubmission: response.output,
      toolCallLog: [],
      telemetry: {
        provider: response.model.provider,
        model: response.model.model,
        promptVersion: input.compilerPromptVersion ?? "bridged",
        schemaVersion: input.irSchemaVersion ?? "bridged",
        stage: "semantic_compilation_bridged",
        timestamp: response.recordedAt,
        inputTokens: response.cost.inputTokens,
        outputTokens: response.cost.outputTokens,
        cachedInputTokens: null,
        cacheCreationInputTokens: null,
        attemptCount: 1,
        retryCount: 0,
        rateLimitFailures: 0,
        latencyMs: response.latencyMs,
        providerCost: undefined,
        calculatedCostUsd: response.cost.costUsd,
      },
      failureReason: null,
      failureDetail: null,
    };
  }
}

/** Convenience: deterministic SemanticCaller (zero cost, no invented semantics). */
export function createDeterministicSemanticCaller(): BridgedSemanticCaller {
  return new BridgedSemanticCaller({ mode: "DETERMINISTIC_ONLY", model: "none", providerName: "inference:deterministic" });
}

export type { SubmitCompilationInput };
