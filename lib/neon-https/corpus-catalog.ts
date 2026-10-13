/**
 * Offline catalog of in-repo precedent corpora that the HTTPS loader imports
 * into knowledge_sources / kf_precedent_*.
 *
 * Dry-run counts come from this walk. Bytes are hashed from disk. A recorded
 * sha256 that does not match the file is a conflict — the hash is not rewritten.
 * Knife River (reserved blind) is excluded.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isReservedBlindIssuer, isReservedBlindReference } from "../edgar-expand/blind";
import { accessionFromSecUrl, isRealAccession, padCik, sanitizeDocumentClass } from "./document-class";

export type PlannedSource = {
  corpus: string;
  sourceId: string;
  issuerCik: string;
  issuerTicker: string | null;
  issuerName: string | null;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: string;
  formType: string;
  documentTitle: string;
  documentClass: string;
  originalBytesHash: string;
  byteSize: number | null;
  /** Repo-relative path whose bytes hash to originalBytesHash. Null = metadata only. */
  localPath: string | null;
  provenance: string;
  usageRights: "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL";
  metadata: Record<string, unknown>;
};

export type PlannedRecord = {
  corpus: string;
  recordId: string;
  kind: string;
  sourceId: string | null;
  contentHash: string;
  accessionNumber: string | null;
  payload: unknown;
};

export type PlannedRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: string;
  evidenceStatus: string | null;
  rationale: string;
  confidence: number | null;
  payload: unknown;
};

export type SourceAction =
  | "insert"
  | "metadata-only"
  | "deduped-sha256"
  | "deduped-accession"
  | "hash-conflict"
  | "missing-file"
  | "excluded-blind"
  | "unresolved-no-hash";

export type CorpusWorkItem =
  | { type: "source"; corpus: string; action: SourceAction; source?: PlannedSource; detail?: string }
  | { type: "record"; corpus: string; action: "insert" | "deduped-content-hash"; record?: PlannedRecord }
  | { type: "relationship"; corpus: string; action: "insert" | "deduped"; relationship?: PlannedRelationship };

const EXPLODE_KEYS = [
  "records",
  "entries",
  "documents",
  "calculations",
  "nodes",
  "edges",
  "models",
  "clusters",
  "cases",
  "heldOutEvaluations",
  "falseLegalDifferenceFindings",
  "packages",
  "compilerChallengeFindings",
  "provisionLevelOperations",
  "missingAuthority",
  "rows",
  "families",
  "sourceDocuments",
  "nextBatch",
] as const;

const UNKNOWN_DATE = "1970-01-01T00:00:00.000Z";

function sha256Bytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function sha256File(abs: string): string {
  return sha256Bytes(readFileSync(abs));
}

function recordIdFor(corpus: string, file: string, kind: string, identity: string): string {
  return createHash("sha256").update(`${corpus}|${file}|${kind}|${identity}`).digest("hex").slice(0, 40);
}

function identityOf(obj: Record<string, unknown>, fallback: string): string {
  for (const key of ["stableId", "recordId", "candidateId", "sourceId", "sourceDocId", "id", "edgeId", "nodeId", "term"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return fallback;
}

function pickAccession(obj: Record<string, unknown>): string | null {
  const raw = obj.accessionNumber ?? obj.accession;
  if (typeof raw === "string" && isRealAccession(raw)) return raw;
  const url = typeof obj.sourceUrl === "string" ? obj.sourceUrl : typeof obj.sourceUri === "string" ? obj.sourceUri : "";
  return accessionFromSecUrl(url)?.accession ?? null;
}

function pickSourceId(obj: Record<string, unknown>): string | null {
  if (typeof obj.sourceId === "string" && obj.sourceId) return obj.sourceId;
  if (typeof obj.instrumentId === "string" && obj.instrumentId) return obj.instrumentId;
  return null;
}

function rel(repoRoot: string, abs: string): string {
  return path.relative(repoRoot, abs).split(path.sep).join("/");
}

export function* iterateCorpusWork(repoRoot: string): Generator<CorpusWorkItem> {
  const seenHash = new Set<string>();
  const seenAccession = new Map<string, string>();
  const seenSourceId = new Map<string, string>();
  const seenContent = new Set<string>();
  const seenRel = new Set<string>();

  const emitSource = function* (source: PlannedSource, pre?: SourceAction, detail?: string): Generator<CorpusWorkItem> {
    if (pre) {
      yield { type: "source", corpus: source.corpus, action: pre, detail, source: pre === "hash-conflict" ? source : undefined };
      return;
    }
    if (isReservedBlindIssuer({ cik: source.issuerCik, ticker: source.issuerTicker, name: source.issuerName, title: source.documentTitle })) {
      yield { type: "source", corpus: source.corpus, action: "excluded-blind", detail: source.sourceId };
      return;
    }
    if (isReservedBlindReference(source.sourceUrl) || isReservedBlindReference(source.exhibitFilename)) {
      yield { type: "source", corpus: source.corpus, action: "excluded-blind", detail: source.sourceId };
      return;
    }
    if (seenSourceId.has(source.sourceId)) {
      const prev = seenSourceId.get(source.sourceId);
      yield {
        type: "source",
        corpus: source.corpus,
        action: prev === source.originalBytesHash ? "deduped-sha256" : "hash-conflict",
        detail: source.sourceId,
      };
      return;
    }
    if (seenHash.has(source.originalBytesHash)) {
      yield { type: "source", corpus: source.corpus, action: "deduped-sha256", detail: source.sourceId };
      return;
    }
    const accKey = isRealAccession(source.accessionNumber)
      ? `${source.accessionNumber}|${source.exhibitFilename.toLowerCase()}`
      : "";
    if (accKey && seenAccession.has(accKey)) {
      const prev = seenAccession.get(accKey);
      yield {
        type: "source",
        corpus: source.corpus,
        action: prev === source.originalBytesHash ? "deduped-accession" : "hash-conflict",
        detail: source.sourceId,
      };
      return;
    }
    seenSourceId.set(source.sourceId, source.originalBytesHash);
    seenHash.add(source.originalBytesHash);
    if (accKey) seenAccession.set(accKey, source.originalBytesHash);
    yield {
      type: "source",
      corpus: source.corpus,
      action: source.localPath ? "insert" : "metadata-only",
      source,
    };
  };

  yield* basketEdgarSources(repoRoot, emitSource);
  yield* fdpSources(repoRoot, emitSource);
  yield* amendmentSources(repoRoot, emitSource);
  yield* edgarExpandSources(repoRoot, emitSource);

  yield* jsonlDir(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-2/export",
    "basket-phase2-export",
    seenContent,
  );
  yield* jsonlDir(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-3/export",
    "basket-phase3-export",
    seenContent,
  );
  yield* jsonlDir(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-4/export",
    "basket-phase4-export",
    seenContent,
  );
  yield* jsonlDir(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/export",
    "basket-library-export",
    seenContent,
  );
  yield* jsonDirFiles(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-2",
    "basket-phase2-summaries",
    seenContent,
    { shallow: true },
  );
  yield* jsonDirFiles(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-3",
    "basket-phase3-summaries",
    seenContent,
    { shallow: true },
  );
  yield* jsonDirFiles(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-4",
    "basket-phase4-summaries",
    seenContent,
    { shallow: true },
  );

  yield* jsonDirFiles(repoRoot, "docs/financial-definitions-precedent", "fdp-records", seenContent, {
    skip: new Set(["01-schema.json", "17-source-document-registry.json", "18-canonical-export-v2.json"]),
  });

  yield* amendmentRelationships(repoRoot, seenRel);
  yield* jsonDirFiles(repoRoot, "docs/amendment-chain-research", "amendment-chain-records", seenContent, {
    skip: new Set(["amendment-chains-export.json"]),
    skipSchema: true,
  });

  yield* jsonDirFiles(repoRoot, "docs/precedent-comparison", "precedent-comparison", seenContent, {});
  yield* jsonDirFiles(repoRoot, "docs/neon-corpus-flywheel", "neon-flywheel", seenContent, {});
}

function* basketEdgarSources(
  repoRoot: string,
  emitSource: (source: PlannedSource, pre?: SourceAction, detail?: string) => Generator<CorpusWorkItem>,
): Generator<CorpusWorkItem> {
  const manPath = path.join(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/acquisition-manifest.json",
  );
  if (!existsSync(manPath)) return;
  const man = JSON.parse(readFileSync(manPath, "utf8")) as {
    documents?: Array<Record<string, unknown>>;
  };
  for (const doc of man.documents ?? []) {
    const relativeDir = String(doc.relativeDir ?? "");
    const htmlRel = relativeDir ? `${relativeDir}/source.html` : "";
    const htmlAbs = htmlRel ? path.join(repoRoot, htmlRel) : "";
    const filename = String(doc.filename ?? "source.html");
    const sourceUrl = String(doc.sourceUrl ?? "");
    const fromUrl = accessionFromSecUrl(sourceUrl);
    const accession = isRealAccession(String(doc.accession ?? ""))
      ? String(doc.accession)
      : (fromUrl?.accession ?? "UNKNOWN");
    const cik = padCik(String(doc.cik ?? fromUrl?.cik ?? ""));
    const recorded = typeof doc.bodySha256 === "string" ? doc.bodySha256.toLowerCase() : "";
    const sourceId = isRealAccession(accession) ? `edgar:${accession}:${filename}` : `cbcfl:${String(doc.docId ?? filename)}`;
    const title = String(doc.description ?? doc.issuer ?? doc.docId ?? filename);
    if (!htmlAbs || !existsSync(htmlAbs)) {
      yield* emitSource(
        blankSource("basket-phase2-edgar", sourceId, { title, accession, filename, sourceUrl, cik }),
        "missing-file",
        sourceId,
      );
      continue;
    }
    const bytes = readFileSync(htmlAbs);
    const hash = sha256Bytes(bytes);
    if (recorded && recorded !== hash) {
      yield* emitSource(
        {
          ...blankSource("basket-phase2-edgar", sourceId, { title, accession, filename, sourceUrl, cik }),
          originalBytesHash: hash,
          localPath: htmlRel,
        },
        "hash-conflict",
        `expected=${recorded} got=${hash}`,
      );
      continue;
    }
    yield* emitSource({
      corpus: "basket-phase2-edgar",
      sourceId,
      issuerCik: cik,
      issuerTicker: doc.ticker ? String(doc.ticker) : null,
      issuerName: doc.issuer ? String(doc.issuer) : null,
      accessionNumber: accession,
      exhibitFilename: filename,
      sourceUrl,
      filingDate: typeof doc.filingDate === "string" ? new Date(doc.filingDate).toISOString() : UNKNOWN_DATE,
      formType: typeof doc.form === "string" ? doc.form : "UNKNOWN",
      documentTitle: title,
      documentClass: sanitizeDocumentClass("CREDIT_AGREEMENT", title),
      originalBytesHash: hash,
      byteSize: bytes.length,
      localPath: htmlRel,
      provenance: "cbcfl-phase2-edgar-acquisition",
      usageRights: "PUBLIC_SEC_EDGAR",
      metadata: {
        docId: doc.docId ?? null,
        extractedTextSha256: doc.extractedTextSha256 ?? null,
        filingDateUnknown: typeof doc.filingDate !== "string",
        corpus: "basket-phase2-edgar",
      },
    });
  }
}

function* fdpSources(
  repoRoot: string,
  emitSource: (source: PlannedSource, pre?: SourceAction, detail?: string) => Generator<CorpusWorkItem>,
): Generator<CorpusWorkItem> {
  const regPath = path.join(repoRoot, "docs/financial-definitions-precedent/17-source-document-registry.json");
  if (!existsSync(regPath)) return;
  const reg = JSON.parse(readFileSync(regPath, "utf8")) as { documents?: Array<Record<string, unknown>> };
  for (const doc of reg.documents ?? []) {
    const sourceDocId = String(doc.sourceDocId ?? "");
    const relPath = String(doc.path ?? "");
    const abs = path.join(repoRoot, relPath);
    const recorded = typeof doc.fileSha256 === "string" ? doc.fileSha256.toLowerCase() : "";
    const filename = path.basename(relPath || sourceDocId);
    const sourceId = `fdp:${sourceDocId || filename}`;
    if (!relPath || !existsSync(abs)) {
      yield* emitSource(blankSource("fdp-sources", sourceId, { title: sourceDocId, filename }), "missing-file", sourceId);
      continue;
    }
    const hash = sha256File(abs);
    if (recorded && recorded !== hash) {
      yield* emitSource(
        { ...blankSource("fdp-sources", sourceId, { title: sourceDocId, filename }), originalBytesHash: hash, localPath: relPath },
        "hash-conflict",
        `expected=${recorded} got=${hash}`,
      );
      continue;
    }
    const hint = `${sourceDocId} ${filename}`;
    const klass = /AMD|AMEND/i.test(sourceDocId)
      ? "AMENDMENT"
      : /INDENTURE/i.test(sourceDocId)
        ? "INDENTURE"
        : "CREDIT_AGREEMENT";
    yield* emitSource({
      corpus: "fdp-sources",
      sourceId,
      issuerCik: "0000000000",
      issuerTicker: null,
      issuerName: null,
      accessionNumber: "UNKNOWN",
      exhibitFilename: filename,
      sourceUrl: "",
      filingDate: UNKNOWN_DATE,
      formType: "FIXTURE",
      documentTitle: sourceDocId,
      documentClass: sanitizeDocumentClass(klass, hint),
      originalBytesHash: hash,
      byteSize: statSync(abs).size,
      localPath: relPath.split(path.sep).join("/"),
      provenance: "financial-definitions-precedent",
      usageRights: "FIXTURE_INTERNAL",
      metadata: {
        sourceDocId,
        acquisitionKind: doc.acquisitionKind ?? null,
        filingDateUnknown: true,
        corpus: "fdp-sources",
      },
    });
  }
}

function* amendmentSources(
  repoRoot: string,
  emitSource: (source: PlannedSource, pre?: SourceAction, detail?: string) => Generator<CorpusWorkItem>,
): Generator<CorpusWorkItem> {
  const expPath = path.join(
    repoRoot,
    "docs/amendment-chain-research/knowledge-factory-export/amendment-chains-export.json",
  );
  if (!existsSync(expPath)) return;
  const exp = JSON.parse(readFileSync(expPath, "utf8")) as { documents?: Array<Record<string, unknown>> };
  for (const doc of exp.documents ?? []) {
    const sourceId = String(doc.sourceId ?? "");
    const filename = String(doc.filename ?? "");
    const sourceUrl = String(doc.sourceUri ?? "");
    const fromUrl = accessionFromSecUrl(sourceUrl);
    const accession = isRealAccession(String(doc.accessionNumber ?? ""))
      ? String(doc.accessionNumber)
      : (fromUrl?.accession ?? "UNKNOWN");
    const recordedRaw = typeof doc.originalBytesHash === "string" ? doc.originalBytesHash.toLowerCase() : "";
    const recorded = /^[a-f0-9]{64}$/.test(recordedRaw) ? recordedRaw : "";
    const title = String(doc.title ?? filename ?? sourceId);
    const cik = padCik(String(doc.cik ?? fromUrl?.cik ?? ""));
    if (!sourceId) {
      yield* emitSource(blankSource("amendment-chain-documents", "missing", { title }), "unresolved-no-hash", "missing sourceId");
      continue;
    }
    if (!recorded) {
      yield* emitSource(
        blankSource("amendment-chain-documents", sourceId, { title, accession, filename, sourceUrl, cik }),
        "unresolved-no-hash",
        String(doc.acquisitionStatus ?? "hash not recorded"),
      );
      continue;
    }
    const local = findBytesByHash(repoRoot, filename, recorded);
    yield* emitSource({
      corpus: "amendment-chain-documents",
      sourceId,
      issuerCik: cik,
      issuerTicker: null,
      issuerName: null,
      accessionNumber: accession,
      exhibitFilename: filename || "UNKNOWN",
      sourceUrl,
      filingDate: UNKNOWN_DATE,
      formType: "UNKNOWN",
      documentTitle: title,
      documentClass: sanitizeDocumentClass(doc.documentClass, title),
      originalBytesHash: recorded,
      byteSize: typeof doc.byteLength === "number" ? doc.byteLength : local ? statSync(path.join(repoRoot, local)).size : null,
      localPath: local,
      provenance: "amendment-chain-research",
      usageRights: "PUBLIC_SEC_EDGAR",
      metadata: {
        instrumentIdentity: doc.instrumentIdentity ?? null,
        researchDocId: doc.researchDocId ?? null,
        acquisitionStatus: doc.acquisitionStatus ?? null,
        bytesPresent: Boolean(local),
        filingDateUnknown: true,
        corpus: "amendment-chain-documents",
      },
    });
  }
}

function* edgarExpandSources(
  repoRoot: string,
  emitSource: (source: PlannedSource, pre?: SourceAction, detail?: string) => Generator<CorpusWorkItem>,
): Generator<CorpusWorkItem> {
  const manPath = path.join(repoRoot, ".local-knowledge-corpus/edgar-expand/manifest.jsonl");
  if (!existsSync(manPath)) return;
  const lines = readFileSync(manPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const localPath = typeof row.localPath === "string" ? row.localPath : "";
    const abs = localPath ? path.join(repoRoot, localPath) : "";
    const sourceId = String(row.sourceId ?? "");
    const hashRecorded = typeof row.sha256 === "string" ? row.sha256.toLowerCase() : "";
    if (!sourceId || !abs || !existsSync(abs) || !/^[a-f0-9]{64}$/.test(hashRecorded)) {
      yield* emitSource(
        blankSource("edgar-expand-local", sourceId || "unknown", { title: sourceId }),
        "missing-file",
        sourceId,
      );
      continue;
    }
    const hash = sha256File(abs);
    if (hash !== hashRecorded) {
      yield* emitSource(
        { ...blankSource("edgar-expand-local", sourceId, {}), originalBytesHash: hash, localPath },
        "hash-conflict",
        `expected=${hashRecorded} got=${hash}`,
      );
      continue;
    }
    const accession = String(row.accessionNumber ?? "UNKNOWN");
    const filename = String(row.exhibitFilename ?? path.basename(localPath));
    yield* emitSource({
      corpus: "edgar-expand-local",
      sourceId,
      issuerCik: padCik(String(row.issuerCik ?? "")),
      issuerTicker: row.issuerTicker ? String(row.issuerTicker) : null,
      issuerName: row.issuerName ? String(row.issuerName) : null,
      accessionNumber: accession,
      exhibitFilename: filename,
      sourceUrl: String(row.sourceUrl ?? ""),
      filingDate: typeof row.filingDate === "string" ? row.filingDate : UNKNOWN_DATE,
      formType: String(row.formType ?? "UNKNOWN"),
      documentTitle: String(row.documentTitle ?? filename),
      documentClass: sanitizeDocumentClass(row.documentClass, String(row.documentTitle ?? "")),
      originalBytesHash: hash,
      byteSize: statSync(abs).size,
      localPath,
      provenance: "edgar-expand",
      usageRights: "PUBLIC_SEC_EDGAR",
      metadata: {
        agreementIdentityKey: row.agreementIdentityKey ?? null,
        unresolved: false,
        corpus: "edgar-expand-local",
      },
    });
  }
}

function blankSource(
  corpus: string,
  sourceId: string,
  bits: { title?: string; accession?: string; filename?: string; sourceUrl?: string; cik?: string },
): PlannedSource {
  return {
    corpus,
    sourceId,
    issuerCik: bits.cik ?? "0000000000",
    issuerTicker: null,
    issuerName: null,
    accessionNumber: bits.accession ?? "UNKNOWN",
    exhibitFilename: bits.filename ?? "UNKNOWN",
    sourceUrl: bits.sourceUrl ?? "",
    filingDate: UNKNOWN_DATE,
    formType: "UNKNOWN",
    documentTitle: bits.title ?? sourceId,
    documentClass: "UNKNOWN",
    originalBytesHash: "",
    byteSize: null,
    localPath: null,
    provenance: corpus,
    usageRights: "FIXTURE_INTERNAL",
    metadata: {},
  };
}

function findBytesByHash(repoRoot: string, filename: string, hash: string): string | null {
  if (!filename) return null;
  const roots = [
    path.join(repoRoot, "docs/amendment-chain-research"),
    path.join(repoRoot, ".local-amendment-research"),
    path.join(repoRoot, ".local-knowledge-corpus"),
  ];
  for (const root of roots) {
    const hit = walkForFilename(root, filename);
    if (!hit) continue;
    if (sha256File(hit) === hash) return rel(repoRoot, hit);
  }
  return null;
}

function walkForFilename(dir: string, filename: string): string | null {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const abs = path.join(cur, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(abs);
      else if (name === filename) return abs;
    }
  }
  return null;
}

function* jsonlDir(
  repoRoot: string,
  relDir: string,
  corpus: string,
  seenContent: Set<string>,
): Generator<CorpusWorkItem> {
  const absDir = path.join(repoRoot, relDir);
  if (!existsSync(absDir)) return;
  const files = readdirSync(absDir).filter((n) => n.endsWith(".jsonl")).sort();
  for (const name of files) {
    const abs = path.join(absDir, name);
    const fileRel = `${relDir}/${name}`;
    const lines = readFileSync(abs, "utf8").split("\n");
    const seenIdentity = new Map<string, number>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      let obj: Record<string, unknown>;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        obj = parsed as Record<string, unknown>;
      } catch {
        yield { type: "record", corpus, action: "insert" };
        continue;
      }
      yield* emitRecord(corpus, fileRel, name.replace(/\.jsonl$/, ""), obj, String(i + 1), seenIdentity, seenContent);
    }
  }
}

function* jsonDirFiles(
  repoRoot: string,
  relDir: string,
  corpus: string,
  seenContent: Set<string>,
  opts: { shallow?: boolean; skip?: Set<string>; skipSchema?: boolean },
): Generator<CorpusWorkItem> {
  const absDir = path.join(repoRoot, relDir);
  if (!existsSync(absDir)) return;
  const files = listJsonFiles(absDir, Boolean(opts.shallow));
  for (const abs of files) {
    const base = path.basename(abs);
    if (opts.skip?.has(base)) continue;
    if (opts.skipSchema && (abs.includes(`${path.sep}schema${path.sep}`) || base.endsWith(".schema.json"))) continue;
    if (base === "acquisition-manifest.json") continue;
    const fileRel = rel(repoRoot, abs);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(abs, "utf8")) as unknown;
    } catch {
      continue;
    }
    yield* emitJsonValue(corpus, fileRel, base.replace(/\.json$/, ""), parsed, seenContent);
  }
}

function listJsonFiles(dir: string, shallow: boolean): string[] {
  const out: string[] = [];
  const walk = (cur: string) => {
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "scripts" || name === "edgar-acquisitions") continue;
      const abs = path.join(cur, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!shallow) walk(abs);
      } else if (name.endsWith(".json")) out.push(abs);
    }
  };
  walk(dir);
  return out.sort();
}

function* emitJsonValue(
  corpus: string,
  fileRel: string,
  kindBase: string,
  parsed: unknown,
  seenContent: Set<string>,
): Generator<CorpusWorkItem> {
  if (Array.isArray(parsed)) {
    const seenIdentity = new Map<string, number>();
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      yield* emitRecord(corpus, fileRel, kindBase, item as Record<string, unknown>, String(i), seenIdentity, seenContent);
    }
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const obj = parsed as Record<string, unknown>;
  const exploded: string[] = [];
  for (const key of EXPLODE_KEYS) {
    const arr = obj[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (!arr.some((x) => x && typeof x === "object" && !Array.isArray(x))) continue;
    const seenIdentity = new Map<string, number>();
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      yield* emitRecord(corpus, fileRel, `${kindBase}:${key}`, item as Record<string, unknown>, String(i), seenIdentity, seenContent);
    }
    exploded.push(key);
  }
  const envelope: Record<string, unknown> = { ...obj };
  for (const key of exploded) envelope[key] = { explodedCount: Array.isArray(obj[key]) ? (obj[key] as unknown[]).length : 0 };
  yield* emitRecord(corpus, fileRel, `${kindBase}:envelope`, envelope, "envelope", new Map(), seenContent);
}

function* emitRecord(
  corpus: string,
  fileRel: string,
  kind: string,
  obj: Record<string, unknown>,
  fallback: string,
  seenIdentity: Map<string, number>,
  seenContent: Set<string>,
): Generator<CorpusWorkItem> {
  const baseIdentity = identityOf(obj, fallback);
  const n = (seenIdentity.get(baseIdentity) ?? 0) + 1;
  seenIdentity.set(baseIdentity, n);
  const identity = n === 1 ? baseIdentity : `${baseIdentity}#${n}`;
  const payloadJson = JSON.stringify(obj);
  const contentHash =
    typeof obj.contentHash === "string" && /^[a-f0-9]{64}$/i.test(obj.contentHash)
      ? obj.contentHash.toLowerCase()
      : sha256Bytes(payloadJson);
  const dedupeKey = `${corpus}|${contentHash}`;
  if (seenContent.has(dedupeKey)) {
    yield { type: "record", corpus, action: "deduped-content-hash" };
    return;
  }
  seenContent.add(dedupeKey);
  const issuerName = typeof obj.issuer === "string" ? obj.issuer : typeof obj.issuerName === "string" ? obj.issuerName : null;
  const ticker = typeof obj.ticker === "string" ? obj.ticker : typeof obj.issuerTicker === "string" ? obj.issuerTicker : null;
  if (isReservedBlindIssuer({ ticker, name: issuerName, title: issuerName, cik: typeof obj.cik === "string" ? obj.cik : null })) {
    return;
  }
  yield {
    type: "record",
    corpus,
    action: "insert",
    record: {
      corpus,
      recordId: recordIdFor(corpus, fileRel, kind, identity),
      kind,
      sourceId: pickSourceId(obj),
      contentHash,
      accessionNumber: pickAccession(obj),
      payload: obj,
    },
  };
}

function* amendmentRelationships(repoRoot: string, seenRel: Set<string>): Generator<CorpusWorkItem> {
  const expPath = path.join(
    repoRoot,
    "docs/amendment-chain-research/knowledge-factory-export/amendment-chains-export.json",
  );
  if (!existsSync(expPath)) return;
  const exp = JSON.parse(readFileSync(expPath, "utf8")) as {
    documents?: Array<Record<string, unknown>>;
    parentChildAuthorityLinks?: Array<Record<string, unknown>>;
  };
  const researchToSource = new Map<string, string>();
  for (const doc of exp.documents ?? []) {
    const researchId = typeof doc.researchDocId === "string" ? doc.researchDocId : "";
    const sourceId = typeof doc.sourceId === "string" ? doc.sourceId : "";
    if (researchId && sourceId) researchToSource.set(researchId, sourceId);
  }
  for (const link of exp.parentChildAuthorityLinks ?? []) {
    const sourceId = resolveLinkEndpoint(link, "sourceId", "child", researchToSource);
    const targetId = resolveLinkEndpoint(link, "targetId", "parent", researchToSource);
    const kind = String(link.kind ?? "AGREEMENT_AMENDMENT");
    if (!sourceId || !targetId) continue;
    const id = createHash("sha256").update(`${sourceId}|${targetId}|${kind}`).digest("hex").slice(0, 32);
    if (seenRel.has(id)) {
      yield { type: "relationship", corpus: "amendment-chain-relationships", action: "deduped" };
      continue;
    }
    seenRel.add(id);
    const chain =
      typeof link.confidenceChainId === "string"
        ? link.confidenceChainId
        : typeof link.chainId === "string"
          ? link.chainId
          : "";
    const evidence = typeof link.evidenceStatus === "string" ? link.evidenceStatus : null;
    yield {
      type: "relationship",
      corpus: "amendment-chain-relationships",
      action: "insert",
      relationship: {
        id,
        sourceId,
        targetId,
        kind,
        evidenceStatus: evidence,
        rationale: `amendment-chain ${chain || "unspecified"} evidence=${evidence ?? "unset"} — discovery link only, not a determination of legal effectiveness`,
        confidence: typeof link.confidence === "number" ? link.confidence : null,
        payload: link,
      },
    };
  }
}

function resolveLinkEndpoint(
  link: Record<string, unknown>,
  directKey: string,
  researchKey: string,
  researchToSource: Map<string, string>,
): string {
  const direct = link[directKey];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const research = link[researchKey];
  if (typeof research !== "string" || !research.trim()) return "";
  return researchToSource.get(research.trim()) ?? `research:${research.trim()}`;
}

export type CorpusCountBucket = {
  candidates: number;
  wouldInsert: number;
  metadataOnly: number;
  dedupedSha256: number;
  dedupedAccession: number;
  dedupedContentHash: number;
  hashConflicts: number;
  missingFile: number;
  excludedBlind: number;
  unresolvedNoHash: number;
  relationships: number;
};

function emptyBucket(): CorpusCountBucket {
  return {
    candidates: 0,
    wouldInsert: 0,
    metadataOnly: 0,
    dedupedSha256: 0,
    dedupedAccession: 0,
    dedupedContentHash: 0,
    hashConflicts: 0,
    missingFile: 0,
    excludedBlind: 0,
    unresolvedNoHash: 0,
    relationships: 0,
  };
}

export type CorpusPlanSummary = {
  byCorpus: Record<string, CorpusCountBucket>;
  totals: CorpusCountBucket;
  /** knowledge_sources rows a live import would add (bytes + metadata-only), in-batch deduped. */
  knowledgeSourcesWouldAdd: number;
  corpusRecordsWouldAdd: number;
  relationshipsWouldAdd: number;
};

export function summarizeCorpusPlan(repoRoot: string): CorpusPlanSummary {
  const byCorpus: Record<string, CorpusCountBucket> = {};
  const totals = emptyBucket();
  const bump = (corpus: string, field: keyof CorpusCountBucket, n = 1) => {
    const b = (byCorpus[corpus] ??= emptyBucket());
    b[field] += n;
    totals[field] += n;
  };
  for (const item of iterateCorpusWork(repoRoot)) {
    if (item.type === "source") {
      bump(item.corpus, "candidates");
      if (item.action === "insert") bump(item.corpus, "wouldInsert");
      else if (item.action === "metadata-only") bump(item.corpus, "metadataOnly");
      else if (item.action === "deduped-sha256") bump(item.corpus, "dedupedSha256");
      else if (item.action === "deduped-accession") bump(item.corpus, "dedupedAccession");
      else if (item.action === "hash-conflict") bump(item.corpus, "hashConflicts");
      else if (item.action === "missing-file") bump(item.corpus, "missingFile");
      else if (item.action === "excluded-blind") bump(item.corpus, "excludedBlind");
      else if (item.action === "unresolved-no-hash") bump(item.corpus, "unresolvedNoHash");
    } else if (item.type === "record") {
      bump(item.corpus, "candidates");
      if (item.action === "insert" && item.record) bump(item.corpus, "wouldInsert");
      else if (item.action === "deduped-content-hash") bump(item.corpus, "dedupedContentHash");
    } else {
      bump(item.corpus, "candidates");
      if (item.action === "insert") {
        bump(item.corpus, "wouldInsert");
        bump(item.corpus, "relationships");
      } else bump(item.corpus, "dedupedContentHash");
    }
  }
  const knowledgeSourcesWouldAdd = Object.entries(byCorpus)
    .filter(([k]) => isSourceCorpus(k))
    .reduce((n, [, b]) => n + b.wouldInsert + b.metadataOnly, 0);
  const relationshipsWouldAdd = totals.relationships;
  const corpusRecordsWouldAdd = Object.entries(byCorpus)
    .filter(([k]) => !isSourceCorpus(k) && k !== "amendment-chain-relationships")
    .reduce((n, [, b]) => n + b.wouldInsert, 0);
  return { byCorpus, totals, knowledgeSourcesWouldAdd, corpusRecordsWouldAdd, relationshipsWouldAdd };
}

function isSourceCorpus(corpus: string): boolean {
  return (
    corpus === "basket-phase2-edgar" ||
    corpus === "fdp-sources" ||
    corpus === "amendment-chain-documents" ||
    corpus === "edgar-expand-local"
  );
}
