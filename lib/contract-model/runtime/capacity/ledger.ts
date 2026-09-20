/**
 * PHASE 4C - the consumption ledger (remediated).
 *
 * Usage records arrive as already-structured truth. Nothing here reads an ERP, a bank feed or a
 * spreadsheet. Selection is by explicit identity: company, instrument, effective date against the
 * evaluation as-of, status policy, explicit supersession and a capacity path that is actually
 * identified.
 *
 * Remediation invariants (R6, R10, R13):
 *   - one immutable usage identity contributes at most once. Records sharing an id are quarantined
 *     as a set, never counted, never chosen between, and every capacity they could touch fails closed;
 *   - an UNRESOLVED path with no candidates is missing attribution information: the usage exists,
 *     so every capacity in scope fails closed rather than the record being dropped;
 *   - the ledger is indexed once by capacity path, so selection for one capacity examines only the
 *     records that could apply to it. There is no per-capacity scan of the whole ledger.
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

export const pathKeyOf = (p: CapacityPathRef): string | null =>
  p.kind === "RULE" ? `rule:${p.ruleId}` : p.kind === "SHARED_CAPACITY" ? `shared:${p.sharedCapacityId}` : null;

export interface LedgerIndex {
  /** Company and instrument the index was built for. Records outside it are listed once in `outOfScope`. */
  companyId: string | null;
  instrumentKey: string | null;
  byId: Map<string, LedgerUsageRecord>;
  /** Successors keyed by the usage they supersede. Explicit only. */
  successors: Map<string, Set<string>>;
  /** In-scope, non-quarantined records with an identified path, keyed by that path. */
  byPath: Map<string, LedgerUsageRecord[]>;
  /** In-scope UNRESOLVED records that name candidates, keyed by each candidate rule id. */
  unresolvedByCandidate: Map<string, LedgerUsageRecord[]>;
  /** In-scope UNRESOLVED records naming no candidate at all. They block every capacity in scope. */
  unresolvedWithoutCandidates: LedgerUsageRecord[];
  /** Every record bearing a duplicated usage id, keyed by that id. None of them is ever counted. */
  quarantined: Map<string, LedgerUsageRecord[]>;
  /** In-scope records whose amount cannot be represented (negative outside a conserved pair, or unparsable), keyed by path. */
  unrepresentableByPath: Map<string, LedgerUsageRecord[]>;
  /** Records rejected once, before selection, for being outside the company or instrument. */
  outOfScope: UsageSelection[];
  issues: LedgerIssue[];
  safe: boolean;
  /** In-scope records in canonical order, never source order. */
  ordered: LedgerUsageRecord[];
}

const sortKey = (u: LedgerUsageRecord) => [u.usageId, u.effectiveAsOf, u.companyId, u.instrumentKey].join("::");

export interface LedgerScope { companyId: string; instrumentKey: string }

/** Build the ledger index once. Every structural problem is reported here, and quarantine happens here. */
export function buildLedgerIndex(records: readonly LedgerUsageRecord[], scope?: LedgerScope): LedgerIndex {
  const issues: LedgerIssue[] = [];
  const outOfScope: UsageSelection[] = [];
  const all = [...records].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

  // Scope once. A record for another company or instrument is never examined again.
  const inScope: LedgerUsageRecord[] = [];
  for (const u of all) {
    if (scope && u.companyId !== scope.companyId) { outOfScope.push({ usageId: u.usageId, rejectedBecause: "COMPANY_MISMATCH" }); continue; }
    if (scope && u.instrumentKey !== scope.instrumentKey) { outOfScope.push({ usageId: u.usageId, rejectedBecause: "INSTRUMENT_MISMATCH" }); continue; }
    inScope.push(u);
  }

  // Identity collision: group by id. Any id claimed by more than one record is quarantined whole.
  const groups = new Map<string, LedgerUsageRecord[]>();
  for (const u of inScope) { const g = groups.get(u.usageId) ?? []; g.push(u); groups.set(u.usageId, g); }
  const quarantined = new Map<string, LedgerUsageRecord[]>();
  const byId = new Map<string, LedgerUsageRecord>();
  for (const [id, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (g.length > 1) {
      quarantined.set(id, g);
      issues.push({ code: "DUPLICATE_USAGE_ID", message: `usage id ${id} is claimed by ${g.length} records; one immutable identity may contribute at most once, so none of them is counted and every capacity they could touch fails closed`, usageIds: [id] });
      continue;
    }
    byId.set(id, g[0]!);
  }
  const ordered = inScope.filter((u) => !quarantined.has(u.usageId));

  for (const u of ordered) {
    if (!u.amount.currency) issues.push({ code: "USAGE_WITHOUT_CURRENCY", message: `usage ${u.usageId} carries an amount with no currency`, usageIds: [u.usageId] });
  }

  // Amount representability (audit U8). A negative row would create capacity; the contract reduces
  // consumption only by status or supersession. The one negative row it does represent is the source
  // half of a reclassification pair, and only when its destination half is present in the same ledger.
  const unrepresentableByPath = new Map<string, LedgerUsageRecord[]>();
  const unrepresentableIds = new Set<string>();
  for (const u of ordered) {
    let negative = false;
    let parsable = true;
    try { negative = rationalFromString(u.amount.amount).num < 0n; } catch { parsable = false; }
    const pairedSourceHalf = negative && u.provenance.approvalState === "RECLASSIFICATION_ELECTION" && u.transactionRef !== null
      && u.usageId === `${u.transactionRef}:source` && byId.has(`${u.transactionRef}:destination`);
    if (parsable && (!negative || pairedSourceHalf)) continue;
    unrepresentableIds.add(u.usageId);
    issues.push({ code: "USAGE_AMOUNT_NOT_REPRESENTABLE", message: parsable
      ? `usage ${u.usageId} carries a negative amount (${u.amount.amount}) that is not the source half of a conserved reclassification pair; a negative usage would create capacity and is not counted`
      : `usage ${u.usageId} carries an amount that is not an exact decimal (${JSON.stringify(u.amount.amount)}); it is not counted`, usageIds: [u.usageId] });
    const key = pathKeyOf(u.capacityPath);
    if (key !== null) { const b = unrepresentableByPath.get(key) ?? []; b.push(u); unrepresentableByPath.set(key, b); }
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

  // Path index. Built once; selection reads only its own bucket.
  const byPath = new Map<string, LedgerUsageRecord[]>();
  const unresolvedByCandidate = new Map<string, LedgerUsageRecord[]>();
  const unresolvedWithoutCandidates: LedgerUsageRecord[] = [];
  for (const u of ordered) {
    if (unrepresentableIds.has(u.usageId)) continue;
    const key = pathKeyOf(u.capacityPath);
    if (key !== null) { const b = byPath.get(key) ?? []; b.push(u); byPath.set(key, b); continue; }
    const path = u.capacityPath as Extract<CapacityPathRef, { kind: "UNRESOLVED" }>;
    if (path.candidateRuleIds.length === 0) {
      unresolvedWithoutCandidates.push(u);
      issues.push({ code: "ALLOCATION_INFORMATION_MISSING", message: `usage ${u.usageId} does not establish which capacity it consumed and names no candidate (${path.reason}); the usage exists, so attribution is missing rather than absent`, usageIds: [u.usageId] });
      continue;
    }
    issues.push({ code: "UNRESOLVED_CAPACITY_PATH", message: `usage ${u.usageId} does not establish which capacity it consumed (${path.reason}); candidates: ${[...path.candidateRuleIds].sort().join(", ")}`, usageIds: [u.usageId] });
    for (const c of [...new Set(path.candidateRuleIds)].sort()) { const b = unresolvedByCandidate.get(c) ?? []; b.push(u); unresolvedByCandidate.set(c, b); }
  }

  // A broken supersession chain makes the whole set unsafe. Duplicate identities and missing
  // attribution are quarantined and reported; the capacities they touch fail closed individually.
  const blocking = new Set(["SELF_SUPERSESSION", "SUPERSESSION_CYCLE"]);
  const safe = !issues.some((i) => blocking.has(i.code));
  issues.sort((a, b) => (`${a.code}|${a.usageIds.join(",")}` < `${b.code}|${b.usageIds.join(",")}` ? -1 : 1));
  outOfScope.sort((a, b) => (a.usageId < b.usageId ? -1 : 1));
  return {
    companyId: scope?.companyId ?? null, instrumentKey: scope?.instrumentKey ?? null,
    byId, successors, byPath, unresolvedByCandidate, unresolvedWithoutCandidates, quarantined, unrepresentableByPath, outOfScope, issues, safe, ordered,
  };
}

export interface UsageQuery {
  /** The capacity this usage would be counted against. */
  target: CapacityPathRef;
  asOf: string | null;
  /** The currency the capacity is denominated in, when it is known. */
  currency: string | null;
}

export type UsageBlockCode =
  | "AMBIGUOUS_CONSUMPTION_ALLOCATION"
  | "ALLOCATION_INFORMATION_MISSING"
  | "DUPLICATE_LEDGER_USAGE_IDENTITY"
  | "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"
  | "USAGE_AMOUNT_NOT_REPRESENTABLE"
  | "UNIT_FAILURE";

export interface UsageResult {
  /** Only the records that could apply to this capacity, each with its outcome. */
  selection: UsageSelection[];
  applied: LedgerUsageRecord[];
  /** Total of the applied records, through the Phase-4A unit algebra. Null when nothing applied. */
  total: SerializedRuntimeValue | null;
  /** Set when a record that could apply could not be counted, so the total is not trustworthy. */
  blocked: { code: UsageBlockCode; message: string; usageIds: string[] } | null;
  /** Records examined by this selection. A complexity counter, not a semantic result. */
  examined: number;
}

/**
 * Select and total the usage counted against one capacity.
 *
 * Only the index buckets that could apply are examined: records whose path names this capacity,
 * unresolved records naming this capacity as a candidate, unresolved records naming no candidate,
 * and quarantined records whose path or candidates name this capacity. Anything that might have
 * consumed this capacity but cannot be counted blocks the answer rather than being dropped.
 */
export function selectUsage(index: LedgerIndex, query: UsageQuery, policy: LedgerPolicy = DEFAULT_LEDGER_POLICY): UsageResult {
  const selection: UsageSelection[] = [];
  const applied: LedgerUsageRecord[] = [];
  const targetKey = pathKeyOf(query.target);
  const targetRuleId = query.target.kind === "RULE" ? query.target.ruleId : null;
  let examined = 0;

  // Quarantined identities that could touch this capacity fail it closed before anything is counted.
  const quarantinedHere: string[] = [];
  for (const [id, group] of index.quarantined) {
    examined += group.length;
    const touches = group.some((u) => pathKeyOf(u.capacityPath) === targetKey || (u.capacityPath.kind === "UNRESOLVED" && (u.capacityPath.candidateRuleIds.length === 0 || (targetRuleId !== null && u.capacityPath.candidateRuleIds.includes(targetRuleId)))));
    if (touches) quarantinedHere.push(id);
  }
  if (quarantinedHere.length > 0) {
    for (const id of quarantinedHere.sort()) selection.push({ usageId: id, rejectedBecause: "DUPLICATE_IDENTITY" });
    return { selection, applied: [], total: null, blocked: { code: "DUPLICATE_LEDGER_USAGE_IDENTITY", message: `usage identity claimed by more than one record could apply to this capacity; one identity may contribute at most once and the runtime will not choose between the claimants`, usageIds: quarantinedHere.sort() }, examined };
  }

  // A record on this path whose amount cannot be represented fails the capacity closed: it is a
  // claim about this capacity's consumption that the runtime will neither count nor discard.
  const unrepresentable = targetKey === null ? [] : (index.unrepresentableByPath.get(targetKey) ?? []);
  examined += unrepresentable.length;
  if (unrepresentable.length > 0) {
    const ids = unrepresentable.map((u) => u.usageId).sort();
    for (const id of ids) selection.push({ usageId: id, rejectedBecause: "AMOUNT_NOT_REPRESENTABLE" });
    return { selection, applied: [], total: null, blocked: { code: "USAGE_AMOUNT_NOT_REPRESENTABLE", message: `usage recorded against this capacity carries a negative or unparsable amount that is not a conserved reclassification half; it is neither counted nor discarded`, usageIds: ids }, examined };
  }

  // Attribution information missing for a usage that exists: every capacity in scope fails closed.
  if (index.unresolvedWithoutCandidates.length > 0) {
    examined += index.unresolvedWithoutCandidates.length;
    const ids = index.unresolvedWithoutCandidates.map((u) => u.usageId).sort();
    for (const id of ids) selection.push({ usageId: id, rejectedBecause: "PATH_UNRESOLVED" });
    return { selection, applied: [], total: null, blocked: { code: "ALLOCATION_INFORMATION_MISSING", message: `usage exists whose capacity attribution is missing entirely; until it is stated, no capacity in scope can state its remaining figure`, usageIds: ids }, examined };
  }

  // Unresolved records that name this capacity among their candidates: ambiguous, never allocated.
  const ambiguous = targetRuleId !== null ? (index.unresolvedByCandidate.get(targetRuleId) ?? []) : [];
  examined += ambiguous.length;
  if (ambiguous.length > 0) {
    const ids = ambiguous.map((u) => u.usageId).sort();
    for (const id of ids) selection.push({ usageId: id, rejectedBecause: "PATH_UNRESOLVED" });
    return { selection, applied: [], total: null, blocked: { code: "AMBIGUOUS_CONSUMPTION_ALLOCATION", message: `usage could have consumed this capacity but the record does not establish that it did; the runtime does not choose a path`, usageIds: ids }, examined };
  }

  const bucket = targetKey === null ? [] : (index.byPath.get(targetKey) ?? []);
  const currencyConflicts: string[] = [];
  for (const u of bucket) {
    examined++;
    const reject = (r: UsageRejectionReason) => { selection.push({ usageId: u.usageId, rejectedBecause: r }); };
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
    return { selection, applied: [], total: null, blocked: { code: "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: `usage recorded in a currency this capacity is not denominated in; no conversion is modelled`, usageIds: currencyConflicts.sort() }, examined };
  }
  if (applied.length === 0) return { selection, applied, total: null, blocked: null, examined };

  const values: RuntimeValue[] = applied.map((u) => ({ type: "MONEY", amount: rationalFromString(u.amount.amount), currency: u.amount.currency, lineage: L }));
  const sum = addAll(values, { exprId: null, inputKeys: applied.map((u) => u.usageId) });
  if (!sum.ok) return { selection, applied, total: null, blocked: { code: sum.code === "UNIT_MISMATCH" ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : "UNIT_FAILURE", message: sum.message, usageIds: applied.map((u) => u.usageId) }, examined };
  return { selection, applied, total: serializeValue(sum.value), blocked: null, examined };
}
