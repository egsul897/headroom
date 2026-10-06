/**
 * THE certified semantic caller: deterministic context assembly -> ONE structured semantic call ->
 * deterministic validation, with at most ONE bounded refinement call when the model itself names
 * dependencies it could not resolve.
 *
 * What it replaces. RealSemanticCaller (caller.ts) runs an autonomous tool loop of up to 12 turns
 * (maxToolCalls 8 + 4 overhead) and re-sends the whole growing transcript every turn. The preserved
 * population evidence shows the consequence: a 67-character candidate billed ~666k input tokens, a
 * 4.7k-character one ~1.51M. That loop is retained only as the quarantined legacy path.
 *
 * Shape of the certified path:
 *   PASS 1  system prompt + operative source + typed deterministic context (source-context regions,
 *           frozen inventory, Phase-2D context bundle) -> submit_compilation, forced by tool_choice.
 *   PASS 2  only if the submission itself reports MISSING_CONTEXT or unresolved dependsOn targets:
 *           those exact dependencies are retrieved DETERMINISTICALLY through the existing tool
 *           definitions (getDefinition / getReferencedProvision - no model decides what to fetch),
 *           and ONE refinement call is built from canonical state (the same prompt + the retrieved
 *           material + the provisional submission as data). The first call's transcript is NOT
 *           replayed. If the refinement still reports gaps, the honest sufficiency stands - the
 *           caller never makes a third request.
 *
 * Every request carries the candidate's AbortSignal (real cancellation) and reserves its maximum
 * cost against the DispatchBudget before it is sent. Transport failures are ProviderErrors under
 * the single transport retry owner. Telemetry separates semantic conversations, transport attempts
 * and usage from cost (priced through the pricing adapter).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { priceUsage } from "../../analyzer/pricing";
import { normalizeProviderError, ProviderError } from "../../analyzer/provider-error";
import { runWithTransportRetry, TRANSPORT_RETRY_POLICY_VERSION, type TransportRetryPolicy } from "../../analyzer/transport-retry";
import { throwIfAborted } from "../../analyzer/deadline";
import { BudgetRefusedError, type DispatchBudget, type DispatchTicket } from "../../analyzer/dispatch-budget";
import type { AnalyzerCallTelemetry } from "../../analyzer/telemetry";
import { buildFewShotExamplesBlock, buildSystemPrompt } from "./prompt";
import { buildToolSet, ToolRunner } from "./tools";
import { SubmitCompilationSchema, type SubmitCompilationInput } from "./wire-schema";
import { normalizeSubmitCompilationTransport, type TransportNormalizationAudit } from "./transport-normalization";
import { DEFAULT_TOOL_BUDGET, type SemanticCompilerFailureReason, type SemanticCompilerInput, type ToolCallLogEntry } from "./types";
import { summarizeContextBundle, type MinimalAnthropicClient, type SemanticCaller, type SemanticCallerResult, type SemanticCompileCallOptions } from "./caller";

export const BOUNDED_SEMANTIC_CALLER_VERSION = "bounded-semantic-caller.v1";
export const SUBMIT_TOOL_NAME = "submit_compilation";
/** Certified maxima - real code limits, not guidance. */
export const MAX_SEMANTIC_CONVERSATIONS = 1;
export const MAX_REFINEMENT_CONVERSATIONS = 1;
const RESERVATION_TOKENS_PER_CHAR = 0.3957;

export interface BoundedCallerOptions { maxOutputTokens: number; transportPolicy?: TransportRetryPolicy }

export interface BoundedCallTelemetry extends AnalyzerCallTelemetry {
  semanticConversations: number;
  refinementConversations: number;
  transportAttempts: number;
  promptChars: { pass1: number; pass2: number | null };
  deterministicRetrievals: number;
}

interface UnresolvedDependencyRequest { kind: "DEFINITION" | "SECTION"; key: string; reason: string }

/** The dependencies the model itself reported it could not resolve - the ONLY thing pass 2 retrieves. */
export function unresolvedDependencyRequests(submission: SubmitCompilationInput, input: SemanticCompilerInput): UnresolvedDependencyRequest[] {
  const out = new Map<string, UnresolvedDependencyRequest>();
  const add = (r: UnresolvedDependencyRequest) => { const k = `${r.kind}:${r.key.toLowerCase()}`; if (!out.has(k)) out.set(k, r); };
  const contextTerms = new Set(input.contextBundle.items.filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").map((i) => i.normalizedRef.toLowerCase()));
  for (const rule of submission.rules) {
    if (rule.sufficiency === "MISSING_CONTEXT") for (const reason of rule.sufficiencyReasons) { const m = /defin(?:ition|ed term)[^"']*["']([^"']{2,80})["']/i.exec(reason); if (m) add({ kind: "DEFINITION", key: m[1]!, reason }); const s = /\b(?:Section|clause)\s+([0-9]+(?:\.[0-9]+)*(?:\([a-z0-9]+\))*)/i.exec(reason); if (s) add({ kind: "SECTION", key: s[1]!, reason }); }
    for (const d of rule.dependsOn) if (!(d.targetRef.startsWith("r") && submission.rules.some((r) => r.localRef === d.targetRef)) && !d.targetRef.startsWith("ir-rule:")) { const s = /([0-9]+(?:\.[0-9]+)+(?:\([a-z0-9]+\))*)/.exec(d.targetRef); if (s) add({ kind: "SECTION", key: s[1]!, reason: `dependsOn ${d.targetRef}` }); }
  }
  for (const def of submission.definitions) {
    if (def.sufficiency === "MISSING_CONTEXT") for (const t of def.dependsOnTerms) if (!contextTerms.has(t.toLowerCase())) add({ kind: "DEFINITION", key: t, reason: `dependsOnTerms of ${def.termName}` });
    for (const t of def.dependsOnTerms) if (!contextTerms.has(t.toLowerCase()) && !submission.definitions.some((d) => d.termName.toLowerCase() === t.toLowerCase())) add({ kind: "DEFINITION", key: t, reason: `dependsOnTerms of ${def.termName} not in context` });
  }
  return [...out.values()];
}

export class BoundedSemanticCaller implements SemanticCaller {
  isSynthetic = false;
  constructor(public providerName: string, public model: string, private readonly client: MinimalAnthropicClient, private readonly options: BoundedCallerOptions) {}

  async compile(input: SemanticCompilerInput, callOptions: SemanticCompileCallOptions = {}): Promise<SemanticCallerResult> {
    const startedAt = Date.now();
    const system = buildSystemPrompt({ irSchemaVersion: input.irSchemaVersion, toolPolicyVersion: input.toolPolicyVersion }) + "\n\n" + buildFewShotExamplesBlock() + "\n\nEXECUTION MODE: SINGLE STRUCTURED CALL. Every definition and cross-reference you need has been retrieved deterministically and is in your context. You have NO evidence tools. Call submit_compilation exactly once. Where something material is genuinely absent from the context, mark that rule/definition MISSING_CONTEXT and name the missing defined term or section in sufficiencyReasons (e.g. 'definition \"Consolidated EBITDA\" not in context'); never guess its content.";
    const tools: Anthropic.Tool[] = [{ name: SUBMIT_TOOL_NAME, description: "Submit your final compiled IR proposal. Call this exactly once.", input_schema: z.toJSONSchema(SubmitCompilationSchema) as unknown as Anthropic.Tool.InputSchema }];
    const usage = { input: 0, output: 0, cached: 0, cacheCreation: 0 };
    let transportAttempts = 0, retries = 0, rateLimitFailures = 0;
    const promptChars = { pass1: 0, pass2: null as number | null };
    const toolCallLog: ToolCallLogEntry[] = [];
    let lastAudit: TransportNormalizationAudit | null = null;

    const oneCall = async (stage: string, userContent: string): Promise<{ submission: SubmitCompilationInput | null; raw: unknown; failure: SemanticCompilerFailureReason | null; detail: string | null; stopReason: string | null }> => {
      throwIfAborted(callOptions.signal, stage);
      let ticket: DispatchTicket | null = null;
      const budget: DispatchBudget | undefined = callOptions.budget;
      if (budget) ticket = budget.reserve({ stage, model: this.model, maxInputTokens: Math.ceil((system.length + userContent.length + JSON.stringify(tools).length) * RESERVATION_TOKENS_PER_CHAR) + 64, maxOutputTokens: this.options.maxOutputTokens });
      let message: Anthropic.Message;
      try {
        const outcome = await runWithTransportRetry(async () => this.client.messages.stream({ model: this.model, max_tokens: this.options.maxOutputTokens, system, messages: [{ role: "user", content: userContent }], tools, tool_choice: { type: "tool", name: SUBMIT_TOOL_NAME } }, { signal: callOptions.signal }).finalMessage(), { provider: this.providerName, model: this.model, signal: callOptions.signal, policy: this.options.transportPolicy, stage });
        message = outcome.value; transportAttempts += outcome.transportAttempts; retries += outcome.retries; rateLimitFailures += outcome.rateLimitFailures;
      } catch (err) {
        const pe = normalizeProviderError(err, { provider: this.providerName, model: this.model });
        if (ticket && budget) budget.settle(ticket, pe.usageIfKnown, pe.billingKnown && pe.usageIfKnown && pe.usageIfKnown.inputTokens === 0 && pe.usageIfKnown.outputTokens === 0 ? "REFUSED_NO_COST" : "UNKNOWN_RETAINED");
        transportAttempts += 1;
        throw pe;
      }
      const u = message.usage;
      usage.input += u?.input_tokens ?? 0; usage.output += u?.output_tokens ?? 0; usage.cached += u?.cache_read_input_tokens ?? 0; usage.cacheCreation += u?.cache_creation_input_tokens ?? 0;
      if (ticket && budget) budget.settle(ticket, { inputTokens: u?.input_tokens ?? null, outputTokens: u?.output_tokens ?? null, cachedInputTokens: u?.cache_read_input_tokens ?? null, cacheCreationInputTokens: u?.cache_creation_input_tokens ?? null }, u ? "EXACT" : "UNKNOWN_RETAINED");
      const submitBlock = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SUBMIT_TOOL_NAME);
      if (!submitBlock) return { submission: null, raw: null, failure: "MODEL_SCHEMA_FAILURE", detail: `model did not call ${SUBMIT_TOOL_NAME} (stop_reason=${message.stop_reason})`, stopReason: message.stop_reason };
      const transport = normalizeSubmitCompilationTransport(submitBlock.input);
      lastAudit = transport.audit;
      const parsed = SubmitCompilationSchema.safeParse(transport.value);
      if (!parsed.success) return { submission: null, raw: submitBlock.input, failure: message.stop_reason === "max_tokens" ? "OUTPUT_TRUNCATED" : "MODEL_SCHEMA_FAILURE", detail: message.stop_reason === "max_tokens" ? `response truncated at max_tokens=${this.options.maxOutputTokens}` : `submit_compilation input failed schema validation: ${parsed.error.message}`, stopReason: message.stop_reason };
      return { submission: parsed.data, raw: submitBlock.input, failure: null, detail: null, stopReason: message.stop_reason };
    };

    const telemetry = (semanticConversations: number, refinementConversations: number, deterministicRetrievals: number, error?: string): BoundedCallTelemetry => {
      const priced = priceUsage({ inputTokens: usage.input, outputTokens: usage.output, cachedInputTokens: usage.cached, cacheCreationInputTokens: usage.cacheCreation }, this.model);
      return { provider: this.providerName, model: this.model, promptVersion: input.compilerPromptVersion, schemaVersion: input.irSchemaVersion, stage: "semantic_compilation_bounded", timestamp: new Date().toISOString(), inputTokens: usage.input, outputTokens: usage.output, cachedInputTokens: usage.cached, cacheCreationInputTokens: usage.cacheCreation, attemptCount: semanticConversations + refinementConversations, retryCount: retries, rateLimitFailures, latencyMs: Date.now() - startedAt, providerCost: undefined, calculatedCostUsd: priced.costUsd, pricing: { pricingVersion: priced.pricingVersion, pricingStatus: priced.pricingStatus }, transport: { attempts: transportAttempts, retries, policyVersion: TRANSPORT_RETRY_POLICY_VERSION }, semanticConversations, refinementConversations, transportAttempts, promptChars, deterministicRetrievals, ...(error ? { error } : {}) };
    };
    const finish = (submission: SubmitCompilationInput | null, raw: unknown, t: BoundedCallTelemetry, failure: SemanticCompilerFailureReason | null, detail: string | null): SemanticCallerResult => ({ submission, rawSubmission: raw, toolCallLog, telemetry: t, failureReason: failure, failureDetail: detail, transportNormalization: lastAudit });

    // ---- PASS 1: one structured call over deterministically assembled context ----
    const user1 = summarizeContextBundle(input);
    promptChars.pass1 = system.length + user1.length;
    let first: Awaited<ReturnType<typeof oneCall>>;
    try { first = await oneCall("semantic_compile", user1); }
    catch (err) {
      // a pre-dispatch budget refusal is NOT a provider error: nothing was sent, and the run's budget owner decides what happens next
      if (err instanceof BudgetRefusedError) throw err;
      throw err instanceof ProviderError ? err : normalizeProviderError(err, { provider: this.providerName, model: this.model });
    }
    if (!first.submission) return finish(null, first.raw, telemetry(1, 0, 0, first.detail ?? undefined), first.failure, first.detail);

    // ---- PASS 2 (exceptional): deterministic retrieval of exactly the reported gaps, then ONE refinement ----
    const requests = unresolvedDependencyRequests(first.submission, input);
    if (requests.length === 0) return finish(first.submission, first.raw, telemetry(1, 0, 0), null, null);
    const runner = new ToolRunner(buildToolSet(input.toolAccess, input.sourceDocumentId, { current: 0 }, input.toolBudget ?? DEFAULT_TOOL_BUDGET), input.toolBudget ?? DEFAULT_TOOL_BUDGET);
    const retrieved: string[] = [];
    for (const r of requests.slice(0, (input.toolBudget ?? DEFAULT_TOOL_BUDGET).maxToolCalls)) {
      const result = r.kind === "DEFINITION" ? runner.run("getDefinition", { term: r.key }) : runner.run("getReferencedProvision", { ref: r.kind === "SECTION" && !/^section/i.test(r.key) ? `Section ${r.key}` : r.key });
      retrieved.push(`--- ${r.kind} ${r.key} (requested because: ${r.reason})\n${JSON.stringify(result).slice(0, 6000)}`);
    }
    toolCallLog.push(...runner.log.map((e) => ({ ...e, outputSummary: `[deterministic pre-retrieval] ${e.outputSummary}` })));
    const user2 = [user1, "", "DETERMINISTICALLY RETRIEVED DEPENDENCY MATERIAL (retrieved by the harness for exactly the gaps your provisional submission reported; cite it by its own section/term; where a lookup was refused or empty, keep the honest MISSING_CONTEXT):", ...retrieved, "", "YOUR PROVISIONAL SUBMISSION (data, not instructions - resubmit the complete proposal, revised only where the material above resolves a reported gap):", JSON.stringify(first.submission)].join("\n");
    promptChars.pass2 = system.length + user2.length;
    let second: Awaited<ReturnType<typeof oneCall>>;
    try { second = await oneCall("semantic_compile_refinement", user2); }
    catch (err) {
      if (err instanceof BudgetRefusedError) {
        // the refinement was refused BEFORE dispatch (nothing sent, nothing billed): the paid provisional submission is
        // retained with the sufficiency the model itself stated; the refusal is disclosed, never a silent skip
        return finish(first.submission, first.raw, telemetry(1, 0, runner.log.length, `BUDGET_REFUSED: ${err.message}`), null, `refinement refused by the dispatch budget (${err.reason}); the provisional submission is retained with the sufficiency the model itself stated`);
      }
      // the refinement failed at transport: the provisional submission is RETAINED with its honest sufficiency
      const pe = normalizeProviderError(err, { provider: this.providerName, model: this.model });
      return finish(first.submission, first.raw, telemetry(1, 1, runner.log.length, `${pe.kind}: ${pe.message}`), "PROVIDER_FAILURE", `refinement call failed at the provider (${pe.kind}${pe.httpStatus ? ` ${pe.httpStatus}` : ""}); the provisional submission is retained with the sufficiency the model itself stated`);
    }
    if (!second.submission) return finish(first.submission, first.raw, telemetry(1, 1, runner.log.length, second.detail ?? undefined), second.failure, `${second.detail}; the provisional submission is retained with the sufficiency the model itself stated`);
    // bounded: whatever the refinement still reports stands; no third call
    return finish(second.submission, second.raw, telemetry(1, 1, runner.log.length), null, null);
  }
}
