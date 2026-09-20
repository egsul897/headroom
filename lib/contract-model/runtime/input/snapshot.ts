/**
 * PHASE 4B - snapshot set integrity: immutability, explicit supersession, cycle safety.
 *
 * The runtime never infers which snapshot is newer. Supersession is an explicit
 * edge, it must be acyclic, and a predecessor with two competing successors is
 * an ambiguity to report, never a choice to make.
 */
import type { FinancialSnapshot, SnapshotStatus } from "./types";
import { hashOf, snapshotHash } from "./identity";

export type SnapshotIssueCode =
  | "DUPLICATE_SNAPSHOT_ID"
  | "SELF_SUPERSESSION"
  | "SUPERSESSION_CYCLE"
  | "COMPETING_SUCCESSORS"
  | "SUPERSEDES_UNKNOWN_SNAPSHOT"
  | "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR"
  | "SUCCESSOR_OF_ANOTHER_COMPANY"
  | "MONEY_INPUT_WITHOUT_CURRENCY"
  | "DUPLICATE_IDENTITY_WITHIN_SNAPSHOT";

export interface SnapshotIssue { code: SnapshotIssueCode; message: string; snapshotIds: string[] }

export interface SnapshotGraph {
  /** snapshotId -> the snapshot. */
  byId: Map<string, FinancialSnapshot>;
  /** snapshotId -> the ids that explicitly supersede it. */
  successors: Map<string, string[]>;
  issues: SnapshotIssue[];
  /** True when the set is safe to resolve against. */
  safe: boolean;
  setHash: string;
}

export function buildSnapshotGraph(snapshots: readonly FinancialSnapshot[]): SnapshotGraph {
  const issues: SnapshotIssue[] = [];
  const byId = new Map<string, FinancialSnapshot>();
  for (const s of [...snapshots].sort((a, b) => (a.snapshotId < b.snapshotId ? -1 : 1))) {
    if (byId.has(s.snapshotId)) issues.push({ code: "DUPLICATE_SNAPSHOT_ID", message: `snapshot id ${s.snapshotId} appears more than once; a revision must be a new id or version, never a reused id`, snapshotIds: [s.snapshotId] });
    else byId.set(s.snapshotId, s);
    const seen = new Set<string>();
    for (const i of s.inputs) {
      if (i.identity.valueType === "MONEY" && !i.identity.currency) issues.push({ code: "MONEY_INPUT_WITHOUT_CURRENCY", message: `input "${i.identity.key}" in ${s.snapshotId} is MONEY without a currency; currency is part of identity`, snapshotIds: [s.snapshotId] });
      const k = `${i.identity.inputKind}::${i.identity.key}::${i.identity.companyId}`;
      const full = `${k}::${JSON.stringify(i.identity.period)}::${JSON.stringify(i.identity.asOf)}::${JSON.stringify(i.identity.scope)}::${i.identity.valueType}::${i.identity.currency ?? "-"}`;
      if (seen.has(full)) issues.push({ code: "DUPLICATE_IDENTITY_WITHIN_SNAPSHOT", message: `snapshot ${s.snapshotId} carries the same input identity twice ("${i.identity.key}")`, snapshotIds: [s.snapshotId] });
      seen.add(full);
    }
  }

  const successors = new Map<string, string[]>();
  for (const s of [...byId.values()].sort((a, b) => (a.snapshotId < b.snapshotId ? -1 : 1))) {
    const target = s.supersedesSnapshotId;
    if (target === null) continue;
    if (target === s.snapshotId) { issues.push({ code: "SELF_SUPERSESSION", message: `snapshot ${s.snapshotId} supersedes itself`, snapshotIds: [s.snapshotId] }); continue; }
    if (!byId.has(target)) { issues.push({ code: "SUPERSEDES_UNKNOWN_SNAPSHOT", message: `snapshot ${s.snapshotId} supersedes ${target}, which is not in the set`, snapshotIds: [s.snapshotId, target] }); continue; }
    if (byId.get(target)!.companyId !== s.companyId) issues.push({ code: "SUCCESSOR_OF_ANOTHER_COMPANY", message: `snapshot ${s.snapshotId} supersedes ${target}, which belongs to a different company`, snapshotIds: [s.snapshotId, target] });
    successors.set(target, [...(successors.get(target) ?? []), s.snapshotId].sort());
  }

  for (const [predecessor, succs] of [...successors.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (succs.length > 1) issues.push({ code: "COMPETING_SUCCESSORS", message: `snapshot ${predecessor} is superseded by ${succs.length} snapshots (${succs.join(", ")}); the runtime will not pick one`, snapshotIds: [predecessor, ...succs] });
  }

  // Cycle detection over the explicit edges (successor -> predecessor).
  const colour = new Map<string, 0 | 1 | 2>();
  const reported = new Set<string>();
  const walk = (id: string, path: string[]): void => {
    const c = colour.get(id) ?? 0;
    if (c === 1) {
      const at = path.indexOf(id);
      const cycle = [...path.slice(at), id];
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) { reported.add(key); issues.push({ code: "SUPERSESSION_CYCLE", message: `supersession cycle: ${cycle.join(" -> ")}`, snapshotIds: cycle }); }
      return;
    }
    if (c === 2) return;
    colour.set(id, 1);
    const next = byId.get(id)?.supersedesSnapshotId;
    if (next && byId.has(next)) walk(next, [...path, id]);
    colour.set(id, 2);
  };
  for (const id of [...byId.keys()].sort()) walk(id, []);

  for (const s of [...byId.values()].sort((a, b) => (a.snapshotId < b.snapshotId ? -1 : 1))) {
    if (s.status === "SUPERSEDED" && (successors.get(s.snapshotId) ?? []).length === 0) issues.push({ code: "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR", message: `snapshot ${s.snapshotId} is marked SUPERSEDED but no snapshot in the set supersedes it`, snapshotIds: [s.snapshotId] });
  }

  const fatal: SnapshotIssueCode[] = ["DUPLICATE_SNAPSHOT_ID", "SELF_SUPERSESSION", "SUPERSESSION_CYCLE", "COMPETING_SUCCESSORS", "SUCCESSOR_OF_ANOTHER_COMPANY", "DUPLICATE_IDENTITY_WITHIN_SNAPSHOT"];
  return { byId, successors, issues, safe: !issues.some((i) => fatal.includes(i.code)), setHash: hashOf([...byId.values()].map(snapshotHash).sort()) };
}

/** True when `snapshotId` is explicitly superseded by another snapshot that is itself present in `inScope`. */
export function isSupersededWithin(graph: SnapshotGraph, snapshotId: string, inScope: ReadonlySet<string>): string | null {
  const succs = (graph.successors.get(snapshotId) ?? []).filter((s) => inScope.has(s));
  return succs.length === 1 ? succs[0]! : null;
}

export const STATUS_VALUES: SnapshotStatus[] = ["DRAFT", "REVIEW_REQUIRED", "APPROVED", "SUPERSEDED"];
