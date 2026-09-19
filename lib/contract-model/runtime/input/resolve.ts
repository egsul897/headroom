/**
 * PHASE 4B - the deterministic selection policy.
 *
 * Every filter is exact. Candidates are sorted canonically before any
 * reduction, so the result never depends on the order inputs were supplied in.
 * When more than one candidate survives, the answer is AMBIGUOUS - never a pick.
 */
import type { IRValueType } from "../../ir/types";
import type { RuntimeValueType } from "../types";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "./version";
import { asOfEquals, candidateSortKey, periodEquals } from "./identity";
import { buildSnapshotGraph, isSupersededWithin, type SnapshotGraph } from "./snapshot";
import type { FinancialInput, FinancialSnapshot, InputQuery, RejectionReason, ResolutionCandidate, ResolutionPolicy, ResolutionResult, ResolutionState, SelectionMethod } from "./types";
import { DEFAULT_RESOLUTION_POLICY } from "./types";

/** The runtime value type an IR-declared type demands. CAPACITY accepts a MONEY fact. */
function acceptableValueTypes(expected: IRValueType | "CAPACITY"): RuntimeValueType[] {
  if (expected === "CAPACITY") return ["MONEY", "CAPACITY"];
  if (expected === "DURATION" || expected === "PERIOD") return [];
  return [expected as RuntimeValueType];
}

function scopeAccepts(input: FinancialInput, q: InputQuery): boolean {
  const s = input.identity.scope;
  if (s.kind === "INSTRUMENT_LEVEL") return q.instrumentKey !== null && s.instrumentKey === q.instrumentKey;
  // Company-level reuse is intentional: it applies to every instrument only when it says so.
  if (q.instrumentKey === null) return true;
  return s.instrumentApplicability.kind === "ALL_INSTRUMENTS" || s.instrumentApplicability.instrumentKeys.includes(q.instrumentKey);
}

function firstRejection(input: FinancialInput, q: InputQuery, policy: ResolutionPolicy, snapshot: FinancialSnapshot): RejectionReason | null {
  const id = input.identity;
  if (id.companyId !== q.companyId || snapshot.companyId !== q.companyId) return "COMPANY_MISMATCH";
  if (!scopeAccepts(input, q)) return "INSTRUMENT_SCOPE_MISMATCH";
  if (id.inputKind !== q.inputKind) return "KIND_MISMATCH";
  if (id.key !== q.key) return "KEY_MISMATCH";
  if (!periodEquals(id.period, q.period)) return "PERIOD_MISMATCH";
  if (policy.asOfMode === "EXACT" && !asOfEquals(id.asOf, q.asOf)) return "AS_OF_MISMATCH";
  if (policy.asOfMode === "LATEST_ON_OR_BEFORE") {
    // Only meaningful when both sides are real dates; anything else must still match exactly.
    if (q.asOf.kind === "EXACT_DATE") { if (id.asOf.kind !== "EXACT_DATE" || id.asOf.isoDate > q.asOf.isoDate) return "AS_OF_MISMATCH"; }
    else if (!asOfEquals(id.asOf, q.asOf)) return "AS_OF_MISMATCH";
  }
  return null;
}

export interface ResolveArgs {
  query: InputQuery;
  snapshots: readonly FinancialSnapshot[];
  policy?: ResolutionPolicy;
  graph?: SnapshotGraph;
}

export function resolveInput({ query, snapshots, policy = DEFAULT_RESOLUTION_POLICY, graph }: ResolveArgs): ResolutionResult {
  const g = graph ?? buildSnapshotGraph(snapshots);
  const base = { contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, query, input: null, provenance: null, selectionMethod: "NONE" as SelectionMethod };

  if (!g.safe) {
    const blocking = g.issues.filter((i) => i.code !== "SUPERSEDES_UNKNOWN_SNAPSHOT" && i.code !== "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR" && i.code !== "MONEY_INPUT_WITHOUT_CURRENCY");
    return { ...base, state: "AMBIGUOUS", reason: `the snapshot set is not safe to resolve against: ${blocking.map((i) => `${i.code} (${i.message})`).join("; ")}`, candidates: [] };
  }

  // 1. every (snapshot, input) pair, in canonical order - never source order.
  const all = [...g.byId.values()]
    .flatMap((s) => s.inputs.map((input) => ({ snapshot: s, input })))
    .sort((a, b) => (candidateSortKey(a.snapshot.snapshotId, a.snapshot.version, a.input.identity) < candidateSortKey(b.snapshot.snapshotId, b.snapshot.version, b.input.identity) ? -1 : 1));

  const candidates: ResolutionCandidate[] = [];
  const record = (s: FinancialSnapshot, input: FinancialInput, rejectedBecause: RejectionReason | null) => {
    candidates.push({ snapshotId: s.snapshotId, snapshotVersion: s.version, snapshotStatus: s.status, identity: input.identity, rejectedBecause });
    return rejectedBecause === null;
  };

  // 2. identity filters (company, scope, kind, key, period, as-of).
  let surviving = all.filter(({ snapshot, input }) => record(snapshot, input, firstRejection(input, query, policy, snapshot)));

  // 3. type contract. An identity match with the wrong or a conflicting type is never silently skipped.
  const acceptable = acceptableValueTypes(query.expectedType);
  const typeOk = surviving.filter(({ input }) => acceptable.includes(input.identity.valueType));
  const typeBad = surviving.filter(({ input }) => !acceptable.includes(input.identity.valueType));
  if (typeOk.length === 0 && typeBad.length > 0) {
    for (const c of candidates) if (typeBad.some((t) => t.input.identity === c.identity)) c.rejectedBecause = "VALUE_TYPE_MISMATCH";
    return { ...base, state: "INCOMPATIBLE", reason: `the input identity exists but every candidate has value type ${[...new Set(typeBad.map((t) => t.input.identity.valueType))].join("/")} where the IR declares ${String(query.expectedType)}`, candidates };
  }
  if (typeOk.length > 0 && typeBad.length > 0) {
    for (const c of candidates) if (typeBad.some((t) => t.input.identity === c.identity)) c.rejectedBecause = "VALUE_TYPE_MISMATCH";
    return { ...base, state: "INCOMPATIBLE", reason: `candidates sharing this identity disagree on value type (${[...new Set(surviving.map((t) => t.input.identity.valueType))].sort().join(", ")}); the runtime will not choose one`, candidates };
  }
  surviving = typeOk;

  // 4. review status policy.
  const statusOk = surviving.filter(({ snapshot }) => policy.acceptableStatuses.includes(snapshot.status));
  if (statusOk.length === 0 && surviving.length > 0) {
    for (const c of candidates) if (surviving.some((s) => s.input.identity === c.identity)) c.rejectedBecause = "SNAPSHOT_STATUS_NOT_ACCEPTABLE";
    return { ...base, state: "NOT_APPROVED", reason: `the fact exists but only in snapshots with status ${[...new Set(surviving.map((s) => s.snapshot.status))].sort().join("/")}; this evaluation accepts ${policy.acceptableStatuses.join("/")}`, candidates };
  }
  surviving = statusOk;

  // 5. explicit supersession, only among the snapshots still in scope.
  const inScope = new Set(surviving.map((s) => s.snapshot.snapshotId));
  const notSuperseded = surviving.filter(({ snapshot }) => {
    const by = isSupersededWithin(g, snapshot.snapshotId, inScope);
    if (by === null) return true;
    for (const c of candidates) if (c.snapshotId === snapshot.snapshotId && c.rejectedBecause === null) c.rejectedBecause = "SUPERSEDED_BY_ANOTHER_SNAPSHOT_IN_SCOPE";
    return false;
  });
  const supersessionApplied = notSuperseded.length !== surviving.length;
  surviving = notSuperseded;

  // 6. as-of selection mode, when the caller explicitly asked for it.
  let method: SelectionMethod = supersessionApplied ? "EXACT_IDENTITY_AFTER_SUPERSESSION" : "EXACT_IDENTITY";
  if (policy.asOfMode === "LATEST_ON_OR_BEFORE" && query.asOf.kind === "EXACT_DATE" && surviving.length > 1) {
    const dates = surviving.map((s) => (s.input.identity.asOf.kind === "EXACT_DATE" ? s.input.identity.asOf.isoDate : ""));
    const latest = [...dates].sort().at(-1)!;
    const keep = surviving.filter((s, i) => dates[i] === latest);
    if (keep.length < surviving.length) { method = "LATEST_ON_OR_BEFORE_AS_OF"; surviving = keep; }
  }

  if (surviving.length === 0) return { ...base, state: "MISSING", reason: `no input matches ${query.inputKind} "${query.key}" for company ${query.companyId}${query.instrumentKey ? ` / instrument ${query.instrumentKey}` : ""} at the requested period and as-of identity`, candidates };
  if (surviving.length > 1) return { ...base, state: "AMBIGUOUS", reason: `${surviving.length} candidates match this identity exactly (${surviving.map((s) => `${s.snapshot.snapshotId}@${s.snapshot.version}`).sort().join(", ")}); no supersession relation distinguishes them`, candidates };

  const chosen = surviving[0]!;
  if (chosen.input.identity.scope.kind === "COMPANY_LEVEL" && query.instrumentKey !== null && method === "EXACT_IDENTITY") method = "EXACT_IDENTITY_VIA_COMPANY_LEVEL_APPLICABILITY";
  const state: ResolutionState = "RESOLVED";
  return {
    ...base,
    state,
    selectionMethod: method,
    input: chosen.input,
    reason: `exactly one candidate matches; selected by ${method}`,
    candidates,
    provenance: {
      snapshotId: chosen.snapshot.snapshotId,
      snapshotVersion: chosen.snapshot.version,
      snapshotStatus: chosen.snapshot.status,
      source: chosen.snapshot.provenance.source,
      sourceVersion: chosen.input.sourceVersion ?? chosen.snapshot.provenance.sourceVersion,
      reviewedBy: chosen.snapshot.review.reviewedBy,
      reviewedAt: chosen.snapshot.review.reviewedAt,
      approvalRef: chosen.snapshot.review.approvalRef,
      selectionMethod: method,
      identity: chosen.input.identity,
      contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
      reliedOnNonApprovedSnapshot: chosen.snapshot.status !== "APPROVED",
    },
  };
}
