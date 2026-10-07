/**
 * Financial onboarding: manual entry (docs/company-onboarding-v1-implementation.md,
 * deliverable 4) + debt-instrument-to-facility mapping (deliverable 5) +
 * compliance-certificate confirmation (deliverable 6).
 *
 * Reuses lib/financial-core/** types (`fact`, `ProvencancedFact`) - no ERP
 * integration, manual entry only, per explicit scope. Every fact this module
 * writes is wrapped with `fact(...)`, tagged `sourceType: "REPORTED"` (a
 * human typed it in directly) and `reviewStatus: "UNVERIFIED"` by default -
 * never auto-VERIFIED (see lib/financial-core/types.ts's own ProvenanceWrapper
 * shape, reused verbatim here, never reinvented).
 */

import { Prisma, type Facility as PrismaFacility, type Permission as PrismaPermission, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { fact } from "../financial-core/types";

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
 * Same factoring as snapshotFieldsFromInput, for FinancialState's three JSON fact groups.
 *
 * P3-FFC1b (HOLD follow-on, not this chunk): a same-date update through this
 * function rebuilds every fact wrapper. Unchanged fields receive new
 * wrappers, and prior source/review metadata is not carried.
 * FinancialSnapshot has no per-field provenance. FFC1 does not rewrite that
 * path. `upsertFinancialFactsForDate` does not call this when an existing
 * same-date row's canonical numbers are left unchanged (conflict preserve,
 * or identical-value corroboration).
 */
function financialStateFactsFromInput(input: ManualFinancialStateInput) {
  const { asOfDate } = input;
  const balanceSheetFacts = {
    cash: fact(input.cash, "REPORTED", asOfDate),
    totalDebtPrincipal: fact(input.totalDebtPrincipal, "REPORTED", asOfDate),
    securedDebtPrincipal: fact(input.securedDebtPrincipal, "REPORTED", asOfDate),
  };
  const incomeStatementFacts = {
    ...(input.revenue !== undefined ? { revenue: fact(input.revenue, "REPORTED", asOfDate) } : {}),
    gaapEbitda: fact(input.ebitda, "REPORTED", asOfDate),
    ...(input.gaapNetIncome !== undefined ? { gaapNetIncome: fact(input.gaapNetIncome, "REPORTED", asOfDate) } : {}),
    cumulativeNetIncomeSinceIssue: fact(input.cumulativeNetIncomeSinceIssue, "REPORTED", asOfDate),
    equityProceedsSinceIssue: fact(input.equityProceedsSinceIssue, "REPORTED", asOfDate),
    interestExpense: fact(input.interestExpense, "REPORTED", asOfDate),
    ...(input.capex !== undefined ? { capex: fact(input.capex, "REPORTED", asOfDate) } : {}),
  };
  const covenantMetricFacts = {
    assumedNewDebtRatePct: fact(input.assumedNewDebtRatePct, "REPORTED", asOfDate),
    covenantEbitda: { value: input.ebitda, addbacks: [], provenance: fact(input.ebitda, "REPORTED", asOfDate) },
  };
  return { balanceSheetFacts, incomeStatementFacts, covenantMetricFacts };
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
  const { balanceSheetFacts, incomeStatementFacts, covenantMetricFacts } = financialStateFactsFromInput(input);

  return prisma.financialState.create({
    data: {
      companyId,
      asOfDate,
      periodType: "ACTUAL",
      scope: "CONSOLIDATED",
      balanceSheetFacts: balanceSheetFacts as unknown as Prisma.InputJsonValue,
      incomeStatementFacts: incomeStatementFacts as unknown as Prisma.InputJsonValue,
      covenantMetricFacts: covenantMetricFacts as unknown as Prisma.InputJsonValue,
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
 * function resolves that tension without copying another date's facts:
 *   1. An existing row for this EXACT asOfDate, if one exists (created by a
 *      prior manual entry or a prior promoted fact for the same date) - the
 *      new metric's field is merged on top of it and the row is UPDATED.
 *   2. Otherwise the batch itself must collectively cover all 8 required
 *      fields. A snapshot with asOfDate < this fact's date is not a seed.
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

  const existingSnapshot = await client.financialSnapshot.findFirst({ where: { companyId, asOfDate } });
  const existingState = await client.financialState.findFirst({ where: { companyId, asOfDate } });

  // Same-date row only. A snapshot dated earlier is a different period and
  // is never read as a seed (P3-R0 C6).
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

  // Existing same-date V is preserved when the batch disagrees. Resolved
  // groups on an existing row are identical corroboration, so the stored
  // numbers do not change and the row is not rewritten (wrapper carry is
  // P3-FFC1b). A first write happens only when the non-conflicting groups
  // themselves cover every required field.
  let financialSnapshotId: string | undefined;
  let financialStateId: string | undefined;

  if (!baseFromSameDate) {
    const base = requiredFromResolved(resolvedFields);
    const merged: ManualFinancialStateInput = { companyId, asOfDate, ...base, notes };
    const snapshot = await client.financialSnapshot.create({ data: { companyId, asOfDate, ...snapshotFieldsFromInput(merged), notes: merged.notes } });
    const { balanceSheetFacts, incomeStatementFacts, covenantMetricFacts } = financialStateFactsFromInput(merged);
    const state = await client.financialState.create({
      data: {
        companyId,
        asOfDate,
        periodType: "ACTUAL",
        scope: "CONSOLIDATED",
        balanceSheetFacts: balanceSheetFacts as unknown as Prisma.InputJsonValue,
        incomeStatementFacts: incomeStatementFacts as unknown as Prisma.InputJsonValue,
        covenantMetricFacts: covenantMetricFacts as unknown as Prisma.InputJsonValue,
        notes: merged.notes,
      },
    });
    financialSnapshotId = snapshot.id;
    financialStateId = state.id;
  } else if (contributors.length > 0) {
    financialSnapshotId = existingSnapshot!.id;
    financialStateId = existingState?.id;
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
