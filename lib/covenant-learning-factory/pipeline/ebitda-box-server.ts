/**
 * Server wiring for the dashboard EBITDA box: loads an uploaded agreement's text and the company's SEC filings, runs
 * the box, and persists to Neon. Used by the upload pipeline (auto-run) and the EBITDA API routes.
 */
import { prisma } from "../../prisma";
import type { IssuerFinancials } from "../xbrl/companyfacts";
import { erpEvidenceSource } from "../erp/contract";
import { financialsForCik, refreshBoxCommitted, type BoxArgs, type EbitdaBox, type EbitdaBoxStore } from "./ebitda-box";

const store = () => prisma as unknown as EbitdaBoxStore;

/** Company CIK → current and prior-year financials; SEC errors other than 404 throw (recorded as a FAILED box). */
export async function companyFinancials(companyId: string): Promise<{ financials: IssuerFinancials | null; priorFinancials: IssuerFinancials | null; cik: string | null }> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { cik: true } });
  return financialsForCik(company?.cik ?? null);
}

/** Agreement text of an uploaded document (from durable storage). */
export async function documentText(companyId: string, documentId: string): Promise<{ text: string; sourceId: string } | null> {
  const row = await prisma.knowledgeSource.findFirst({ where: { companyId, documentId }, orderBy: { acquisitionTimestamp: "desc" } });
  const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
  const storageRef = row?.storageRef ?? doc?.storageRef;
  if (!storageRef) return null;
  const { getDocumentStorageProvider } = await import("../../document-storage");
  const { extractTextAsync } = await import("../../knowledge-factory/pipeline/text");
  const bytes = await getDocumentStorageProvider().retrieve(storageRef);
  const text = (await extractTextAsync(bytes, doc?.name ?? "agreement.pdf")).text;
  return { text, sourceId: row?.sourceId ?? documentId };
}

/** ERP period facts for the company from the registered source (none until ERP-1 registers one; never synthesized). */
export async function companyErpFacts(companyId: string): Promise<BoxArgs["erp"]> {
  const facts = await erpEvidenceSource().listPeriodFacts(companyId);
  return facts.length ? { companyId, facts } : null;
}

export async function pipelineArgsFor(companyId: string, documentId: string, known?: { text: string; sourceId: string }): Promise<BoxArgs | null> {
  const t = known ?? (await documentText(companyId, documentId));
  if (!t) return null;
  const { financials, priorFinancials, cik } = await companyFinancials(companyId);
  return { sourceId: t.sourceId, text: t.text, issuerCik: cik, financials, priorFinancials, erp: await companyErpFacts(companyId) };
}

/** Compute and persist the box for one uploaded agreement from committed CFO confirmations (one locked transaction);
 *  load or compute failures (e.g. SEC outage) are saved as a FAILED box that keeps the last committed figures. */
export async function refreshEbitdaBox(companyId: string, documentId: string, known?: { text: string; sourceId: string }): Promise<{ box: EbitdaBox; id: string } | null> {
  return refreshBoxCommitted(store(), { companyId, documentId }, () => pipelineArgsFor(companyId, documentId, known));
}

export { store as ebitdaBoxStore };

/** Production wiring for the EBITDA API handlers. */
export function ebitdaApiDeps(): import("./ebitda-box-api").EbitdaApiDeps {
  return {
    store,
    documentBelongsTo: async (companyId, documentId) => (await prisma.document.findFirst({ where: { id: documentId, companyId }, select: { id: true } })) != null,
    pipelineArgsFor: (c, d) => pipelineArgsFor(c, d),
    refresh: (c, d) => refreshEbitdaBox(c, d),
  };
}
