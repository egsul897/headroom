/**
 * Single-tenant data access for the app. Coherent Corp. is the only company
 * seeded in the database right now, so every page just reads its data - no
 * multi-tenant routing/session logic yet, per the current scope.
 */
import { cache } from "react";
import { prisma } from "./prisma";
import { computeCovenantPosition, loadCompanyCovenantData } from "./covenant-engine";
import {
  COHERENT_COMPANY,
  COHERENT_CREDIT_AGREEMENT_ID,
  COHERENT_DOCUMENT_CAVEATS,
  COHERENT_INDENTURE_ID,
  LEDGER_BASKET_LABELS,
  NOT_TESTED_CAVEATS,
} from "@/prisma/seed-data";

export const COMPANY_ID = COHERENT_COMPANY.id;
export {
  COHERENT_COMPANY,
  COHERENT_CREDIT_AGREEMENT_ID,
  COHERENT_DOCUMENT_CAVEATS,
  COHERENT_INDENTURE_ID,
  LEDGER_BASKET_LABELS,
  NOT_TESTED_CAVEATS,
};

/** Loads Coherent's documents/provisions/latest snapshot/ledger, deduped per request. */
export const getCovenantData = cache(async () => {
  return loadCompanyCovenantData(prisma, COMPANY_ID);
});

/** getCovenantData() plus the computed position (leverage metrics + per-document capacity). */
export const getPosition = cache(async () => {
  const data = await getCovenantData();
  const position = computeCovenantPosition(data);
  return { data, position };
});

export const getDebtTranches = cache(async () => {
  const snapshot = await prisma.financialSnapshot.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: { asOfDate: "desc" },
  });
  if (!snapshot) return [];
  return prisma.debtTranche.findMany({
    where: { financialSnapshotId: snapshot.id },
    orderBy: { createdAt: "asc" },
  });
});

export const getLedgerEntries = cache(async () => {
  return prisma.ledgerEntry.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
  });
});

export const getCompany = cache(async () => {
  return prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
});

/** Raw Document rows (name/governs/notes) for display - the engine's DocumentInput deliberately omits non-computational fields like `notes`. */
export const getDocuments = cache(async () => {
  return prisma.document.findMany({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: "asc" } });
});
