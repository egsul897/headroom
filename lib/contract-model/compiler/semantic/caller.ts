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
import { SubmitCompilationSchema, WireDefinitionSchema, WireRuleSchema, type SubmitCompilationInput } from "./wire-schema";
import { DEFAULT_TOOL_BUDGET, type SemanticCompilerFailureReason, type SemanticCompilerInput, type ToolCallLogEntry } from "./types";
import { validateToolUseProtocol } from "./tool-protocol";

/** Env var override for the semantic compiler's own model choice - additive, defaults to the same Sonnet 5 this codebase already uses everywhere else for cost-disciplined real LLM calls (task §51's own "do not change provider/model opportunistically"). */
const MODEL_ENV_VAR = "SEMANTIC_COMPILER_MODEL";
/** One bounded turn ceiling beyond the tool-call budget itself, guarding against a model that never calls submit_compilation even after every evidence tool is exhausted (a real, distinct failure mode from TOOL_BUDGET_EXHAUSTED). */
const MAX_TURN_OVERHEAD = 4;
/**
 * Phase 3B.1 root-cause statement (task §5, written before this fix): Phase
 * 3B's original value here was 8192 - an arbitrary, never-calibrated
 * ceiling, NOT the provider's real limit. Both real Phase 3B output-
 * truncation failures were confirmed via exact telemetry to be genuine
 * provider-side cutoffs at that too-low ceiling (fwrg-6.10-a's final turn
 * used EXACTLY 8192 output tokens; lsb-6.01's rules[] array was cut off
 * mid-element at index 17 of an 18-rule emission, needing ~23,251 output
 * tokens aggregate) - not a reasoning/semantic failure: in both cases the
 * emitted content up to the cutoff was architecturally correct. Failure
 * shape is therefore "ceiling set too low for legitimate output size,"
 * not "unbounded/runaway generation" - which determines the fix below.
 *
 * Alternatives considered and rejected (task §6 options B/C/D, task §43
 * item 11):
 *  - Full decomposition/continuation (splitting one compilation into
 *    multiple chained model calls that each emit a bounded slice of
 *    rules): rejected as disproportionate to the measured failure scale.
 *    lsb-6.01's own worst case needed ~23K output tokens; a single call
 *    already comfortably fits that under a 128K ceiling, so a multi-call
 *    continuation protocol would add real complexity (turn-boundary state,
 *    partial-IR stitching, doubled tool-loop bookkeeping) to solve a
 *    problem the simpler fix below already resolves at the scale observed.
 *  - An arbitrary larger fixed constant chosen without a precedent (e.g.
 *    guessing 32768 or 65536): rejected because task §5 explicitly
 *    prohibits "simply increasing the token ceiling without understanding
 *    failure shape" - any value not grounded in evidence would just move
 *    the same risk to a new, still-uncalibrated number.
 *  - Chosen fix: this codebase's own already-proven
 *    lib/contract-model/analyzer/anthropic-analyzer.ts uses
 *    `max_tokens: 128000` (DEFAULT_MAX_TOKENS) for the exact same model via
 *    the exact same streaming transport, in real production use. Adopting
 *    that same, already-tested ceiling here - rather than an arbitrary
 *    larger guess or a new continuation architecture - is the minimal,
 *    evidence-based fix task §5 requires, and is paired with
 *    recoverPartialSubmission() below as defense-in-depth: even if some
 *    future compilation legitimately needs more than 128K output tokens,
 *    a confirmed truncation degrades to a safe, validated partial result
 *    (PARTIAL status) rather than a hard MODEL_SCHEMA_FAILURE that throws
 *    away an otherwise-correct prefix.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 128000;
const MAX_TOKENS_ENV_VAR = "SEMANTIC_COMPILER_MAX_TOKENS";

const SUBMIT_TOOL_NAME = "submit_compilation";

/**
 * Phase 3 Chewy remediation F-1 - the retrieval nudge is delivered as the
 * tool_result of the PROVISIONAL submit_compilation call it answers, never
 * as a free-standing user text turn: the provider requires every tool_use
 * that is followed by another turn to receive its tool_result first
 * (tool-protocol.ts). The wording is the 3B.1 policy text unchanged; only
 * the transport envelope changed.
 */
const RETRIEVAL_NUDGE_TEXT =
  "NOT YET ACCEPTED - provisional submission evaluated. You marked at least one rule or definition UNSUPPORTED or MISSING_CONTEXT, but you have not made a single tool call yet and you still have tool budget remaining. Per the RETRIEVAL BEFORE GIVING UP policy, first attempt whichever of your available tools could plausibly resolve the specific gap (a cross-reference, an undefined term, a schedule, a versioning question, or other bundle evidence) before finalizing. If, after trying, the gap genuinely cannot be resolved (not found, refused, or no tool applies), resubmit with the same honest sufficiency - that is a correct outcome too.";

/**
 * F-1 invariant holder: builds the ONE user content block that must follow an
 * assistant turn containing tool_use blocks - exactly one tool_result per
 * tool_use, in order, before anything else. Every branch of the loop that
 * continues the conversation after a tool_use goes through here, so the
 * protocol cannot be violated by construction, whatever the tool is called.
 */
function toolResultsForAssistantTurn(toolUseBlocks: Anthropic.ToolUseBlock[], resolve: (block: Anthropic.ToolUseBlock) => string): Anthropic.ToolResultBlockParam[] {
  return toolUseBlocks.map((block) => ({ type: "tool_result", tool_use_id: block.id, content: resolve(block) }));
}

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

/**
 * Phase 3F.1 FIX-2 (§3 of the governing fix spec) - every item's own real
 * evidenceStatus/reason (context-retrieval/state.ts's own
 * resolveSectionEvidenceState/resolveDefinitionEvidenceState, computed at
 * BUNDLE-CONSTRUCTION time, before this prompt is ever assembled) is now
 * rendered explicitly alongside its excerpt, rather than the excerpt being
 * dumped verbatim with no trust signal at all. This is a COURTESY to the
 * model - it lets a well-behaved model correctly self-report an honest
 * sufficiency without spending a tool call - but it is explicitly NOT the
 * safety mechanism itself: compile.ts's own inputHasUnresolvedOperativeEvidence
 * gate (derived from the SAME evidenceState, independent of anything the
 * model reads or writes here) is what actually prevents a false COMPLETED/
 * VERIFIED result, so a model that ignores this text entirely is still
 * caught downstream.
 */
function formatContextItem(i: SemanticCompilerInput["contextBundle"]["items"][number]): string {
  const trust = i.evidenceState ? `evidenceStatus: ${i.evidenceState.status}${i.evidenceState.isCurrentTruth ? "" : " [NOT CONFIRMED CURRENT]"}, reason: ${i.evidenceState.reason}` : "evidenceStatus: N/A (not independently-interpretable provision/economic text)";
  return `- [${i.itemId}] (${i.type}, ${i.sourceCitation}) {${trust}}: ${i.excerptText}`;
}

/**
 * SEMANTIC ACCOUNTABILITY (mission §7/§8): renders the FROZEN Pass A
 * inventory and the source-context expansion regions into the first user
 * turn. The inventory is read-only evidence of what the source contains;
 * Pass B must consume every MATERIAL/CRITICAL item into lineage
 * (inventoryItemIds on the node/rule/definition/condition/exception/shared
 * capacity that represents it) or disposition it explicitly - Pass C
 * (compile.ts) checks this deterministically afterwards, so this text is
 * guidance, never the enforcement mechanism.
 */
function summarizeAccountability(input: SemanticCompilerInput): string {
  const parts: string[] = [];
  const sc = input.sourceContext;
  if (sc) {
    const expansions = sc.regions.filter((r) => r.kind !== "OPERATIVE");
    parts.push(`SOURCE CONTEXT STATE: ${sc.state}${sc.reasons.length > 0 ? ` (${sc.reasons.join("; ")})` : ""}. ${sc.state === "TRUNCATED_SOURCE" || sc.state === "STRUCTURALLY_INCOMPLETE_SOURCE" ? "The operative text you were given is KNOWN to be incomplete against its own unit boundary - your sufficiency for anything that could depend on the missing text must be PARTIAL/MISSING_CONTEXT, never COMPLETE." : ""}`);
    if (expansions.length > 0) {
      parts.push("ADDITIONAL SOURCE REGIONS (explicitly cross-referenced by the operative text; retrieved deterministically with provenance - use them to resolve what the operative text's references mean, cite them by their own section ref, and never treat them as the provision you are compiling):");
      for (const r of expansions) parts.push(`--- REGION ${r.regionId}: ${r.documentId}::${r.sectionRef ?? "(no ref)"} chars ${r.charStart}-${r.charEnd}${r.truncatedAtBudget ? " [TRUNCATED AT BUDGET]" : ""} (included because the operative text references "${r.expandedFor?.referenceText}" [${r.expandedFor?.resolution}]: ${r.expandedFor?.note}) ---\n${r.text}`);
    }
    if (sc.unresolvedReferences.length > 0) parts.push(`CROSS-REFERENCES THAT COULD NOT BE RESOLVED TO A REGION (record each as a dependsOn with the exact reference text, or as MISSING_CONTEXT; never guess their content):\n${sc.unresolvedReferences.map((u) => `- "${u.referenceText}" -> ${u.status}: ${u.reason}`).join("\n")}`);
  }
  const inv = input.frozenInventory;
  if (inv) {
    if (inv.items.length > 0) {
      parts.push(`FROZEN SEMANTIC INVENTORY (Pass A, ${inv.items.length} item(s), content hash ${inv.frozenContentHash.slice(0, 16)}). ACCOUNTABILITY OBLIGATION: every item marked CRITICAL or MATERIAL below MUST end up either (a) CONSUMED - list its inventoryItemId in the inventoryItemIds array of the rule, definition, sharedCapacity, condition, exception, or expression node that represents it (a node may consume several items; a definition's calculationExpression consumes its FORMULA_COMPONENT items on the operand nodes themselves), or (b) DISPOSITIONED - listed in inventoryDispositions with INTENTIONALLY_NON_COMPUTATIONAL (real but not a computable mechanic - e.g. a purely descriptive statement), UNSUPPORTED (you could not represent it faithfully; prefer an UNSUPPORTED node that consumes it), or AMBIGUOUS (the source supports more than one reading; say why). A material item you neither consume nor disposition is reported as MISSING_FROM_COMPOSITION by a deterministic check - never silently omit one, and never list an item's id on a node that does not actually carry that item's value or meaning.`);
      for (const it of inv.items) {
        const values = it.quantitativeValues.length > 0 ? ` values={${it.quantitativeValues.map((v) => `${v.kind} ${v.rawText}`).join("; ")}}` : "";
        const refs = [...it.referencedTerms.map((t) => `term:${t}`), ...it.referencedSections.map((s) => `ref:${s}`)];
        parts.push(`- ${it.inventoryItemId} [${it.semanticRole}/${it.materiality}${it.ambiguity !== "NONE" ? `/${it.ambiguity}` : ""}] ${it.proposition}${values}${refs.length > 0 ? ` {${refs.join(", ")}}` : ""} (${it.sourceSpan.sourceCitation}: "${it.sourceSpan.excerpt.slice(0, 160).replace(/\s+/g, " ")}")`);
      }
    } else {
      parts.push(`FROZEN SEMANTIC INVENTORY: ${inv.inventoryStatus} - ${inv.inventoryStatusReason}`);
    }
    if (inv.uninventoriedValues.length > 0) parts.push(`QUANTITATIVE VALUES DETECTED DETERMINISTICALLY THAT NO INVENTORY ITEM COVERS (account for each that participates in a material proposition; a value that is genuinely non-operative may be left un-consumed): ${inv.uninventoriedValues.map((v) => `${v.kind} ${v.rawText} [${v.regionId}]`).join("; ")}`);
  }
  return parts.join("\n\n");
}

function summarizeContextBundle(input: SemanticCompilerInput): string {
  const items = input.contextBundle.items.map(formatContextItem).join("\n");
  const unresolved = input.contextBundle.unresolvedDependencies.map((u) => `- ${u.dependencyType} (${u.severity}): ${u.reason}`).join("\n");
  const accountability = summarizeAccountability(input);
  return [
    `Operative source text (${input.sourceSectionRef ?? "no section ref"}):`,
    input.operativeSourceText,
    "",
    ...(accountability ? [accountability, ""] : []),
    input.operativeLineage
      ? `Operative-state status: ${input.operativeLineage.operativeStatus} (as of ${input.operativeLineage.asOfDate}). If this is not OPERATIVE_STATE_RESOLVED, your sufficiency must honestly reflect the uncertainty - never treat unresolved/conflicted operative text as authoritative COMPLETE.`
      : "This provision has no recorded amendment history (never amended).",
    "",
    `Already-gathered context (Phase 2's own bounded retrieval - read this BEFORE requesting tools). Each item's own {evidenceStatus, reason} tells you whether ITS excerpt is confirmed current operative text - an item marked anything other than CURRENT (e.g. OPERATIVE_STATE_UNRESOLVED, AMBIGUOUS_TARGET, KNOWN_SUPERSEDED, PARTIAL_AMENDMENT, HISTORICAL_ONLY) must NOT be treated as authoritative current truth even though its excerpt is shown for context - your sufficiency must honestly reflect that uncertainty regardless of how confident the excerpt's own wording reads:\n${items || "(none)"}`,
    unresolved ? `\nAlready-known unresolved dependencies:\n${unresolved}` : "",
  ].join("\n");
}

function resolveMaxTokens(): number {
  const override = process.env[MAX_TOKENS_ENV_VAR];
  const parsed = override ? Number(override) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Phase 3B.1 (task §10) - partial-output recovery, engaged ONLY when the
 * caller already has POSITIVE evidence of transport truncation
 * (stop_reason === "max_tokens") - never as a generic fallback for an
 * ordinary model mistake, which is exactly the "unsafe ad hoc JSON repair"
 * task §10 forbids. Walks `rules`/`definitions` as plain arrays (the raw,
 * unvalidated tool input - schema validation already failed on the whole
 * object) and keeps the longest CONTIGUOUS PREFIX of elements that each
 * independently validate against WireRuleSchema/WireDefinitionSchema,
 * stopping at the first invalid element (the truncation point) - later
 * elements are never speculatively kept even if one happened to look
 * valid, since a corrupted stream can coincidentally produce a
 * syntactically-valid-looking fragment past the real cut. `sharedCapacities`/
 * `irExtensionCandidates` are dropped on a truncated response rather than
 * guessed at, since they typically depend on member rules that may
 * themselves have been the truncated part.
 */
function recoverPartialSubmission(rawInput: unknown): { recovered: SubmitCompilationInput; rulesRecovered: number; rulesDropped: number; definitionsRecovered: number; definitionsDropped: number } | null {
  if (typeof rawInput !== "object" || rawInput === null) return null;
  const obj = rawInput as Record<string, unknown>;
  const rawRules = Array.isArray(obj.rules) ? obj.rules : [];
  const rawDefinitions = Array.isArray(obj.definitions) ? obj.definitions : [];

  const validRules = [];
  for (const r of rawRules) {
    const parsed = WireRuleSchema.safeParse(r);
    if (!parsed.success) break;
    validRules.push(parsed.data);
  }
  const validDefinitions = [];
  for (const d of rawDefinitions) {
    const parsed = WireDefinitionSchema.safeParse(d);
    if (!parsed.success) break;
    validDefinitions.push(parsed.data);
  }

  if (validRules.length === 0 && validDefinitions.length === 0) return null;

  return {
    recovered: {
      rules: validRules,
      definitions: validDefinitions,
      sharedCapacities: [],
      irExtensionCandidates: [],
      inventoryDispositions: [],
      overallNotes: [`Phase 3B.1 partial-output recovery: response was truncated at the provider's output-token ceiling. Recovered ${validRules.length}/${rawRules.length} rule(s) and ${validDefinitions.length}/${rawDefinitions.length} definition(s) as a validated prefix; anything after the first malformed element was dropped, never guessed. sharedCapacities/irExtensionCandidates were dropped entirely on this truncated response since they may depend on the truncated portion.`],
    },
    rulesRecovered: validRules.length,
    rulesDropped: rawRules.length - validRules.length,
    definitionsRecovered: validDefinitions.length,
    definitionsDropped: rawDefinitions.length - validDefinitions.length,
  };
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
    let retrievalNudgeUsed = false;
    /**
     * F-1: a syntactically valid submission that this caller chose NOT to
     * accept yet (it answered it with the retrieval nudge). If the
     * continuation then fails for a reason that is NOT a semantic
     * re-decision by the model (provider/transport failure, turn ceiling,
     * corrective-reminder exhaustion), the held submission is returned with
     * that failure reason attached - never discarded, never promoted: its
     * own sufficiency values are exactly what the model stated.
     */
    let heldProvisional: { submission: SubmitCompilationInput; raw: unknown } | null = null;
    const retainingHeld = (reason: SemanticCompilerFailureReason, detail: string, telemetry: AnalyzerCallTelemetry): SemanticCallerResult | null =>
      heldProvisional ? this.finish(heldProvisional.submission, heldProvisional.raw, toolRunner.log, telemetry, reason, `${detail} - the provisional submission received before the retrieval nudge is RETAINED with the sufficiency the model itself stated (it was never accepted as complete by this caller; this failure reason marks why the continuation ended)`) : null;

    const maxTurns = budget.maxToolCalls + MAX_TURN_OVERHEAD;
    const maxTokens = resolveMaxTokens();
    for (let turn = 0; turn < maxTurns; turn++) {
      let message: Anthropic.Message;
      try {
        // F-1 defense in depth: the invariant is structural (every continuation goes through
        // toolResultsForAssistantTurn), but an outgoing sequence is still checked before it is sent
        // so a future branch can never reach the provider with an orphaned tool_use. A violation is
        // a caller-side protocol failure, classified with the transport failures below and never
        // allowed to discard a held provisional submission.
        const protocolViolations = validateToolUseProtocol(messages);
        if (protocolViolations.length > 0) throw new Error(`caller tool-protocol violation before send: ${protocolViolations.map((v) => `${v.toolName}:${v.toolUseId} ${v.reason}`).join("; ")}`);
        const { value, attemptCount, retryCount, rateLimitFailures } = await withRetry(async () => {
          const stream = this.client.messages.stream({ model: this.model, max_tokens: maxTokens, system, messages, tools });
          return stream.finalMessage();
        });
        message = value;
        aggAttempts += attemptCount;
        aggRetryCount += retryCount;
        aggRateLimitFailures += rateLimitFailures;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const telemetry = this.buildTelemetry(input.compilerPromptVersion, input.irSchemaVersion, startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures, detail);
        return retainingHeld("PROVIDER_FAILURE", `continuation turn failed at the provider: ${detail}`, telemetry) ?? this.finish(null, null, toolRunner.log, telemetry, "PROVIDER_FAILURE", detail);
      }

      aggInputTokens += message.usage?.input_tokens ?? 0;
      aggOutputTokens += message.usage?.output_tokens ?? 0;
      aggCachedInputTokens += message.usage?.cache_read_input_tokens ?? 0;
      aggCacheCreationInputTokens += message.usage?.cache_creation_input_tokens ?? 0;

      const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const submitBlock = toolUseBlocks.find((b) => b.name === SUBMIT_TOOL_NAME);
      if (submitBlock) {
        const parsed = SubmitCompilationSchema.safeParse(submitBlock.input);
        const telemetry = this.buildTelemetry(input.compilerPromptVersion, input.irSchemaVersion, startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
        if (!parsed.success) {
          // Phase 3B.1 (task §5/§10): only attempt partial-output recovery when the provider's own
          // stop_reason gives POSITIVE evidence of output-token truncation - never as a blanket
          // fallback for an ordinary malformed response, which would be unsafe ad hoc JSON repair.
          if (message.stop_reason === "max_tokens") {
            const recovery = recoverPartialSubmission(submitBlock.input);
            if (recovery) {
              return this.finish(recovery.recovered, submitBlock.input, toolRunner.log, telemetry, "OUTPUT_TRUNCATED", `response was truncated at the output-token ceiling (max_tokens=${maxTokens}); recovered ${recovery.rulesRecovered} rule(s) and ${recovery.definitionsRecovered} definition(s) as a validated prefix, dropped ${recovery.rulesDropped} rule(s) and ${recovery.definitionsDropped} definition(s) after the truncation point`);
            }
            return this.finish(null, submitBlock.input, toolRunner.log, telemetry, "OUTPUT_TRUNCATED", `response was truncated at the output-token ceiling (max_tokens=${maxTokens}) and no valid rule/definition prefix could be recovered`);
          }
          return this.finish(null, submitBlock.input, toolRunner.log, telemetry, "MODEL_SCHEMA_FAILURE", `submit_compilation input failed schema validation: ${parsed.error.message}`);
        }

        // Phase 3B.1 (task §12/§16) - mechanical, generic (never package/section-specific)
        // retrieval-before-give-up enforcement: a submission that declares a rule/definition
        // UNSUPPORTED or MISSING_CONTEXT while having made LITERALLY ZERO tool calls, with tool
        // budget still available, is the clearest, most mechanically detectable case of "gave up
        // without ever trying." This is a bounded, one-time corrective nudge (mirrors the existing
        // plain-text corrective-turn pattern below) - it does not name any specific term, section,
        // or expected answer, and it never fires when the model already attempted retrieval (as in
        // a case where some but not all gaps were investigated), which stays governed by the
        // prompt's own RETRIEVAL BEFORE GIVING UP guidance rather than a mechanical rule that would
        // require guessing which unresolved item a given tool call was "for."
        const hasUnresolvedSufficiency = parsed.data.rules.some((r) => r.sufficiency === "UNSUPPORTED" || r.sufficiency === "MISSING_CONTEXT") || parsed.data.definitions.some((d) => d.sufficiency === "UNSUPPORTED" || d.sufficiency === "MISSING_CONTEXT");
        if (hasUnresolvedSufficiency && toolRunner.log.length === 0 && toolRunner.remainingCalls > 0 && !retrievalNudgeUsed) {
          retrievalNudgeUsed = true;
          heldProvisional = { submission: parsed.data, raw: submitBlock.input };
          messages.push({ role: "assistant", content: message.content });
          // F-1: the nudge is the tool_result of the provisional submit call; any evidence tool the model
          // requested in the same turn is served alongside it, so every tool_use in the turn is answered.
          messages.push({ role: "user", content: toolResultsForAssistantTurn(toolUseBlocks, (block) => (block.name === SUBMIT_TOOL_NAME ? RETRIEVAL_NUDGE_TEXT : JSON.stringify(toolRunner.run(block.name, block.input)))) });
          continue;
        }

        return this.finish(parsed.data, submitBlock.input, toolRunner.log, telemetry, null, null);
      }

      if (toolUseBlocks.length > 0) {
        messages.push({ role: "assistant", content: message.content });
        messages.push({ role: "user", content: toolResultsForAssistantTurn(toolUseBlocks, (block) => JSON.stringify(toolRunner.run(block.name, block.input))) });
        continue;
      }

      // No tool_use at all - the model produced plain text instead of following protocol. Give it exactly one corrective nudge before failing honestly (task §29's own MODEL_SCHEMA_FAILURE).
      if (correctiveTurnsUsed >= 1) {
        const telemetry = this.buildTelemetry(input.compilerPromptVersion, input.irSchemaVersion, startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
        return retainingHeld("MODEL_SCHEMA_FAILURE", "model did not call submit_compilation or any evidence tool after a corrective reminder", telemetry) ?? this.finish(null, null, toolRunner.log, telemetry, "MODEL_SCHEMA_FAILURE", "model did not call submit_compilation or any evidence tool after a corrective reminder");
      }
      correctiveTurnsUsed += 1;
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: "You must call either an evidence tool or submit_compilation - a plain text response cannot be used. Please call submit_compilation now with your best current proposal if you have no further evidence to request." });
    }

    const telemetry = this.buildTelemetry(input.compilerPromptVersion, input.irSchemaVersion, startedAt, aggInputTokens, aggOutputTokens, aggCachedInputTokens, aggCacheCreationInputTokens, aggAttempts, aggRetryCount, aggRateLimitFailures);
    return retainingHeld("TOOL_BUDGET_EXHAUSTED", `model did not call submit_compilation within ${maxTurns} turns (tool budget ${budget.maxToolCalls})`, telemetry) ?? this.finish(null, null, toolRunner.log, telemetry, "TOOL_BUDGET_EXHAUSTED", `model did not call submit_compilation within ${maxTurns} turns (tool budget ${budget.maxToolCalls})`);
  }

  private finish(submission: SubmitCompilationInput | null, rawSubmission: unknown, toolCallLog: ToolCallLogEntry[], telemetry: AnalyzerCallTelemetry, failureReason: SemanticCompilerFailureReason | null, failureDetail: string | null): SemanticCallerResult {
    return { submission, rawSubmission, toolCallLog, telemetry, failureReason, failureDetail };
  }

  private buildTelemetry(
    promptVersion: string,
    schemaVersion: string,
    startedAt: number,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number,
    cacheCreationInputTokens: number,
    attemptCount: number,
    retryCount: number,
    rateLimitFailures: number,
    error?: string
  ): AnalyzerCallTelemetry {
    return {
      provider: this.providerName,
      model: this.model,
      // Phase 3B.1 (task §35): sourced from this specific call's own input rather than a
      // hardcoded literal, so telemetry always reflects the actual prompt/schema version
      // used for THIS compilation (never silently stale after a version bump).
      promptVersion,
      schemaVersion,
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
