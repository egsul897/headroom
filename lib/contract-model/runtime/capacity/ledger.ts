/**
 * PHASE 4C - the consumption ledger.
 *
 * Usage records arrive as already-structured truth. Nothing here reads an ERP, a bank feed or a
 * spreadsheet. Selection is by explicit identity: company, instrument, effective date against the
 * evaluation as-of, status policy, explicit supersession and a capacity path that is actually
 * identified. A record whose path is unresolved is never allocated to a guess.
 */
import { rationalFromString } from "../decimal";
import { addAll } from "../units";
import { serializeValue } from "../values";
import type { RuntimeValue, SerializedRuntimeValue } from "../types";
import type {
  CapacityPathRef, LedgerIssue, LedgerPolicy, LedgerUsageRecord, UsageRejectionReason, UsageSelection,
} from "./types";
import { DEFAULT_LEDGER_POLICY } from "./types";

const L = { exprId: null, inputKeys: [] as string[] };

export interface LedgerIndex {
  byId: Map<string, LedgerUsageRecord>;
  /** Successors keyed by the usage they supersede. Explicit only. */
  successors: Map<string, Set<string>>;
  issues: LedgerIssue[];
  safe: boolean;
  /** Records in canonical order, never source order. */
  ordered: LedgerUsageRecord[];
}

const sortKey = (u: LedgerUsageRecord) => [u.usageId, u.effectiveAsOf, u.companyId, u.instrumentKey].join("::");

/** Build the ledger index and report every way the set is unsafe to reduce against. */
export function buildLedgerIndex(records: readonly LedgerUsageRecord[]): LedgerIndex {
  const byId = new Map<string, LedgerUsageRecord>();
  const issues: LedgerIssue[] = [];
  const ordered = [...records].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

  for (const u of ordered) {
    if (byId.has(u.usageId)) { issues.push({ code: "DUPLICATE_USAGE_ID", message: `usage id ${u.usageId} appears more than once; the runtime will not choose which row is authoritative`, usageIds: [u.usageId] }); continue; }
    byId.set(u.usageId, u);
    if (!u.amount.currency) issues.push({ code: "USAGE_WITHOUT_CURRENCY", message: `usage ${u.usageId} carries an amount with no currency`, usageIds: [u.usageId] });
    if (u.capacityPath.kind === "UNRESOLVED") issues.push({ code: "UNRESOLVED_CAPACITY_PATH", message: `usage ${u.usageId} does not establish which capacity it consumed (${u.capacityPath.reason}); candidates: ${u.capacityPath.candidateRuleIds.join(", ") || "none named"}`, usageIds: [u.usageId] });
  }

  const successors = new Map<string, Set<string>>();
  for (const u of ordered) {
    if (u.supersededByUsageId === null) continue;
    if (u.supersededByUsageId === u.usageId) { issues.push({ code: "SELF_SUPERSESSION", message: `usage ${u.usageId} names itself as its successor`, usageIds: [u.usageId] }); continue; }
    if (!byId.has(u.supersededByUsageId)) { issues.push({ code: "SUPERSEDES_UNKNOWN_USAGE", message: `usage ${u.usageId} names successor ${u.supersededByUsageId}, which is not in this ledger`, usageIds: [u.usageId] }); continue; }
    const set = successors.get(u.usageId) ?? new Set<string>();
    set.add(u.supersededByUsageId);
    successors.set(u.usageId, set);
  }
  for (const u of ordered) {
    if (u.status === "SUPERSEDED" && (successors.get(u.usageId)?.size ?? 0) === 0) {
      issues.push({ code: "SUPERSEDED_STATUS_WITHOUT_SUCCESSOR", message: `usage ${u.usageId} is marked SUPERSEDED but names no successor`, usageIds: [u.usageId] });
    }
  }

  // Three-colour walk over the supersession chain.
  const colour = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const walk = (id: string) => {
    const c = colour.get(id) ?? 0;
    if (c === 1) { const at = stack.indexOf(id); if (at >= 0) issues.push({ code: "SUPERSESSION_CYCLE", message: `supersession cycle: ${[...stack.slice(at), id].join(" -> ")}`, usageIds: [...stack.slice(at), id] }); return; }
    if (c === 2) return;
    colour.set(id, 1); stack.push(id);
    for (const nxt of [...(successors.get(id) ?? [])].sort()) walk(nxt);
    stack.pop(); colour.set(id, 2);
  };
  for (const id of [...byId.keys()].sort()) walk(id);

  // A duplicate id or a broken supersession chain makes the whole set unsafe. An unresolved path or
  // a missing currency blocks only the records it touches, which the selection step reports.
  const blocking = new Set(["DUPLICATE_USAGE_ID", "SELF_SUPERSESSION", "SUPERSESSION_CYCLE"]);
  const safe = !issues.some((i) => blocking.has(i.code));
  issues.sort((a, b) => (`${a.code}|${a.usageIds.join(",")}` < `${b.code}|${b.usageIds.join(",")}` ? -1 : 1));
  return { byId, successors, issues, safe, ordered };
}

const pathMatches = (path: CapacityPathRef, target: CapacityPathRef): boolean =>
  path.kind === "RULE" && target.kind === "RULE" ? path.ruleId === target.ruleId
    : path.kind === "SHARED_CAPACITY" && target.kind === "SHARED_CAPACITY" ? path.sharedCapacityId === target.sharedCapacityId
      : false;

export interface UsageQuery {
  companyId: string;
  instrumentKey: string;
  /** The capacity this usage would be counted against. */
  target: CapacityPathRef;
  asOf: string | null;
  /** The currency the capacity is denominated in, when it is known. */
  currency: string | null;
}

export interface UsageResult {
  selection: UsageSelection[];
  applied: LedgerUsageRecord[];
  /** Total of the applied records, through the Phase-4A unit algebra. Null when nothing applied. */
  total: SerializedRuntimeValue | null;
  /** Set when an applicable record could not be counted, so the total is not trustworthy. */
  blocked: { code: "AMBIGUOUS_CONSUMPTION_ALLOCATION" | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" | "UNIT_FAILURE"; message: string; usageIds: string[] } | null;
}

/**
 * Select and total the usage counted against one capacity.
 *
 * An unresolved record that names this capacity among its candidates blocks the answer rather than
 * being silently dropped: if it might have consumed this capacity, the remaining figure cannot be
 * stated. Choosing the path is a later phase's decision, never this one's.
 */
export function selectUsage(index: LedgerIndex, query: UsageQuery, policy: LedgerPolicy = DEFAULT_LEDGER_POLICY): UsageResult {
  const selection: UsageSelection[] = [];
  const applied: LedgerUsageRecord[] = [];
  const ambiguous: string[] = [];
  const currencyConflicts: string[] = [];

  for (const u of index.ordered) {
    const reject = (r: UsageRejectionReason) => { selection.push({ usageId: u.usageId, rejectedBecause: r }); return null; };
    if (u.companyId !== query.companyId) { reject("COMPANY_MISMATCH"); continue; }
    if (u.instrumentKey !== query.instrumentKey) { reject("INSTRUMENT_MISMATCH"); continue; }
    if (u.capacityPath.kind === "UNRESOLVED") {
      const couldBeThis = query.target.kind === "RULE" && u.capacityPath.candidateRuleIds.includes(query.target.ruleId);
      if (couldBeThis) ambiguous.push(u.usageId);
      reject("PATH_UNRESOLVED");
      continue;
    }
    if (!pathMatches(u.capacityPath, query.target)) { reject("PATH_NOT_THIS_CAPACITY"); continue; }
    if (query.asOf !== null && u.effectiveAsOf > query.asOf) { reject("EFFECTIVE_AFTER_AS_OF"); continue; }
    if (!policy.acceptableUsageStatuses.includes(u.status)) { reject("STATUS_NOT_ACCEPTABLE"); continue; }
    const successor = index.successors.get(u.usageId);
    if (successor && successor.size > 0) { reject("SUPERSEDED_BY_ANOTHER_USAGE"); continue; }
    if (query.currency !== null && u.amount.currency !== query.currency) { currencyConflicts.push(u.usageId); reject("CURRENCY_MISMATCH"); continue; }
    selection.push({ usageId: u.usageId, rejectedBecause: null });
    applied.push(u);
  }

  selection.sort((a, b) => (a.usageId < b.usageId ? -1 : 1));

  if (currencyConflicts.length > 0) {
    return { selection, applied: [], total: null, blocked: { code: "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: `usage recorded in a currency this capacity is not denominated in; no conversion is modelled`, usageIds: currencyConflicts.sort() } };
  }
  if (ambiguous.length > 0) {
    return { selection, applied: [], total: null, blocked: { code: "AMBIGUOUS_CONSUMPTION_ALLOCATION", message: `usage could have consumed this capacity but the record does not establish that it did; the runtime does not choose a path`, usageIds: ambiguous.sort() } };
  }
  if (applied.length === 0) return { selection, applied, total: null, blocked: null };

  const values: RuntimeValue[] = applied.map((u) => ({ type: "MONEY", amount: rationalFromString(u.amount.amount), currency: u.amount.currency, lineage: L }));
  const sum = addAll(values, { exprId: null, inputKeys: applied.map((u) => u.usageId) });
  if (!sum.ok) return { selection, applied, total: null, blocked: { code: sum.code === "UNIT_MISMATCH" ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : "UNIT_FAILURE", message: sum.message, usageIds: applied.map((u) => u.usageId) } };
  return { selection, applied, total: serializeValue(sum.value), blocked: null };
}
