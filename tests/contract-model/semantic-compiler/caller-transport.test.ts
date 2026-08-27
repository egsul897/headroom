/**
 * Phase 3B.1 synthetic test matrix, remediation class A (task §29-31,
 * transport reliability). Exercises RealSemanticCaller against a scripted
 * FAKE Anthropic client (no network), specifically targeting the raised
 * MAX_TOKENS ceiling, the SEMANTIC_COMPILER_MAX_TOKENS env override, and
 * recoverPartialSubmission's safe-contiguous-prefix behavior - engaged only
 * on POSITIVE evidence of truncation (stop_reason === "max_tokens"), never
 * as a generic malformed-response fallback (task §10).
 */
import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller, SemanticCallerResult } from "../../../lib/contract-model/compiler/semantic/caller";
import { WireRuleSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { testCompilerInput } from "./test-helpers";

function fakeMessage(content: Anthropic.ContentBlock[], opts: { stopReason?: Anthropic.StopReason; usage?: Partial<Anthropic.Usage> } = {}): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content,
    model: "claude-sonnet-5",
    role: "assistant",
    stop_reason: opts.stopReason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, ...opts.usage } as Anthropic.Usage,
  } as Anthropic.Message;
}

function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient & { lastMaxTokens: number | null } {
  let i = 0;
  let lastMaxTokens: number | null = null;
  return {
    get lastMaxTokens() {
      return lastMaxTokens;
    },
    messages: {
      stream: (params: { max_tokens: number }) => {
        lastMaxTokens = params.max_tokens;
        return {
          finalMessage: async () => {
            const msg = script[Math.min(i, script.length - 1)]!;
            i++;
            return msg;
          },
        };
      },
    },
  } as MinimalAnthropicClient & { lastMaxTokens: number | null };
}

const validRule = (localRef: string) => ({ localRef, sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 } });
const validDefinition = (localRef: string) => ({ localRef, termName: `Term ${localRef}` });

describe("Phase 3B.1 synthetic tests - transport reliability (remediation class A)", () => {
  const originalEnv = process.env.SEMANTIC_COMPILER_MAX_TOKENS;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SEMANTIC_COMPILER_MAX_TOKENS;
    else process.env.SEMANTIC_COMPILER_MAX_TOKENS = originalEnv;
  });

  it("resolves the default MAX_TOKENS to 128000 (the same already-proven ceiling anthropic-analyzer.ts uses for this model), not the old arbitrary 8192", async () => {
    delete process.env.SEMANTIC_COMPILER_MAX_TOKENS;
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1")] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    await caller.compile(testCompilerInput());
    expect(client.lastMaxTokens).toBe(128000);
  });

  it("respects a SEMANTIC_COMPILER_MAX_TOKENS env override", async () => {
    process.env.SEMANTIC_COMPILER_MAX_TOKENS = "50000";
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1")] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    await caller.compile(testCompilerInput());
    expect(client.lastMaxTokens).toBe(50000);
  });

  it("an invalid env override (non-numeric, zero, negative) falls back to the default rather than crashing or disabling the ceiling", async () => {
    process.env.SEMANTIC_COMPILER_MAX_TOKENS = "not-a-number";
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1")] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    await caller.compile(testCompilerInput());
    expect(client.lastMaxTokens).toBe(128000);
  });

  it("a malformed submit_compilation input WITHOUT stop_reason==='max_tokens' still fails as MODEL_SCHEMA_FAILURE - recovery is never attempted absent positive truncation evidence", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1"), { localRef: "r2" /* missing required sourceSectionRef */ }] })], { stopReason: "tool_use" })]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("MODEL_SCHEMA_FAILURE");
    expect(result.submission).toBeNull();
  });

  it("stop_reason==='max_tokens' with a fully-unrecoverable prefix (first rule itself malformed) reports OUTPUT_TRUNCATED with no submission", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [{ localRef: "r1" /* missing required sourceSectionRef */ }] })], { stopReason: "max_tokens" })]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("OUTPUT_TRUNCATED");
    expect(result.submission).toBeNull();
    expect(result.failureDetail).toMatch(/no valid rule\/definition prefix could be recovered/);
  });

  it("stop_reason==='max_tokens' recovers the longest CONTIGUOUS valid prefix of rules, dropping everything from the first malformed element onward - even a later element that looks valid", async () => {
    const client = scriptedClient([
      fakeMessage(
        [
          toolUseBlock("t1", "submit_compilation", {
            rules: [validRule("r1"), validRule("r2"), { localRef: "r3" /* malformed: missing sourceSectionRef */ }, validRule("r4")],
          }),
        ],
        { stopReason: "max_tokens" }
      ),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("OUTPUT_TRUNCATED");
    expect(result.submission?.rules).toHaveLength(2);
    expect(result.submission?.rules.map((r) => r.localRef)).toEqual(["r1", "r2"]);
    expect(result.failureDetail).toMatch(/recovered 2 rule\(s\)/);
    expect(result.failureDetail).toMatch(/dropped 2 rule\(s\)/);
  });

  it("stop_reason==='max_tokens' recovers a valid definitions prefix independently of rules", async () => {
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1")], definitions: [validDefinition("d1"), { localRef: "d2" /* missing required termName */ }] })], { stopReason: "max_tokens" }),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("OUTPUT_TRUNCATED");
    expect(result.submission?.rules).toHaveLength(1);
    expect(result.submission?.definitions).toHaveLength(1);
    expect(result.submission?.definitions[0]?.localRef).toBe("d1");
  });

  it("a truncated recovery drops sharedCapacities/irExtensionCandidates entirely rather than guessing at them, even when the schema-invalid element is elsewhere (in rules)", async () => {
    const client = scriptedClient([
      fakeMessage(
        [
          toolUseBlock("t1", "submit_compilation", {
            rules: [validRule("r1"), { localRef: "r2" /* malformed: missing sourceSectionRef, forces overall schema failure */ }],
            sharedCapacities: [{ localRef: "sc1", capExpression: { kind: "MONEY", amount: 1 }, memberRefs: ["r1"] }],
            irExtensionCandidates: [{ sourceEvidence: "x" }],
          }),
        ],
        { stopReason: "max_tokens" }
      ),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("OUTPUT_TRUNCATED");
    expect(result.submission?.rules).toHaveLength(1);
    expect(result.submission?.sharedCapacities).toHaveLength(0);
    expect(result.submission?.irExtensionCandidates).toHaveLength(0);
  });

  it("compile.ts: OUTPUT_TRUNCATED with a recovered non-empty rule prefix produces PARTIAL status, and the failure reason survives into the final result (never silently dropped)", async () => {
    const truncatedRecoverySuccess: SemanticCallerResult = {
      submission: { rules: [WireRuleSchema.parse(validRule("r1"))], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: ["recovered 1 rule(s)"] },
      rawSubmission: {},
      toolCallLog: [],
      telemetry: null,
      failureReason: "OUTPUT_TRUNCATED",
      failureDetail: "response was truncated at the output-token ceiling; recovered 1 rule(s)",
    };
    const caller: SemanticCaller = { providerName: "fake", model: "fake-model", isSynthetic: false, async compile() { return truncatedRecoverySuccess; } };
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("PARTIAL");
    expect(result.failureReasons).toContain("OUTPUT_TRUNCATED");
    expect(result.unresolvedIssues.some((i) => i.includes("truncated at the output-token ceiling"))).toBe(true);
    expect(result.rules).toHaveLength(1);
  });

  it("compile.ts: OUTPUT_TRUNCATED with NO recoverable content (null submission) produces FAILED status", async () => {
    const truncatedTotalFailure: SemanticCallerResult = { submission: null, rawSubmission: {}, toolCallLog: [], telemetry: null, failureReason: "OUTPUT_TRUNCATED", failureDetail: "no valid rule/definition prefix could be recovered" };
    const caller: SemanticCaller = { providerName: "fake", model: "fake-model", isSynthetic: false, async compile() { return truncatedTotalFailure; } };
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.status).toBe("FAILED");
    expect(result.failureReasons).toEqual(["OUTPUT_TRUNCATED"]);
  });
});
