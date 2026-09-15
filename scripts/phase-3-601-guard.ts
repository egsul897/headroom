/**
 * PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN - the SINGLE cost-guard implementation.
 *
 * Both the §3 zero-cost harness certification and the paid clean rerun import THIS module, so the guard that is
 * certified is literally the guard that runs. That is the whole point: harness defect HD-1 existed because the
 * in-run guard and the pre-run gate were two different formulas that happened to disagree by $0.647.
 *
 * HD-1 CLOSURE: conservativeRemaining() uses EXACTLY the frozen §5 estimator -
 *   Pass A  : remaining batch calls x worst observed batch rate + remaining gap calls x worst observed gap rate
 *   Pass B  : remaining plannerEstimatedInputTokens x worst observed per-token rate   (NO per-shard floor/max term)
 *   Verifier: remaining semantic reviews x worst observed review cost + remaining condition-suspicion calls x rate
 *   TOTAL   x 1.25
 * No other cost dimension exists. Nothing here may be re-parameterised to make a run fit.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { calculateCostUsd, type AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import type Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { observedRates } from "./phase-3-601-preflight";

export const CONDITION_SUSPICION_PER_CALL = 0.0114;
export const CONDITION_SUSPICION_CALLS = 5;
export const SAFETY_FACTOR = 1.25;
const CHARS_PER_TOKEN = 3.2;
const ASSUMED_OUTPUT_TOKENS = 12_000;

export class BudgetExhaustedError extends Error { constructor(msg: string) { super(msg); this.name = "BudgetExhaustedError"; } }
export class PassAPrerequisiteError extends Error { constructor(msg: string) { super(msg); this.name = "PassAPrerequisiteError"; } }

export interface GuardCall { n: number; stage: string; model: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number; conservativeRemainingBeforeUsd: number; at: string }
export interface GuardRefusal { stage: string; reason: string; spentUsd: number; conservativeRemainingUsd: number; capRemainingUsd: number; balanceRemainingUsd: number; at: string }

export interface GuardInit {
  rates: ReturnType<typeof observedRates>;
  passABatchesPerPass: number;
  passAGapCallsPerPass: number;
  passes: number;
  passBPlannerTokens: number;
  verifierReviews: number;
  conditionSuspicionCalls: number;
  capUsd: number;
  balanceUsd: number;
  statePath?: string | null;
}

export class Guard {
  spent = 0;
  calls: GuardCall[] = [];
  refusals: GuardRefusal[] = [];
  passABatchesRemaining: number;
  passAGapRemaining: number;
  passBTokensRemaining: number;
  verifierReviewRemaining: number;
  conditionSuspicionRemaining: number;
  readonly capUsd: number;
  readonly balanceUsd: number;
  private readonly r: ReturnType<typeof observedRates>;
  private readonly statePath: string | null;

  constructor(init: GuardInit) {
    this.r = init.rates;
    this.passABatchesRemaining = init.passABatchesPerPass * init.passes;
    this.passAGapRemaining = init.passAGapCallsPerPass * init.passes;
    this.passBTokensRemaining = init.passBPlannerTokens;
    this.verifierReviewRemaining = init.verifierReviews;
    this.conditionSuspicionRemaining = init.conditionSuspicionCalls;
    this.capUsd = init.capUsd;
    this.balanceUsd = init.balanceUsd;
    this.statePath = init.statePath ?? null;
    if (this.statePath) mkdirSync(this.statePath.slice(0, this.statePath.lastIndexOf("/")), { recursive: true });
  }

  /** The frozen §5 estimator applied to genuinely remaining required work. */
  conservativeRemaining(): number {
    const passA = this.passABatchesRemaining * this.r.passABatchWorst + this.passAGapRemaining * this.r.passAGapWorst;
    const passB = this.passBTokensRemaining * this.r.passBWorst;
    const verifier = this.verifierReviewRemaining * this.r.verifierSemanticReview + this.conditionSuspicionRemaining * CONDITION_SUSPICION_PER_CALL;
    return (passA + passB + verifier) * SAFETY_FACTOR;
  }

  state(): Record<string, number> {
    return { spent: this.spent, passABatchesRemaining: this.passABatchesRemaining, passAGapRemaining: this.passAGapRemaining, passBTokensRemaining: this.passBTokensRemaining, verifierReviewRemaining: this.verifierReviewRemaining, conditionSuspicionRemaining: this.conditionSuspicionRemaining, conservativeRemaining: this.conservativeRemaining(), capRemaining: this.capUsd - this.spent, balanceRemaining: this.balanceUsd - this.spent };
  }

  /** §7: refuse unless ALL remaining required work fits both the remaining cap and the remaining balance. */
  check(stage: string): number {
    const remaining = this.conservativeRemaining();
    const capLeft = this.capUsd - this.spent;
    const balLeft = this.balanceUsd - this.spent;
    if (this.statePath) appendFileSync(this.statePath, JSON.stringify({ at: new Date().toISOString(), stage, ...this.state() }) + "\n");
    if (remaining > capLeft || remaining > balLeft) {
      const reason = `full remaining mission no longer fits: conservative remaining $${remaining.toFixed(4)} > ${remaining > capLeft ? `cap remaining $${capLeft.toFixed(4)}` : `balance remaining $${balLeft.toFixed(4)}`}`;
      this.refusals.push({ stage, reason, spentUsd: this.spent, conservativeRemainingUsd: remaining, capRemainingUsd: capLeft, balanceRemainingUsd: balLeft, at: new Date().toISOString() });
      throw new BudgetExhaustedError(`PHASE3_601_COST_BOUND_DURING_RUN before ${stage}: ${reason}`);
    }
    return remaining;
  }

  /** Zero-cost admissibility probe: same arithmetic as check(), no throw, no state written. */
  wouldAdmit(): { admitted: boolean; conservativeRemaining: number; capRemaining: number; balanceRemaining: number } {
    const remaining = this.conservativeRemaining();
    return { admitted: remaining <= this.capUsd - this.spent && remaining <= this.balanceUsd - this.spent, conservativeRemaining: remaining, capRemaining: this.capUsd - this.spent, balanceRemaining: this.balanceUsd - this.spent };
  }

  record(stage: string, model: string, inT: number, outT: number, cr: number, cw: number, remainingBefore: number): void {
    const cost = calculateCostUsd(inT + cr + cw, outT, model) ?? 0;
    this.spent += cost;
    this.calls.push({ n: this.calls.length + 1, stage, model, inputTokens: inT, outputTokens: outT, cacheRead: cr, cacheWrite: cw, costUsd: cost, conservativeRemainingBeforeUsd: +remainingBefore.toFixed(4), at: new Date().toISOString() });
    console.log(`  [cost] ${stage}: in=${inT} out=${outT} +$${cost.toFixed(4)} (spent $${this.spent.toFixed(4)} / cap $${this.capUsd.toFixed(2)}; conservative remaining before call $${remainingBefore.toFixed(2)})`);
  }

  costByPrefix(p: string): number { return this.calls.filter((c) => c.stage.startsWith(p)).reduce((a, c) => a + c.costUsd, 0); }
  countByPrefix(p: string): number { return this.calls.filter((c) => c.stage.startsWith(p)).length; }
}

/** Wraps a real StageCaller: guard-check, decrement exactly once, call, ledger. */
export class GuardedStageCaller implements StageCaller {
  providerName: string; model: string; isSynthetic = false;
  constructor(private inner: StageCaller, private label: string, private guard: Guard, private onCall: (stage: string) => void) { this.providerName = inner.providerName; this.model = inner.model; this.isSynthetic = inner.isSynthetic; }
  async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    const tag = `${this.label}:${stage}`;
    const remaining = this.guard.check(tag);
    this.onCall(stage);
    const out = await this.inner.call(schema, stage, systemPrompt, userContent);
    const t = this.inner.lastTelemetry();
    this.guard.record(tag, this.model, t?.inputTokens ?? Math.ceil((systemPrompt.length + userContent.length) / CHARS_PER_TOKEN), t?.outputTokens ?? ASSUMED_OUTPUT_TOKENS, t?.cachedInputTokens ?? 0, t?.cacheCreationInputTokens ?? 0, remaining);
    return out;
  }
  lastTelemetry(): AnalyzerCallTelemetry | null { return this.inner.lastTelemetry(); }
}

/** Wraps the real Anthropic client used by the semantic compiler's tool loop. */
export function guardedCompileClient(real: Anthropic, guard: Guard, onTurn: () => void): MinimalAnthropicClient {
  return { messages: { stream: (params) => {
    const remaining = guard.check("compile:turn");
    onTurn();
    return { finalMessage: async () => {
      const m = await real.messages.stream(params as never).finalMessage();
      const u = m.usage as unknown as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
      guard.record("compile:turn", params.model, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, remaining);
      return m;
    } };
  } } };
}

// ---------------------------------------------------------------------------
// §4 Pass-A prerequisite (HD-2 closure). ONE predicate, imported by both the paid run and its certification.
// ---------------------------------------------------------------------------

export interface PassALike { inventoryStatus: string; items: { length: number } | unknown[] }

/**
 * A pass is USABLE when it actually produced an inventory. §4's stop conditions are: refused by the cost guard,
 * throws, INVENTORY_FAILED, or no usable inventory. INVENTORY_COVERAGE_GAP is NOT a stop condition - it is a
 * successful Pass A that discloses unaccounted source, and HD-2 was exactly the error of treating it as failure.
 */
export function passAUsable(p: PassALike | null | undefined): boolean {
  if (!p) return false;
  if (p.inventoryStatus === "INVENTORY_FAILED") return false;
  const n = Array.isArray(p.items) ? p.items.length : (p.items as { length: number } | undefined)?.length ?? 0;
  return n > 0;
}

/** The whole §4 gate: both passes usable, ensemble built, and the authoritative inventory non-empty. */
export function passAPrerequisiteSatisfied(input: { pass1: PassALike | null | undefined; pass2: PassALike | null | undefined; ensembleBuilt: boolean; authoritativeItemCount: number }): boolean {
  return passAUsable(input.pass1) && passAUsable(input.pass2) && input.ensembleBuilt === true && input.authoritativeItemCount > 0;
}

// ---------------------------------------------------------------------------
// §10 durable persistence (HD-3 closure). ONE helper, used by the paid run and by its zero-cost certification.
// ---------------------------------------------------------------------------
import { closeSync, existsSync, fsyncSync, mkdirSync as mkdirSyncP, openSync, readFileSync as readFileSyncP, writeFileSync as writeFileSyncP } from "node:fs";
import { createHash as createHashP } from "node:crypto";

const sha256P = (s: string) => createHashP("sha256").update(s).digest("hex");

/** Write JSON, fsync the file, close. Returns the sha256 of the exact bytes written. */
export function writeJsonDurable(path: string, data: unknown): string {
  mkdirSyncP(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const text = JSON.stringify(data, null, 1);
  writeFileSyncP(path, text);
  const fd = openSync(path, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  return sha256P(text);
}

export interface PersistProof<T> { path: string; existsAfterWrite: boolean; writtenSha256: string; readSha256: string; hashEqual: boolean; structurallyEqual: boolean; reloaded: T }

/**
 * Persist, then prove the persisted bytes are a complete substitute for the in-memory object: file exists, the bytes
 * read back hash to the bytes written, and the reloaded object is structurally identical to the JSON projection of
 * the original. Callers MUST use `reloaded`, never the original, for anything downstream (§11).
 */
export function persistAndReload<T>(path: string, obj: T): PersistProof<T> {
  const writtenSha256 = writeJsonDurable(path, obj);
  const existsAfterWrite = existsSync(path);
  const raw = readFileSyncP(path, "utf8");
  const readSha256 = sha256P(raw);
  const reloaded = JSON.parse(raw) as T;
  const structurallyEqual = JSON.stringify(reloaded) === JSON.stringify(JSON.parse(JSON.stringify(obj)));
  return { path, existsAfterWrite, writtenSha256, readSha256, hashEqual: writtenSha256 === readSha256, structurallyEqual, reloaded };
}
