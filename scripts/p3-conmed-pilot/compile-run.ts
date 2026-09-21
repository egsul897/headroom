/**
 * The pilot's compilation runner. Drives the UNCHANGED production compiler
 * (`compileCovenantToIR`) over CONMED candidates, with the only authorized
 * methodological substitution: a cheaper model, supplied through the production
 * caller's own existing `SEMANTIC_COMPILER_MODEL` env knob.
 *
 * §2's cheap-first cascade is implemented here and nowhere else: Tier 1 runs every
 * candidate; a candidate escalates to Tier 2 ONLY on execution failure. A NO_CREDIT
 * result, a low-confidence result, an honest UNSUPPORTED and an unfavourable answer are
 * all explicitly NOT escalation triggers — escalating on those would be shopping for a
 * better answer, which is the one thing this pilot must not do.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { AI_GATEWAY_BASE_URL } from "../../lib/contract-model/analyzer/anthropic-analyzer";
import { RealSemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilationResult, type SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { COMPANY_ID, INSTRUMENT_KEY, buildDeterministicStages, contextBundlesFor, operativeTextFor, rehydrateNodeIds, sealedPopulation, sha256 } from "./pipeline";
import { blendedPricePerMtok, loadCatalogue, type GatewayModel } from "./probe-models";

/**
 * §2 — the ONLY conditions that justify moving a candidate to a more expensive model.
 * Every one of these is an execution failure: the model could not complete the protocol.
 * `UNSUPPORTED_BY_SOURCE` and an honest partial are deliberately absent.
 */
export const ESCALATION_TRIGGERS = new Set([
  "MODEL_SCHEMA_FAILURE",
  "TOOL_BUDGET_EXHAUSTED",
  "TRANSPORT_OR_INTERNAL_ERROR",
  "OUTPUT_TRUNCATED",
  "CONTEXT_WINDOW_EXCEEDED",
]);

export function shouldEscalate(result: SemanticCompilationResult): { escalate: boolean; reason: string | null } {
  if (result.status === "FAILED") {
    const trigger = (result.failureReasons ?? []).find((r) => ESCALATION_TRIGGERS.has(r));
    return { escalate: true, reason: trigger ?? `FAILED:${(result.failureReasons ?? []).join(",") || "unspecified"}` };
  }
  const trigger = (result.failureReasons ?? []).find((r) => ESCALATION_TRIGGERS.has(r));
  if (trigger) return { escalate: true, reason: trigger };
  return { escalate: false, reason: null };
}

export interface CandidateRecord {
  discoveryId: string;
  documentId: string;
  sourceSectionRef: string;
  role: string;
  sourceTextHash: string;
  sourceTextChars: number;
  model: string;
  tier: 1 | 2;
  escalated: boolean;
  escalationReason: string | null;
  status: string;
  failureReasons: string[];
  rules: number;
  definitions: number;
  sufficiencySummary: Record<string, number>;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  attemptCount: number | null;
  actualCostUsd: number;
  outputHash: string;
  wallClockMs: number | null;
}

/** Cost at the model's REAL gateway price. Production telemetry only knows Sonnet/Opus rates. */
export function realCost(m: GatewayModel, inTok: number | null, outTok: number | null): number {
  return (inTok ?? 0) * Number(m.pricing.input) + (outTok ?? 0) * Number(m.pricing.output);
}

/**
 * A per-candidate wall-clock ceiling. The compiler's own guards bound TURNS and TOOL
 * CALLS, not time, so a cheap model that answers slowly (or stalls mid-stream) can hang
 * a run indefinitely with no signal. A timeout turns that into a recorded execution
 * failure — which §2 then treats as a legitimate escalation trigger — instead of a
 * silent stall that would be indistinguishable from progress.
 */
export const PER_CANDIDATE_TIMEOUT_MS = Number(process.env.PILOT_CANDIDATE_TIMEOUT_MS ?? 900_000);

export class CandidateTimeoutError extends Error {
  constructor(ms: number) {
    super(`candidate exceeded the ${ms}ms pilot wall-clock ceiling`);
    this.name = "CandidateTimeoutError";
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CandidateTimeoutError(ms)), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The output ceiling the run requests, via production's own SEMANTIC_COMPILER_MAX_TOKENS
 * knob. A model whose own ceiling is below the 128,000 default would have every call
 * rejected by the API before it ever saw the prompt, so the request is clamped to the
 * model's stated ceiling. This is a capability fact about the substituted model, not a
 * behavioural change: the frozen run's mean output was 14,403 tokens, far under either.
 */
export function maxTokensFor(m: GatewayModel): number {
  return Math.min(m.max_tokens, 128000);
}

export function callerFor(model: string): RealSemanticCaller {
  return new RealSemanticCaller("vercel-ai-gateway", model, new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL, maxRetries: 2 }));
}

export function buildInput(candidate: DiscoveredCandidate, bundle: unknown, stages: ReturnType<typeof buildDeterministicStages>, operativeState: unknown, amendmentEffects: unknown[]): SemanticCompilerInput {
  return {
    companyId: COMPANY_ID,
    instrumentKey: INSTRUMENT_KEY,
    sourceDocumentId: candidate.documentId,
    candidateRef: candidate.discoveryId,
    sourceSectionRef: candidate.normalizedSourceRef,
    operativeSourceText: operativeTextFor(candidate, stages.index),
    contextBundle: bundle,
    operativeLineage: null,
    toolAccess: { structuralIndex: stages.index, operativeState, packageGraph: stages.packageGraph, amendmentEffects, contextBundle: bundle },
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  } as SemanticCompilerInput;
}

export function record(candidate: DiscoveredCandidate, input: SemanticCompilerInput, result: SemanticCompilationResult, m: GatewayModel, tier: 1 | 2, escalationReason: string | null): CandidateRecord {
  const t = (result.telemetry ?? {}) as Record<string, number | null | undefined>;
  const sufficiency: Record<string, number> = {};
  for (const r of result.rules ?? []) sufficiency[(r as { sufficiency?: string }).sufficiency ?? "UNKNOWN"] = (sufficiency[(r as { sufficiency?: string }).sufficiency ?? "UNKNOWN"] ?? 0) + 1;

  return {
    discoveryId: candidate.discoveryId,
    documentId: candidate.documentId,
    sourceSectionRef: candidate.normalizedSourceRef,
    role: candidate.role,
    sourceTextHash: sha256(input.operativeSourceText),
    sourceTextChars: input.operativeSourceText.length,
    model: m.id,
    tier,
    escalated: tier === 2,
    escalationReason,
    status: result.status,
    failureReasons: result.failureReasons ?? [],
    rules: (result.rules ?? []).length,
    definitions: (result.definitions ?? []).length,
    sufficiencySummary: sufficiency,
    toolCalls: (result.toolCallLog ?? []).length,
    inputTokens: (t.inputTokens as number) ?? null,
    outputTokens: (t.outputTokens as number) ?? null,
    attemptCount: (t.attemptCount as number) ?? null,
    actualCostUsd: realCost(m, (t.inputTokens as number) ?? null, (t.outputTokens as number) ?? null),
    outputHash: sha256(JSON.stringify({ rules: result.rules, definitions: result.definitions, status: result.status })),
    wallClockMs: (t.wallClockMs as number) ?? null,
  };
}

/** Bounded-concurrency map, matching production's own default pool of 4. */
export async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

export function loadModel(id: string, cataloguePath = "/tmp/claude-0/pilot/models.json"): GatewayModel {
  const m = loadCatalogue(cataloguePath).find((x) => x.id === id);
  if (!m) throw new Error(`model ${id} not in the gateway catalogue`);
  return m;
}

export async function prepare() {
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated, unresolved } = rehydrateNodeIds(pop.eligible, stages.index);
  const bundles = contextBundlesFor(rehydrated, stages.access);
  return { stages, pop, rehydrated, unresolved, bundles };
}

/** A real-compiler capability probe: the toy tool probe proves transport, not competence. */
if (process.argv[1]?.endsWith("compile-run.ts")) {
  void (async () => {
    const modelIds = (process.argv[2] ?? "").split(",").filter(Boolean);
    const n = Number(process.argv[3] ?? 3);
    const { stages, rehydrated, bundles } = await prepare();
    const sample = rehydrated.filter((c) => operativeTextFor(c, stages.index).length > 0).slice(0, n);

    const results: Record<string, CandidateRecord[]> = {};
    for (const id of modelIds) {
      const m = loadModel(id);
      const caller = callerFor(id);
      process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(m));
      const recs = await runPool(sample, 3, async (candidate) => {
        const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, null, []);
        const started = Date.now();
        try {
          const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
          console.log(`    [${id}] ${candidate.normalizedSourceRef} -> ${result.status} rules=${(result.rules ?? []).length} in ${Math.round((Date.now() - started) / 1000)}s`);
          return record(candidate, input, result, m, 1, null);
        } catch (err) {
          const name = err instanceof Error ? err.name : "UnknownError";
          console.log(`    [${id}] ${candidate.normalizedSourceRef} -> THREW ${name} after ${Math.round((Date.now() - started) / 1000)}s`);
          return record(candidate, input, { status: "FAILED", failureReasons: [name === "CandidateTimeoutError" ? "TRANSPORT_OR_INTERNAL_ERROR" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult, m, 1, null);
        }
      });
      results[id] = recs;
      const ok = recs.filter((r) => r.status !== "FAILED").length;
      const cost = recs.reduce((s, r) => s + r.actualCostUsd, 0);
      console.log(
        `${id.padEnd(40)} blended $${blendedPricePerMtok(m).toFixed(3)}/Mtok  ok ${ok}/${recs.length}  rules ${recs.reduce((s, r) => s + r.rules, 0)}  tools ${recs.reduce((s, r) => s + r.toolCalls, 0)}  cost $${cost.toFixed(5)}  statuses ${recs.map((r) => r.status).join("/")}  fails ${JSON.stringify(recs.flatMap((r) => r.failureReasons))}`,
      );
    }
    fs.mkdirSync("/tmp/claude-0/pilot", { recursive: true });
    fs.writeFileSync(path.join("/tmp/claude-0/pilot", `compiler-probe-${modelIds.join("_").replace(/[^a-zA-Z0-9]/g, "_")}.json`), JSON.stringify(results, null, 2));
  })();
}
