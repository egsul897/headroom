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

import { Prisma, type Facility as PrismaFacility, type Permission as PrismaPermission } from "@prisma/client";
import { prisma } from "../prisma";
import { fact } from "../financial-core/types";

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
 * Creates a manually-entered FinancialState row (lib/financial-core) AND a
 * matching legacy FinancialSnapshot row (lib/covenant-engine) from the SAME
 * human input - the onboarding wizard's Financials stage. See
 * ManualFinancialStateInput's own comment for why both are written.
 */
export async function createManualFinancialState(input: ManualFinancialStateInput) {
  const { companyId, asOfDate } = input;

  await prisma.financialSnapshot.create({
    data: {
      companyId,
      asOfDate,
      ebitda: input.ebitda,
      cash: input.cash,
      interestExpense: input.interestExpense,
      cumulativeNetIncome: input.cumulativeNetIncomeSinceIssue,
      equityProceedsSinceIssue: input.equityProceedsSinceIssue,
      assumedNewDebtRatePct: input.assumedNewDebtRatePct,
      totalDebt: input.totalDebtPrincipal,
      securedDebt: input.securedDebtPrincipal,
      notes: input.notes,
    },
  });
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
