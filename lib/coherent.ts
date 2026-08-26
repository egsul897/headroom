/**
 * Data access for the app. Every loader below takes `companyId` explicitly
 * and required (task "UNIVERSAL HEADROOM PRODUCT EXPERIENCE" §4
 * generalization audit) - there is no silent "falls back to Coherent"
 * default anymore. That default existed only for a handful of now-deleted
 * legacy top-level pages (app/position, app/simulate, app/docs, app/ledger,
 * app/feeds - all Coherent-hardcoded, superseded by app/[companyId]/*) and
 * was, honestly, a real production risk: any future call site that forgot
 * to pass a companyId would have silently rendered Coherent's data instead
 * of failing loudly. Every real call site already passes an explicit id.
 */
import { cache } from "react";
import { prisma } from "./prisma";
import { computeCovenantPosition, loadCompanyCovenantData, loadCompanySolverStaticData } from "./covenant-engine";
import { COHERENT_COMPANY, LEDGER_BASKET_LABELS } from "@/prisma/seed-data";

/** A fixed label per LedgerBasket enum value - generic across any company using that enum, not Coherent-specific. */
export { LEDGER_BASKET_LABELS };

/**
 * The two golden regression companies (task "UNIVERSAL HEADROOM PRODUCT
 * EXPERIENCE" §79 - "Protected companies: Coherent, Matthews must remain
 * protected"). An explicit, minimal safety allowlist consumed only by the
 * delete flow (app/companies/[companyId]/delete/actions.ts) - not a
 * rendering/UI branch, and no other page reads it.
 */
export const PROTECTED_COMPANY_IDS = new Set<string>([COHERENT_COMPANY.id, "matthews"]);

/** Loads a company's documents/provisions/latest snapshot/ledger, deduped per request, date-scoped for amendment precedence. */
export const getCovenantData = cache(async (companyId: string, asOfDate: Date = new Date()) => {
  return loadCompanyCovenantData(prisma, companyId, asOfDate);
});

/** getCovenantData() plus the computed position (leverage metrics + per-document capacity). */
export const getPosition = cache(async (companyId: string, asOfDate: Date = new Date()) => {
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
export const getSolverStaticData = cache(async (companyId: string, asOfDate: Date = new Date()) => {
  return loadCompanySolverStaticData(prisma, companyId, asOfDate);
});

export const getDebtTranches = cache(async (companyId: string) => {
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

export const getLedgerEntries = cache(async (companyId: string) => {
  return prisma.ledgerEntry.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
});

export const getCompany = cache(async (companyId: string) => {
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
});

/** Raw Document rows (name/governs/notes) for display - the engine's DocumentInput deliberately omits non-computational fields like `notes`. */
export const getDocuments = cache(async (companyId: string) => {
  return prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
});

/** Raw FinancialSnapshot row (asOfDate/notes) for display - the engine's FinancialSnapshotInput deliberately omits non-computational fields. */
export const getFinancialSnapshot = cache(async (companyId: string, asOfDate: Date = new Date()) => {
  return prisma.financialSnapshot.findFirst({
    where: { companyId, asOfDate: { lte: asOfDate } },
    orderBy: { asOfDate: "desc" },
  });
});

export const getFeedQueueItems = cache(async (companyId: string) => {
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
export const getDefinedTermsByProvision = cache(async (companyId: string): Promise<Record<string, DefinedTermLite[]>> => {
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
});

/**
 * Per-document EBITDA definition, for the Docs tab (task "MAKE THE UI MATCH
 * THE PROTOTYPE EXACTLY"). Not derived/computed - just the raw DefinedTerm
 * row named "EBITDA" (or a defined variant like "Consolidated EBITDA") under
 * each document, if legal has entered one. A document with none returns
 * `null` for that key rather than fabricating a definition.
 */
export const getEbitdaDefinitionsByDocument = cache(async (companyId: string): Promise<Record<string, DefinedTermLite | null>> => {
  const documents = await prisma.document.findMany({ where: { companyId }, select: { id: true } });
  const terms = await prisma.definedTerm.findMany({
    where: { document: { companyId }, termName: { contains: "EBITDA", mode: "insensitive" } },
    orderBy: { termName: "asc" },
  });
  const byDoc = new Map<string, DefinedTermLite>();
  for (const t of terms) {
    if (!byDoc.has(t.documentId)) {
      byDoc.set(t.documentId, { termName: t.termName, sectionRef: t.sectionRef, fullText: t.fullText, status: t.status });
    }
  }
  const map: Record<string, DefinedTermLite | null> = {};
  for (const doc of documents) map[doc.id] = byDoc.get(doc.id) ?? null;
  return map;
});
