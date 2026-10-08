/**
 * Per-document deterministic pipeline for Phase 2 real EDGAR docs.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED. No LLM / paid inference.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "../../extraction/parse";
import { chunkDocument } from "../../extraction/chunk";
import { parseDocumentStructure } from "../../contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../contract-model/compiler/discovery/pass-a-signals";
import { contentHash, type Phase2SecClient } from "./sec-client-adapter";
import { detectContentChangeAndInvalidate, markStage, stagesNeedingWork } from "./processing-queue";
import type { DocumentProcessResult, QueueItemState, StageTimingMs } from "./types";

const MAX_BYTES = 28 * 1024 * 1024;

function emptyTimings(): StageTimingMs {
  return {
    downloadMs: 0,
    parseMs: 0,
    dedupeMs: 0,
    structureMs: 0,
    definitionsMs: 0,
    referencesMs: 0,
    passAMs: 0,
    storageMs: 0,
    totalProcessingMs: 0,
  };
}

function guessContentType(filename: string, uri: string): string {
  const ext = (filename.split(".").pop() ?? uri.split(".").pop() ?? "").toLowerCase();
  if (ext === "htm" || ext === "html") return "text/html";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/html";
}

function rawPath(corpusRoot: string, sourceDocumentId: string): string {
  const safe = sourceDocumentId.replace(/[^a-zA-Z0-9._:-]/g, "_");
  return path.join(corpusRoot, "raw", `${safe}.bin`);
}

function metaPath(corpusRoot: string, sourceDocumentId: string): string {
  const safe = sourceDocumentId.replace(/[^a-zA-Z0-9._:-]/g, "_");
  return path.join(corpusRoot, "meta", `${safe}.json`);
}

function maxHierarchyDepth(nodes: { nodeId: string; parentNodeId: string | null }[]): number {
  if (nodes.length === 0) return 0;
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  let max = 0;
  for (const n of nodes) {
    let depth = 1;
    let cur: (typeof n) | undefined = n;
    const seen = new Set<string>();
    while (cur?.parentNodeId && !seen.has(cur.parentNodeId)) {
      seen.add(cur.parentNodeId);
      cur = byId.get(cur.parentNodeId);
      if (!cur) break;
      depth += 1;
      if (depth > 50) break;
    }
    max = Math.max(max, depth);
  }
  return max;
}

export async function processQueueItem(params: {
  item: QueueItemState;
  corpusRoot: string;
  sec: Phase2SecClient;
  seenHashes: Map<string, string>;
  forceRedownload?: boolean;
}): Promise<DocumentProcessResult> {
  const { item, corpusRoot, sec, seenHashes } = params;
  const timings = emptyTimings();
  let peakRss = process.memoryUsage().rss;
  const touch = () => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  };

  const needed = new Set(stagesNeedingWork(item));
  let bytes: Buffer | null = null;
  let fromCache = false;
  let contentType: string | null = null;
  const artifact = rawPath(corpusRoot, item.source.sourceDocumentId);

  const fail = (errorClass: DocumentProcessResult["errorClass"], error: string, status: DocumentProcessResult["status"] = "FAILED"): DocumentProcessResult => {
    // Terminal failure: clear remaining PENDING/INVALIDATED so the drain loop cannot spin.
    for (const stage of ["download", "parse", "dedupe", "structure", "definitions", "references", "passA", "storage"] as const) {
      if (item.stages[stage] === "PENDING" || item.stages[stage] === "INVALIDATED") {
        markStage(item, stage, "FAILED", error);
      }
    }
    const result: DocumentProcessResult = {
      sourceDocumentId: item.source.sourceDocumentId,
      status,
      error,
      errorClass,
      contentHash: item.contentHash,
      byteLength: bytes?.length ?? 0,
      charCount: 0,
      contentType,
      fromCache,
      wasDuplicate: false,
      duplicateOf: null,
      chunkCount: 0,
      nodeCount: 0,
      definitionCount: 0,
      referenceCount: 0,
      resolvedReferenceCount: 0,
      passACandidateCount: 0,
      hierarchyDepthMax: 0,
      timingsMs: timings,
      peakRssBytes: peakRss,
      stages: { ...item.stages },
      artifactPath: fs.existsSync(artifact) ? artifact : null,
    };
    item.result = result;
    item.lastError = error;
    return result;
  };

  try {
    // DOWNLOAD
    if (needed.has("download") || !fs.existsSync(artifact)) {
      const t = performance.now();
      const res = await sec.get(item.source.sourceUri, { bypassCache: params.forceRedownload });
      timings.downloadMs = performance.now() - t;
      fromCache = res.fromCache;
      if (res.status !== 200) {
        markStage(item, "download", "FAILED", `HTTP ${res.status}`);
        return fail("DOWNLOAD_FAILURE", `download HTTP ${res.status} for ${item.source.sourceUri}`);
      }
      if (res.body.length > MAX_BYTES) {
        markStage(item, "download", "FAILED", "oversized");
        return fail("OVERSIZED", `document exceeds ${MAX_BYTES} bytes`, "OVERSIZED");
      }
      bytes = res.body;
      const hash = contentHash(bytes);
      const changed = detectContentChangeAndInvalidate(item, hash);
      if (changed) {
        // downstream already invalidated
      }
      fs.mkdirSync(path.dirname(artifact), { recursive: true });
      fs.writeFileSync(artifact, bytes);
      markStage(item, "download", "DONE");
      touch();
    } else {
      bytes = fs.readFileSync(artifact);
      fromCache = true;
      const hash = contentHash(bytes);
      detectContentChangeAndInvalidate(item, hash);
      markStage(item, "download", "DONE");
    }

    const hash = item.contentHash ?? contentHash(bytes!);

    // DEDUPE (by content hash + agreement identity awareness)
    if (needed.has("dedupe") || item.stages.dedupe !== "DONE") {
      const t = performance.now();
      const prior = seenHashes.get(hash);
      timings.dedupeMs = performance.now() - t;
      if (prior && prior !== item.source.sourceDocumentId) {
        markStage(item, "dedupe", "SKIPPED_DUPLICATE");
        for (const s of ["parse", "structure", "definitions", "references", "passA", "storage"] as const) {
          markStage(item, s, "SKIPPED_DUPLICATE");
        }
        const result: DocumentProcessResult = {
          sourceDocumentId: item.source.sourceDocumentId,
          status: "SKIPPED_DUPLICATE",
          error: null,
          errorClass: "DUPLICATE_IDENTITY",
          contentHash: hash,
          byteLength: bytes!.length,
          charCount: 0,
          contentType: null,
          fromCache,
          wasDuplicate: true,
          duplicateOf: prior,
          chunkCount: 0,
          nodeCount: 0,
          definitionCount: 0,
          referenceCount: 0,
          resolvedReferenceCount: 0,
          passACandidateCount: 0,
          hierarchyDepthMax: 0,
          timingsMs: { ...timings, totalProcessingMs: timings.parseMs + timings.dedupeMs + timings.structureMs + timings.definitionsMs + timings.referencesMs + timings.passAMs + timings.storageMs },
          peakRssBytes: peakRss,
          stages: { ...item.stages },
          artifactPath: artifact,
        };
        item.result = result;
        return result;
      }
      seenHashes.set(hash, item.source.sourceDocumentId);
      markStage(item, "dedupe", "DONE");
    }

    contentType = guessContentType(item.source.filename, item.source.sourceUri);
    if (contentType === "application/pdf" || contentType.includes("wordprocessingml")) {
      // supported via parseDocument, continue
    } else if (!contentType.startsWith("text/")) {
      markStage(item, "parse", "FAILED", "unsupported");
      return fail("UNSUPPORTED_FORMAT", `unsupported contentType ${contentType}`, "UNSUPPORTED");
    }

    // PARSE + CHUNK
    let fullText = "";
    let chunkCount = 0;
    if (needed.has("parse") || item.stages.parse !== "DONE") {
      const t = performance.now();
      try {
        const parsed = await parseDocument(bytes!, contentType);
        const chunks = chunkDocument(parsed);
        fullText = parsed.fullText;
        chunkCount = chunks.length;
        timings.parseMs = performance.now() - t;
        markStage(item, "parse", "DONE");
        touch();
      } catch (err) {
        timings.parseMs = performance.now() - t;
        markStage(item, "parse", "FAILED", err instanceof Error ? err.message : String(err));
        return fail("PARSE_FAILURE", err instanceof Error ? err.message : String(err));
      }
    } else {
      const parsed = await parseDocument(bytes!, contentType);
      fullText = parsed.fullText;
      chunkCount = chunkDocument(parsed).length;
    }

    const documentId = item.source.sourceDocumentId;

    // STRUCTURE
    let nodes: ReturnType<typeof parseDocumentStructure> = [];
    if (needed.has("structure") || item.stages.structure !== "DONE") {
      const t = performance.now();
      nodes = parseDocumentStructure({ documentId, label: item.source.description || item.source.filename, text: fullText });
      timings.structureMs = performance.now() - t;
      if (nodes.length === 0) {
        markStage(item, "structure", "FAILED", "zero nodes");
        // Still continue definitions/refs on empty? Prefer fail-closed structural outcome recorded.
      } else {
        markStage(item, "structure", "DONE");
      }
      touch();
    } else {
      nodes = parseDocumentStructure({ documentId, label: item.source.description || item.source.filename, text: fullText });
    }

    const hierarchyDepthMax = maxHierarchyDepth(nodes);
    const brokenHierarchy = nodes.length > 0 && nodes.filter((n) => n.nodeType === "SECTION").length === 0 && fullText.length > 50_000;

    // DEFINITIONS
    let defs: ReturnType<typeof detectStructuralDefinitions> = [];
    if (needed.has("definitions") || item.stages.definitions !== "DONE") {
      const t = performance.now();
      defs = detectStructuralDefinitions(documentId, fullText, nodes);
      timings.definitionsMs = performance.now() - t;
      markStage(item, "definitions", "DONE");
      touch();
    } else {
      defs = detectStructuralDefinitions(documentId, fullText, nodes);
    }

    // REFERENCES
    let refs: ReturnType<typeof detectStructuralReferences> = [];
    if (needed.has("references") || item.stages.references !== "DONE") {
      const t = performance.now();
      refs = detectStructuralReferences(documentId, fullText, nodes);
      timings.referencesMs = performance.now() - t;
      markStage(item, "references", "DONE");
      touch();
    } else {
      refs = detectStructuralReferences(documentId, fullText, nodes);
    }

    // PASS A
    let passACount = 0;
    if (needed.has("passA") || item.stages.passA !== "DONE") {
      const t = performance.now();
      const index = buildStructuralIndex(new Map([[documentId, { text: fullText, nodes }]]), defs, refs);
      const passA = runPassADeterministicSignals(documentId, index);
      passACount = passA.length;
      timings.passAMs = performance.now() - t;
      markStage(item, "passA", "DONE");
      touch();
    }

    // STORAGE (structured meta sidecar — not git)
    if (needed.has("storage") || item.stages.storage !== "DONE") {
      const t = performance.now();
      const meta = {
        source: item.source,
        contentHash: hash,
        byteLength: bytes!.length,
        charCount: fullText.length,
        contentType,
        chunkCount,
        nodeCount: nodes.length,
        definitionCount: defs.length,
        referenceCount: refs.length,
        resolvedReferenceCount: refs.filter((r) => r.resolved).length,
        passACandidateCount: passACount,
        hierarchyDepthMax,
        compiler: "deterministic-structure+passA",
        verificationStatus: "SOURCE_ONLY",
        // Soft gate: never promote compute/structure outputs to legal verification.
        legalPromotionBlocked: true,
        certificationClaimed: false,
      };
      const mp = metaPath(corpusRoot, item.source.sourceDocumentId);
      fs.mkdirSync(path.dirname(mp), { recursive: true });
      fs.writeFileSync(mp, JSON.stringify(meta, null, 2));
      timings.storageMs = performance.now() - t;
      markStage(item, "storage", "DONE");
    }

    timings.totalProcessingMs =
      timings.parseMs + timings.dedupeMs + timings.structureMs + timings.definitionsMs + timings.referencesMs + timings.passAMs + timings.storageMs;

    let errorClass: DocumentProcessResult["errorClass"] = null;
    let status: DocumentProcessResult["status"] = "OK";
    let error: string | null = null;
    if (nodes.length === 0) {
      errorClass = "STRUCTURE_EMPTY";
      error = "structural compilation produced zero nodes";
      // still OK for throughput accounting of attempted processing; quality tracks separately
    } else if (brokenHierarchy) {
      errorClass = "STRUCTURE_BROKEN_HIERARCHY";
      error = "large document with nodes but no SECTION headers detected";
    } else if (defs.length === 0 && fullText.length > 100_000) {
      errorClass = "MISSING_DEFINITIONS";
      error = "no definitions detected on large financing document";
    }

    const result: DocumentProcessResult = {
      sourceDocumentId: item.source.sourceDocumentId,
      status,
      error,
      errorClass,
      contentHash: hash,
      byteLength: bytes!.length,
      charCount: fullText.length,
      contentType,
      fromCache,
      wasDuplicate: false,
      duplicateOf: null,
      chunkCount,
      nodeCount: nodes.length,
      definitionCount: defs.length,
      referenceCount: refs.length,
      resolvedReferenceCount: refs.filter((r) => r.resolved).length,
      passACandidateCount: passACount,
      hierarchyDepthMax,
      timingsMs: timings,
      peakRssBytes: peakRss,
      stages: { ...item.stages },
      artifactPath: artifact,
    };
    item.result = result;
    return result;
  } catch (err) {
    markStage(item, "parse", "FAILED", err instanceof Error ? err.message : String(err));
    return fail("OTHER", err instanceof Error ? err.message : String(err));
  }
}

export function directorySizeBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(root);
  return total;
}
