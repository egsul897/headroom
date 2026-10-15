/**
 * Benchmark integrity for the CLF scoreboard gate (deterministic, no I/O except via callbacks).
 *
 * 1. Frozen membership: HELDOUT sources are frozen by sourceId + source hash (contentSha256) and
 *    issuer (CIK + normalized ticker). Moving a frozen HELDOUT source to DEV, dropping it (absent or
 *    turned into a duplicate), changing its source hash or its issuer FAILS unless a committed
 *    benchmark migration record names that source, the change, a reason and an approver.
 * 2. Comparability: every comparison is bound to the same input snapshot identity, per-source input
 *    hashes and ruleset identity (version + content hash). Anything else is refused
 *    (IncomparableEvaluationError) instead of being scored as "better" or "worse".
 * 3. Append-only baseline history: every baseline ever accepted is kept as an immutable file whose
 *    sha256 is recorded in a hash-chained history; baseline.json must equal the latest entry.
 *    Thresholds live in the history; changing them, or accepting a baseline with more HELDOUT errors
 *    or more HELDOUT UNSUPPORTED_SEMANTICS than the previous identity-bound entry, requires an explicit
 *    migration record ({ reason, approver }) on that entry.
 * 4. Regression rules beyond the aggregate: see GateThresholds.
 *
 * No AI / LLM calls. No per-issuer logic.
 */

import { createHash } from "node:crypto";
import type { LearnedRuleSet } from "../learned-rules/types";

type Split = "DEV" | "HELDOUT";

/** Stable JSON: object keys sorted, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");

/** Hash of everything the scorer reads for one source (source row, document text, candidates, ...). */
export function sourceInputSha256(input: unknown): string {
  return sha256(canonicalJson(input));
}

export interface RulesetIdentity {
  rulesetVersion: number;
  rulesetSha256: string;
}

export function rulesetIdentity(rules: LearnedRuleSet): RulesetIdentity {
  return { rulesetVersion: rules.rulesetVersion, rulesetSha256: sha256(canonicalJson(rules)) };
}

export interface EvaluationIdentity extends RulesetIdentity {
  /** sha256 over the sorted (sourceId, inputSha256) list: the input snapshot identity. */
  snapshotSha256: string;
  /** sourceId → per-source input sha256. */
  sourceHashes: Record<string, string>;
  /** Scorer configuration that changes results (e.g. section-tree mode); compared verbatim. */
  scorerConfig?: string | null;
}

export function evaluationIdentity(
  perSource: { sourceId: string; inputSha256?: string | null }[],
  ruleset: RulesetIdentity,
  scorerConfig: string | null = null,
): EvaluationIdentity | null {
  if (perSource.some((s) => !s.inputSha256)) return null; // e.g. resumed rows without input hashes
  const pairs = perSource.map((s) => [s.sourceId, s.inputSha256 as string] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    rulesetVersion: ruleset.rulesetVersion,
    rulesetSha256: ruleset.rulesetSha256,
    snapshotSha256: snapshotIdentitySha256(pairs),
    sourceHashes: Object.fromEntries(pairs),
    ...(scorerConfig ? { scorerConfig } : {}),
  };
}

export class IncomparableEvaluationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`incomparable evaluations (refusing to compare): ${problems.join("; ")}`);
    this.name = "IncomparableEvaluationError";
  }
}

/** Throws IncomparableEvaluationError unless both sides carry the same snapshot, source hashes and ruleset. */
export function assertComparable(
  baseline: { identity?: EvaluationIdentity | null },
  current: { identity?: EvaluationIdentity | null },
): void {
  const problems: string[] = [];
  const b = baseline.identity;
  const c = current.identity;
  if (!b) problems.push("baseline has no evaluation identity (snapshot / source hashes / ruleset)");
  if (!c) problems.push("current run has no evaluation identity (snapshot / source hashes / ruleset)");
  if (b && c) {
    if (b.rulesetVersion !== c.rulesetVersion) problems.push(`ruleset version ${b.rulesetVersion} ≠ ${c.rulesetVersion}`);
    if (b.rulesetSha256 !== c.rulesetSha256) problems.push(`ruleset hash ${b.rulesetSha256.slice(0, 12)} ≠ ${c.rulesetSha256.slice(0, 12)}`);
    if ((b.scorerConfig ?? null) !== (c.scorerConfig ?? null)) problems.push(`scorer config ${b.scorerConfig ?? "default"} ≠ ${c.scorerConfig ?? "default"}`);
    if (b.snapshotSha256 !== c.snapshotSha256) problems.push(`input snapshot ${b.snapshotSha256.slice(0, 12)} ≠ ${c.snapshotSha256.slice(0, 12)}`);
    const ids = [...new Set([...Object.keys(b.sourceHashes ?? {}), ...Object.keys(c.sourceHashes ?? {})])].sort();
    const diff = ids.filter((id) => (b.sourceHashes ?? {})[id] !== (c.sourceHashes ?? {})[id]);
    if (diff.length) problems.push(`${diff.length} source input hash(es) differ (e.g. ${diff.slice(0, 3).join(", ")})`);
  }
  if (problems.length) throw new IncomparableEvaluationError(problems);
}

// ---------------------------------------------------------------- thresholds

/**
 * Acceptance thresholds (recorded in the baseline history; change only via a recorded migration).
 *  - heldoutTotalMaxIncrease: allowed rise in aggregate HELDOUT errors (0).
 *  - heldoutUnsupportedMaxIncrease: allowed rise in aggregate HELDOUT UNSUPPORTED_SEMANTICS (0).
 *    Additionally ANY single HELDOUT source whose UNSUPPORTED_SEMANTICS rises fails.
 *  - Material per-source regression: a HELDOUT source whose total rises by
 *    ≥ max(perSourceMaterialAbs, ceil(perSourceMaterialRel × before)) fails, even when aggregate
 *    errors go down. Defaults: 2 and 0.10 (0→2 fails, 0→1 passes, 50→55 fails, 50→54 passes).
 */
export interface GateThresholds {
  heldoutTotalMaxIncrease: number;
  heldoutUnsupportedMaxIncrease: number;
  perSourceMaterialAbs: number;
  perSourceMaterialRel: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  heldoutTotalMaxIncrease: 0,
  heldoutUnsupportedMaxIncrease: 0,
  perSourceMaterialAbs: 2,
  perSourceMaterialRel: 0.1,
};

export function materialRegressionLimit(before: number, t: GateThresholds): number {
  return Math.max(t.perSourceMaterialAbs, Math.ceil(t.perSourceMaterialRel * before));
}

// ---------------------------------------------------------------- frozen membership

export interface FrozenMember {
  sourceId: string;
  contentSha256: string | null;
  issuerCik: string | null;
  ticker: string | null;
}

export interface BenchmarkMembership {
  schema: "clf-scoreboard-membership/v1";
  description?: string;
  frozenAt: string;
  heldout: FrozenMember[];
}

export type MigrationChange = "HELDOUT_TO_DEV" | "DROP_HELDOUT" | "SOURCE_HASH_CHANGE" | "ISSUER_CHANGE";

export interface BenchmarkMigration {
  id: string;
  date: string;
  change: MigrationChange;
  sourceIds: string[];
  reason: string;
  approver: string;
}

export interface MembershipSourceView {
  sourceId: string;
  split: Split;
  duplicateOf?: string | null;
  contentSha256?: string | null;
  issuerCik?: string | null;
  ticker?: string | null;
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const normCik = (cik: string | null | undefined) => {
  const d = (cik ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length ? d : null;
};
const normTicker = (t: string | null | undefined) => (t ? t.toUpperCase().replace(/_(?:ALT|SEL)$/, "") : null);

export function validateMigrations(migrations: BenchmarkMigration[]): string[] {
  const reasons: string[] = [];
  const kinds: MigrationChange[] = ["HELDOUT_TO_DEV", "DROP_HELDOUT", "SOURCE_HASH_CHANGE", "ISSUER_CHANGE"];
  for (const [i, m] of migrations.entries()) {
    const bad: string[] = [];
    if (!nonEmpty(m.id)) bad.push("id");
    if (!nonEmpty(m.date)) bad.push("date");
    if (!kinds.includes(m.change)) bad.push("change");
    if (!Array.isArray(m.sourceIds) || m.sourceIds.length === 0 || !m.sourceIds.every(nonEmpty)) bad.push("sourceIds");
    if (!nonEmpty(m.reason)) bad.push("reason");
    if (!nonEmpty(m.approver)) bad.push("approver");
    if (bad.length) reasons.push(`benchmark migration #${i} (${m.id ?? "?"}) is invalid: missing/invalid ${bad.join(", ")}`);
  }
  return reasons;
}

/** Frozen HELDOUT membership check. Returns failure reasons (empty = membership intact). */
export function checkMembership(
  membership: Pick<BenchmarkMembership, "heldout">,
  current: MembershipSourceView[],
  migrations: BenchmarkMigration[] = [],
): string[] {
  const reasons = validateMigrations(migrations);
  const valid = migrations.filter((m) => validateMigrations([m]).length === 0);
  const authorized = (id: string, change: MigrationChange) => valid.some((m) => m.change === change && m.sourceIds.includes(id));
  const byId = new Map(current.map((s) => [s.sourceId, s]));
  const fail = (id: string, change: MigrationChange, what: string) => {
    if (!authorized(id, change)) reasons.push(`frozen HELDOUT ${id}: ${what} without an authorized ${change} benchmark migration`);
  };
  for (const m of membership.heldout) {
    const cur = byId.get(m.sourceId);
    if (!cur) {
      fail(m.sourceId, "DROP_HELDOUT", "dropped (absent from run)");
      continue;
    }
    if (cur.split !== "HELDOUT") fail(m.sourceId, "HELDOUT_TO_DEV", `moved HELDOUT → ${cur.split}`);
    if (cur.duplicateOf) fail(m.sourceId, "DROP_HELDOUT", `dropped (re-marked duplicate of ${cur.duplicateOf})`);
    if ((cur.contentSha256 ?? null) !== (m.contentSha256 ?? null)) fail(m.sourceId, "SOURCE_HASH_CHANGE", "source hash changed");
    if (normCik(cur.issuerCik) !== normCik(m.issuerCik) || normTicker(cur.ticker) !== normTicker(m.ticker)) {
      fail(m.sourceId, "ISSUER_CHANGE", "issuer (CIK/ticker) changed");
    }
  }
  return reasons;
}

/** Membership derived from a report (used when freezing, and as a fallback when no membership file is given). */
export function membershipFromReport(perSource: MembershipSourceView[], frozenAt: string): BenchmarkMembership {
  return {
    schema: "clf-scoreboard-membership/v1",
    frozenAt,
    heldout: perSource
      .filter((s) => s.split === "HELDOUT" && !s.duplicateOf)
      .map((s) => ({ sourceId: s.sourceId, contentSha256: s.contentSha256 ?? null, issuerCik: s.issuerCik ?? null, ticker: s.ticker ?? null }))
      .sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)),
  };
}

// ---------------------------------------------------------------- append-only baseline history

export interface RecordedMigration {
  reason: string;
  approver: string;
}

export interface BaselineHistoryEntry {
  seq: number;
  recordedAt: string;
  /** Repo-relative path of the immutable baseline report file. */
  file: string;
  reportSha256: string;
  prevEntrySha256: string | null;
  /** Commit the baseline was originally committed in (legacy entries). */
  sourceCommit?: string;
  /** Legacy = recorded before evaluation identities existed; never compared, kept as evidence. */
  legacy: boolean;
  identity: { rulesetVersion: number; rulesetSha256: string; snapshotSha256: string } | null;
  heldout: { sources: number; total: number; UNSUPPORTED_SEMANTICS: number };
  thresholds: GateThresholds;
  reason: string;
  approver: string;
  /** Required when thresholds change, or HELDOUT total / UNSUPPORTED_SEMANTICS rise vs the previous identity-bound entry. */
  thresholdMigration?: RecordedMigration;
  /** Set on entries scored with the reference-relabel overlay (--relabels). Such entries form their own track:
   *  thresholds, raise checks and "latest" are per track, so the default gate keeps using the latest default entry. */
  relabels?: { logFile: string; entries: number; logSha256: string; scorerConfig: string };
}

/** Which baseline track a gate uses: "default" (no relabels) or "relabels" (scored with --relabels). */
export type BaselineTrack = "default" | "relabels";
export const trackOf = (e: Pick<BaselineHistoryEntry, "relabels">): BaselineTrack => (e.relabels ? "relabels" : "default");

export interface BaselineHistory {
  schema: "clf-scoreboard-baseline-history/v1";
  entries: BaselineHistoryEntry[];
}

export const historyEntrySha256 = (e: BaselineHistoryEntry) => sha256(canonicalJson(e));

export interface HistoryCheck {
  reasons: string[];
  thresholds: GateThresholds;
  latest: BaselineHistoryEntry | null;
}

/**
 * Verify the append-only history. `readFile(rel)` returns file bytes or null.
 * `baselineText` is the baseline actually used for the gate: it must be byte-identical to the latest entry.
 * `baseHistory` (e.g. the base branch's history) must be an unchanged prefix of `history`.
 */
export function verifyHistory(
  history: BaselineHistory,
  readFile: (rel: string) => string | Buffer | null,
  opts: { baselineText?: string | Buffer; baseHistory?: BaselineHistory | null; track?: BaselineTrack } = {},
): HistoryCheck {
  const track = opts.track ?? "default";
  const reasons: string[] = [];
  const entries = history?.entries ?? [];
  if (history?.schema !== "clf-scoreboard-baseline-history/v1") reasons.push("baseline history: unsupported schema");
  if (entries.length === 0) reasons.push("baseline history is empty");
  const prevBoundByTrack: Record<BaselineTrack, BaselineHistoryEntry | null> = { default: null, relabels: null };
  const prevByTrack: Record<BaselineTrack, BaselineHistoryEntry | null> = { default: null, relabels: null };
  for (const [i, e] of entries.entries()) {
    const prevBound = prevBoundByTrack[trackOf(e)];
    const tag = `history entry seq=${e.seq}`;
    if (e.seq !== i + 1) reasons.push(`${tag}: seq must be ${i + 1} (append-only, contiguous)`);
    const expectPrev = i === 0 ? null : historyEntrySha256(entries[i - 1]!);
    if (e.prevEntrySha256 !== expectPrev) reasons.push(`${tag}: hash chain broken (an earlier entry was edited or removed)`);
    const bytes = readFile(e.file);
    if (bytes === null) reasons.push(`${tag}: baseline file ${e.file} is missing (history must be preserved)`);
    else if (sha256(bytes) !== e.reportSha256) reasons.push(`${tag}: baseline file ${e.file} was modified (sha256 mismatch)`);
    if (!nonEmpty(e.reason) || !nonEmpty(e.approver)) reasons.push(`${tag}: reason and approver are required`);
    if (e.relabels && (!nonEmpty(e.relabels.logSha256) || !nonEmpty(e.relabels.scorerConfig))) reasons.push(`${tag}: relabels entry without log sha / scorer config`);
    // The first entry of a track compares thresholds with the previous entry overall; later ones within the track.
    const prev = prevByTrack[trackOf(e)] ?? (i > 0 ? entries[i - 1]! : null);
    if (prev) {
      const changed = canonicalJson(prev.thresholds) !== canonicalJson(e.thresholds);
      const mig = e.thresholdMigration;
      const recorded = Boolean(mig && nonEmpty(mig.reason) && nonEmpty(mig.approver));
      if (changed && !recorded) reasons.push(`${tag}: acceptance thresholds changed without a recorded thresholdMigration`);
      if (!e.legacy && prevBound && !recorded) {
        if (e.heldout.total > prevBound.heldout.total) {
          reasons.push(`${tag}: HELDOUT baseline raised ${prevBound.heldout.total} → ${e.heldout.total} without a recorded thresholdMigration`);
        }
        if (e.heldout.UNSUPPORTED_SEMANTICS > prevBound.heldout.UNSUPPORTED_SEMANTICS) {
          reasons.push(
            `${tag}: HELDOUT UNSUPPORTED_SEMANTICS baseline raised ${prevBound.heldout.UNSUPPORTED_SEMANTICS} → ${e.heldout.UNSUPPORTED_SEMANTICS} without a recorded thresholdMigration`,
          );
        }
      }
    }
    if (!e.legacy && !e.identity) reasons.push(`${tag}: non-legacy entry without evaluation identity`);
    if (!e.legacy) prevBoundByTrack[trackOf(e)] = e;
    prevByTrack[trackOf(e)] = e;
  }
  if (opts.baseHistory) {
    const base = opts.baseHistory.entries ?? [];
    if (entries.length < base.length) reasons.push(`baseline history shrank (${base.length} → ${entries.length} entries)`);
    for (let i = 0; i < Math.min(base.length, entries.length); i++) {
      if (canonicalJson(base[i]) !== canonicalJson(entries[i])) reasons.push(`baseline history entry seq=${i + 1} differs from the base branch (rewritten)`);
    }
  }
  const latest = prevByTrack[track];
  if (!latest) reasons.push(`baseline history has no ${track} entry`);
  if (latest && opts.baselineText !== undefined && sha256(opts.baselineText) !== latest.reportSha256) {
    reasons.push(track === "default" ? "baseline.json is not the latest history entry (overwritten without appending to history)" : "baseline-relabels.json is not the latest relabels history entry (overwritten without appending to history)");
  }
  if (latest?.legacy) reasons.push("latest baseline history entry is legacy (no evaluation identity): gate cannot compare");
  return { reasons, thresholds: latest?.thresholds ?? DEFAULT_THRESHOLDS, latest };
}

/** Snapshot identity: sha256 over the sorted (sourceId, inputSha256) pairs. Shards record it for the WHOLE snapshot. */
export function snapshotIdentitySha256(pairs: readonly (readonly [string, string])[]): string {
  return sha256(canonicalJson([...pairs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))));
}

/** What a --shard=i/n run records about the whole snapshot it was cut from. */
export interface ShardInfo {
  index: number;
  count: number;
  /** Identity of the FULL snapshot (all sources), the same formula as EvaluationIdentity.snapshotSha256. */
  snapshotSha256: string;
  snapshotSourceIds: string[];
}

/**
 * Check a shard set before merging: same ruleset/scorer identity, same full-snapshot identity, every shard index
 * 0..n-1 exactly once, no source in two shards, and no snapshot source missing. The merged report's own identity must
 * then equal the recorded full-snapshot identity. Throws on any violation.
 */
export function verifyShardSet(reports: readonly { rulesetVersion: number; mode: string; identity?: EvaluationIdentity | null; shard?: ShardInfo | null; perSource: { sourceId: string }[] }[]): ShardInfo {
  if (reports.length === 0) throw new Error("no shards");
  const ids = new Set(reports.map((r) => JSON.stringify([r.rulesetVersion, r.identity?.rulesetSha256 ?? null, r.identity?.scorerConfig ?? null, r.mode])));
  if (ids.size !== 1) throw new Error(`shards disagree on ruleset/scorer identity: ${[...ids].join(" | ")}`);
  if (reports.some((r) => !r.shard)) throw new Error("shard report without shard/snapshot identity (re-run with a current scoreboard)");
  const snaps = new Set(reports.map((r) => `${r.shard!.snapshotSha256}/${r.shard!.count}`));
  if (snaps.size !== 1) throw new Error(`shards come from different snapshots or shard counts: ${[...snaps].join(" | ")}`);
  const info = reports[0]!.shard!;
  const idx = reports.map((r) => r.shard!.index).sort((a, b) => a - b);
  if (idx.length !== info.count || idx.some((v, i) => v !== i)) throw new Error(`shard set incomplete or duplicated: have [${idx.join(",")}] of ${info.count}`);
  const seen = new Set<string>();
  for (const r of reports) for (const s of r.perSource) {
    if (seen.has(s.sourceId)) throw new Error(`source scored in two shards: ${s.sourceId}`);
    seen.add(s.sourceId);
  }
  const missing = info.snapshotSourceIds.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`${missing.length} snapshot source(s) missing from the shards: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`);
  const extra = [...seen].filter((id) => !info.snapshotSourceIds.includes(id));
  if (extra.length) throw new Error(`${extra.length} source(s) not in the snapshot: ${extra.slice(0, 5).join(", ")}`);
  return info;
}
