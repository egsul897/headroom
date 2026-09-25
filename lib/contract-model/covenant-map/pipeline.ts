/**
 * THE canonical compiler path.
 *
 *   compileCandidateToVerifiedIR  - ONE candidate: deterministic input -> certified compile (Pass A inventory,
 *                                   ONE bounded semantic conversation, deterministic reconciliation) -> independent
 *                                   verification, under ONE AbortSignal deadline and ONE hard dispatch budget.
 *   compileCovenantMap            - the whole package, in a bounded worker pool, then deterministic assembly.
 *
 * Nothing here reads an environment variable to decide behaviour. Every provider request made below carries the
 * candidate's signal and reserves its cost first. A credit exhaustion, a deadline or a budget refusal is observed
 * where it happens (the callers are wrapped, since the compile path itself turns every throw into a FAILED result)
 * and STOPS the run: the remaining candidates are recorded UNSERVED, never silently skipped.
 */
import type { ZodType } from "zod";
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import type { StageCaller, StageCallOptions } from "../compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult, SemanticCompileCallOptions } from "../compiler/semantic/caller";
import { compileCovenantToIR, type CompileOptions } from "../compiler/semantic/compile";
import type { SemanticCompilationCache } from "../compiler/semantic/cache";
import type { SemanticCompilerInput } from "../compiler/semantic/types";
import { isEligibleForSemanticCompilation } from "../compiler/semantic/package-compile";
import { verifyCompiledCandidate, type VerifyOptions } from "../compiler/semantic-verification/verify";
import type { SemanticVerificationResult } from "../compiler/semantic-verification/types";
import { certifiedConfigIdentity, validateCertifiedConfig, type CertifiedCompilerConfig } from "../compiler/certified-config";
import { createDeadline, DeadlineExceededError } from "../analyzer/deadline";
import { BudgetRefusedError, type DispatchBudget } from "../analyzer/dispatch-budget";
import { ProviderError, isAbortError, normalizeProviderError } from "../analyzer/provider-error";
import type { AnalyzerCallTelemetry } from "../analyzer/telemetry";
import { assembleCovenantMap, type AssembleCovenantMapInput, type CandidateMapResult } from "./assemble";
import { buildCandidateCompilerInput, type CandidateInputPackage } from "./candidate-input";
import type { CandidateExecutionTelemetry, CanonicalCovenantMap, CovenantMapDocument } from "./types";

export const CANONICAL_COMPILER_PATH_VERSION = "canonical-compiler-path.v1";
export const MAX_MAP_CONCURRENCY = 4;

export interface CovenantMapPackageInput extends CandidateInputPackage {
  asOfDate: string | null;
  documents: { documentId: string; label: string; text: string; role?: CovenantMapDocument["role"] }[];
  candidates: DiscoveredCandidate[];
  discoveryRunVersion: string | null;
}

export interface CertifiedExecutionDeps {
  config: CertifiedCompilerConfig;
  semanticCaller: SemanticCaller;
  /** DUAL_PASS_ENSEMBLE: two independent Pass A callers. SINGLE_PASS: one. */
  inventoryPassCallers: [StageCaller, StageCaller] | null;
  inventoryCaller: StageCaller | null;
  reviewCaller: StageCaller;
  conditionSuspicionCaller: StageCaller;
  budget: DispatchBudget;
  parentSignal?: AbortSignal;
  cache?: SemanticCompilationCache;
  /** 1..MAX_MAP_CONCURRENCY, default 1. */
  concurrency?: number;
  onCandidateResult?: (result: CandidateMapResult) => void | Promise<void>;
  /** Tests / offline replay ONLY: extra compile options (e.g. a frozen inventory, a scripted shard executor). Production never sets this. */
  compileOptionsForTests?: Partial<CompileOptions>;
  verifyOptionsForTests?: Partial<VerifyOptions>;
}

export type RunStopReason = "CREDIT_EXHAUSTED" | "BUDGET_REFUSED" | "PARENT_ABORTED";
export interface RunStop { reason: RunStopReason; atCandidateRef: string; detail: string }

/**
 * Observes every provider call of ONE candidate: counts, tokens, cost, and the first FATAL error (credit exhaustion,
 * abort, budget refusal). After a fatal error no further request is dispatched for that candidate - the wrapper
 * refuses immediately, so a 402 on Pass A can never be followed by a paid Pass B.
 */
export class CandidateCallObserver {
  calls = 0; inventoryCalls = 0; verifierCalls = 0; semanticConversations = 0; refinementConversations = 0; transportAttempts = 0;
  inputTokens: number | null = null; outputTokens: number | null = null; costUsd: number | null = null; pricingStatus: string | null = null;
  fatal: { kind: "CREDIT_EXHAUSTED" | "ABORTED" | "BUDGET_REFUSED"; error: Error } | null = null;
  private addUsage(t: AnalyzerCallTelemetry | null | undefined): void {
    if (!t) return;
    if (t.inputTokens !== null && t.inputTokens !== undefined) this.inputTokens = (this.inputTokens ?? 0) + t.inputTokens;
    if (t.outputTokens !== null && t.outputTokens !== undefined) this.outputTokens = (this.outputTokens ?? 0) + t.outputTokens;
    if (t.calculatedCostUsd !== null && t.calculatedCostUsd !== undefined) this.costUsd = (this.costUsd ?? 0) + t.calculatedCostUsd;
    const ps = (t as { pricing?: { pricingStatus?: string } }).pricing?.pricingStatus;
    if (ps && this.pricingStatus !== "UNKNOWN_MODEL") this.pricingStatus = ps;
  }
  observe(err: unknown, provider: string, model: string): void {
    if (this.fatal) return;
    if (err instanceof BudgetRefusedError) { this.fatal = { kind: "BUDGET_REFUSED", error: err }; return; }
    const pe = normalizeProviderError(err, { provider, model });
    if (pe.kind === "CREDIT_EXHAUSTED") this.fatal = { kind: "CREDIT_EXHAUSTED", error: pe };
    else if (pe.kind === "ABORTED" || isAbortError(err) || err instanceof DeadlineExceededError) this.fatal = { kind: "ABORTED", error: pe };
  }
  private refuse(provider: string, model: string): never {
    throw new ProviderError({ provider, model, kind: "ABORTED", httpStatus: null, providerCode: null, retryable: false, billingKnown: true, usageIfKnown: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 }, rawCauseClass: "CandidateCallObserver", message: `request refused: candidate already ${this.fatal!.kind} (${this.fatal!.error.message})` });
  }
  wrapStage(caller: StageCaller, role: "INVENTORY" | "VERIFIER"): StageCaller {
    const self = this;
    return {
      providerName: caller.providerName, model: caller.model, isSynthetic: caller.isSynthetic,
      async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string, options?: StageCallOptions): Promise<T> {
        if (self.fatal) self.refuse(caller.providerName, caller.model);
        self.calls++; if (role === "INVENTORY") self.inventoryCalls++; else self.verifierCalls++;
        try { const v = await caller.call(schema, stage, systemPrompt, userContent, options); self.addUsage(caller.lastTelemetry()); return v; }
        catch (err) { self.addUsage(caller.lastTelemetry()); self.observe(err, caller.providerName, caller.model); throw err; }
      },
      lastTelemetry: () => caller.lastTelemetry(),
    };
  }
  wrapSemantic(caller: SemanticCaller): SemanticCaller {
    const self = this;
    return {
      providerName: caller.providerName, model: caller.model, isSynthetic: caller.isSynthetic,
      async compile(input: SemanticCompilerInput, options?: SemanticCompileCallOptions): Promise<SemanticCallerResult> {
        if (self.fatal) self.refuse(caller.providerName, caller.model);
        self.calls++;
        try {
          const r = await caller.compile(input, options);
          const t = r.telemetry as (AnalyzerCallTelemetry & { semanticConversations?: number; refinementConversations?: number; transportAttempts?: number }) | null;
          self.addUsage(t);
          self.semanticConversations += t?.semanticConversations ?? 1; self.refinementConversations += t?.refinementConversations ?? 0; self.transportAttempts += t?.transportAttempts ?? t?.attemptCount ?? 1;
          return r;
        } catch (err) { self.transportAttempts += 1; self.observe(err, caller.providerName, caller.model); throw err; }
      },
    };
  }
}

export interface CandidateExecution extends CandidateMapResult { observer: CandidateCallObserver; stop: RunStop | null }

export async function compileCandidateToVerifiedIR(candidate: DiscoveredCandidate, pkg: CovenantMapPackageInput, deps: CertifiedExecutionDeps): Promise<CandidateExecution> {
  const problems = validateCertifiedConfig(deps.config);
  if (problems.length > 0) throw new Error(`certified config invalid: ${problems.join(", ")}`);
  const observer = new CandidateCallObserver();
  const startedAt = Date.now();
  const base = (outcome: CandidateMapResult["outcome"], failure: CandidateMapResult["failure"], partial: Partial<CandidateExecution> = {}): CandidateExecution => ({
    candidate, input: null, bundle: null, compilation: null, verification: null, operativeProvision: null, sourceContentVersion: null, identityStrength: "WEAK", outcome, failure,
    telemetry: telemetryOf(observer, startedAt, deps.config.candidateDeadlineMs, null, false), observer, stop: null, ...partial,
  });
  const eligibility = isEligibleForSemanticCompilation(candidate);
  if (!eligibility.eligible) return base("INELIGIBLE", { kind: "INELIGIBLE", detail: eligibility.reason ?? "ineligible" });
  if (candidate.structuralNodeIds.length === 0 || !pkg.index.getNodeById(candidate.structuralNodeIds[0]!)) return base("NO_STRUCTURAL_ANCHOR", { kind: "NO_STRUCTURAL_ANCHOR", detail: `structuralNodeIds ${JSON.stringify(candidate.structuralNodeIds)} resolve to no node` });

  const built = buildCandidateCompilerInput(candidate, pkg);
  const common = { input: built.input, bundle: built.bundle, operativeProvision: built.operativeProvision, sourceContentVersion: built.sourceContentVersion, identityStrength: built.identityStrength } as const;
  if (built.operativeSourceText.trim().length === 0) return base("EMPTY_OPERATIVE_TEXT", { kind: "EMPTY_OPERATIVE_TEXT", detail: "operativeSourceTextFor() returned empty text for the candidate's anchor node" }, common);

  const deadline = createDeadline(deps.config.candidateDeadlineMs, deps.parentSignal);
  const callOptions = { signal: deadline.signal, budget: deps.budget };
  try {
    const semantic = observer.wrapSemantic(deps.semanticCaller);
    const compileOptions: CompileOptions = {
      caller: semantic, certified: deps.config, callOptions, cache: deps.cache,
      ...(deps.config.inventoryMode === "DUAL_PASS_ENSEMBLE"
        ? { inventoryPassCallers: deps.inventoryPassCallers ? [observer.wrapStage(deps.inventoryPassCallers[0], "INVENTORY"), observer.wrapStage(deps.inventoryPassCallers[1], "INVENTORY")] as [StageCaller, StageCaller] : undefined }
        : { inventoryCaller: deps.inventoryCaller ? observer.wrapStage(deps.inventoryCaller, "INVENTORY") : undefined }),
      ...(deps.compileOptionsForTests ?? {}),
    };
    const compilation = await compileCovenantToIR(built.input, compileOptions);
    // stamp the invalidation identity on every unit the certified path emits
    for (const u of [...compilation.rules, ...compilation.definitions]) if (u.sourceContentVersion === null || u.sourceContentVersion === undefined) u.sourceContentVersion = built.sourceContentVersion;
    const shardAttempts = compilation.execution?.sharded ? compilation.execution.sharded.executed + compilation.execution.sharded.retries : 0;
    const timedOut = deadline.signal.aborted && deadline.signal.reason instanceof DeadlineExceededError;
    const stop = stopFrom(observer, candidate.discoveryId, deps.parentSignal);
    if (compilation.status === "FAILED") {
      const detail = compilation.errorDetail ? `${compilation.errorDetail.errorClass}: ${compilation.errorDetail.sanitizedMessage}` : compilation.failureReasons.join(",");
      return base(stop ? "UNSERVED" : "COMPILE_FAILED", { kind: observer.fatal?.kind ?? compilation.failureReasons[0] ?? "FAILED", detail: observer.fatal ? observer.fatal.error.message : detail }, { ...common, compilation, telemetry: telemetryOf(observer, startedAt, deps.config.candidateDeadlineMs, shardAttempts, timedOut), stop });
    }
    let verification: SemanticVerificationResult | null = null;
    let verifyFailure: CandidateMapResult["failure"] = null;
    const fatalBeforeVerify = observer.fatal as NonNullable<CandidateCallObserver["fatal"]> | null;
    if (!fatalBeforeVerify) {
      try {
        verification = await verifyCompiledCandidate({ compilerInput: built.input, compilationResult: compilation }, { signal: deadline.signal, budget: deps.budget, reviewCaller: observer.wrapStage(deps.reviewCaller, "VERIFIER"), conditionSuspicionCaller: observer.wrapStage(deps.conditionSuspicionCaller, "VERIFIER"), ...(deps.verifyOptionsForTests ?? {}) });
      } catch (err) {
        observer.observe(err, deps.reviewCaller.providerName, deps.reviewCaller.model);
        verifyFailure = { kind: observer.fatal?.kind ?? (err instanceof Error ? err.constructor.name : "VERIFY_ERROR"), detail: err instanceof Error ? err.message : String(err) };
      }
    } else { const f = observer.fatal as NonNullable<CandidateCallObserver["fatal"]>; verifyFailure = { kind: f.kind, detail: `verification not attempted: ${f.error.message}` }; }
    const stop2 = stopFrom(observer, candidate.discoveryId, deps.parentSignal);
    const timedOut2 = deadline.signal.aborted && deadline.signal.reason instanceof DeadlineExceededError;
    const telemetry = telemetryOf(observer, startedAt, deps.config.candidateDeadlineMs, shardAttempts, timedOut2);
    if (!verification) return base(stop2 ? "UNSERVED" : "VERIFICATION_FAILED", verifyFailure, { ...common, compilation, telemetry, stop: stop2 });
    const ok = compilation.status === "COMPLETED" && (verification.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || verification.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS");
    return base(ok ? "MAPPED" : "MAPPED_WITH_REVIEW", null, { ...common, compilation, verification, telemetry, stop: stop2 });
  } finally {
    deadline.dispose();
  }
}

function stopFrom(observer: CandidateCallObserver, candidateRef: string, parentSignal?: AbortSignal): RunStop | null {
  if (parentSignal?.aborted) return { reason: "PARENT_ABORTED", atCandidateRef: candidateRef, detail: String((parentSignal.reason as Error | undefined)?.message ?? parentSignal.reason ?? "aborted") };
  if (!observer.fatal) return null;
  if (observer.fatal.kind === "CREDIT_EXHAUSTED") return { reason: "CREDIT_EXHAUSTED", atCandidateRef: candidateRef, detail: observer.fatal.error.message };
  if (observer.fatal.kind === "BUDGET_REFUSED") return { reason: "BUDGET_REFUSED", atCandidateRef: candidateRef, detail: observer.fatal.error.message };
  return null; // a per-candidate deadline is that candidate's failure, not a run stop
}

function telemetryOf(o: CandidateCallObserver, startedAt: number, deadlineMs: number, shardAttempts: number | null, timedOut: boolean): CandidateExecutionTelemetry {
  return { candidateAttempt: 1, semanticConversations: o.semanticConversations, refinementConversations: o.refinementConversations, transportAttempts: o.transportAttempts, shardAttempts: shardAttempts ?? 0, inventoryCalls: o.inventoryCalls, verifierCalls: o.verifierCalls, providerCalls: o.calls, inputTokens: o.inputTokens, outputTokens: o.outputTokens, costUsd: o.costUsd, pricingStatus: o.pricingStatus, wallClockMs: Date.now() - startedAt, deadlineMs, timedOut };
}

export interface CovenantMapRun { map: CanonicalCovenantMap; results: CandidateMapResult[]; stop: RunStop | null; budget: ReturnType<DispatchBudget["snapshot"]> }

export async function compileCovenantMap(pkg: CovenantMapPackageInput, deps: CertifiedExecutionDeps): Promise<CovenantMapRun> {
  const concurrency = Math.max(1, Math.min(MAX_MAP_CONCURRENCY, deps.concurrency ?? 1));
  const queue = [...pkg.candidates];
  const results: CandidateMapResult[] = [];
  let stop: RunStop | null = null;
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (stop || deps.parentSignal?.aborted) {
        const detail = stop ? `run stopped: ${stop.reason} at ${stop.atCandidateRef} (${stop.detail})` : "parent signal aborted before this candidate started";
        const r: CandidateMapResult = { candidate: next, input: null, bundle: null, compilation: null, verification: null, operativeProvision: null, sourceContentVersion: null, identityStrength: "WEAK", outcome: "UNSERVED", failure: { kind: stop?.reason ?? "PARENT_ABORTED", detail }, telemetry: null };
        results.push(r); await deps.onCandidateResult?.(r); continue;
      }
      const exec = await compileCandidateToVerifiedIR(next, pkg, deps);
      if (exec.stop && !stop) stop = exec.stop;
      const { observer: _o, stop: _s, ...r } = exec; void _o; void _s;
      results.push(r); await deps.onCandidateResult?.(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  const map = assembleCovenantMap(assemblyInput(pkg, deps.config, results));
  return { map, results, stop, budget: deps.budget.snapshot() };
}

export function assemblyInput(pkg: Omit<CovenantMapPackageInput, "exactTermsByDocument" | "packageGraph" | "amendmentEffects" | "supersessionIndex" | "retrievalBudget">, config: CertifiedCompilerConfig | null, results: CandidateMapResult[]): AssembleCovenantMapInput {
  return { companyId: pkg.companyId, packageKey: pkg.packageKey, instrumentKey: pkg.instrumentKey, asOfDate: pkg.asOfDate, documents: pkg.documents, index: pkg.index, operativeState: pkg.operativeState, certifiedConfigIdentity: config ? certifiedConfigIdentity(config) : null, discoveryRunVersion: pkg.discoveryRunVersion, candidates: pkg.candidates, results };
}
