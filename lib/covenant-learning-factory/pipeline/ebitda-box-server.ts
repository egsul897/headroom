/**
 * Server wiring for the dashboard EBITDA box: loads an uploaded agreement's text and the company's SEC filings, runs
 * the box, and persists to Neon. Used by the upload pipeline (auto-run) and the EBITDA API routes.
 */
import { prisma } from "../../prisma";
import type { IssuerFinancials } from "../xbrl/companyfacts";
import { erpEvidenceSource, type ErpEvidenceFact } from "../erp/contract";
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

/** ERP period facts for the company from the registered source (none until ERP-1 registers one; never synthesized).
 *  ERP is evidence only, so an ERP outage must not fail the box computed from filings: the box is built without ERP
 *  evidence (and a BASE_METRIC confirm then answers NEEDS_ERP_EVIDENCE). Fail-closed on shape: anything but an array is
 *  dropped (each element is still admitted fact-by-fact downstream). Bounded by a timeout so a hung connector cannot
 *  hold the upload pipeline. The log carries the company and a reason class only: never the error text, which can hold
 *  connector URLs, account ids or credential hints. */
export const ERP_EVIDENCE_TIMEOUT_MS = 10_000;
export async function companyErpFacts(companyId: string, opts: { timeoutMs?: number } = {}): Promise<BoxArgs["erp"]> {
  const timeoutMs = opts.timeoutMs ?? ERP_EVIDENCE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
  let facts: unknown;
  try {
    facts = await Promise.race([Promise.resolve().then(() => erpEvidenceSource().listPeriodFacts(companyId)), timeout]);
  } catch (err) {
    console.error("[ebitda-box] ERP evidence unavailable", { companyId, reason: "error", errorName: err instanceof Error ? err.name : typeof err });
    return null;
  } finally { clearTimeout(timer); }
  if (facts === "timeout") { console.error("[ebitda-box] ERP evidence unavailable", { companyId, reason: "timeout", timeoutMs }); return null; }
  if (!Array.isArray(facts)) { console.error("[ebitda-box] ERP evidence unavailable", { companyId, reason: "invalid_shape" }); return null; }
  return facts.length ? { companyId, facts: facts as ErpEvidenceFact[] } : null;
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
