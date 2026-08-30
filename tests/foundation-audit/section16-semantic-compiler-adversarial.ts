/**
 * Phase 3F.1.6 Section 16 - independent semantic-compiler safety
 * certification. Drives real compileCovenantToIR/RealSemanticCaller/
 * normalize.ts/cache.ts (lib/contract-model/compiler/semantic/**) with
 * scripted fake Anthropic clients (no network, no API key needed - the
 * SAME technique tests/contract-model/semantic-compiler/caller-*.test.ts
 * already uses), never SyntheticStageCaller (which always returns zero
 * rules and cannot exercise malformed/truncated-output classification).
 *
 * Run via: npx tsx tests/foundation-audit/section16-semantic-compiler-adversarial.ts
 */
import { writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { computeCacheKey, InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { enforceSufficiencyConsistency } from "../../lib/contract-model/compiler/semantic/normalize";
import { compileCovenantToIRWithPrecedent } from "../../lib/contract-model/compiler/semantic/precedent-integration";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import type { SubmitCompilationInput } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION, type GeneralizedPrecedent, type SemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { testCompilerInput, emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";

function submission(overrides: Partial<SubmitCompilationInput> = {}): SubmitCompilationInput {
  return { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [], ...overrides };
}

function wireRule(amount: number, localRef = "rule-1") {
  return {
    localRef,
    sourceSectionRef: "6.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    capacityExpression: { kind: "MONEY", amount, currency: "USD" },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    citation: null,
    excerpt: null,
  };
}

class ScriptedCaller implements SemanticCaller {
  providerName = "test-provider";
  model = "test-model";
  isSynthetic = false;
  calls: SemanticCompilerInput[] = [];
  constructor(private readonly responses: SubmitCompilationInput[]) {}
  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    this.calls.push(input);
    const sub = this.responses[this.calls.length - 1] ?? this.responses[this.responses.length - 1]!;
    return { submission: sub, rawSubmission: sub, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

function signature(overrides: Partial<SemanticSignature> = {}): SemanticSignature {
  return {
    action: "INCUR_DEBT",
    posture: "PERMISSION",
    ruleType: "QUANTITATIVE_PERMISSION",
    covenantFamily: "INDEBTEDNESS",
    topLevelOperator: "MONEY",
    operatorSet: ["MONEY"],
    hasRatioGate: false,
    hasScheduledThreshold: false,
    hasEventActiveStepUp: false,
    conditionTypes: [],
    hasExceptions: false,
    entityScopeTags: ["BORROWER"],
    hasSharedCapacity: false,
    hasReclassificationDependency: false,
    dependencyRelationshipTypes: [],
    ...overrides,
  };
}

let precedentCounter = 0;
function precedent(overrides: Partial<GeneralizedPrecedent> = {}): GeneralizedPrecedent {
  precedentCounter++;
  const now = new Date().toISOString();
  return {
    precedentId: `prec-${precedentCounter}`,
    version: 1,
    supersedesPrecedentId: null,
    supersededByPrecedentId: null,
    tenancy: "SYSTEM_REVIEWED",
    ownerCompanyId: null,
    dimensions: ["EXPRESSION_SHAPE"],
    granularity: "EXPRESSION_PATTERN",
    lessonDescription: "test precedent lesson",
    signature: signature(),
    expressionPattern: null,
    structuralLessons: [],
    dependencyLessons: [],
    isNegativePrecedent: false,
    contrastedWithSignature: null,
    reviewStatus: "APPROVED",
    reviewEvents: [],
    support: { supportingInstanceIds: ["inst-1"], distinctSourceDocumentCount: 2, distinctInstrumentCount: 2, distinctCompanyCount: 2, knownCounterexampleInstanceIds: [] },
    origin: "AI_PROPOSED",
    precedentSchemaVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as GeneralizedPrecedent;
}

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

function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient {
  let i = 0;
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => {
          const msg = script[Math.min(i, script.length - 1)]!;
          i++;
          return msg;
        },
      }),
    },
  } as MinimalAnthropicClient;
}

interface CaseResult {
  name: string;
  verdict: "PASS" | "FAIL";
  detail: string;
}
const results: CaseResult[] = [];
function record(name: string, verdict: "PASS" | "FAIL", detail: string) {
  results.push({ name, verdict, detail });
  console.log(`[${verdict}] ${name}: ${detail}`);
}

const validRule = (localRef: string) => ({ localRef, sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 } });

async function main() {
  // --- 1. Malformed AI output (schema violation) is rejected, not silently coerced ---
  {
    // "rules" is a string, not an array - a genuinely malformed tool call, the RealSemanticCaller/
    // SubmitCompilationSchema pair must reject this, never coerce it into an empty/fabricated result.
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: "not-an-array", definitions: [] })]),
      fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: "not-an-array", definitions: [] })]), // corrective-nudge retry also malformed
      fakeMessage([{ type: "text", text: "giving up" } as Anthropic.TextBlock], { stopReason: "end_turn" }),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    const rejected = result.status === "FAILED" && result.rules.length === 0 && result.failureReasons.includes("MODEL_SCHEMA_FAILURE");
    record("malformed-output-rejected", rejected ? "PASS" : "FAIL", `status=${result.status} failureReasons=${JSON.stringify(result.failureReasons)} rules=${result.rules.length} - malformed tool input must produce FAILED/MODEL_SCHEMA_FAILURE with zero fabricated rules, never a silently-coerced empty success`);
  }

  // --- 2. IR validation failure surfaces distinctly (a schema-valid but IR-invalid submission) ---
  {
    // A rule missing companyId/instrumentKey is not possible via WireRuleSchema (compiler fills those from input),
    // so exercise IR_VALIDATION_FAILURE via a rule referencing a nonexistent dependency target instead - a
    // shape the wire schema accepts but the real IR validator (validateCompilationUnit) must catch downstream.
    // Simpler, deterministic proof: an UNSUPPORTED capacityExpression must remain UNSUPPORTED_TYPE end-to-end,
    // not silently coerced into a fabricated numeric value (also proves req #2, unsupported semantics preserved).
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [{ ...validRule("r1"), capacityExpression: { kind: "UNSUPPORTED", reason: "ambiguous formula", sourceEvidence: "see schedule 3" } }] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(testCompilerInput(), { caller, cache: new InMemorySemanticCompilationCache() });
    const rule = result.rules[0];
    const preserved = rule?.capacityExpression?.kind === "UNSUPPORTED" && rule.sufficiency !== "COMPLETE";
    record("unsupported-marker-preserved", preserved ? "PASS" : "FAIL", `rule.capacityExpression.kind=${rule?.capacityExpression?.kind} rule.sufficiency=${rule?.sufficiency} - an UNSUPPORTED wire node must survive normalization as UNSUPPORTED_TYPE IR, never silently dropped/coerced to a fabricated value, and must downgrade sufficiency away from COMPLETE`);
  }

  // --- 3. enforceSufficiencyConsistency: OPERATIVE_STATE_CONFLICTED/REVIEW_REQUIRED downgrade sufficiency ---
  {
    const conflicted = enforceSufficiencyConsistency("COMPLETE", [], null, { operativeStatus: "OPERATIVE_STATE_CONFLICTED", currentSourceDocumentId: "d1" } as never);
    const reviewRequired = enforceSufficiencyConsistency("COMPLETE", [], null, { operativeStatus: "OPERATIVE_STATE_REVIEW_REQUIRED", currentSourceDocumentId: "d1" } as never);
    const ok = conflicted.sufficiency === "CONFLICTED" && reviewRequired.sufficiency === "AMBIGUOUS";
    record("operative-lineage-downgrades-sufficiency", ok ? "PASS" : "FAIL", `OPERATIVE_STATE_CONFLICTED -> ${conflicted.sufficiency} (want CONFLICTED); OPERATIVE_STATE_REVIEW_REQUIRED -> ${reviewRequired.sufficiency} (want AMBIGUOUS) - a COMPLETE claim must never survive an unresolved/conflicted operative lineage unchanged`);
  }

  // --- 4. OUTPUT_TRUNCATED set ONLY on positive stop_reason==="max_tokens" evidence ---
  {
    // Genuine truncation shape: the tool input itself fails schema validation (rules[1] cut off
    // mid-element, a raw string instead of a rule object - exactly the real fwrg-6.10-a/lsb-6.01
    // failure shape caller.ts's own header cites) AND the provider's own stop_reason confirms
    // max_tokens - the ONLY combination that must produce OUTPUT_TRUNCATED.
    const truncatedClient = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [validRule("r1"), "MID-ELEMENT-CUTOFF-NOT-AN-OBJECT"] })], { stopReason: "max_tokens" })]);
    const callerT = new RealSemanticCaller("test", "test-model", truncatedClient);
    const truncatedResult = await compileCovenantToIR(testCompilerInput(), { caller: callerT, cache: new InMemorySemanticCompilationCache() });
    const truncatedFlagged = truncatedResult.failureReasons.includes("OUTPUT_TRUNCATED");

    // Negative control: a schema failure that is NOT truncation must never be mislabeled OUTPUT_TRUNCATED.
    const badClient = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: "not-an-array" })], { stopReason: "end_turn" }),
      fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: "not-an-array" })], { stopReason: "end_turn" }),
      fakeMessage([{ type: "text", text: "giving up" } as Anthropic.TextBlock], { stopReason: "end_turn" }),
    ]);
    const callerB = new RealSemanticCaller("test", "test-model", badClient);
    const badResult = await compileCovenantToIR(testCompilerInput(), { caller: callerB, cache: new InMemorySemanticCompilationCache() });
    const falsePositiveAvoided = !badResult.failureReasons.includes("OUTPUT_TRUNCATED");

    record("output-truncated-positive-evidence-only", truncatedFlagged && falsePositiveAvoided ? "PASS" : "FAIL", `stop_reason=max_tokens -> OUTPUT_TRUNCATED present=${truncatedFlagged} (want true); ordinary schema failure (stop_reason=end_turn) -> OUTPUT_TRUNCATED present=${!falsePositiveAvoided} (want false)`);
  }

  // --- 5. Tenant-aware cache identity: two tenants, same candidateRef/sourceText/contextIdentity, no cross-contamination ---
  {
    const cache = new InMemorySemanticCompilationCache();
    let callCount = 0;
    const client = (): MinimalAnthropicClient => ({
      messages: {
        stream: () => {
          callCount++;
          return { finalMessage: async () => fakeMessage([toolUseBlock(`t${callCount}`, "submit_compilation", { rules: [validRule(`r${callCount}`)] })]) };
        },
      },
    });
    const sharedBundle = emptyContextBundle({ contentIdentity: "identical-content-hash-both-tenants" });
    const inputTenantA = testCompilerInput({ companyId: "tenant-a", instrumentKey: "instr-1", sourceDocumentId: "doc-1", candidateRef: "cand-1", operativeSourceText: "identical text", contextBundle: sharedBundle });
    const inputTenantB = testCompilerInput({ companyId: "tenant-b", instrumentKey: "instr-1", sourceDocumentId: "doc-1", candidateRef: "cand-1", operativeSourceText: "identical text", contextBundle: sharedBundle });

    const keyA = computeCacheKey(inputTenantA, "test::test-model");
    const keyB = computeCacheKey(inputTenantB, "test::test-model");

    const resultA = await compileCovenantToIR(inputTenantA, { caller: new RealSemanticCaller("test", "test-model", client()), cache });
    const resultB = await compileCovenantToIR(inputTenantB, { caller: new RealSemanticCaller("test", "test-model", client()), cache });

    const keysDistinct = keyA !== keyB;
    const bothCallersInvoked = callCount === 2; // if tenant B's request had been served from tenant A's cache entry, callCount would still be 1
    const noObjectIdentityLeak = resultA !== resultB && resultA.rules[0]?.ruleId !== resultB.rules[0]?.ruleId;
    record("tenant-aware-cache-identity", keysDistinct && bothCallersInvoked && noObjectIdentityLeak ? "PASS" : "FAIL", `cacheKeyA===cacheKeyB? ${!keysDistinct}; model calls made=${callCount} (want 2, i.e. tenant B was never served tenant A's cached result); resultA.rules[0].ruleId=${resultA.rules[0]?.ruleId} resultB.rules[0].ruleId=${resultB.rules[0]?.ruleId}`);
  }

  // --- 6. Precedent stays advisory: "source always wins" gate rejects an ungrounded literal Pass 2 introduces ---
  {
    // Pass 1 (baseline, no precedent): a clean $1,000,000 capacity rule.
    // Pass 2 (precedent-augmented): the SAME rule/ruleId shape, but with a capacityExpression amount
    // (99,999,999) grounded in NEITHER Pass 1's own output NOR the operative source text - exactly the
    // injected-literal contamination case the mechanical "source always wins" gate exists to catch.
    const caller = new ScriptedCaller([submission({ rules: [wireRule(1_000_000)] }), submission({ rules: [wireRule(99_999_999)] })]);
    const input = testCompilerInput({ candidateRef: "cand-contamination-probe", operativeSourceText: "Indebtedness not to exceed $1,000,000." });
    const outcome = await compileCovenantToIRWithPrecedent(input, [precedent()], { caller });
    const rejectedContamination = outcome.precedentRejectedAsUnsupported === true && outcome.precedentAugmented === null && outcome.baseline.rules[0]?.capacityExpression?.kind === "MONEY";
    record("precedent-advisory-source-wins-gate", rejectedContamination ? "PASS" : "FAIL", `precedentRejectedAsUnsupported=${outcome.precedentRejectedAsUnsupported} precedentAugmented=${outcome.precedentAugmented === null ? "null (baseline returned)" : "NON-NULL (would mean an ungrounded precedent literal was allowed through)"} - Pass 2's ungrounded $99,999,999 literal must be rejected and the caller must fall back to Pass 1's baseline`);
  }

  const summary = { generatedAt: new Date().toISOString(), totalCases: results.length, passCount: results.filter((r) => r.verdict === "PASS").length, failCount: results.filter((r) => r.verdict === "FAIL").length, results };
  writeFileSync("/tmp/phase-3f1-6-section16-adversarial-results.json", JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passCount}/${summary.totalCases} PASS, ${summary.failCount}/${summary.totalCases} FAIL`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
