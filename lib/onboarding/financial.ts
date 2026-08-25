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

/** Same factoring as snapshotFieldsFromInput, for FinancialState's three JSON fact groups. */
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
 * function resolves that tension by finding a BASE row to seed the other 7
 * fields from:
 *   1. An existing row for this EXACT asOfDate, if one exists (created by a
 *      prior manual entry or a prior promoted fact for the same date) - the
 *      new metric's field is merged on top of it and the row is UPDATED.
 *   2. Otherwise, the company's most recent PRIOR row (asOfDate < this
 *      fact's) - its 8 values seed a NEW row, again with only this metric's
 *      field overridden.
 *   3. If neither exists (this is the company's very first financial fact of
 *      any kind), this function FAILS CLOSED: it does not fabricate the
 *      other 7 required fields as 0 or any other guessed value. It returns
 *      applied:false with a clear skipReason instead - the fact remains an
 *      approved-but-not-yet-promotable candidate until either a full manual
 *      snapshot or a second promotable fact for the same date exists to seed
 *      the missing fields from.
 */
export interface BatchFinancialFact {
  /** Caller-supplied identifier (lib/onboarding/promotion.ts passes the originating ExtractionCandidate's own id) echoed back on the matching perFact entry - avoids relying on array position or on metricName uniqueness (two facts in the same batch CAN legitimately share a metricName, e.g. two independently-approved candidates both proposing "cash" for the same date) to match a result back to its request. */
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

/**
 * The general form `upsertFinancialFactForDate` (below) delegates to for a
 * single fact: merges a WHOLE BATCH of facts for the SAME (companyId,
 * asOfDate) at once. This matters for the common real case a single-fact
 * call cannot handle - a CSV/EDGAR/upload source that reports SEVERAL
 * metrics for the same reporting date in one batch, for a company with NO
 * prior FinancialSnapshot at all (e.g. a brand-new company's very first
 * financial data). Resolving facts one at a time (each looking for a "base"
 * row before the others in the same batch have been written) would make
 * EVERY one of them fail closed, even though the batch as a whole may
 * collectively supply all 8 required fields. Batching them together fixes
 * that without weakening the fail-closed guarantee: if the batch (merged
 * onto whatever base row exists) still leaves a required field with no
 * source at all, this still creates nothing and reports every affected fact
 * as skipped with a clear reason - never a fabricated 0.
 */
export async function upsertFinancialFactsForDate(companyId: string, asOfDate: Date, facts: BatchFinancialFact[], notes: string | undefined, client: FinancialDbClient = prisma): Promise<UpsertFinancialFactsResult> {
  const perFact: (UpsertFinancialFactResult & { key: string; metricName: string })[] = [];
  const resolvedFields = new Map<keyof RequiredFinancialFields, number>();
  const applicableFacts: { key: string; metricName: string; field: keyof RequiredFinancialFields; value: number }[] = [];

  for (const f of facts) {
    const field = FINANCIAL_METRIC_FIELD_MAP[f.metricName];
    if (!field) {
      perFact.push({ key: f.key, metricName: f.metricName, applied: false, skipReason: `Unrecognized metricName "${f.metricName}" - no entry in FINANCIAL_METRIC_FIELD_MAP. Not promoted (fail closed): configuration/data gap, not an error, and never a fabricated mapping.` });
      continue;
    }
    resolvedFields.set(field, f.value);
    applicableFacts.push({ key: f.key, metricName: f.metricName, field, value: f.value });
  }

  if (applicableFacts.length === 0) return { perFact };

  const existingSnapshot = await client.financialSnapshot.findFirst({ where: { companyId, asOfDate } });
  const existingState = await client.financialState.findFirst({ where: { companyId, asOfDate } });

  let base: RequiredFinancialFields | null = existingSnapshot ? requiredFieldsFromSnapshot(existingSnapshot) : null;
  if (!base) {
    const prior = await client.financialSnapshot.findFirst({ where: { companyId, asOfDate: { lt: asOfDate } }, orderBy: { asOfDate: "desc" } });
    if (prior) base = requiredFieldsFromSnapshot(prior);
  }

  const ALL_FIELDS: (keyof RequiredFinancialFields)[] = ["ebitda", "cash", "totalDebtPrincipal", "securedDebtPrincipal", "cumulativeNetIncomeSinceIssue", "equityProceedsSinceIssue", "interestExpense", "assumedNewDebtRatePct"];

  if (!base) {
    // No base row anywhere - the batch itself must collectively cover all 8 required fields, or every applicable fact is skipped (never a fabricated 0 for whatever's missing).
    const missing = ALL_FIELDS.filter((f) => !resolvedFields.has(f));
    if (missing.length > 0) {
      const reason = `No existing or prior FinancialSnapshot for ${asOfDate.toISOString().slice(0, 10)} to seed the missing required field(s) from, and this batch does not itself cover: ${missing.join(", ")}. Not promoted (fail closed: never fabricates a required field as 0). Promote a full manual financial snapshot first, or wait for facts covering the remaining metrics.`;
      for (const f of applicableFacts) perFact.push({ key: f.key, metricName: f.metricName, applied: false, skipReason: reason });
      return { perFact };
    }
    base = {
      ebitda: resolvedFields.get("ebitda")!,
      cash: resolvedFields.get("cash")!,
      totalDebtPrincipal: resolvedFields.get("totalDebtPrincipal")!,
      securedDebtPrincipal: resolvedFields.get("securedDebtPrincipal")!,
      cumulativeNetIncomeSinceIssue: resolvedFields.get("cumulativeNetIncomeSinceIssue")!,
      equityProceedsSinceIssue: resolvedFields.get("equityProceedsSinceIssue")!,
      interestExpense: resolvedFields.get("interestExpense")!,
      assumedNewDebtRatePct: resolvedFields.get("assumedNewDebtRatePct")!,
    };
  } else {
    base = { ...base, ...Object.fromEntries(resolvedFields) };
  }

  const merged: ManualFinancialStateInput = { companyId, asOfDate, ...base, notes };

  const snapshot = existingSnapshot
    ? await client.financialSnapshot.update({ where: { id: existingSnapshot.id }, data: { ...snapshotFieldsFromInput(merged), notes: merged.notes ?? existingSnapshot.notes } })
    : await client.financialSnapshot.create({ data: { companyId, asOfDate, ...snapshotFieldsFromInput(merged), notes: merged.notes } });

  const { balanceSheetFacts, incomeStatementFacts, covenantMetricFacts } = financialStateFactsFromInput(merged);
  const state = existingState
    ? await client.financialState.update({
        where: { id: existingState.id },
        data: { balanceSheetFacts: balanceSheetFacts as unknown as Prisma.InputJsonValue, incomeStatementFacts: incomeStatementFacts as unknown as Prisma.InputJsonValue, covenantMetricFacts: covenantMetricFacts as unknown as Prisma.InputJsonValue, notes: merged.notes ?? existingState.notes },
      })
    : await client.financialState.create({
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

  for (const f of applicableFacts) perFact.push({ key: f.key, metricName: f.metricName, applied: true, financialSnapshotId: snapshot.id, financialStateId: state.id });
  return { perFact, financialSnapshotId: snapshot.id, financialStateId: state.id };
}

/** Single-fact convenience wrapper over upsertFinancialFactsForDate - see that function's own header comment for why a batch of sibling facts for the same date should generally be promoted together when a company has no prior snapshot to seed from. */
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
