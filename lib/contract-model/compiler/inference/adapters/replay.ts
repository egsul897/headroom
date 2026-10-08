import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contentAddress } from "../hash";
import type { InferenceAdapter, InferenceRequest, InferenceResponse } from "../types";
import { INFERENCE_CONTRACT_VERSION, InferenceResponseSchema } from "../types";

export interface ReplayStoreOptions {
  /** Directory of recorded InferenceResponse JSON files keyed by context+prompt+schema hash. */
  directory: string;
}

function replayKey(request: InferenceRequest): string {
  if (request.recordedOutputKey) return request.recordedOutputKey;
  return contentAddress({
    contextHash: request.contextHash,
    promptHash: request.promptHash,
    schemaHash: request.schemaHash,
    purpose: request.purpose,
    outputSchemaName: request.outputSchemaName,
  });
}

export class OfflineReplayAdapter implements InferenceAdapter {
  readonly name = "offline-replay";
  readonly mode = "OFFLINE_REPLAY" as const;
  private readonly directory: string;

  constructor(options: ReplayStoreOptions) {
    this.directory = options.directory;
  }

  supports(policy: InferenceRequest["policy"]): boolean {
    return policy.mode === "OFFLINE_REPLAY";
  }

  pathFor(key: string): string {
    return join(this.directory, `${key}.json`);
  }

  record(response: InferenceResponse, key?: string): string {
    mkdirSync(this.directory, { recursive: true });
    const k = key ?? contentAddress({
      contextHash: response.contextHash,
      promptHash: response.promptHash,
      schemaHash: response.schemaHash,
    });
    const path = this.pathFor(k);
    writeFileSync(path, JSON.stringify(response, null, 2), "utf8");
    return k;
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const key = replayKey(request);
    const path = this.pathFor(key);
    if (!existsSync(path)) {
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "NOT_FOUND",
        model: request.model ?? { provider: "replay", model: "missing", modelVersion: null, endpoint: null },
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output: null,
        rawText: null,
        latencyMs: Date.now() - started,
        cost: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costStatus: "ZERO", pricingNote: "replay miss" },
        error: `No recorded output for key ${key} at ${path}`,
        recordedAt: new Date().toISOString(),
      };
    }
    const parsed = InferenceResponseSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) {
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "SCHEMA_INVALID",
        model: request.model ?? { provider: "replay", model: "corrupt", modelVersion: null, endpoint: null },
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output: null,
        rawText: null,
        latencyMs: Date.now() - started,
        cost: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costStatus: "ZERO", pricingNote: "replay corrupt" },
        error: `Recorded output failed schema: ${parsed.error.message}`,
        recordedAt: new Date().toISOString(),
      };
    }
    return {
      ...parsed.data,
      requestId: request.requestId,
      policy: request.policy,
      latencyMs: Date.now() - started,
      recordedAt: new Date().toISOString(),
    };
  }
}

/** Ensure parent dir exists when constructing a store under a temp path. */
export function ensureReplayDir(directory: string): string {
  mkdirSync(directory, { recursive: true });
  return dirname(join(directory, ".keep"));
}
