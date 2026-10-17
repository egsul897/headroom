/**
 * Server wiring for the dashboard EBITDA box: loads an uploaded agreement's text and the company's SEC filings, runs
 * the box, and persists to Neon. Used by the upload pipeline (auto-run) and the EBITDA API routes.
 */
import { prisma } from "../../prisma";
import { fetchIssuerFinancials, type IssuerFinancials } from "../xbrl/companyfacts";
import { priorAsOf } from "../xbrl/addback-tracker";
import { computeEbitdaBox, loadConfirmations, saveEbitdaBox, type EbitdaBox, type EbitdaBoxStore, type PipelineArgs } from "./ebitda-box";

const store = () => prisma as unknown as EbitdaBoxStore;

/** Company CIK → current and prior-year financials (SEC companyfacts + submissions); null when no CIK or no data. */
export async function companyFinancials(companyId: string): Promise<{ financials: IssuerFinancials | null; priorFinancials: IssuerFinancials | null; cik: string | null }> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { cik: true } });
  const cik = company?.cik?.replace(/\D/g, "") || null;
  if (!cik || /^0+$/.test(cik)) return { financials: null, priorFinancials: null, cik: null };
  const financials = await fetchIssuerFinancials(cik).catch(() => null);
  const pa = financials ? priorAsOf(financials.anchor) : null;
  const priorFinancials = pa ? await fetchIssuerFinancials(cik, undefined, pa).catch(() => null) : null;
  return { financials, priorFinancials, cik };
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

export async function pipelineArgsFor(companyId: string, documentId: string, known?: { text: string; sourceId: string }): Promise<PipelineArgs | null> {
  const t = known ?? (await documentText(companyId, documentId));
  if (!t) return null;
  const { financials, priorFinancials, cik } = await companyFinancials(companyId);
  return { sourceId: t.sourceId, text: t.text, issuerCik: cik, financials, priorFinancials };
}

/** Compute and persist the box for one uploaded agreement (applies stored CFO confirmations). */
export async function refreshEbitdaBox(companyId: string, documentId: string, known?: { text: string; sourceId: string }): Promise<{ box: EbitdaBox; id: string } | null> {
  const args = await pipelineArgsFor(companyId, documentId, known);
  if (!args) return null;
  const scope = { companyId, documentId };
  const box = computeEbitdaBox(args, await loadConfirmations(store(), scope));
  const { id } = await saveEbitdaBox(store(), scope, box);
  return { box, id };
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
