/**
 * Company-agnostic loader: DefinedTerms + LEVERAGE_RATIO_ROOM provisions /
 * permissions + verified financial snapshot → contractual leverage results.
 *
 * No companyId branching in computation — only Prisma I/O by companyId param.
 */

import { prisma } from "@/lib/prisma";
import { FinancialIdentityError, resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import type { FormulaParams } from "@/lib/covenant-engine";
import { calculateContractualLeverage } from "./calculate";
import {
  DEFAULT_SECURED_LEVERAGE_TERMS,
  DEFAULT_TOTAL_LEVERAGE_TERMS,
} from "./identify";
import type {
  ContractualLeverageResult,
  DefinitionText,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "./types";

export interface ContractualLeverageDashboardPayload {
  companyId: string;
  asOfDate: string | null;
  results: ContractualLeverageResult[];
  /** Serializable requests so the client can reflow on edited financials. */
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
  const resolution = await resolveCanonicalFinancialIdentity(
    (args) => prisma.financialState.findMany(args),
    { where: { companyId }, selection: "latest-cohort" },
  );
  if (resolution.status === "UNIQUE") return resolution.row.asOfDate;
  if (resolution.status === "AMBIGUOUS") {
    throw new FinancialIdentityError(
      "AMBIGUOUS",
      resolution.matchCount,
      `${resolution.matchCount} FinancialState rows claim the latest identity for company ${companyId}`,
    );
  }
  const snap = await prisma.financialSnapshot.findFirst({
    where: { companyId },
    orderBy: { asOfDate: "desc" },
  });
  return snap?.asOfDate ?? null;
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
 * Load and compute contractual leverage ratios for every LEVERAGE_RATIO_ROOM
 * covenant provision or solver-native permission with identifiable definitions.
 */
export async function loadContractualLeverageForCompany(
  companyId: string,
  asOfDateParam?: Date,
): Promise<ContractualLeverageDashboardPayload> {
  const asOfDate = await resolveAsOf(companyId, asOfDateParam);
  const effective = dateFilter(asOfDate);

  const [legacyProvisions, permissions, documents, snapshot] = await Promise.all([
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

  // Solver-native permissions (Matthews path) — skip ids already covered by legacy provisions.
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

  const requests: LeverageCalculationRequest[] = [];
  const results: ContractualLeverageResult[] = [];

  if (sources.length === 0) {
    results.push({
      status: "MISSING_DEFINITIONS",
      name: "Contractual leverage",
      sectionRef: "—",
      documentName: null,
      debtBasis: null,
      formulaDisplay: null,
      citations: [],
      limitations: [],
      inputs: [],
      missingRequirements: ["No LEVERAGE_RATIO_ROOM provision or permission modeled for this company"],
      currentRatio: null,
      threshold: null,
      ratioHeadroom: null,
      debtHeadroomMillions: null,
      debtHeadroomIsVerifiedCapacity: false,
      runtimeStatus: null,
      derivedEbitdaMillions: null,
      ebitdaBuildupKind: null,
      informationRequest: null,
    });
    return {
      companyId,
      asOfDate: asOfDate?.toISOString() ?? snapshot?.asOfDate.toISOString() ?? null,
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

    // Prefer named refs from the permission/provision when present.
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
    };
    requests.push(req);
    results.push(calculateContractualLeverage(req));
  }

  return {
    companyId,
    asOfDate: (asOfDate ?? snapshot?.asOfDate)?.toISOString() ?? null,
    results,
    requests,
  };
}
