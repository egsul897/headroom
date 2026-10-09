/**
 * Deterministic 100-doc ingestion + structural-compilation job.
 *
 * Stages (zero LLM / zero paid API):
 *   parse → chunk → content-hash dedup → STRUCTURE → definitions →
 *   references → structural index → Pass A covenant signals
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. Does not mint discoveryIds or
 * touch certified-config algorithm knobs.
 */
import { performance } from "node:perf_hooks";
import { computeContentHash } from "../connectors/dedup";
import { parseDocument } from "../extraction/parse";
import { chunkDocument } from "../extraction/chunk";
import { parseDocumentStructure } from "../contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../contract-model/compiler/discovery/pass-a-signals";
import { buildDeterministicCorpus, DEFAULT_CORPUS_SIZE } from "./corpus";
import type { BenchmarkMetrics, CorpusDocument, DocumentJobResult, DocumentStageTimingsMs } from "./types";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function emptyTimings(): DocumentStageTimingsMs {
  return { parseMs: 0, chunkMs: 0, hashDedupMs: 0, structureMs: 0, definitionsMs: 0, referencesMs: 0, indexMs: 0, passAMs: 0, totalMs: 0 };
}

export async function processDocumentDeterministic(doc: CorpusDocument, seenHashes: Map<string, string>): Promise<DocumentJobResult> {
  const timings = emptyTimings();
  const t0 = performance.now();
  let peakRss = process.memoryUsage().rss;

  const touchRss = () => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  };

  try {
    let t = performance.now();
    const contentHash = computeContentHash(doc.bytes);
    const prior = seenHashes.get(contentHash);
    const wasDuplicate = prior !== undefined;
    if (!wasDuplicate) seenHashes.set(contentHash, doc.documentId);
    timings.hashDedupMs = performance.now() - t;
    touchRss();

    if (wasDuplicate) {
      timings.totalMs = performance.now() - t0;
      return {
        documentId: doc.documentId,
        label: doc.label,
        sourceSeed: doc.sourceSeed,
        contentType: doc.contentType,
        charCount: doc.charCount,
        byteLength: doc.bytes.length,
        contentHash,
        wasDuplicate: true,
        intentionalDuplicateOf: doc.intentionalDuplicateOf ?? prior ?? null,
        status: "OK",
        error: null,
        chunkCount: 0,
        nodeCount: 0,
        definitionCount: 0,
        referenceCount: 0,
        passACandidateCount: 0,
        timingsMs: timings,
        peakRssBytes: peakRss,
      };
    }

    t = performance.now();
    const parsed = await parseDocument(doc.bytes, doc.contentType);
    timings.parseMs = performance.now() - t;
    touchRss();

    t = performance.now();
    const chunks = chunkDocument(parsed);
    timings.chunkMs = performance.now() - t;
    touchRss();

    const text = parsed.fullText;
    t = performance.now();
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    timings.structureMs = performance.now() - t;
    touchRss();

    t = performance.now();
    const defs = detectStructuralDefinitions(doc.documentId, text, nodes);
    timings.definitionsMs = performance.now() - t;
    touchRss();

    t = performance.now();
    const refs = detectStructuralReferences(doc.documentId, text, nodes);
    timings.referencesMs = performance.now() - t;
    touchRss();

    t = performance.now();
    const index = buildStructuralIndex(new Map([[doc.documentId, { text, nodes }]]), defs, refs);
    timings.indexMs = performance.now() - t;
    touchRss();

    t = performance.now();
    const passA = runPassADeterministicSignals(doc.documentId, index);
    timings.passAMs = performance.now() - t;
    touchRss();

    timings.totalMs = performance.now() - t0;
    return {
      documentId: doc.documentId,
      label: doc.label,
      sourceSeed: doc.sourceSeed,
      contentType: doc.contentType,
      charCount: text.length,
      byteLength: doc.bytes.length,
      contentHash,
      wasDuplicate: false,
      intentionalDuplicateOf: doc.intentionalDuplicateOf,
      status: "OK",
      error: null,
      chunkCount: chunks.length,
      nodeCount: nodes.length,
      definitionCount: defs.length,
      referenceCount: refs.length,
      passACandidateCount: passA.length,
      timingsMs: timings,
      peakRssBytes: peakRss,
    };
  } catch (err) {
    timings.totalMs = performance.now() - t0;
    return {
      documentId: doc.documentId,
      label: doc.label,
      sourceSeed: doc.sourceSeed,
      contentType: doc.contentType,
      charCount: doc.charCount,
      byteLength: doc.bytes.length,
      contentHash: computeContentHash(doc.bytes),
      wasDuplicate: false,
      intentionalDuplicateOf: doc.intentionalDuplicateOf,
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      chunkCount: 0,
      nodeCount: 0,
      definitionCount: 0,
      referenceCount: 0,
      passACandidateCount: 0,
      timingsMs: timings,
      peakRssBytes: peakRss,
    };
  }
}

export function summarizeBenchmark(results: DocumentJobResult[], wallClockMs: number, cpuUserMs: number, cpuSystemMs: number, peakRssBytes: number): BenchmarkMetrics {
  const ok = results.filter((r) => r.status === "OK");
  const failed = results.filter((r) => r.status === "FAILED");
  const dupes = results.filter((r) => r.wasDuplicate);
  const unique = results.filter((r) => !r.wasDuplicate);
  const docMs = [...results.map((r) => r.timingsMs.totalMs)].sort((a, b) => a - b);
  const stageTotals = emptyTimings();
  for (const r of results) {
    stageTotals.parseMs += r.timingsMs.parseMs;
    stageTotals.chunkMs += r.timingsMs.chunkMs;
    stageTotals.hashDedupMs += r.timingsMs.hashDedupMs;
    stageTotals.structureMs += r.timingsMs.structureMs;
    stageTotals.definitionsMs += r.timingsMs.definitionsMs;
    stageTotals.referencesMs += r.timingsMs.referencesMs;
    stageTotals.indexMs += r.timingsMs.indexMs;
    stageTotals.passAMs += r.timingsMs.passAMs;
    stageTotals.totalMs += r.timingsMs.totalMs;
  }
  const totalChars = unique.reduce((s, r) => s + r.charCount, 0);
  const totalBytes = results.reduce((s, r) => s + r.byteLength, 0);
  const wallSec = wallClockMs / 1000;

  return {
    documentCountRequested: results.length,
    documentCountProcessed: results.length,
    uniqueDocuments: unique.length,
    duplicateDocuments: dupes.length,
    okCount: ok.length,
    failureCount: failed.length,
    failureRate: results.length === 0 ? 0 : failed.length / results.length,
    wallClockMs,
    cpuUserMs,
    cpuSystemMs,
    cpuTotalMs: cpuUserMs + cpuSystemMs,
    peakRssBytes,
    totalChars,
    totalBytes,
    totalNodes: unique.reduce((s, r) => s + r.nodeCount, 0),
    totalPassACandidates: unique.reduce((s, r) => s + r.passACandidateCount, 0),
    docsPerSecond: wallSec > 0 ? results.length / wallSec : 0,
    charsPerSecond: wallSec > 0 ? totalChars / wallSec : 0,
    meanDocMs: results.length === 0 ? 0 : stageTotals.totalMs / results.length,
    p50DocMs: percentile(docMs, 50),
    p95DocMs: percentile(docMs, 95),
    p99DocMs: percentile(docMs, 99),
    stageTotalsMs: stageTotals,
  };
}

export interface RunJobOptions {
  size?: number;
  repoRoot?: string;
  corpus?: CorpusDocument[];
}

export async function runDeterministicIngestCompileJob(options?: RunJobOptions): Promise<{
  results: DocumentJobResult[];
  metrics: BenchmarkMetrics;
}> {
  const corpus = options?.corpus ?? buildDeterministicCorpus({ size: options?.size ?? DEFAULT_CORPUS_SIZE, repoRoot: options?.repoRoot });
  const seenHashes = new Map<string, string>();
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  let peakRss = process.memoryUsage().rss;
  const results: DocumentJobResult[] = [];

  for (const doc of corpus) {
    const result = await processDocumentDeterministic(doc, seenHashes);
    peakRss = Math.max(peakRss, result.peakRssBytes, process.memoryUsage().rss);
    results.push(result);
  }

  const wallClockMs = performance.now() - wallStart;
  const cpu = process.cpuUsage(cpuStart);
  const metrics = summarizeBenchmark(results, wallClockMs, cpu.user / 1000, cpu.system / 1000, peakRss);
  return { results, metrics };
}
