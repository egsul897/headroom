/**
 * NS-4 slice 1 — append-only write API over an event log.
 *
 * Materialization is derived from events; prior event bytes are never mutated.
 * Every commit rebuilds the company snapshot set and runs `buildSnapshotGraph`;
 * any of the nine unsafe-graph issue codes refuses the write (store is stricter
 * than 4B resolve, which treats some codes as non-fatal for `safe`).
 */
import type { FinancialSnapshot } from "../types";
import { buildSnapshotGraph, type SnapshotIssueCode } from "../snapshot";
import type {
  AppendSnapshotRequest,
  ApprovalTransition,
  StoreEvent,
  StoreWriteIssue,
  WriteResult,
} from "./types";
import { APPENDABLE_STATUSES, graphIssuesToStoreIssues } from "./types";

const ALL_NINE_BLOCKING: ReadonlySet<SnapshotIssueCode> = new Set([
  "DUPLICATE_SNAPSHOT_ID",
  "SELF_SUPERSESSION",
  "SUPERSESSION_CYCLE",
  "COMPETING_SUCCESSORS",
  "SUPERSEDES_UNKNOWN_SNAPSHOT",
  "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR",
  "SUCCESSOR_OF_ANOTHER_COMPANY",
  "MONEY_INPUT_WITHOUT_CURRENCY",
  "DUPLICATE_IDENTITY_WITHIN_SNAPSHOT",
]);

export interface SnapshotStoreBackend {
  /** Append-only event log (never mutated in place). */
  readonly events: readonly StoreEvent[];
  /** Persist new events atomically with the caller's prospective materialization check already done. */
  commit(events: StoreEvent[]): void;
}

let eventSeq = 0;
function nextEventId(): string {
  eventSeq += 1;
  return `evt-${eventSeq}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Deep-ish clone so callers cannot mutate stored materialization. */
export function cloneSnapshot(s: FinancialSnapshot): FinancialSnapshot {
  return {
    ...s,
    inputs: s.inputs.map((i) => ({
      ...i,
      identity: { ...i.identity, scope: structuredClone(i.identity.scope), period: structuredClone(i.identity.period), asOf: structuredClone(i.identity.asOf) },
      value: structuredClone(i.value),
    })),
    provenance: { ...s.provenance },
    review: { ...s.review },
  };
}

/** Deep-freeze a cloned snapshot (public read / WriteOk materialization). */
export function freezeSnapshot(s: FinancialSnapshot): FinancialSnapshot {
  const c = cloneSnapshot(s);
  for (const inp of c.inputs) {
    Object.freeze(inp.identity.scope);
    Object.freeze(inp.identity.period);
    Object.freeze(inp.identity.asOf);
    Object.freeze(inp.identity);
    Object.freeze(inp.value);
    Object.freeze(inp);
  }
  Object.freeze(c.inputs);
  Object.freeze(c.provenance);
  Object.freeze(c.review);
  return Object.freeze(c);
}

/** Clone a store event so the log never shares mutable payload refs with callers. */
export function cloneStoreEvent(e: StoreEvent): StoreEvent {
  if (e.type === "SNAPSHOT_APPENDED") {
    return {
      type: "SNAPSHOT_APPENDED",
      eventId: e.eventId,
      at: e.at,
      snapshot: cloneSnapshot(e.snapshot),
    };
  }
  return { ...e };
}

/** Deep-freeze a cloned store event for public reads. */
export function freezeStoreEvent(e: StoreEvent): StoreEvent {
  if (e.type === "SNAPSHOT_APPENDED") {
    return Object.freeze({
      type: "SNAPSHOT_APPENDED" as const,
      eventId: e.eventId,
      at: e.at,
      snapshot: freezeSnapshot(e.snapshot),
    });
  }
  return Object.freeze({ ...e });
}

/** Deep-frozen copy of an event log (array + payloads). */
export function publicEventLog(events: readonly StoreEvent[]): readonly StoreEvent[] {
  return Object.freeze(events.map((e) => freezeStoreEvent(e)));
}

/**
 * Rebuild current snapshot materialization from the event log.
 * SNAPSHOT_APPENDED inserts a row; APPROVED / SUPERSEDED flip status (+ review fields) on that id.
 */
export function materializeFromEvents(events: readonly StoreEvent[]): Map<string, FinancialSnapshot> {
  const byId = new Map<string, FinancialSnapshot>();
  for (const e of events) {
    if (e.type === "SNAPSHOT_APPENDED") {
      byId.set(e.snapshot.snapshotId, cloneSnapshot(e.snapshot));
      continue;
    }
    if (e.type === "SNAPSHOT_APPROVED") {
      const cur = byId.get(e.snapshotId);
      if (!cur) continue;
      byId.set(e.snapshotId, {
        ...cloneSnapshot(cur),
        status: "APPROVED",
        review: { reviewedBy: e.reviewedBy, reviewedAt: e.reviewedAt, approvalRef: e.approvalRef },
      });
      continue;
    }
    if (e.type === "SNAPSHOT_SUPERSEDED") {
      const cur = byId.get(e.snapshotId);
      if (!cur) continue;
      byId.set(e.snapshotId, { ...cloneSnapshot(cur), status: "SUPERSEDED" });
    }
  }
  return byId;
}

export function getSnapshots(backend: SnapshotStoreBackend, companyId: string): FinancialSnapshot[] {
  const all = materializeFromEvents(backend.events);
  return [...all.values()]
    .filter((s) => s.companyId === companyId)
    .sort((a, b) => (a.snapshotId < b.snapshotId ? -1 : 1))
    .map(cloneSnapshot);
}

export function getSnapshot(backend: SnapshotStoreBackend, snapshotId: string): FinancialSnapshot | null {
  const all = materializeFromEvents(backend.events);
  const s = all.get(snapshotId);
  return s ? cloneSnapshot(s) : null;
}

function validateGraphForCompany(snapshots: FinancialSnapshot[]): StoreWriteIssue[] {
  const graph = buildSnapshotGraph(snapshots);
  // Store refuses EVERY one of the nine codes, even those 4B marks non-fatal for `safe`.
  return graphIssuesToStoreIssues(graph.issues.filter((i) => ALL_NINE_BLOCKING.has(i.code)));
}

/**
 * Append a DRAFT or REVIEW_REQUIRED snapshot. Refuses APPROVED / SUPERSEDED on raw append.
 *
 * A proposal may name `supersedesSnapshotId` (successor → predecessor edge) without
 * immediately flipping the predecessor to SUPERSEDED. Authoritative APPROVED reporting
 * stays live until the successor itself is attributable-approved (see `approveSnapshot`).
 * Graph checks still refuse competing successors / unknown edges on the named edge alone.
 */
export function appendSnapshot(backend: SnapshotStoreBackend, request: AppendSnapshotRequest): WriteResult {
  const snapshot = cloneSnapshot(request.snapshot);
  const issues: StoreWriteIssue[] = [];

  if (!(APPENDABLE_STATUSES as readonly string[]).includes(snapshot.status)) {
    issues.push({
      code: "APPEND_STATUS_NOT_ALLOWED",
      message: `raw append accepts only DRAFT | REVIEW_REQUIRED; got ${snapshot.status}. APPROVED requires approveSnapshot; SUPERSEDED is derived from a successor edge`,
      snapshotIds: [snapshot.snapshotId],
    });
    // Still run the nine-code graph check on a prospective that includes this row so
    // SUPERSEDED_STATUS_WITHOUT_SUCCESSOR (and similar) are reported, not only the status gate.
    const current = materializeFromEvents(backend.events);
    const prospectiveSnaps = [
      ...[...current.values()].filter((s) => s.companyId === snapshot.companyId),
      snapshot,
    ];
    issues.push(...validateGraphForCompany(prospectiveSnaps));
    return { ok: false, issues };
  }

  // Clear approval fields on proposal append — approval is attributable via approveSnapshot only.
  if (snapshot.review.approvalRef) {
    issues.push({
      code: "APPEND_STATUS_NOT_ALLOWED",
      message: `raw append must not carry approvalRef; use approveSnapshot for attributable approval`,
      snapshotIds: [snapshot.snapshotId],
    });
    return { ok: false, issues };
  }

  const current = materializeFromEvents(backend.events);
  if (current.has(snapshot.snapshotId)) {
    issues.push({
      code: "DUPLICATE_SNAPSHOT_ID",
      message: `snapshot id ${snapshot.snapshotId} already exists in the store; revisions must use a new id (append-only)`,
      snapshotIds: [snapshot.snapshotId],
    });
    return { ok: false, issues };
  }

  if (snapshot.supersedesSnapshotId) {
    const pred = current.get(snapshot.supersedesSnapshotId);
    if (pred && pred.companyId !== snapshot.companyId) {
      issues.push({
        code: "SUCCESSOR_OF_ANOTHER_COMPANY",
        message: `snapshot ${snapshot.snapshotId} supersedes ${snapshot.supersedesSnapshotId}, which belongs to a different company`,
        snapshotIds: [snapshot.snapshotId, snapshot.supersedesSnapshotId],
      });
      return { ok: false, issues };
    }
  }

  const prospectiveEvents: StoreEvent[] = [
    {
      type: "SNAPSHOT_APPENDED",
      eventId: nextEventId(),
      at: nowIso(),
      snapshot: {
        ...snapshot,
        review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
      },
    },
  ];

  const prospective = materializeFromEvents([...backend.events, ...prospectiveEvents]);
  const companySnaps = [...prospective.values()].filter((s) => s.companyId === snapshot.companyId);
  const graphIssues = validateGraphForCompany(companySnaps);
  if (graphIssues.length > 0) return { ok: false, issues: graphIssues };

  backend.commit(prospectiveEvents);
  const written = prospective.get(snapshot.snapshotId)!;
  return { ok: true, snapshot: cloneSnapshot(written), events: prospectiveEvents };
}

/**
 * Attributable DRAFT | REVIEW_REQUIRED → APPROVED transition.
 * Appends SNAPSHOT_APPROVED; materialization flips status and sets review fields.
 * When the approved snapshot names `supersedesSnapshotId`, also emits SNAPSHOT_SUPERSEDED
 * for that predecessor (immutable supersession only on attributable approval of the successor).
 * Refuses if missing, already APPROVED/SUPERSEDED, or approval fields incomplete.
 */
export function approveSnapshot(backend: SnapshotStoreBackend, approval: ApprovalTransition): WriteResult {
  const issues: StoreWriteIssue[] = [];
  const { snapshotId, reviewedBy, reviewedAt, approvalRef } = approval;

  if (!reviewedBy?.trim() || !reviewedAt?.trim() || !approvalRef?.trim()) {
    issues.push({
      code: "APPROVAL_FIELDS_REQUIRED",
      message: "approveSnapshot requires non-empty reviewedBy, reviewedAt, and approvalRef",
      snapshotIds: [snapshotId],
    });
    return { ok: false, issues };
  }

  const current = materializeFromEvents(backend.events);
  const existing = current.get(snapshotId);
  if (!existing) {
    issues.push({
      code: "SNAPSHOT_NOT_FOUND",
      message: `snapshot ${snapshotId} is not in the store`,
      snapshotIds: [snapshotId],
    });
    return { ok: false, issues };
  }

  if (existing.status === "APPROVED" || existing.status === "SUPERSEDED") {
    issues.push({
      code: "SNAPSHOT_NOT_APPROVABLE",
      message: `snapshot ${snapshotId} has status ${existing.status}; only DRAFT | REVIEW_REQUIRED may be approved`,
      snapshotIds: [snapshotId],
    });
    return { ok: false, issues };
  }

  const prospectiveEvents: StoreEvent[] = [
    {
      type: "SNAPSHOT_APPROVED",
      eventId: nextEventId(),
      at: nowIso(),
      snapshotId,
      companyId: existing.companyId,
      reviewedBy,
      reviewedAt,
      approvalRef,
    },
  ];

  if (existing.supersedesSnapshotId) {
    const pred = current.get(existing.supersedesSnapshotId);
    if (pred && pred.companyId !== existing.companyId) {
      issues.push({
        code: "SUCCESSOR_OF_ANOTHER_COMPANY",
        message: `snapshot ${snapshotId} supersedes ${existing.supersedesSnapshotId}, which belongs to a different company`,
        snapshotIds: [snapshotId, existing.supersedesSnapshotId],
      });
      return { ok: false, issues };
    }
    if (pred && pred.status !== "SUPERSEDED") {
      prospectiveEvents.push({
        type: "SNAPSHOT_SUPERSEDED",
        eventId: nextEventId(),
        at: nowIso(),
        snapshotId: pred.snapshotId,
        companyId: pred.companyId,
        supersededBy: snapshotId,
      });
    }
  }

  const prospective = materializeFromEvents([...backend.events, ...prospectiveEvents]);
  const companySnaps = [...prospective.values()].filter((s) => s.companyId === existing.companyId);
  const graphIssues = validateGraphForCompany(companySnaps);
  if (graphIssues.length > 0) return { ok: false, issues: graphIssues };

  backend.commit(prospectiveEvents);
  return { ok: true, snapshot: cloneSnapshot(prospective.get(snapshotId)!), events: prospectiveEvents };
}
