/**
 * Phase 3B - the bounded tool-use model caller (task §6/§9). This is
 * genuinely new capability - lib/contract-model/compiler/llm-caller.ts's
 * own StageCaller.call() is a one-shot forced-schema call with no `tools`
 * parameter at all (confirmed by reading it: it calls
 * `messages.stream({ output_config: { format: zodOutputFormat(schema) } })`,
 * no tool-loop of any kind exists anywhere in this codebase today) - task
 * §2's "do not build parallel model orchestration if existing
 * infrastructure already solves it" does not apply here because nothing
 * existing solves it. What IS reused, verbatim: the exact provider-
 * selection env-var convention (AI_GATEWAY_API_KEY -> Gateway,
 * ANTHROPIC_API_KEY -> direct, throw on Vercel with neither, synthetic
 * fallback off Vercel), the exact retry/telemetry/cost-calculation
 * primitives (lib/contract-model/analyzer/telemetry.ts, unmodified), and
 * the exact model/base-URL constants (lib/contract-model/analyzer/
 * anthropic-analyzer.ts's own exported DEFAULT_ANALYZER_MODEL/
 * DEFAULT_GATEWAY_ANALYZER_MODEL/AI_GATEWAY_BASE_URL) - a new file rather
 * than a modification to that existing, already-relied-upon class
 * hierarchy, so this addition carries zero risk to any current production
 * call path.
 *
 * The `submit_compilation` tool is the loop's ONLY terminal action - the
 * model must call it exactly once to finish; every other tool is a bounded
 * evidence request that keeps the loop going (task §6/§7).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_GATEWAY_BASE_URL, DEFAULT_ANALYZER_MODEL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../../analyzer/anthropic-analyzer";
import { calculateCostUsd, withRetry, type AnalyzerCallTelemetry } from "../../analyzer/telemetry";
import { MissingCompilerCredentialError } from "../llm-caller";
import { buildFewShotExamplesBlock, buildSystemPrompt } from "./prompt";
import { buildToolSet, ToolRunner } from "./tools";
import { SubmitCompilationSchema, type SubmitCompilationInput } from "./wire-schema";
import { DEFAULT_TOOL_BUDGET, type SemanticCompilerFailureReason, type SemanticCompilerInput, type ToolCallLogEntry } from "./types";

/** Env var override for the semantic compiler's own model choice - additive, defaults to the same Sonnet 5 this codebase already uses everywhere else for cost-disciplined real LLM calls (task §51's own "do not change provider/model opportunistically"). */
const MODEL_ENV_VAR = "SEMANTIC_COMPILER_MODEL";
/** One bounded turn ceiling beyond the tool-call budget itself, guarding against a model that never calls submit_compilation even after every evidence tool is exhausted (a real, distinct failure mode from TOOL_BUDGET_EXHAUSTED). */
const MAX_TURN_OVERHEAD = 4;
const MAX_TOKENS = 8192;

const SUBMIT_TOOL_NAME = "submit_compilation";

/**
 * The minimal shape RealSemanticCaller actually calls on its client - a
 * real `Anthropic` instance satisfies this structurally (its own
 * `messages.stream(...)` returns a MessageStream object with a superset of
 * `finalMessage()`), so production code is unaffected; tests inject a
 * plain scripted object here instead of a real SDK client, to unit-test
 * the loop's OWN orchestration (submit detection, corrective nudge, turn
 * ceiling) without any network dependency.
 */
export interface MinimalAnthropicClient {
  messages: {
    stream: (params: { model: string; max_tokens: number; system: string; messages: Anthropic.MessageParam[]; tools: Anthropic.Tool[] }) => { finalMessage: () => Promise<Anthropic.Message> };
  };
}

export interface SemanticCallerResult {
  submission: SubmitCompilationInput | null;
  rawSubmission: unknown;
  toolCallLog: ToolCallLogEntry[];
  telemetry: AnalyzerCallTelemetry | null;
  failureReason: SemanticCompilerFailureReason | null;
  failureDetail: string | null;
}

export interface SemanticCaller {
  providerName: string;
  model: string;
  isSynthetic: boolean;
  compile(input: SemanticCompilerInput): Promise<SemanticCallerResult>;
}

function submitToolInputSchema(): Record<string, unknown> {
  return z.toJSONSchema(SubmitCompilationSchema) as Record<string, unknown>;
}

function summarizeContextBundle(input: SemanticCompilerInput): string {
  const items = input.contextBundle.items.map((i) => `- [${i.itemId}] (${i.type}, ${i.sourceCitation}): ${i.excerptText}`).join("\n");
  const unresolved = input.contextBundle.unresolvedDependencies.map((u) => `- ${u.dependencyType} (${u.severity}): ${u.reason}`).join("\n");
  return [
    `Operative source text (${input.sourceSectionRef ?? "no section ref"}):`,
    input.operativeSourceText,
    "",
    input.operativeLineage
      ? `Operative-state status: ${input.operativeLineage.operativeStatus} (as of ${input.operativeLineage.asOfDate}). If this is not OPERATIVE_STATE_RESOLVED, your sufficiency must honestly reflect the uncertainty - never treat unresolved/conflicted operative text as authoritative COMPLETE.`
      : "This provision has no recorded amendment history (never amended).",
    "",
    `Already-gathered context (Phase 2's own bounded retrieval - read this BEFORE requesting tools):\n${items || "(none)"}`,
    unresolved ? `\nAlready-known unresolved dependencies:\n${unresolved}` : "",
  ].join("\n");
}

/** Exported for direct unit testing of the tool-use loop's own orchestration (submit detection, corrective nudge, turn ceiling) against a scripted fake Anthropic client - never used in production code, which always goes through getSemanticCaller()'s real env-var-driven selection. */
export class RealSemanticCaller implements SemanticCaller {
  isSynthetic = false;

  constructor(
    public providerName: string,
    public model: string,
    private readonly client: MinimalAnthropicClient
  ) {}

  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    const budget = input.toolBudget ?? DEFAULT_TOOL_BUDGET;
    const charsUsedRef = { current: 0 };
    const toolDefinitions = buildToolSet(input.toolAccess, input.sourceDocumentId, charsUsedRef, budget);
    const toolRunner = new ToolRunner(toolDefinitions, budget);

    const tools: Anthropic.Tool[] = [
      ...toolDefinitions.map((d) => ({ name: d.name, description: d.description, input_schema: d.inputSchema as unknown as Anthropic.Tool.InputSchema })),
      { name: SUBMIT_TOOL_NAME, description: "Submit your final compiled IR proposal. Call this exactly once, when you are done.", input_schema: submitToolInputSchema() as unknown as Anthropic.Tool.InputSchema },
    ];

    const system = buildSystemPrompt({ irSchemaVersion: input.irSchemaVersion, toolPolicyVersion: input.toolPolicyVersion }) + "\n\n" + buildFewShotExamplesBlock();
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: summarizeContextBundle(input) }];

    let aggInputTokens = 0;
    let aggOutputTokens = 0;
    let aggCachedInputTokens = 0;
    let aggCacheCreationInputTokens = 0;
    let aggRetryCount = 0;
    let aggRateLimitFailures = 0;
    let aggAttempts = 0;
    const startedAt = Date.now();
    let correctiveTurnsUsed = 0;

    const maxTurns = budget.maxToolCalls + MAX_TURN_OVERHEAD;
    for (let turn = 0; turn < maxTurns; turn++) {
      let message: Anthropic.Message;
      try {
        const { value, attemptCount, retryCount, rateLimitFailures } = await withRetry(async () => {
          const stream = this.client.messages.stream({ model: this.model, max_tokens: MAX_TOKENS, system, messages, tools });
          return stream.finalMessage();
        });
        message = value;
        aggAttempts += attemptCount;
        aggRetryCount += retryCount;
        aggRateLimitFailures += rateLimitFailures;
      } catch (err) {
        return this.finish(null, null, toolRunner.log, this.buildTelemetry(startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures, err instanceof Error ? err.message : String(err)), "PROVIDER_FAILURE", err instanceof Error ? err.message : String(err));
      }

      aggInputTokens += message.usage?.input_tokens ?? 0;
      aggOutputTokens += message.usage?.output_tokens ?? 0;
      aggCachedInputTokens += message.usage?.cache_read_input_tokens ?? 0;
      aggCacheCreationInputTokens += message.usage?.cache_creation_input_tokens ?? 0;

      const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const submitBlock = toolUseBlocks.find((b) => b.name === SUBMIT_TOOL_NAME);
      if (submitBlock) {
        const parsed = SubmitCompilationSchema.safeParse(submitBlock.input);
        const telemetry = this.buildTelemetry(startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
        if (!parsed.success) {
          return this.finish(null, submitBlock.input, toolRunner.log, telemetry, "MODEL_SCHEMA_FAILURE", `submit_compilation input failed schema validation: ${parsed.error.message}`);
        }
        return this.finish(parsed.data, submitBlock.input, toolRunner.log, telemetry, null, null);
      }

      if (toolUseBlocks.length > 0) {
        messages.push({ role: "assistant", content: message.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(toolRunner.run(block.name, block.input)),
        }));
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // No tool_use at all - the model produced plain text instead of following protocol. Give it exactly one corrective nudge before failing honestly (task §29's own MODEL_SCHEMA_FAILURE).
      if (correctiveTurnsUsed >= 1) {
        const telemetry = this.buildTelemetry(startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
        return this.finish(null, null, toolRunner.log, telemetry, "MODEL_SCHEMA_FAILURE", "model did not call submit_compilation or any evidence tool after a corrective reminder");
      }
      correctiveTurnsUsed += 1;
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: "You must call either an evidence tool or submit_compilation - a plain text response cannot be used. Please call submit_compilation now with your best current proposal if you have no further evidence to request." });
    }

    const telemetry = this.buildTelemetry(startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
    return this.finish(null, null, toolRunner.log, telemetry, "TOOL_BUDGET_EXHAUSTED", `model did not call submit_compilation within ${maxTurns} turns (tool budget ${budget.maxToolCalls})`);
  }

  private finish(submission: SubmitCompilationInput | null, rawSubmission: unknown, toolCallLog: ToolCallLogEntry[], telemetry: AnalyzerCallTelemetry, failureReason: SemanticCompilerFailureReason | null, failureDetail: string | null): SemanticCallerResult {
    return { submission, rawSubmission, toolCallLog, telemetry, failureReason, failureDetail };
  }

  private buildTelemetry(startedAt: number, inputTokens: number, outputTokens: number, cachedInputTokens: number, cacheCreationInputTokens: number, attemptCount: number, retryCount: number, rateLimitFailures: number, error?: string): AnalyzerCallTelemetry {
    return {
      provider: this.providerName,
      model: this.model,
      promptVersion: "phase-3b-semantic-compiler-prompt.v1",
      schemaVersion: "phase-3b-semantic-compiler.v1",
      stage: "semantic_compilation",
      timestamp: new Date().toISOString(),
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheCreationInputTokens,
      attemptCount,
      retryCount,
      rateLimitFailures,
      latencyMs: Date.now() - startedAt,
      providerCost: undefined,
      calculatedCostUsd: calculateCostUsd(inputTokens, outputTokens, this.model),
      error,
    };
  }
}

class SyntheticSemanticCaller implements SemanticCaller {
  providerName = "synthetic";
  model = "synthetic-v1";
  isSynthetic = true;

  async compile(): Promise<SemanticCallerResult> {
    // Matches llm-caller.ts's own SyntheticStageCaller convention exactly: schema defaults (empty arrays), never fabricated content - testable orchestration wiring with zero cost and zero real model dependency.
    return { submission: SubmitCompilationSchema.parse({}), rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

export function getSemanticCaller(): SemanticCaller {
  if (process.env.AI_GATEWAY_API_KEY) {
    const model = process.env[MODEL_ENV_VAR] ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
    return new RealSemanticCaller("vercel-ai-gateway", model, new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env[MODEL_ENV_VAR] ?? DEFAULT_ANALYZER_MODEL;
    return new RealSemanticCaller("anthropic-direct", model, new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  }
  if (process.env.VERCEL) {
    throw new MissingCompilerCredentialError();
  }
  return new SyntheticSemanticCaller();
}
