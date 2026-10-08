/**
 * Load real EDGAR source identities from WS-EHB discovery outputs.
 * Read-only consumer of the EHB acquisition queue + issuer manifests.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import fs from "node:fs";
import path from "node:path";
import type { DocumentKind, SourceDocumentRef } from "./types";

const FINANCING_KINDS = new Set<DocumentKind>([
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "INTERCREDITOR",
  "WAIVER",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
  "OTHER_DEBT_AGREEMENT",
]);

const FINANCING_HINT =
  /credit agreement|indenture|amendment|restated|supplemental indenture|intercreditor|loan agreement|facility agreement|revolving|term loan|notes? agreement|senior notes|guaranty|guarantee and collateral|security agreement/i;

interface EhbQueueItem {
  queueId: string;
  cik: string;
  ticker?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: DocumentKind;
  sourceUri: string;
  agreementIdentityKey: string;
  relevanceScore: number;
}

interface EhbExhibit {
  cik: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: DocumentKind;
  sourceUri?: string;
  agreementIdentityKey: string;
  relevanceScore: number;
  isIncorporatedByReference?: boolean;
  ibr?: { resolvedSourceUri?: string };
  discoveryStatus?: string;
}

interface EhbManifest {
  issuer: { cik: string; ticker?: string; title?: string };
  exhibits: EhbExhibit[];
}

function normalizeUri(uri: string): string | null {
  if (!uri) return null;
  // SEC inline viewer URLs are not direct exhibit bodies.
  if (uri.includes("ix?doc=")) {
    const m = uri.match(/ix\?doc=(\/Archives\/edgar\/data\/[^&\s]+)/i);
    if (m?.[1]) return `https://www.sec.gov${m[1]}`;
    return null;
  }
  if (!uri.includes("/Archives/edgar/")) return null;
  return uri.startsWith("http") ? uri : `https://www.sec.gov${uri.startsWith("/") ? "" : "/"}${uri}`;
}

function isEligibleFinancing(kind: DocumentKind, description: string, filename: string, relevance: number): boolean {
  if (FINANCING_KINDS.has(kind) && relevance >= 20) return true;
  if (kind === "UNKNOWN" && FINANCING_HINT.test(`${description} ${filename}`) && relevance >= 30) return true;
  return FINANCING_KINDS.has(kind);
}

function toRef(params: {
  ehbRunDir: string;
  queueId?: string;
  cik: string;
  ticker?: string;
  issuerName?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: DocumentKind;
  sourceUri: string;
  agreementIdentityKey: string;
  relevanceScore: number;
}): SourceDocumentRef {
  const sourceDocumentId =
    params.queueId ??
    `${params.cik}:${params.accessionNumber}:${params.filename}`.replace(/[^a-zA-Z0-9:._-]/g, "_");
  return { sourceDocumentId, ...params };
}

export function loadEhbSourceDocuments(ehbRunDir: string, options?: { limit?: number; minRelevance?: number }): {
  documents: SourceDocumentRef[];
  discoveryMs: number;
  stats: {
    queueItems: number;
    manifestExhibits: number;
    selected: number;
    issuers: number;
    kindCounts: Record<string, number>;
  };
} {
  const t0 = performance.now();
  if (!fs.existsSync(ehbRunDir)) {
    throw new Error(`EHB run dir not found: ${ehbRunDir}. Run WS-EHB discovery first (do not invent a competing registry).`);
  }

  const byKey = new Map<string, SourceDocumentRef>();

  const queuePath = path.join(ehbRunDir, "acquisition-queue.json");
  let queueItems = 0;
  if (fs.existsSync(queuePath)) {
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf-8")) as EhbQueueItem[];
    queueItems = queue.length;
    for (const q of queue) {
      const uri = normalizeUri(q.sourceUri);
      if (!uri) continue;
      if (!isEligibleFinancing(q.documentKind, q.description, q.filename, q.relevanceScore)) continue;
      const ref = toRef({
        ehbRunDir,
        queueId: q.queueId,
        cik: q.cik,
        ticker: q.ticker,
        accessionNumber: q.accessionNumber,
        filingDate: q.filingDate,
        form: q.form,
        exhibitType: q.exhibitType,
        filename: q.filename,
        description: q.description,
        documentKind: q.documentKind,
        sourceUri: uri,
        agreementIdentityKey: q.agreementIdentityKey,
        relevanceScore: q.relevanceScore,
      });
      byKey.set(`${ref.agreementIdentityKey}::${ref.sourceUri}`, ref);
    }
  }

  const manifestsDir = path.join(ehbRunDir, "manifests");
  let manifestExhibits = 0;
  if (fs.existsSync(manifestsDir)) {
    for (const name of fs.readdirSync(manifestsDir)) {
      if (!name.endsWith(".json") || name.includes(".duplicates.")) continue;
      const manifest = JSON.parse(fs.readFileSync(path.join(manifestsDir, name), "utf-8")) as EhbManifest;
      for (const e of manifest.exhibits ?? []) {
        manifestExhibits += 1;
        if (e.discoveryStatus === "SKIPPED_DUPLICATE" || e.discoveryStatus === "SKIPPED_LOW_RELEVANCE") continue;
        const rawUri = e.sourceUri ?? e.ibr?.resolvedSourceUri;
        const uri = rawUri ? normalizeUri(rawUri) : null;
        if (!uri) continue;
        if (!isEligibleFinancing(e.documentKind, e.description, e.filename, e.relevanceScore)) continue;
        if ((options?.minRelevance ?? 0) > e.relevanceScore && e.documentKind === "UNKNOWN") continue;
        const ref = toRef({
          ehbRunDir,
          cik: e.cik,
          ticker: manifest.issuer.ticker,
          issuerName: manifest.issuer.title,
          accessionNumber: e.accessionNumber,
          filingDate: e.filingDate,
          form: e.form,
          exhibitType: e.exhibitType,
          filename: e.filename,
          description: e.description,
          documentKind: e.documentKind,
          sourceUri: uri,
          agreementIdentityKey: e.agreementIdentityKey,
          relevanceScore: e.relevanceScore,
        });
        const key = `${ref.agreementIdentityKey}::${ref.sourceUri}`;
        if (!byKey.has(key)) byKey.set(key, ref);
      }
    }
  }

  let documents = [...byKey.values()].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return a.sourceDocumentId.localeCompare(b.sourceDocumentId);
  });
  if (options?.limit && options.limit > 0) documents = documents.slice(0, options.limit);

  const kindCounts: Record<string, number> = {};
  for (const d of documents) kindCounts[d.documentKind] = (kindCounts[d.documentKind] ?? 0) + 1;

  return {
    documents,
    discoveryMs: performance.now() - t0, // local load time only — not SEC discovery wall
    stats: {
      queueItems,
      manifestExhibits,
      selected: documents.length,
      issuers: new Set(documents.map((d) => d.cik)).size,
      kindCounts,
    },
  };
}

export function readEhbDiscoveryWallMs(ehbRunDir: string): number | null {
  const checkpointPath = path.join(ehbRunDir, "checkpoint.json");
  if (!fs.existsSync(checkpointPath)) return null;
  try {
    const cp = JSON.parse(fs.readFileSync(checkpointPath, "utf-8")) as {
      startedAt?: string;
      finishedAt?: string;
      createdAt?: string;
      updatedAt?: string;
      stats?: { wallMs?: number };
    };
    if (typeof cp.stats?.wallMs === "number") return cp.stats.wallMs;
    const start = cp.startedAt ?? cp.createdAt;
    const end = cp.finishedAt ?? cp.updatedAt;
    if (start && end) {
      return new Date(end).getTime() - new Date(start).getTime();
    }
  } catch {
    return null;
  }
  return null;
}
