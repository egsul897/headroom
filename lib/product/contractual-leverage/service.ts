/**
 * Company-agnostic loader: DefinedTerms + LEVERAGE_RATIO_ROOM provisions /
 * permissions + financial snapshot / FinancialState line items → leverage results.
 *
 * Snapshot / seed scalars are labeled SEEDED_SNAPSHOT — never APPROVED merely
 * because they were loaded. No companyId branching in computation.
 */

import { loadApprovedSnapshotsFromPrisma } from "@/lib/contract-model/north-star-bridge";
import { prisma } from "@/lib/prisma";
import { FinancialIdentityError } from "@/lib/financial-identity";
import type { FormulaParams } from "@/lib/covenant-engine";
import type { CovenantEbitdaAddback } from "@/lib/financial-core/types";
import { resolveCanonicalFinancialAsOf } from "@/lib/product/canonical-financial-asof";
import { calculateContractualLeverage } from "./calculate";
import { CAPACITY_DISCLAIMER } from "./disclaimer";
import { bindLineItemsToNs4Snapshots } from "./evidence";
import {
  DEFAULT_SECURED_LEVERAGE_TERMS,
  DEFAULT_TOTAL_LEVERAGE_TERMS,
} from "./identify";
import type {
  ApprovedFinancialLineItem,
  ContractualLeverageResult,
  DefinitionText,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "./types";

export interface ContractualLeverageDashboardPayload {
  companyId: string;
  asOfDate: string | null;
  /** Persisted NS-4 APPROVED snapshot ids considered for this load. */
  ns4SnapshotIds: string[];
  results: ContractualLeverageResult[];
  requests: LeverageCalculationRequest[];
}

interface LeverageSourceRow {
  id: string;
  documentId: string;
  name: string;
  sectionRef: string;
  thresholdValue: number;
  debtBasis: "total" | "secured";
  definedTermNames: string[];
}

function num(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : v.toNumber();
}

async function resolveAsOf(companyId: string, asOfDateParam?: Date): Promise<Date | null> {
  if (asOfDateParam) return asOfDateParam;
  try {
    return await resolveCanonicalFinancialAsOf(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError && err.code === "AMBIGUOUS") throw err;
    // Fall back to legacy FinancialSnapshot date only when no FinancialState exists.
    const snap = await prisma.financialSnapshot.findFirst({
      where: { companyId },
      orderBy: { asOfDate: "desc" },
    });
    return snap?.asOfDate ?? null;
  }
}

function candidatesForBasis(basis: "total" | "secured"): string[] {
  return basis === "secured" ? DEFAULT_SECURED_LEVERAGE_TERMS : DEFAULT_TOTAL_LEVERAGE_TERMS;
}

function dateFilter(asOfDate: Date | null) {
  if (!asOfDate) return {};
  return {
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOfDate } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOfDate } }] },
    ],
  };
}

/**
 * Map FinancialState covenantEbitda addbacks → line items for EBITDA build-up.
 * Authority stays SEEDED_SNAPSHOT unless a future APPROVED bridge upgrades it.
 *
 * If addbacks already include a CNI / net-earnings base row, use them as the
 * full schedule (Coherent path). Otherwise reconstruct CNI = EBITDA − Σ(signed).
 */
function lineItemsFromCovenantEbitda(
  asOf: Date,
  covenantEbitda: { value: number; addbacks: CovenantEbitdaAddback[] } | null | undefined,
  cumulativeNetIncome: number | null | undefined,
  periodOverride?: string | null,
): ApprovedFinancialLineItem[] {
  if (!covenantEbitda?.addbacks?.length) return [];
  const asOfStr = asOf.toISOString().slice(0, 10);
  const period = periodOverride ?? `TTM-${asOfStr}`;
  const hasEmbeddedBase = covenantEbitda.addbacks.some((a) =>
    /net\s+income|net\s+earnings|consolidated\s+net\s+income/i.test(a.label),
  );

  if (hasEmbeddedBase) {
    return covenantEbitda.addbacks.map((ab, i) => {
      const isGain = /gain\s+on\s+/i.test(ab.label);
      const isTaxBenefit = /tax\s+benefit/i.test(ab.label);
      return {
        key: /net\s+income|net\s+earnings/i.test(ab.label) ? "cni" : `line_${i}`,
        label: ab.label,
        amountMillions: isTaxBenefit || isGain ? Math.abs(ab.amount) : ab.amount,
        period,
        asOf: asOfStr,
        authority: "SEEDED_SNAPSHOT" as const,
      };
    });
  }

  if (cumulativeNetIncome == null) return [];
  const items: ApprovedFinancialLineItem[] = [
    {
      key: "cni",
      label: "Consolidated Net Income",
      amountMillions: cumulativeNetIncome,
      period,
      asOf: asOfStr,
      authority: "SEEDED_SNAPSHOT",
    },
  ];
  for (const [i, ab] of covenantEbitda.addbacks.entries()) {
    const label = ab.label;
    const isTaxBenefit = /tax\s+benefit/i.test(label);
    const isGain = /gain\s+on\s+/i.test(label);
    items.push({
      key: `addback_${i}`,
      label,
      amountMillions: isTaxBenefit || isGain ? Math.abs(ab.amount) : ab.amount,
      period,
      asOf: asOfStr,
      authority: "SEEDED_SNAPSHOT",
    });
  }
  return items;
}

function emptyMissing(message: string): ContractualLeverageResult {
  return {
    status: "MISSING_DEFINITIONS",
    name: "Contractual leverage",
    sectionRef: "—",
    documentName: null,
    debtBasis: null,
    formulaDisplay: null,
    citations: [],
    limitations: [],
    inputs: [],
    missingRequirements: [message],
    currentRatio: null,
    threshold: null,
    ratioHeadroom: null,
    debtHeadroomMillions: null,
    runtimeStatus: null,
    inputAuthority: "SEEDED_SNAPSHOT",
    computationAuthority: "INDICATIVE",
    contractualEligibility: "UNRESOLVED",
    headroomPresentation: "NOT_PRESENTED_AS_CAPACITY",
    capacityDisclaimer: CAPACITY_DISCLAIMER,
    ebitdaBuildup: null,
    ns4SnapshotId: null,
  };
}

export async function loadContractualLeverageForCompany(
  companyId: string,
  asOfDateParam?: Date,
): Promise<ContractualLeverageDashboardPayload> {
  const asOfDate = await resolveAsOf(companyId, asOfDateParam);
  const effective = dateFilter(asOfDate);

  const [legacyProvisions, permissions, documents, snapshot, financialState] = await Promise.all([
    prisma.covenantProvision.findMany({
      where: { companyId, formulaType: "LEVERAGE_RATIO_ROOM", ...effective },
      include: { definedTerms: true },
      orderBy: { sectionRef: "asc" },
    }),
    prisma.permission.findMany({
      where: { companyId, formulaType: "LEVERAGE_RATIO_ROOM", ...effective },
      orderBy: { sectionRef: "asc" },
    }),
    prisma.document.findMany({ where: { companyId } }),
    asOfDate
      ? prisma.financialSnapshot.findUnique({ where: { companyId_asOfDate: { companyId, asOfDate } } })
      : prisma.financialSnapshot.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } }),
    asOfDate
      ? prisma.financialState.findFirst({ where: { companyId, asOfDate }, orderBy: { createdAt: "desc" } })
      : prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } }),
  ]);

  const docName = new Map(documents.map((d) => [d.id, d.name]));
  const allDocTerms = await prisma.definedTerm.findMany({
    where: { documentId: { in: documents.map((d) => d.id) } },
  });
  const termsByDoc = new Map<string, DefinitionText[]>();
  for (const t of allDocTerms) {
    const list = termsByDoc.get(t.documentId) ?? [];
    list.push({
      termName: t.termName,
      sectionRef: t.sectionRef,
      fullText: t.fullText,
      documentId: t.documentId,
      documentName: docName.get(t.documentId),
    });
    termsByDoc.set(t.documentId, list);
  }

  const sources: LeverageSourceRow[] = [];

  for (const p of legacyProvisions) {
    const params = (p.params ?? {}) as FormulaParams;
    sources.push({
      id: p.id,
      documentId: p.documentId,
      name: p.basketName,
      sectionRef: p.sectionRef,
      thresholdValue: num(p.thresholdValue) ?? 0,
      debtBasis: params.debtBasis === "secured" ? "secured" : "total",
      definedTermNames: p.definedTerms.map((t) => t.termName),
    });
  }

  const legacyKeys = new Set(sources.map((s) => `${s.documentId}::${s.sectionRef}`));
  for (const p of permissions) {
    const key = `${p.documentId}::${p.sectionRef}`;
    if (legacyKeys.has(key)) continue;
    const params = (p.params ?? {}) as FormulaParams;
    sources.push({
      id: p.id,
      documentId: p.documentId,
      name: p.action,
      sectionRef: p.sectionRef,
      thresholdValue: num(p.thresholdValue) ?? 0,
      debtBasis: params.debtBasis === "secured" ? "secured" : "total",
      definedTermNames: p.definedTermRefs ?? [],
    });
  }

  const financials: LeverageFinancialInputs = {
    ebitda: num(snapshot?.ebitda),
    totalDebt: num(snapshot?.totalDebt),
    securedDebt: num(snapshot?.securedDebt),
    cash: num(snapshot?.cash),
  };

  // FinancialState addbacks — SEEDED_SNAPSHOT authority (PUBLIC_FILING_RECONSTRUCTION).
  let ebitdaLineItems: ApprovedFinancialLineItem[] = [];
  let expectedPeriod: string | null = null;
  if (financialState) {
    const covenantFacts = financialState.covenantMetricFacts as {
      covenantEbitda?: { value: number; addbacks: CovenantEbitdaAddback[]; periodKey?: string };
    } | null;
    const incomeFacts = financialState.incomeStatementFacts as {
      cumulativeNetIncomeSinceIssue?: { value?: number };
    } | null;
    const addbacks = covenantFacts?.covenantEbitda?.addbacks ?? [];
    const ebitdaVal = covenantFacts?.covenantEbitda?.value;
    const periodKey =
      covenantFacts?.covenantEbitda?.periodKey ??
      (addbacks.some((a) => /net\s+earnings\s+attributable/i.test(a.label))
        ? `FY2026-${financialState.asOfDate.toISOString().slice(0, 10)}`
        : `TTM-${financialState.asOfDate.toISOString().slice(0, 10)}`);

    if (addbacks.length > 0) {
      const hasEmbeddedBase = addbacks.some((a) => /net\s+income|net\s+earnings/i.test(a.label));
      if (hasEmbeddedBase) {
        ebitdaLineItems = lineItemsFromCovenantEbitda(
          financialState.asOfDate,
          covenantFacts?.covenantEbitda,
          null,
          periodKey,
        );
        expectedPeriod = periodKey;
      } else if (ebitdaVal != null) {
        const signedSum = addbacks.reduce((s, a) => s + a.amount, 0);
        const cni = ebitdaVal - signedSum;
        ebitdaLineItems = lineItemsFromCovenantEbitda(
          financialState.asOfDate,
          covenantFacts?.covenantEbitda,
          cni,
          periodKey,
        );
        expectedPeriod = periodKey;
      } else {
        const cni = incomeFacts?.cumulativeNetIncomeSinceIssue?.value ?? null;
        ebitdaLineItems = lineItemsFromCovenantEbitda(
          financialState.asOfDate,
          covenantFacts?.covenantEbitda,
          cni,
          periodKey,
        );
        if (ebitdaLineItems.length) expectedPeriod = periodKey;
      }
    }
  }

  // Bind component facts to persisted NS-4 APPROVED snapshots when available.
  // Missing components remain missing — never zero-filled.
  const ns4Snapshots = await loadApprovedSnapshotsFromPrisma(prisma, companyId).catch(() => []);
  const ns4SnapshotIds = ns4Snapshots.map((s) => s.snapshotId);
  let ns4SnapshotId: string | null = null;
  let financialAuthority: "SEEDED_SNAPSHOT" | "APPROVED_PERIOD_MATCHED" = "SEEDED_SNAPSHOT";
  if (ebitdaLineItems.length && ns4Snapshots.length) {
    const bound = bindLineItemsToNs4Snapshots({ lineItems: ebitdaLineItems, snapshots: ns4Snapshots });
    ebitdaLineItems = bound.bound;
    ns4SnapshotId = bound.ns4SnapshotId;
    // Only upgrade leaf authority when EVERY required component bound to NS-4.
    if (bound.missingKeys.length === 0 && bound.ns4SnapshotId) {
      financialAuthority = "APPROVED_PERIOD_MATCHED";
    }
  }

  const requests: LeverageCalculationRequest[] = [];
  const results: ContractualLeverageResult[] = [];

  if (sources.length === 0) {
    results.push(emptyMissing("No LEVERAGE_RATIO_ROOM provision or permission modeled for this company"));
    return {
      companyId,
      asOfDate: asOfDate?.toISOString() ?? snapshot?.asOfDate.toISOString() ?? null,
      ns4SnapshotIds,
      results,
      requests,
    };
  }

  for (const src of sources) {
    const docDefs = termsByDoc.get(src.documentId) ?? [];
    const linked = docDefs.filter((d) =>
      src.definedTermNames.some((n) => n.toLowerCase() === d.termName.toLowerCase()),
    );
    const definitions =
      linked.length > 0
        ? [...linked, ...docDefs.filter((d) => !linked.some((l) => l.termName === d.termName))]
        : docDefs;

    const leverageFromRefs = src.definedTermNames.filter((n) => /leverage\s+ratio/i.test(n));
    const leverageTermCandidates =
      leverageFromRefs.length > 0 ? leverageFromRefs : candidatesForBasis(src.debtBasis);

    const req: LeverageCalculationRequest = {
      name: src.name,
      sectionRef: src.sectionRef,
      documentName: docName.get(src.documentId) ?? null,
      companyId,
      instrumentKey: src.documentId,
      definitions,
      leverageTermCandidates,
      ebitdaTermCandidates: ["Consolidated EBITDA", "Adjusted EBITDA", "EBITDA"],
      threshold: src.thresholdValue,
      debtBasisHint: src.debtBasis,
      financials,
      financialAuthority,
      ebitdaLineItems: ebitdaLineItems.length ? ebitdaLineItems : undefined,
      expectedPeriod,
      ns4SnapshotId,
      // Heuristic classification remains provisional — never auto-bound.
      contractualEligibilityBound: false,
    };
    // Server evaluation may use NS-4 snapshots; client package omits them.
    results.push(calculateContractualLeverage({ ...req, ns4Snapshots }));
    requests.push(req);
  }

  return {
    companyId,
    asOfDate: (asOfDate ?? snapshot?.asOfDate)?.toISOString() ?? null,
    ns4SnapshotIds,
    results,
    requests,
  };
}
