/**
 * PHASE 3 FINAL-BRIDGE / 6.01 - HD-4 DURABLE PASS-A CALL REPLAY (harness-level; zero production semantic changes).
 *
 * HD-4: a successful paid StageCaller call made during Pass A was not durable until runDualPassSemanticInventory
 * returned, so the worker restart at 5bd15c2 destroyed 11 completed, paid calls. Closure invariant:
 *
 *   AFTER EVERY SUCCESSFUL MODEL CALL a validated, replayable record is durably written (temp -> fsync -> atomic
 *   rename -> fsync dir -> read-back hash check) BEFORE control returns to the production caller. On restart the
 *   IDENTICAL call (exact deterministic request identity) is served from that record with provider calls = 0 and new
 *   spend = $0. A call admitted but not persisted at interruption is NOT reusable and executes again.
 *
 * Ordering per call: cost/admission guard (the wrapped inner caller) -> provider -> schema validation (inner) ->
 * durable atomic persistence -> durability barrier -> ONLY THEN return. Provider success + persistence failure = STOP
 * (DurablePersistenceError); nothing downstream sees the result.
 *
 * Replay identity is EXACT: mission, pass, stage, provider, model, explicit schema id + structural schema fingerprint,
 * system-prompt hash, user-content hash, source document, candidate, source-context hash, algorithm and prompt
 * versions. Never by ordinal, section name, batch number or candidateRef alone. Any component change -> MISS ->
 * executes normally. A record that exists for the exact key but fails validation (truncated, hash mismatch, wrong
 * identity, schema rejection) FAILS CLOSED (DurableReplayRecordInvalidError) - pre-registered: it is never a miss,
 * because a corrupt record for the exact key means tampering or a harness bug, not a legitimate cache miss.
 *
 * The replay-authoritative object is the exact validated parsed StageCaller result the production caller consumed.
 * No second parser exists. On replay the stored payload is re-validated with the CURRENT expected Zod schema.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import type { ShardExecutor } from "../lib/contract-model/compiler/semantic/shard-execution";
import { REUSABLE_TERMINAL_SHARD_STATUSES } from "../lib/contract-model/compiler/semantic/shard-execution";
import type { ShardExecutionResult, ShardPlan } from "../lib/contract-model/compiler/semantic/shard-types";

export const DURABLE_CALL_RECORD_VERSION = "hd4-durable-call-record.v1";
export const DURABLE_REPLAY_ALGORITHM_VERSION = "hd4-durable-replay.v1";
export const DURABLE_SHARD_RECORD_VERSION = "hd4-durable-shard-record.v1";

/** Harness-level explicit schema ids for every StageCaller stage the paid run makes. An unmapped stage is refused. */
export const PASS_A_SCHEMA_IDS: Readonly<Record<string, string>> = { semantic_inventory: "semantic-accountability/wire-schema#SubmitSemanticInventorySchema", semantic_inventory_gap: "semantic-accountability/wire-schema#SubmitSemanticInventorySchema" };
export const VERIFIER_SCHEMA_IDS: Readonly<Record<string, string>> = { semantic_verification: "semantic-verification/wire-schema#SubmitVerificationFindingsSchema", condition_suspicion_classification: "semantic-verification/wire-schema#SubmitConditionSuspicionSchema" };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Deterministic JSON: keys sorted at every level. */
export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown => Array.isArray(x) ? x.map(norm) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])])) : x;
  return JSON.stringify(norm(v));
}
/** Structural fingerprint of a Zod schema (its JSON-Schema projection) - never JS object identity. */
export function schemaFingerprint(schema: ZodType): string {
  return sha256(canonicalJson(z.toJSONSchema(schema as never, { unrepresentable: "any" })));
}

export class DurablePersistenceError extends Error { constructor(msg: string) { super(msg); this.name = "DurablePersistenceError"; } }
export class DurableReplayRecordInvalidError extends Error { constructor(public reason: string, public path: string) { super(`durable replay record INVALID (fail closed): ${reason} [${path}]`); this.name = "DurableReplayRecordInvalidError"; } }
export class UnmappedStageError extends Error { constructor(stage: string) { super(`no explicit schema id is mapped for stage "${stage}" - refusing to persist or replay an unidentified schema`); this.name = "UnmappedStageError"; } }

// ---------------------------------------------------------------------------
// Atomic durable file primitives
// ---------------------------------------------------------------------------
function fsyncDir(dir: string): void {
  try { const fd = openSync(dir, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } } catch { /* directory fsync unsupported on this FS - file fsync + rename still hold */ }
}
/** temp write -> fsync -> atomic rename -> fsync parent dir -> read back -> sha256 must equal what was written. */
export function writeAtomicDurable(path: string, text: string): string {
  const dir = path.slice(0, path.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const expect = sha256(text);
  try {
    const fd = openSync(tmp, "w");
    try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, path);
    fsyncDir(dir);
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    throw new DurablePersistenceError(`atomic write failed for ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const back = sha256(readFileSync(path, "utf8"));
  if (back !== expect) throw new DurablePersistenceError(`read-back hash mismatch for ${path}: wrote ${expect.slice(0, 16)} read ${back.slice(0, 16)}`);
  return expect;
}

// ---------------------------------------------------------------------------
// Call identity + record
// ---------------------------------------------------------------------------
export interface DurableCallScope {
  missionId: string;
  passId: string;
  sourceDocumentId: string;
  candidateRef: string;
  sourceContextHash: string;
  algorithmVersion: string;
  promptVersion: string;
}
export interface DurableCallIdentity extends DurableCallScope {
  recordVersion: string;
  replayAlgorithmVersion: string;
  stage: string;
  provider: string;
  model: string;
  schemaId: string;
  schemaFingerprint: string;
  systemPromptSha256: string;
  userContentSha256: string;
}
export const REQUEST_IDENTITY_FIELDS: readonly (keyof DurableCallIdentity)[] = ["recordVersion", "replayAlgorithmVersion", "missionId", "passId", "stage", "provider", "model", "schemaId", "schemaFingerprint", "systemPromptSha256", "userContentSha256", "sourceDocumentId", "candidateRef", "sourceContextHash", "algorithmVersion", "promptVersion"];
export function computeRequestHash(identity: DurableCallIdentity): string {
  const picked: Record<string, string> = {};
  for (const k of REQUEST_IDENTITY_FIELDS) picked[k] = identity[k];
  return sha256(canonicalJson(picked));
}
export interface DurableCallTelemetry { inputTokens: number | null; outputTokens: number | null; cacheRead: number | null; cacheWrite: number | null; originalCostUsd: number | null; latencyMs: number | null }
export interface DurableCallRecord {
  identity: DurableCallIdentity;
  requestHash: string;
  /** n-th occurrence (0-based) of this exact request hash within the pass - two byte-identical logical calls stay two records. */
  occurrence: number;
  /** Informational only (never a replay key): the position of the call in the pass's call sequence. */
  callOrdinal: number;
  /** Informational: batch identity is bound through userContentSha256 (the batch's exact rendered text); the harness cannot see the planner's batch index. */
  batchRef: string | null;
  payload: unknown;
  payloadSha256: string;
  telemetry: DurableCallTelemetry;
  /** The production caller's own telemetry object, stored verbatim so replay returns the same lastTelemetry() the live call did. */
  stageTelemetry: AnalyzerCallTelemetry | null;
  rawProviderOutput: string | null;
  completedAt: string;
  recordSha256: string;
}
export function recordHash(rec: Omit<DurableCallRecord, "recordSha256">): string { return sha256(canonicalJson(rec)); }

export type LoadOutcome = { status: "MISS" } | { status: "PRESENT"; raw: string; path: string };
export type ValidationOutcome = { ok: true; record: DurableCallRecord; payload: unknown } | { ok: false; reason: string };

export class DurableCallStore {
  constructor(public readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  pathFor(requestHash: string, occurrence: number): string { return `${this.dir}/${requestHash}-${occurrence}.json`; }
  load(requestHash: string, occurrence: number): LoadOutcome {
    const path = this.pathFor(requestHash, occurrence);
    if (!existsSync(path)) return { status: "MISS" };
    return { status: "PRESENT", raw: readFileSync(path, "utf8"), path };
  }
  write(rec: DurableCallRecord): string { return writeAtomicDurable(this.pathFor(rec.requestHash, rec.occurrence), JSON.stringify(rec, null, 1)); }
  list(): string[] { return existsSync(this.dir) ? readdirSync(this.dir).filter((f) => f.endsWith(".json")).sort() : []; }
  appendOriginLog(entry: DurableCallLogEntry): void { appendFileSync(`${this.dir}/origin-log.ndjson`, JSON.stringify(entry) + "\n"); }
}

/** Full replay validation: parse, version, record hash, identity equality, request hash, payload hash, CURRENT schema. */
export function validateDurableRecord(raw: string, expected: DurableCallIdentity, requestHash: string, occurrence: number, schema: ZodType): ValidationOutcome {
  let rec: DurableCallRecord;
  try { rec = JSON.parse(raw) as DurableCallRecord; } catch (e) { return { ok: false, reason: `unparseable JSON (truncated or corrupt): ${e instanceof Error ? e.message : String(e)}` }; }
  if (!rec || typeof rec !== "object" || !rec.identity) return { ok: false, reason: "not a record object" };
  if (rec.identity.recordVersion !== DURABLE_CALL_RECORD_VERSION) return { ok: false, reason: `record version ${rec.identity.recordVersion} != ${DURABLE_CALL_RECORD_VERSION}` };
  const { recordSha256, ...body } = rec;
  if (recordHash(body) !== recordSha256) return { ok: false, reason: "record hash mismatch" };
  for (const k of REQUEST_IDENTITY_FIELDS) if (rec.identity[k] !== expected[k]) return { ok: false, reason: `identity mismatch on ${k}: stored ${String(rec.identity[k]).slice(0, 24)} expected ${String(expected[k]).slice(0, 24)}` };
  if (rec.requestHash !== requestHash || computeRequestHash(rec.identity) !== requestHash) return { ok: false, reason: "request hash mismatch" };
  if (rec.occurrence !== occurrence) return { ok: false, reason: `occurrence mismatch ${rec.occurrence} != ${occurrence}` };
  if (sha256(canonicalJson(rec.payload)) !== rec.payloadSha256) return { ok: false, reason: "payload hash mismatch" };
  const parsed = schema.safeParse(rec.payload);
  if (!parsed.success) return { ok: false, reason: `stored payload rejected by the current schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  return { ok: true, record: rec, payload: parsed.data };
}

// ---------------------------------------------------------------------------
// The caller
// ---------------------------------------------------------------------------
export type CallOrigin = "LIVE_PROVIDER" | "DURABLE_REPLAY";
export interface DurableCallLogEntry {
  origin: CallOrigin; passId: string; stage: string; requestHash: string; occurrence: number; callOrdinal: number; at: string;
  originalCompletedAt: string; originalCostUsd: number | null; newCostUsd: number; providerCallsAvoided: 0 | 1; recordPath: string;
}
export interface DurableReplayHooks {
  /** Fired after a valid replay is served (guard: decrement remaining logical work, charge $0). */
  onReplay?: (entry: DurableCallLogEntry, record: DurableCallRecord) => void;
  /** Fired after a live call is persisted (the inner guarded caller has already charged it). */
  onLive?: (entry: DurableCallLogEntry, record: DurableCallRecord) => void;
}
export interface DurableCallSummary { logicalCalls: number; liveCalls: number; replayedCalls: number; liveCostUsd: number; historicalReplayedCostUsd: number; providerCallsAvoided: number }

export class DurableReplayStageCaller implements StageCaller {
  providerName: string; model: string; isSynthetic: boolean;
  log: DurableCallLogEntry[] = [];
  private occurrences = new Map<string, number>();
  private ordinal = 0;
  private last: AnalyzerCallTelemetry | null = null;
  constructor(private inner: StageCaller, public readonly store: DurableCallStore, public readonly scope: DurableCallScope, private schemaIds: Readonly<Record<string, string>>, private hooks: DurableReplayHooks = {}, private rawOutputOf: (() => string | null) | null = null) {
    this.providerName = inner.providerName; this.model = inner.model; this.isSynthetic = inner.isSynthetic;
  }
  identityFor(schema: ZodType, stage: string, systemPrompt: string, userContent: string): DurableCallIdentity {
    const schemaId = this.schemaIds[stage];
    if (!schemaId) throw new UnmappedStageError(stage);
    return { recordVersion: DURABLE_CALL_RECORD_VERSION, replayAlgorithmVersion: DURABLE_REPLAY_ALGORITHM_VERSION, ...this.scope, stage, provider: this.providerName, model: this.model, schemaId, schemaFingerprint: schemaFingerprint(schema), systemPromptSha256: sha256(systemPrompt), userContentSha256: sha256(userContent) };
  }
  async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string, options?: import("../lib/contract-model/compiler/llm-caller").StageCallOptions): Promise<T> {
    const identity = this.identityFor(schema, stage, systemPrompt, userContent);
    const requestHash = computeRequestHash(identity);
    const occurrence = this.occurrences.get(requestHash) ?? 0;
    this.occurrences.set(requestHash, occurrence + 1);
    const callOrdinal = this.ordinal++;
    const loaded = this.store.load(requestHash, occurrence);
    if (loaded.status === "PRESENT") {
      const v = validateDurableRecord(loaded.raw, identity, requestHash, occurrence, schema);
      if (!v.ok) throw new DurableReplayRecordInvalidError(v.reason, loaded.path);
      this.last = v.record.stageTelemetry;
      const entry: DurableCallLogEntry = { origin: "DURABLE_REPLAY", passId: this.scope.passId, stage, requestHash, occurrence, callOrdinal, at: new Date().toISOString(), originalCompletedAt: v.record.completedAt, originalCostUsd: v.record.telemetry.originalCostUsd, newCostUsd: 0, providerCallsAvoided: 1, recordPath: loaded.path };
      this.log.push(entry); this.store.appendOriginLog(entry);
      this.hooks.onReplay?.(entry, v.record);
      return v.payload as T;
    }
    // MISS -> live: admission + provider + schema validation all happen inside the (guarded) inner caller.
    const out = await this.inner.call(schema, stage, systemPrompt, userContent, options);
    const t = this.inner.lastTelemetry();
    const body: Omit<DurableCallRecord, "recordSha256"> = {
      identity, requestHash, occurrence, callOrdinal, batchRef: null,
      payload: JSON.parse(JSON.stringify(out)), payloadSha256: sha256(canonicalJson(JSON.parse(JSON.stringify(out)))),
      telemetry: { inputTokens: t?.inputTokens ?? null, outputTokens: t?.outputTokens ?? null, cacheRead: t?.cachedInputTokens ?? null, cacheWrite: t?.cacheCreationInputTokens ?? null, originalCostUsd: t?.calculatedCostUsd ?? null, latencyMs: t?.latencyMs ?? null },
      stageTelemetry: t, rawProviderOutput: this.rawOutputOf?.() ?? null, completedAt: new Date().toISOString(),
    };
    const rec: DurableCallRecord = { ...body, recordSha256: recordHash(body) };
    this.store.write(rec); // throws DurablePersistenceError -> the call is NOT safely completed; nothing downstream sees it
    this.last = t;
    const entry: DurableCallLogEntry = { origin: "LIVE_PROVIDER", passId: this.scope.passId, stage, requestHash, occurrence, callOrdinal, at: rec.completedAt, originalCompletedAt: rec.completedAt, originalCostUsd: rec.telemetry.originalCostUsd, newCostUsd: rec.telemetry.originalCostUsd ?? 0, providerCallsAvoided: 0, recordPath: this.store.pathFor(requestHash, occurrence) };
    this.log.push(entry); this.store.appendOriginLog(entry);
    this.hooks.onLive?.(entry, rec);
    return out;
  }
  lastTelemetry(): AnalyzerCallTelemetry | null { return this.last; }
  summary(): DurableCallSummary { return summarize(this.log); }
}
export function summarize(log: DurableCallLogEntry[]): DurableCallSummary {
  const live = log.filter((e) => e.origin === "LIVE_PROVIDER"), rep = log.filter((e) => e.origin === "DURABLE_REPLAY");
  return { logicalCalls: log.length, liveCalls: live.length, replayedCalls: rep.length, liveCostUsd: +live.reduce((a, e) => a + (e.newCostUsd ?? 0), 0).toFixed(6), historicalReplayedCostUsd: +rep.reduce((a, e) => a + (e.originalCostUsd ?? 0), 0).toFixed(6), providerCallsAvoided: rep.length };
}

// ---------------------------------------------------------------------------
// Pass B: terminal shard result durability on the existing priorShardResults / shardHash contract (mission §16)
// ---------------------------------------------------------------------------
export interface DurableShardRecord { version: string; missionId: string; planHash: string; shardId: string; shardHash: string; result: ShardExecutionResult; resultSha256: string; completedAt: string; recordSha256: string }
export class DurableShardStore {
  constructor(public readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  pathFor(shardHash: string): string { return `${this.dir}/${shardHash}.json`; }
  write(rec: DurableShardRecord): string { return writeAtomicDurable(this.pathFor(rec.shardHash), JSON.stringify(rec, null, 1)); }
  /** Only records whose shardHash is in THIS plan, whose hashes verify, and whose status is reusable are loaded. */
  loadPriorResults(plan: ShardPlan, missionId: string): { prior: Map<string, ShardExecutionResult>; rejected: { path: string; reason: string }[] } {
    const prior = new Map<string, ShardExecutionResult>(); const rejected: { path: string; reason: string }[] = [];
    for (const s of plan.shards) {
      const path = this.pathFor(s.shardHash);
      if (!existsSync(path)) continue;
      let rec: DurableShardRecord;
      try { rec = JSON.parse(readFileSync(path, "utf8")) as DurableShardRecord; } catch (e) { rejected.push({ path, reason: `unparseable: ${e instanceof Error ? e.message : String(e)}` }); continue; }
      const { recordSha256, ...body } = rec;
      if (rec.version !== DURABLE_SHARD_RECORD_VERSION) { rejected.push({ path, reason: `version ${rec.version}` }); continue; }
      if (recordHash(body as never) !== recordSha256) { rejected.push({ path, reason: "record hash mismatch" }); continue; }
      if (sha256(canonicalJson(rec.result)) !== rec.resultSha256) { rejected.push({ path, reason: "result hash mismatch" }); continue; }
      if (rec.missionId !== missionId || rec.planHash !== plan.planHash || rec.shardHash !== s.shardHash || rec.result.shardHash !== s.shardHash) { rejected.push({ path, reason: "identity mismatch (mission/plan/shard)" }); continue; }
      if (!REUSABLE_TERMINAL_SHARD_STATUSES.includes(rec.result.status)) { rejected.push({ path, reason: `status ${rec.result.status} not reusable` }); continue; }
      prior.set(s.shardHash, rec.result);
    }
    return { prior, rejected };
  }
}
/** Wraps the PRODUCTION shard executor: identical semantics; every terminal reusable outcome is durably written before it is returned. */
export function durableShardExecutor(inner: ShardExecutor, store: DurableShardStore, plan: ShardPlan, missionId: string, onPersisted?: (rec: DurableShardRecord) => void): ShardExecutor {
  return async (shard, attempt) => {
    const out = await inner(shard, attempt);
    if (REUSABLE_TERMINAL_SHARD_STATUSES.includes(out.status)) {
      const result: ShardExecutionResult = { ...out, shardId: shard.shardId, shardHash: shard.shardHash, reusedFromHash: false, attempts: attempt };
      const body = { version: DURABLE_SHARD_RECORD_VERSION, missionId, planHash: plan.planHash, shardId: shard.shardId, shardHash: shard.shardHash, result: JSON.parse(JSON.stringify(result)) as ShardExecutionResult, resultSha256: sha256(canonicalJson(JSON.parse(JSON.stringify(result)))), completedAt: new Date().toISOString() };
      const rec: DurableShardRecord = { ...body, recordSha256: recordHash(body as never) };
      store.write(rec);
      onPersisted?.(rec);
    }
    return out;
  };
}
