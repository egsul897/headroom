/**
 * Provider-independent inference contracts for covenant compilation.
 *
 * This layer sits BESIDE the existing Anthropic/Vercel RealSemanticCaller
 * (lib/contract-model/compiler/semantic/caller.ts). It does not replace that
 * caller; local / deterministic / replay adapters implement the same validated
 * I/O contracts so compileCovenantToIR and the local experimentation path can
 * run without Vercel AI Gateway.
 *
 * Paid providers require explicit founder authorization (see policy.ts).
 */
import { z } from "zod";

export const INFERENCE_CONTRACT_VERSION = "covenant-inference-contract.v1" as const;

/** How a call is allowed to execute. Paid paths are never the default. */
export type InferenceExecutionMode =
  | "DETERMINISTIC_ONLY"
  | "OLLAMA_LOCAL"
  | "VLLM_LOCAL"
  | "DIRECT_PROVIDER"
  | "OFFLINE_REPLAY";

export type CostStatus = "EXACT" | "ESTIMATED" | "ZERO" | "UNKNOWN" | "BLOCKED";

export const InferenceExecutionPolicySchema = z.object({
  mode: z.enum(["DETERMINISTIC_ONLY", "OLLAMA_LOCAL", "VLLM_LOCAL", "DIRECT_PROVIDER", "OFFLINE_REPLAY"]),
  /** Must be true for DIRECT_PROVIDER paid calls. Local/replay/deterministic never need this. */
  founderPaidAuthorization: z.boolean().default(false),
  authorizationRef: z.string().nullable().default(null),
  allowNetwork: z.boolean().default(false),
  maxTokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0),
});
export type InferenceExecutionPolicy = z.infer<typeof InferenceExecutionPolicySchema>;

export const ModelIdentitySchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().nullable().default(null),
  endpoint: z.string().nullable().default(null),
});
export type ModelIdentity = z.infer<typeof ModelIdentitySchema>;

export const InferenceCostRecordSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  costStatus: z.enum(["EXACT", "ESTIMATED", "ZERO", "UNKNOWN", "BLOCKED"]),
  pricingNote: z.string().nullable().default(null),
});
export type InferenceCostRecord = z.infer<typeof InferenceCostRecordSchema>;

export const SourceLineageSchema = z.object({
  companyId: z.string().nullable().default(null),
  packageKey: z.string().nullable().default(null),
  instrumentKey: z.string().nullable().default(null),
  documentId: z.string().nullable().default(null),
  candidateRef: z.string().nullable().default(null),
  operativeVersionRef: z.string().nullable().default(null),
  sourceContentHashes: z.array(z.string()).default([]),
});
export type SourceLineage = z.infer<typeof SourceLineageSchema>;

export const InferenceRequestSchema = z.object({
  contractVersion: z.literal(INFERENCE_CONTRACT_VERSION).default(INFERENCE_CONTRACT_VERSION),
  requestId: z.string().min(1),
  purpose: z.enum([
    "DETERMINISTIC_EXTRACTION",
    "SEMANTIC_COMPILATION",
    "MODEL_COMPARISON",
    "SELECTIVE_PLAN_AUDIT",
    "REPLAY",
  ]),
  prompt: z.string(),
  systemPrompt: z.string().nullable().default(null),
  /** JSON Schema object the adapter must validate outputs against when structured. */
  outputSchemaName: z.string().min(1),
  outputSchema: z.record(z.string(), z.unknown()),
  contextHash: z.string().min(1),
  promptHash: z.string().min(1),
  schemaHash: z.string().min(1),
  sourceLineage: SourceLineageSchema,
  policy: InferenceExecutionPolicySchema,
  model: ModelIdentitySchema.nullable().default(null),
  recordedOutputKey: z.string().nullable().default(null),
});
export type InferenceRequest = z.infer<typeof InferenceRequestSchema>;

export const InferenceResponseSchema = z.object({
  contractVersion: z.literal(INFERENCE_CONTRACT_VERSION),
  requestId: z.string(),
  status: z.enum(["OK", "SCHEMA_INVALID", "UNSUPPORTED_MODE", "UNAUTHORIZED_PAID", "NOT_FOUND", "TRANSPORT_ERROR", "DETERMINISTIC"]),
  model: ModelIdentitySchema,
  policy: InferenceExecutionPolicySchema,
  contextHash: z.string(),
  promptHash: z.string(),
  schemaHash: z.string(),
  sourceLineage: SourceLineageSchema,
  /** Parsed structured output when status is OK or DETERMINISTIC; otherwise null. */
  output: z.unknown().nullable(),
  rawText: z.string().nullable(),
  latencyMs: z.number().nonnegative(),
  cost: InferenceCostRecordSchema,
  error: z.string().nullable().default(null),
  recordedAt: z.string(),
});
export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;

export interface InferenceAdapter {
  readonly name: string;
  readonly mode: InferenceExecutionMode;
  supports(policy: InferenceExecutionPolicy): boolean;
  infer(request: InferenceRequest): Promise<InferenceResponse>;
}

export class PaidInferenceUnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED_PAID" as const;
  constructor(message = "Paid direct-provider inference requires explicit founder authorization (founderPaidAuthorization=true and authorizationRef).") {
    super(message);
    this.name = "PaidInferenceUnauthorizedError";
  }
}

export class InferenceModeUnsupportedError extends Error {
  readonly code = "UNSUPPORTED_MODE" as const;
  constructor(mode: string, detail?: string) {
    super(detail ?? `Inference mode ${mode} is not supported by this adapter.`);
    this.name = "InferenceModeUnsupportedError";
  }
}
