/**
 * Sealed append-only ledger writes — validate before commit; never mutate prior events.
 */
import { rationalFromString } from "../../decimal";
import type { LedgerUsageRecord } from "../types";
import type {
  AppendUsageRequest,
  LedgerStoreEvent,
  LedgerWriteIssue,
  LedgerWriteResult,
  SupersedeUsageRequest,
} from "./types";

export interface LedgerStoreBackend {
  readonly events: readonly LedgerStoreEvent[];
  commit(events: LedgerStoreEvent[]): void;
}

let eventSeq = 0;
function nextEventId(): string {
  eventSeq += 1;
  return `led-evt-${eventSeq}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function cloneUsage(u: LedgerUsageRecord): LedgerUsageRecord {
  return {
    ...u,
    amount: { ...u.amount },
    capacityPath: structuredClone(u.capacityPath),
    provenance: { ...u.provenance },
  };
}

export function materializeUsages(events: readonly LedgerStoreEvent[]): Map<string, LedgerUsageRecord> {
  const byId = new Map<string, LedgerUsageRecord>();
  for (const e of events) {
    if (e.type === "USAGE_APPENDED") {
      byId.set(e.usage.usageId, cloneUsage(e.usage));
      continue;
    }
    const pred = byId.get(e.usageId);
    if (!pred) continue;
    byId.set(e.usageId, {
      ...cloneUsage(pred),
      status: "SUPERSEDED",
      supersededByUsageId: e.successorUsageId,
    });
  }
  return byId;
}

function validateAppendable(usage: LedgerUsageRecord, existing: Map<string, LedgerUsageRecord>): LedgerWriteIssue[] {
  const issues: LedgerWriteIssue[] = [];
  if (existing.has(usage.usageId)) {
    issues.push({
      code: "DUPLICATE_USAGE_ID",
      message: `usageId ${usage.usageId} already recorded; corrections must supersede, never overwrite`,
      usageIds: [usage.usageId],
    });
  }
  if (usage.status === "SUPERSEDED") {
    issues.push({
      code: "INVALID_STATUS_ON_APPEND",
      message: "raw append cannot set SUPERSEDED; use supersedeUsage",
      usageIds: [usage.usageId],
    });
  }
  if (usage.supersededByUsageId != null) {
    issues.push({
      code: "INVALID_STATUS_ON_APPEND",
      message: "raw append must leave supersededByUsageId null",
      usageIds: [usage.usageId],
    });
  }
  if (!usage.amount.currency) {
    issues.push({
      code: "USAGE_WITHOUT_CURRENCY",
      message: `usage ${usage.usageId} missing currency`,
      usageIds: [usage.usageId],
    });
  }
  try {
    const r = rationalFromString(usage.amount.amount);
    if (r.num < 0n) {
      issues.push({
        code: "USAGE_AMOUNT_NOT_REPRESENTABLE",
        message: `usage ${usage.usageId} has negative amount; use REVERSED/supersession, not negative rows`,
        usageIds: [usage.usageId],
      });
    }
  } catch {
    issues.push({
      code: "USAGE_AMOUNT_NOT_REPRESENTABLE",
      message: `usage ${usage.usageId} amount is not a decimal literal`,
      usageIds: [usage.usageId],
    });
  }
  // Unattributed UNRESOLVED with empty candidates fails closed at write (capacity also fails closed at eval).
  if (usage.capacityPath.kind === "UNRESOLVED" && usage.capacityPath.candidateRuleIds.length === 0) {
    issues.push({
      code: "MISSING_ATTRIBUTION",
      message: `usage ${usage.usageId} is UNRESOLVED with no candidate rules; refuse unattributed capacity consumption`,
      usageIds: [usage.usageId],
    });
  }
  return issues;
}

export function appendUsage(backend: LedgerStoreBackend, request: AppendUsageRequest): LedgerWriteResult {
  const existing = materializeUsages(backend.events);
  const issues = validateAppendable(request.usage, existing);
  if (issues.length) return { ok: false, issues };

  const usage = cloneUsage(request.usage);
  const event: LedgerStoreEvent = {
    type: "USAGE_APPENDED",
    eventId: nextEventId(),
    at: nowIso(),
    usage,
  };
  backend.commit([event]);
  return { ok: true, usage: cloneUsage(usage), events: [event] };
}

export function supersedeUsage(backend: LedgerStoreBackend, request: SupersedeUsageRequest): LedgerWriteResult {
  const existing = materializeUsages(backend.events);
  const pred = existing.get(request.predecessorUsageId);
  if (!pred) {
    return {
      ok: false,
      issues: [{
        code: "SUPERSEDES_UNKNOWN_USAGE",
        message: `predecessor ${request.predecessorUsageId} not in ledger`,
        usageIds: [request.predecessorUsageId],
      }],
    };
  }
  if (request.predecessorUsageId === request.successor.usageId) {
    return {
      ok: false,
      issues: [{
        code: "SELF_SUPERSESSION",
        message: "successor cannot equal predecessor",
        usageIds: [request.predecessorUsageId],
      }],
    };
  }
  if (pred.companyId !== request.successor.companyId) {
    return {
      ok: false,
      issues: [{
        code: "COMPANY_MISMATCH",
        message: "successor companyId must match predecessor",
        usageIds: [request.predecessorUsageId, request.successor.usageId],
      }],
    };
  }
  if (!request.supersessionRef.trim() || !request.supersededBy.trim() || !request.supersededAt.trim()) {
    return {
      ok: false,
      issues: [{
        code: "MISSING_ATTRIBUTION",
        message: "supersedeUsage requires supersessionRef, supersededBy, supersededAt",
        usageIds: [request.predecessorUsageId],
      }],
    };
  }

  const appendIssues = validateAppendable(request.successor, existing);
  if (appendIssues.length) return { ok: false, issues: appendIssues };

  const successor = cloneUsage({
    ...request.successor,
    status: "RECORDED",
    supersededByUsageId: null,
    provenance: {
      ...request.successor.provenance,
      approvalRef: request.supersessionRef,
      approvalState: request.successor.provenance.approvalState ?? "APPROVED",
    },
  });

  const appendEvent: LedgerStoreEvent = {
    type: "USAGE_APPENDED",
    eventId: nextEventId(),
    at: request.supersededAt,
    usage: successor,
  };
  const supersedeEvent: LedgerStoreEvent = {
    type: "USAGE_SUPERSEDED",
    eventId: nextEventId(),
    at: request.supersededAt,
    companyId: pred.companyId,
    usageId: request.predecessorUsageId,
    successorUsageId: successor.usageId,
  };
  backend.commit([appendEvent, supersedeEvent]);
  return { ok: true, usage: cloneUsage(successor), events: [appendEvent, supersedeEvent] };
}

export function getUsages(backend: LedgerStoreBackend, companyId: string): LedgerUsageRecord[] {
  return [...materializeUsages(backend.events).values()]
    .filter((u) => u.companyId === companyId)
    .map(cloneUsage)
    .sort((a, b) => a.usageId.localeCompare(b.usageId));
}

export function getUsage(backend: LedgerStoreBackend, usageId: string): LedgerUsageRecord | null {
  const u = materializeUsages(backend.events).get(usageId);
  return u ? cloneUsage(u) : null;
}
