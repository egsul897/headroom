/**
 * Financial onboarding: manual entry (docs/company-onboarding-v1-implementation.md,
 * deliverable 4) + debt-instrument-to-facility mapping (deliverable 5) +
 * compliance-certificate confirmation (deliverable 6).
 *
 * Reuses lib/financial-core/** types (`fact`, `ProvencancedFact`) - no ERP
 * integration, manual entry only, per explicit scope. A first write wraps
 * every fact with `fact(...)`, tagged `sourceType: "REPORTED"` (a human
 * typed it in directly) and `reviewStatus: "UNVERIFIED"` by default -
 * never auto-VERIFIED (see lib/financial-core/types.ts's own ProvenanceWrapper
 * shape, reused verbatim here, never reinvented). A same-date FinancialState
 * rewrite keeps the prior wrapper when the numeric value is unchanged
 * (P3-FFC1b). FinancialSnapshot stays plain columns: this module does not
 * invent per-field snapshot provenance.
 *
 * P3-FFC2b: same-date Snapshot and State resolve goes through
 * resolveCanonicalFinancialIdentity with selection "exact". Zero rows is
 * absent. One row is that row. More than one row on either table fails the
 * batch closed. FinancialSnapshot @@unique([companyId, asOfDate]) landed in
 * P3-FFC2c. FinancialState @@unique stays HOLD. createManualFinancialState
 * product semantics stay HOLD.
 */

import { Prisma, type Facility as PrismaFacility, type Permission as PrismaPermission, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { fact } from "../financial-core/types";
import { FINANCIAL_IDENTITY_AMBIGUOUS, resolveCanonicalFinancialIdentity } from "../financial-identity";

/** Either the global client or a `prisma.$transaction` callback's `tx` - lets upsertFinancialFactForDate participate in lib/onboarding/promotion.ts's single all-or-nothing transaction instead of writing outside it. */
type FinancialDbClient = Prisma.TransactionClient | PrismaClient;

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

// ---------------------------------------------------------------------------
// Manual FinancialState entry
// ---------------------------------------------------------------------------

export interface ManualFinancialStateInput {
  companyId: string;
  asOfDate: Date;
  /**
   * Required - this codebase currently has TWO parallel financial models that
   * both remain live consumers for a solver-native company (confirmed by
   * inspecting Coherent's own data: it carries one row in EACH table, not
   * one-or-the-other): the legacy `FinancialSnapshot` table
   * (lib/covenant-engine.ts's `loadCompanyCovenantData` - what
   * `computeRemainingCapacityAfterDebtIncurrence` and therefore every
   * Overview/Capacity/Simulate capacity figure ultimately reads, via
   * lib/dashboard-service.ts) and the newer `FinancialState` table
   * (lib/financial-core/** - what `getFinancialPosition` reads for the
   * liquidity/maturity/leverage-metrics side of the same dashboard). Neither
   * this task nor Phase 1 unifies them, so one manual-entry action writes
   * BOTH rows from the same human input rather than leaving one of the two
   * dashboard halves silently broken for an onboarded company.
   */
  ebitda: number;
  cash: number;
  totalDebtPrincipal: number;
  securedDebtPrincipal: number;
  cumulativeNetIncomeSinceIssue: number;
  equityProceedsSinceIssue: number;
  interestExpense: number;
  assumedNewDebtRatePct: number;
  revenue?: number;
  gaapNetIncome?: number;
  capex?: number;
  notes?: string;
}

/**
 * Shapes the FinancialSnapshot row's plain-column data from a full
 * ManualFinancialStateInput - factored out of createManualFinancialState so
 * lib/onboarding/promotion.ts's FINANCIAL_FACT promotion path (Phase B) can
 * write the SAME fields from a merged (existing-row + one-new-fact) input
 * without duplicating this mapping.
 */
function snapshotFieldsFromInput(input: ManualFinancialStateInput) {
  return {
    ebitda: input.ebitda,
    cash: input.cash,
    interestExpense: input.interestExpense,
    cumulativeNetIncome: input.cumulativeNetIncomeSinceIssue,
    equityProceedsSinceIssue: input.equityProceedsSinceIssue,
    assumedNewDebtRatePct: input.assumedNewDebtRatePct,
    totalDebt: input.totalDebtPrincipal,
    securedDebt: input.securedDebtPrincipal,
  };
}

/**
 * Stored FinancialState JSON groups from the same date. Omitted when the
 * write is a first insert and there is no prior wrapper to carry.
 */
interface PriorFinancialStateFactGroups {
  balanceSheetFacts?: unknown;
  incomeStatementFacts?: unknown;
  covenantMetricFacts?: unknown;
}

const FACT_SOURCE_TYPES = new Set(["REPORTED", "RECONSTRUCTED", "ASSUMED", "EXTERNAL_CERTIFICATE"]);
const FACT_REVIEW_STATUSES = new Set(["UNVERIFIED", "VERIFIED", "DISPUTED"]);

type CarriedFact = {
  value: number;
  sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE";
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
  asOfDate: string | Date;
  notes?: string;
  staleness?: { maxAgeDays: number };
};

/** A usable prior wrapper, copied down to the ProvencancedFact fields this chunk carries. Anything else is not a wrapper and is not repaired. */
function readCarriedFact(raw: unknown): CarriedFact | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.value !== "number") return null;
  if (typeof o.sourceType !== "string" || !FACT_SOURCE_TYPES.has(o.sourceType)) return null;
  if (typeof o.reviewStatus !== "string" || !FACT_REVIEW_STATUSES.has(o.reviewStatus)) return null;
  let asOfDate: string | Date;
  if (o.asOfDate instanceof Date) {
    if (Number.isNaN(o.asOfDate.getTime())) return null;
    asOfDate = o.asOfDate;
  } else if (typeof o.asOfDate === "string" && !Number.isNaN(new Date(o.asOfDate).getTime())) {
    asOfDate = o.asOfDate;
  } else {
    return null;
  }
  if (o.notes !== undefined && typeof o.notes !== "string") return null;
  let staleness: { maxAgeDays: number } | undefined;
  if (o.staleness !== undefined) {
    if (!o.staleness || typeof o.staleness !== "object" || Array.isArray(o.staleness)) return null;
    const maxAgeDays = (o.staleness as { maxAgeDays?: unknown }).maxAgeDays;
    if (typeof maxAgeDays !== "number" || !Number.isFinite(maxAgeDays)) return null;
    staleness = { maxAgeDays };
  }
  const carried: CarriedFact = {
    value: o.value,
    sourceType: o.sourceType as CarriedFact["sourceType"],
    reviewStatus: o.reviewStatus as CarriedFact["reviewStatus"],
    asOfDate,
  };
  if (typeof o.notes === "string") carried.notes = o.notes;
  if (staleness) carried.staleness = staleness;
  return carried;
}

/** Unchanged numeric value keeps the prior wrapper. A changed value, or no usable prior wrapper, gets a fresh fact(). */
function factCarryingPrior(value: number, asOfDate: Date, prior: unknown) {
  const carried = readCarriedFact(prior);
  if (carried && carried.value === value) return carried;
  return fact(value, "REPORTED", asOfDate);
}

function priorRecord(group: unknown): Record<string, unknown> | null {
  if (!group || typeof group !== "object" || Array.isArray(group)) return null;
  return group as Record<string, unknown>;
}

/** Facts this write does not replace stay on the group when they are already usable wrappers. */
function withUntouchedPriorFacts(written: Record<string, unknown>, priorGroup: unknown): Record<string, unknown> {
  const prior = priorRecord(priorGroup);
  if (!prior) return written;
  const out: Record<string, unknown> = { ...written };
  for (const [key, raw] of Object.entries(prior)) {
    if (Object.prototype.hasOwnProperty.call(written, key)) continue;
    const carried = readCarriedFact(raw);
    if (carried) out[key] = carried;
  }
  return out;
}

function cloneJsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return JSON.parse(JSON.stringify(value)) as unknown[];
}

function covenantEbitdaFromInput(ebitda: number, asOfDate: Date, priorGroup: unknown) {
  const priorObj = priorRecord(priorRecord(priorGroup)?.covenantEbitda);
  const priorProvenance = readCarriedFact(priorObj?.provenance);
  if (priorObj && typeof priorObj.value === "number" && priorObj.value === ebitda && priorProvenance && priorProvenance.value === ebitda) {
    return { value: ebitda, addbacks: cloneJsonArray(priorObj.addbacks), provenance: priorProvenance };
  }
  return { value: ebitda, addbacks: [] as unknown[], provenance: fact(ebitda, "REPORTED", asOfDate) };
}

/**
 * Same factoring as snapshotFieldsFromInput, for FinancialState's three JSON fact groups.
 *
 * P3-FFC1b: optional prior fact groups from the same date. For each field
 * whose numeric value equals the prior ProvencancedFact `value`, reuse that
 * wrapper (`value`, `sourceType`, `reviewStatus`, `notes`, `asOfDate`,
 * `staleness`). A changed or new value, or a prior that is not a usable
 * wrapper, gets a fresh `fact(...)`. Optional facts omitted from `input`
 * keep a usable prior wrapper. No provenance is invented for a non-wrapper.
 * FinancialSnapshot has no per-field provenance; this function does not
 * invent any.
 *
 * `upsertFinancialFactsForDate` does not call this to rewrite a row whose
 * canonical numbers are left unchanged (conflict preserve, or identical-value
 * corroboration). It does call this when a same-date FinancialState JSON
 * row is rewritten, and when a missing state is created from an existing
 * snapshot (no prior wrappers to carry).
 */
function financialStateFactsFromInput(input: ManualFinancialStateInput, prior?: PriorFinancialStateFactGroups) {
  const { asOfDate } = input;
  const balancePrior = priorRecord(prior?.balanceSheetFacts);
  const incomePrior = priorRecord(prior?.incomeStatementFacts);
  const covenantPrior = priorRecord(prior?.covenantMetricFacts);

  const balanceSheetFacts = withUntouchedPriorFacts({
    cash: factCarryingPrior(input.cash, asOfDate, balancePrior?.cash),
    totalDebtPrincipal: factCarryingPrior(input.totalDebtPrincipal, asOfDate, balancePrior?.totalDebtPrincipal),
    securedDebtPrincipal: factCarryingPrior(input.securedDebtPrincipal, asOfDate, balancePrior?.securedDebtPrincipal),
  }, prior?.balanceSheetFacts);

  const incomeStatementFacts = withUntouchedPriorFacts({
    ...(input.revenue !== undefined ? { revenue: factCarryingPrior(input.revenue, asOfDate, incomePrior?.revenue) } : {}),
    gaapEbitda: factCarryingPrior(input.ebitda, asOfDate, incomePrior?.gaapEbitda),
    ...(input.gaapNetIncome !== undefined ? { gaapNetIncome: factCarryingPrior(input.gaapNetIncome, asOfDate, incomePrior?.gaapNetIncome) } : {}),
    cumulativeNetIncomeSinceIssue: factCarryingPrior(input.cumulativeNetIncomeSinceIssue, asOfDate, incomePrior?.cumulativeNetIncomeSinceIssue),
    equityProceedsSinceIssue: factCarryingPrior(input.equityProceedsSinceIssue, asOfDate, incomePrior?.equityProceedsSinceIssue),
    interestExpense: factCarryingPrior(input.interestExpense, asOfDate, incomePrior?.interestExpense),
    ...(input.capex !== undefined ? { capex: factCarryingPrior(input.capex, asOfDate, incomePrior?.capex) } : {}),
  }, prior?.incomeStatementFacts);

  const covenantMetricFacts = withUntouchedPriorFacts({
    assumedNewDebtRatePct: factCarryingPrior(input.assumedNewDebtRatePct, asOfDate, covenantPrior?.assumedNewDebtRatePct),
    covenantEbitda: covenantEbitdaFromInput(input.ebitda, asOfDate, prior?.covenantMetricFacts),
  }, prior?.covenantMetricFacts);

  return { balanceSheetFacts, incomeStatementFacts, covenantMetricFacts };
}

function financialStateJson(input: ManualFinancialStateInput, prior?: PriorFinancialStateFactGroups) {
  const built = financialStateFactsFromInput(input, prior);
  return {
    balanceSheetFacts: built.balanceSheetFacts as unknown as Prisma.InputJsonValue,
    incomeStatementFacts: built.incomeStatementFacts as unknown as Prisma.InputJsonValue,
    covenantMetricFacts: built.covenantMetricFacts as unknown as Prisma.InputJsonValue,
  };
}

function priorFactGroupsFromState(state: { balanceSheetFacts: unknown; incomeStatementFacts: unknown; covenantMetricFacts: unknown }): PriorFinancialStateFactGroups {
  return {
    balanceSheetFacts: state.balanceSheetFacts,
    incomeStatementFacts: state.incomeStatementFacts,
    covenantMetricFacts: state.covenantMetricFacts,
  };
}

/**
 * Creates a manually-entered FinancialState row (lib/financial-core) AND a
 * matching legacy FinancialSnapshot row (lib/covenant-engine) from the SAME
 * human input - the onboarding wizard's Financials stage. See
 * ManualFinancialStateInput's own comment for why both are written.
 */
export async function createManualFinancialState(input: ManualFinancialStateInput) {
  const { companyId, asOfDate } = input;

  await prisma.financialSnapshot.create({
    data: { companyId, asOfDate, ...snapshotFieldsFromInput(input), notes: input.notes },
  });
  // First insert. No prior same-date state is read, so every wrapper is a
  // fresh fact() — a different row's provenance is not copied onto this one.
  return prisma.financialState.create({
    data: {
      companyId,
      asOfDate,
      periodType: "ACTUAL",
      scope: "CONSOLIDATED",
      ...financialStateJson(input),
      notes: input.notes,
    },
  });
}

// ---------------------------------------------------------------------------
// FINANCIAL_FACT promotion (Phase B, lib/onboarding/promotion.ts) - a
// connector-discovered, human-approved financial fact upserts into the SAME
// FinancialSnapshot/FinancialState rows manual entry writes, so
// lib/dashboard-service.ts needs zero changes to reflect it (docs/
// autonomous-information-retrieval-v1.md "Source mapping" / "Canonical
// company state").
// ---------------------------------------------------------------------------

/**
 * The small, fixed, explicit mapping (task §17) from a FINANCIAL_FACT
 * candidate's `metricName` to the one ManualFinancialStateInput field it
 * updates - configuration/data, never company-specific code. An unrecognized
 * metricName is NOT in this map on purpose; callers must check for its
 * absence and skip with a clear reason (fail closed) rather than guess a
 * mapping.
 */
/**
 * Named fail-closed outcome when two or more claims disagree on one canonical
 * field (batch-internal, or batch versus an existing same-date value).
 * Promotion maps this code to REVIEW_REQUIRED and must not set promotedAt.
 * Not a winner, not a majority, not last-approved-wins.
 */
export const CONFLICTING_FINANCIAL_FACTS = "CONFLICTING_FINANCIAL_FACTS";

export const FINANCIAL_METRIC_FIELD_MAP: Record<string, keyof ReturnType<typeof requiredFieldsFromSnapshot>> = {
  cash: "cash",
  total_debt: "totalDebtPrincipal",
  secured_debt: "securedDebtPrincipal",
  covenant_ebitda: "ebitda",
  interest_expense: "interestExpense",
  cumulative_net_income: "cumulativeNetIncomeSinceIssue",
  equity_proceeds: "equityProceedsSinceIssue",
  assumed_new_debt_rate_pct: "assumedNewDebtRatePct",
};

type RequiredFinancialFields = Pick<ManualFinancialStateInput, "ebitda" | "cash" | "totalDebtPrincipal" | "securedDebtPrincipal" | "cumulativeNetIncomeSinceIssue" | "equityProceedsSinceIssue" | "interestExpense" | "assumedNewDebtRatePct">;

function requiredFieldsFromSnapshot(row: { ebitda: Prisma.Decimal | number; cash: Prisma.Decimal | number; totalDebt: Prisma.Decimal | number; securedDebt: Prisma.Decimal | number; cumulativeNetIncome: Prisma.Decimal | number; equityProceedsSinceIssue: Prisma.Decimal | number; interestExpense: Prisma.Decimal | number; assumedNewDebtRatePct: Prisma.Decimal | number }): RequiredFinancialFields {
  return {
    ebitda: toNumber(row.ebitda),
    cash: toNumber(row.cash),
    totalDebtPrincipal: toNumber(row.totalDebt),
    securedDebtPrincipal: toNumber(row.securedDebt),
    cumulativeNetIncomeSinceIssue: toNumber(row.cumulativeNetIncome),
    equityProceedsSinceIssue: toNumber(row.equityProceedsSinceIssue),
    interestExpense: toNumber(row.interestExpense),
    assumedNewDebtRatePct: toNumber(row.assumedNewDebtRatePct),
  };
}

export interface UpsertFinancialFactParams {
  companyId: string;
  asOfDate: Date;
  metricName: string;
  value: number;
  notes?: string;
}

export interface UpsertFinancialFactResult {
  applied: boolean;
  /** Populated only when applied is false - a clear, human-readable reason, never a fabricated mapping or a fabricated value. */
  skipReason?: string;
  financialSnapshotId?: string;
  financialStateId?: string;
}

/**
 * Upserts ONE financial fact into the company's FinancialSnapshot/
 * FinancialState row for `asOfDate` - reusing snapshotFieldsFromInput/
 * financialStateFactsFromInput (the SAME field-writing logic
 * createManualFinancialState uses) rather than a parallel writer.
 *
 * Both tables require a FULL set of 8 numeric fields per row (they were
 * designed around one human typing in a complete snapshot at once) - a
 * single connector-discovered fact only ever supplies ONE of those 8. This
 * function resolves that tension without copying another date's facts.
 * Same-date identity uses resolveCanonicalFinancialIdentity with selection
 * "exact" on { companyId, asOfDate }. Zero matches is absent. One match is
 * that row. More than one FinancialSnapshot or FinancialState row fails the
 * whole batch closed as FINANCIAL_IDENTITY_AMBIGUOUS: every fact is
 * applied:false, and neither table is rewritten.
 *   1. An existing row for this EXACT asOfDate is canonical V. A batch value
 *      equal to V corroborates and does not rewrite stored numbers. A batch
 *      value that disagrees is CONFLICTING_FINANCIAL_FACTS and does not
 *      overwrite V. An existing same-date FinancialState is left untouched
 *      in both of those cases. If the snapshot exists and the state row does
 *      not, the missing state is created from V with fresh wrappers.
 *   2. Otherwise the batch itself must collectively cover all 8 required
 *      fields. A snapshot with asOfDate < this fact's date is not a seed.
 *      A same-date FinancialState, if one already exists, is rewritten
 *      through the carry-aware builder rather than replaced by a second row.
 *   3. If there is no same-date row and the batch leaves a required field
 *      uncovered, this function FAILS CLOSED: it does not fabricate the
 *      missing fields as 0 and it does not copy them from a prior date. It
 *      returns applied:false with a clear skipReason. The fact stays an
 *      approved-but-not-yet-promotable candidate until a same-date manual
 *      snapshot exists or a same-date batch covers the remaining metrics.
 */
export interface BatchFinancialFact {
  /**
   * Caller-supplied identifier (lib/onboarding/promotion.ts passes the
   * originating ExtractionCandidate's own id) echoed back on the matching
   * perFact entry. Two facts in the same batch may share a metricName.
   * Identical values corroborate. Different values are
   * CONFLICTING_FINANCIAL_FACTS — iteration order must not pick a winner.
   */
  key: string;
  metricName: string;
  value: number;
}

export interface UpsertFinancialFactsResult {
  /** One entry per input fact, keyed by `key` - applied:true/false + skipReason, mirroring UpsertFinancialFactResult per-fact. */
  perFact: (UpsertFinancialFactResult & { key: string; metricName: string })[];
  financialSnapshotId?: string;
  financialStateId?: string;
}

type FactOutcome = UpsertFinancialFactResult & { key: string; metricName: string };

const ALL_REQUIRED_FIELDS: (keyof RequiredFinancialFields)[] = ["ebitda", "cash", "totalDebtPrincipal", "securedDebtPrincipal", "cumulativeNetIncomeSinceIssue", "equityProceedsSinceIssue", "interestExpense", "assumedNewDebtRatePct"];

/** Identical numbers (===) are one claim. Different numbers are never collapsed, and NaN does not collapse into itself. */
function distinctNumbers(values: number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (!out.some((existing) => existing === value)) out.push(value);
  }
  return out;
}

/** Order-independent rendering so two permutations of the same claims share one skipReason. */
function formatConflictValues(values: number[]): string {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const nonFinite = values.filter((v) => !Number.isFinite(v)).map((v) => String(v)).sort();
  return [...finite.map((v) => String(v)), ...nonFinite].join(", ");
}

function conflictSkipReason(field: keyof RequiredFinancialFields, values: number[]): string {
  return `${CONFLICTING_FINANCIAL_FACTS}: canonical field "${field}" has conflicting values (${formatConflictValues(values)}). REVIEW_REQUIRED. Not promoted (fail closed: no auto winner, no majority vote, no last-approved-wins, no insertion-order collapse).`;
}

function ambiguousIdentitySkipReason(asOfDate: Date, snapshotMatches: number, stateMatches: number): string {
  return `${FINANCIAL_IDENTITY_AMBIGUOUS}: same-date financial identity for ${asOfDate.toISOString().slice(0, 10)} is not unique (FinancialSnapshot matches=${snapshotMatches}, FinancialState matches=${stateMatches}). Not promoted (fail closed: no silent pick, no rewrite, no majority, no last-row, no insertion-order collapse).`;
}

function requiredFromResolved(resolved: Map<keyof RequiredFinancialFields, number>): RequiredFinancialFields {
  return {
    ebitda: resolved.get("ebitda")!,
    cash: resolved.get("cash")!,
    totalDebtPrincipal: resolved.get("totalDebtPrincipal")!,
    securedDebtPrincipal: resolved.get("securedDebtPrincipal")!,
    cumulativeNetIncomeSinceIssue: resolved.get("cumulativeNetIncomeSinceIssue")!,
    equityProceedsSinceIssue: resolved.get("equityProceedsSinceIssue")!,
    interestExpense: resolved.get("interestExpense")!,
    assumedNewDebtRatePct: resolved.get("assumedNewDebtRatePct")!,
  };
}

/**
 * The general form `upsertFinancialFactForDate` (below) delegates to for a
 * single fact: merges a WHOLE BATCH of facts for the SAME (companyId,
 * asOfDate) at once. This matters for the common real case a single-fact
 * call cannot handle - a CSV/EDGAR/upload source that reports SEVERAL
 * metrics for the same reporting date in one batch, for a company with NO
 * same-date FinancialSnapshot at all (e.g. a brand-new company's very first
 * financial data). Resolving facts one at a time (each looking for a
 * same-date row before the others in the same batch have been written)
 * would make EVERY one of them fail closed, even though the batch as a
 * whole may collectively supply all 8 required fields. Batching them
 * together fixes that without weakening the fail-closed guarantee: if the
 * batch (merged onto a same-date row, when one exists) still leaves a
 * required field with no source at all, this still creates nothing and
 * reports every affected fact as skipped with a clear reason — never a
 * fabricated 0 and never a value copied from an earlier date.
 *
 * Same canonical field: identical values corroborate. Different values,
 * including a batch value that disagrees with an existing same-date value,
 * fail closed as CONFLICTING_FINANCIAL_FACTS. Iteration order, majority,
 * and last-approved-wins do not choose a canonical number. `applied: true`
 * only for candidates that contributed the value that lands.
 *
 * Duplicate same-date Snapshot or State rows are AMBIGUOUS. This function
 * does not pick one of them and does not rewrite either table on that call.
 */
export async function upsertFinancialFactsForDate(companyId: string, asOfDate: Date, facts: BatchFinancialFact[], notes: string | undefined, client: FinancialDbClient = prisma): Promise<UpsertFinancialFactsResult> {
  const outcomes: FactOutcome[] = facts.map((f) => ({
    key: f.key,
    metricName: f.metricName,
    applied: false,
    skipReason: "Internal: fact was not classified - not promoted (fail closed).",
  }));

  type Claim = { index: number; key: string; metricName: string; field: keyof RequiredFinancialFields; value: number };
  const groups = new Map<keyof RequiredFinancialFields, Claim[]>();

  facts.forEach((f, index) => {
    const field = FINANCIAL_METRIC_FIELD_MAP[f.metricName];
    if (!field) {
      outcomes[index] = {
        key: f.key,
        metricName: f.metricName,
        applied: false,
        skipReason: `Unrecognized metricName "${f.metricName}" - no entry in FINANCIAL_METRIC_FIELD_MAP. Not promoted (fail closed): configuration/data gap, not an error, and never a fabricated mapping.`,
      };
      return;
    }
    const list = groups.get(field) ?? [];
    list.push({ index, key: f.key, metricName: f.metricName, field, value: f.value });
    groups.set(field, list);
  });

  if (groups.size === 0) return { perFact: outcomes };

  // Exact (companyId, asOfDate). 0 → UNKNOWN (absent). 1 → UNIQUE (that row).
  // >1 on Snapshot or State → AMBIGUOUS: no silent pick, no rewrite.
  // A prior date is outside this where, so it is never a seed (P3-R0 C6).
  const snapshotResolution = await resolveCanonicalFinancialIdentity(
    (args) => client.financialSnapshot.findMany(args),
    { where: { companyId, asOfDate }, selection: "exact" },
  );
  const stateResolution = await resolveCanonicalFinancialIdentity(
    (args) => client.financialState.findMany(args),
    { where: { companyId, asOfDate }, selection: "exact" },
  );
  if (snapshotResolution.status === "AMBIGUOUS" || stateResolution.status === "AMBIGUOUS") {
    const reason = ambiguousIdentitySkipReason(asOfDate, snapshotResolution.matchCount, stateResolution.matchCount);
    for (let index = 0; index < facts.length; index++) {
      const batchFact = facts[index]!;
      outcomes[index] = { key: batchFact.key, metricName: batchFact.metricName, applied: false, skipReason: reason };
    }
    return { perFact: outcomes };
  }
  const existingSnapshot = snapshotResolution.status === "UNIQUE" ? snapshotResolution.row : null;
  const existingState = stateResolution.status === "UNIQUE" ? stateResolution.row : null;

  const baseFromSameDate: RequiredFinancialFields | null = existingSnapshot ? requiredFieldsFromSnapshot(existingSnapshot) : null;

  const conflicted = new Set<keyof RequiredFinancialFields>();
  const resolvedFields = new Map<keyof RequiredFinancialFields, number>();
  const contributors: Claim[] = [];

  for (const [field, claims] of groups) {
    const distinct = distinctNumbers(claims.map((c) => c.value));
    const baseValue = baseFromSameDate ? baseFromSameDate[field] : undefined;
    const nonFinite = distinct.some((v) => !Number.isFinite(v));
    const disagreesWithBase = baseValue !== undefined && distinct.some((v) => v !== baseValue);
    if (nonFinite || disagreesWithBase || distinct.length !== 1) {
      conflicted.add(field);
      const shown = [...distinct];
      if (baseValue !== undefined && Number.isFinite(baseValue) && !shown.some((v) => v === baseValue)) shown.push(baseValue);
      const reason = conflictSkipReason(field, shown);
      for (const claim of claims) {
        outcomes[claim.index] = { key: claim.key, metricName: claim.metricName, applied: false, skipReason: reason };
      }
      continue;
    }
    resolvedFields.set(field, distinct[0]!);
    contributors.push(...claims);
  }

  if (!baseFromSameDate) {
    const missing = ALL_REQUIRED_FIELDS.filter((field) => !resolvedFields.has(field));
    if (missing.length > 0) {
      const conflictedMissing = missing.filter((field) => conflicted.has(field));
      const withheld = conflictedMissing.length > 0 ? ` Conflicted canonical field(s) not used as a value (no winner chosen): ${conflictedMissing.join(", ")}.` : "";
      const reason = `No same-date FinancialSnapshot for ${asOfDate.toISOString().slice(0, 10)}. Prior-date snapshots are not used as a seed. This batch does not cover: ${missing.join(", ")}. Not promoted (fail closed: never copies a value from an earlier date and never fabricates a required field as 0).${withheld}`;
      for (const claim of contributors) {
        outcomes[claim.index] = { key: claim.key, metricName: claim.metricName, applied: false, skipReason: reason };
      }
      return { perFact: outcomes };
    }
  }

  // Existing same-date V is preserved when the batch disagrees. No auto
  // winner, no majority, no last-approved-wins. Identical corroboration does
  // not rewrite stored numbers, so an existing state's wrappers stay
  // byte-stable. A first snapshot write that finds a same-date FinancialState
  // updates that state's JSON through the carry-aware builder (unchanged
  // field values keep their prior wrappers). A snapshot with no state row
  // gets the missing state created from the snapshot's own canonical numbers
  // — fresh fact() wrappers, because there is no prior state to carry.
  // Conflict preserve does not rewrite either row.
  let financialSnapshotId: string | undefined;
  let financialStateId: string | undefined;

  if (!baseFromSameDate) {
    const base = requiredFromResolved(resolvedFields);
    const merged: ManualFinancialStateInput = { companyId, asOfDate, ...base, notes };
    const snapshot = await client.financialSnapshot.create({ data: { companyId, asOfDate, ...snapshotFieldsFromInput(merged), notes: merged.notes } });
    const factData = financialStateJson(merged, existingState ? priorFactGroupsFromState(existingState) : undefined);
    const state = existingState
      ? await client.financialState.update({
          where: { id: existingState.id },
          data: factData,
        })
      : await client.financialState.create({
          data: {
            companyId,
            asOfDate,
            periodType: "ACTUAL",
            scope: "CONSOLIDATED",
            ...factData,
            notes: merged.notes,
          },
        });
    financialSnapshotId = snapshot.id;
    financialStateId = state.id;
  } else if (contributors.length > 0) {
    financialSnapshotId = existingSnapshot!.id;
    if (existingState) {
      financialStateId = existingState.id;
    } else {
      const merged: ManualFinancialStateInput = { companyId, asOfDate, ...baseFromSameDate, notes: existingSnapshot!.notes ?? undefined };
      const state = await client.financialState.create({
        data: {
          companyId,
          asOfDate,
          periodType: "ACTUAL",
          scope: "CONSOLIDATED",
          ...financialStateJson(merged),
          notes: merged.notes,
        },
      });
      financialStateId = state.id;
    }
  }

  if (financialSnapshotId) {
    for (const claim of contributors) {
      outcomes[claim.index] = {
        key: claim.key,
        metricName: claim.metricName,
        applied: true,
        financialSnapshotId,
        financialStateId,
      };
    }
  }

  const result: UpsertFinancialFactsResult = { perFact: outcomes };
  if (financialSnapshotId) result.financialSnapshotId = financialSnapshotId;
  if (financialStateId) result.financialStateId = financialStateId;
  return result;
}

/** Single-fact convenience wrapper over upsertFinancialFactsForDate. A single fact still fails closed when no same-date row exists and the other required fields are absent. A prior-date snapshot is not a seed. */
export async function upsertFinancialFactForDate(params: UpsertFinancialFactParams, client: FinancialDbClient = prisma): Promise<UpsertFinancialFactResult> {
  const result = await upsertFinancialFactsForDate(params.companyId, params.asOfDate, [{ key: "single", metricName: params.metricName, value: params.value }], params.notes, client);
  const { key: _key, metricName: _metricName, ...rest } = result.perFact[0]!;
  return rest;
}

// ---------------------------------------------------------------------------
// Debt-instrument-to-facility mapping (deliverable 5) - human-assisted, not
// exact-name-match-only.
// ---------------------------------------------------------------------------

/** Cheap, dependency-free token-overlap similarity - enough to RANK candidates for a human to pick from, never to auto-decide. */
function tokenOverlapScore(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length > 1));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

export interface PermissionMatchCandidate {
  permission: PrismaPermission & { document: { name: string } };
  score: number;
}

/**
 * Ranks a company's promoted Permission rows by textual similarity to a
 * manually-entered debt-instrument name (e.g. "Term Loan A", "2029 Senior
 * Secured Notes") - surfaced to a human in the mapping UI to confirm/correct,
 * never auto-applied. Deliberately NOT exact-string matching: an instrument
 * named "2029 Notes" should still surface a Permission whose `action` reads
 * "issue Senior Secured Notes due 2029" even though neither string contains
 * the other verbatim.
 */
export async function suggestPermissionMatches(companyId: string, instrumentName: string, limit = 5): Promise<PermissionMatchCandidate[]> {
  const permissions = await prisma.permission.findMany({ where: { companyId }, include: { document: { select: { name: true } } } });
  return permissions
    .map((p) => ({ permission: p, score: Math.max(tokenOverlapScore(instrumentName, p.action), tokenOverlapScore(instrumentName, p.code ?? ""), tokenOverlapScore(instrumentName, p.document.name) * 0.6) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface CreateFacilityInput {
  companyId: string;
  name: string;
  facilityType: "TERM_LOAN" | "REVOLVER" | "NOTES" | "ABL" | "OTHER";
  currency?: string;
  originalPrincipal: number;
  commitmentAmount?: number;
  secured: boolean;
  couponType: "FIXED" | "FLOATING";
  couponPct?: number;
  marginBps?: number;
  referenceRate?: string;
  maturityDate?: Date;
  issuedDate?: Date;
  governingDocumentId?: string;
  /** Human-confirmed Permission id(s) this facility was incurred under - see suggestPermissionMatches. Never auto-derived from a name match alone. */
  originatingPermissionIds: string[];
}

/** Creates a Facility row with a human-confirmed originatingPermissionIds mapping - the onboarding wizard's own write for deliverable 5. */
export async function createFacilityWithMapping(input: CreateFacilityInput): Promise<PrismaFacility> {
  return prisma.facility.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      facilityType: input.facilityType,
      currency: input.currency ?? "USD",
      originalPrincipal: input.originalPrincipal,
      commitmentAmount: input.commitmentAmount ?? null,
      secured: input.secured,
      couponType: input.couponType,
      couponPct: input.couponPct ?? null,
      marginBps: input.marginBps ?? null,
      referenceRate: input.referenceRate ?? null,
      maturityDate: input.maturityDate ?? null,
      issuedDate: input.issuedDate ?? null,
      governingDocumentId: input.governingDocumentId ?? null,
      obligorEntityClasses: [],
      guarantorEntityClasses: [],
      collateralPoolIds: [],
      originatingPermissionIds: input.originatingPermissionIds,
    },
  });
}

// ---------------------------------------------------------------------------
// Compliance-certificate confirmation (deliverable 6) - the ONLY place an
// ExternalInputRecord created by promotion (a placeholder: value=null,
// reviewStatus=UNVERIFIED) is ever given a real value and marked certified.
// Extraction alone never counts as certified - a human must supply the
// actual figure themselves, even if a COMPLIANCE_CERTIFICATE document was
// the thing that surfaced the requirement in the first place.
// ---------------------------------------------------------------------------

export interface CertifyExternalInputParams {
  externalInputRecordId: string;
  value: number;
  asOfDate: Date;
  sourceRef?: string;
}

export async function certifyExternalInputRecord(params: CertifyExternalInputParams) {
  const record = await prisma.externalInputRecord.findUniqueOrThrow({ where: { id: params.externalInputRecordId } });
  return prisma.externalInputRecord.update({
    where: { id: record.id },
    data: {
      value: params.value,
      asOfDate: params.asOfDate,
      sourceRef: params.sourceRef ?? record.sourceRef,
      // DefinedTermStatus.VERIFIED here means DATA FIDELITY ("a human
      // confirmed this figure against its certificate source"), the same
      // established meaning DefinedTerm.status/Permission.reviewStatus
      // already carry elsewhere in this codebase - explicitly NOT the
      // separate LegalReviewStatus/GoldenTestStatus "founder legal review"
      // dimension (prisma/schema.prisma's own LegalReviewRecord comment).
      reviewStatus: "VERIFIED",
    },
  });
}
