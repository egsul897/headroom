/**
 * Data access for the app. Every loader below takes `companyId` explicitly
 * (defaulting to Coherent, the only company currently seeded) rather than
 * baking a company id into the function bodies - there's still no
 * multi-tenant account-selection UI, but the data-access layer itself no
 * longer assumes a single tenant, so a page (or a future account switcher)
 * can pass a different id without touching this file.
 */
import { cache } from "react";
import { prisma } from "./prisma";
import { computeCovenantPosition, loadCompanyCovenantData, loadCompanySolverStaticData } from "./covenant-engine";
import { COHERENT_COMPANY, LEDGER_BASKET_LABELS } from "@/prisma/seed-data";

/** The tenant every page falls back to until account selection exists. Not consumed by lib/covenant-engine.ts or any calculation logic - only by page-level call sites below. */
export const DEFAULT_COMPANY_ID = COHERENT_COMPANY.id;
/** A fixed label per LedgerBasket enum value - generic across any company using that enum, not Coherent-specific. */
export { LEDGER_BASKET_LABELS };

/** Loads a company's documents/provisions/latest snapshot/ledger, deduped per request, date-scoped for amendment precedence. */
export const getCovenantData = cache(async (companyId: string = DEFAULT_COMPANY_ID, asOfDate: Date = new Date()) => {
  return loadCompanyCovenantData(prisma, companyId, asOfDate);
});

/** getCovenantData() plus the computed position (leverage metrics + per-document capacity). */
export const getPosition = cache(async (companyId: string = DEFAULT_COMPANY_ID, asOfDate: Date = new Date()) => {
  const data = await getCovenantData(companyId, asOfDate);
  const position = computeCovenantPosition(data);
  return { data, position };
});

/**
 * Loads a company's solver-native graph rows (Permission/relationship/shared-
 * constraint/collateral-scope/rule-activation/coverage-declaration), date-
 * scoped for amendment precedence - the data-access counterpart to
 * getCovenantData() for the solver-native composition path (design doc §Q).
 * For Coherent this always returns empty arrays for every field (zero
 * Permission rows have ever been populated for Coherent - see report §N).
 */
export const getSolverStaticData = cache(async (companyId: string = DEFAULT_COMPANY_ID, asOfDate: Date = new Date()) => {
  return loadCompanySolverStaticData(prisma, companyId, asOfDate);
});

export const getDebtTranches = cache(async (companyId: string = DEFAULT_COMPANY_ID) => {
  const snapshot = await prisma.financialSnapshot.findFirst({
    where: { companyId },
    orderBy: { asOfDate: "desc" },
  });
  if (!snapshot) return [];
  return prisma.debtTranche.findMany({
    where: { financialSnapshotId: snapshot.id },
    orderBy: { createdAt: "asc" },
  });
});

export const getLedgerEntries = cache(async (companyId: string = DEFAULT_COMPANY_ID) => {
  return prisma.ledgerEntry.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
});

export const getCompany = cache(async (companyId: string = DEFAULT_COMPANY_ID) => {
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
});

/** Raw Document rows (name/governs/notes) for display - the engine's DocumentInput deliberately omits non-computational fields like `notes`. */
export const getDocuments = cache(async (companyId: string = DEFAULT_COMPANY_ID) => {
  return prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
});

/** Raw FinancialSnapshot row (asOfDate/notes) for display - the engine's FinancialSnapshotInput deliberately omits non-computational fields. */
export const getFinancialSnapshot = cache(async (companyId: string = DEFAULT_COMPANY_ID, asOfDate: Date = new Date()) => {
  return prisma.financialSnapshot.findFirst({
    where: { companyId, asOfDate: { lte: asOfDate } },
    orderBy: { asOfDate: "desc" },
  });
});

export const getFeedQueueItems = cache(async (companyId: string = DEFAULT_COMPANY_ID) => {
  return prisma.feedQueueItem.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
});

export interface DefinedTermLite {
  termName: string;
  sectionRef: string;
  fullText: string;
  status: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
}

/**
 * Every provision's defined-term dependencies, keyed by `${documentId}:${code}`
 * - a plain Record (not a Map) so it's safe to pass as a prop into client
 * components like SimulateClient. This is the data behind ProvisionTrace's
 * "defined terms it depends on" expansion.
 */
export const getDefinedTermsByProvision = cache(
  async (companyId: string = DEFAULT_COMPANY_ID): Promise<Record<string, DefinedTermLite[]>> => {
    const provisions = await prisma.covenantProvision.findMany({
      where: { companyId },
      include: { definedTerms: { orderBy: { termName: "asc" } } },
    });
    const map: Record<string, DefinedTermLite[]> = {};
    for (const p of provisions) {
      map[`${p.documentId}:${p.code}`] = p.definedTerms.map((t) => ({
        termName: t.termName,
        sectionRef: t.sectionRef,
        fullText: t.fullText,
        status: t.status,
      }));
    }
    return map;
  }
);
