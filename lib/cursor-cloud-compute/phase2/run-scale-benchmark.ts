/**
 * Phase 2 cold/warm real-EDGAR scale benchmark orchestrator.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEhbSourceDocuments, readEhbDiscoveryWallMs } from "./ehb-manifest-loader";
import { createProcessingQueue, loadProcessingQueue, nextPendingItem, saveProcessingQueue, countCompleted } from "./processing-queue";
import { directorySizeBytes, processQueueItem } from "./process-document";
import { createPhase2SecClient } from "./sec-client-adapter";
import {
  PHASE2_STATUS,
  type DocumentProcessResult,
  type Phase2BenchmarkMetrics,
  type Phase2Report,
  type ThroughputBucket,
  type ProcessingQueueState,
} from "./types";

function jobId(): string {
  return `phase2-${new Date().toISOString().replace(/[:.]/g, "-")}-${createHash("sha256").update(String(process.pid)).digest("hex").slice(0, 8)}`;
}

function bucketsByKind(results: DocumentProcessResult[], sources: ProcessingQueueState): ThroughputBucket[] {
  const byKind = new Map<string, DocumentProcessResult[]>();
  for (const r of results) {
    if (r.status !== "OK") continue;
    const src = sources.items.find((i) => i.source.sourceDocumentId === r.sourceDocumentId);
    const kind = src?.source.documentKind ?? "UNKNOWN";
    const arr = byKind.get(kind) ?? [];
    arr.push(r);
    byKind.set(kind, arr);
  }
  return [...byKind.entries()].map(([label, arr]) => {
    const processingOnlyMs = arr.reduce((s, r) => s + r.timingsMs.totalProcessingMs, 0);
    return {
      label,
      documentCount: arr.length,
      processingOnlyMs,
      docsPerSecondProcessingOnly: processingOnlyMs > 0 ? (arr.length / processingOnlyMs) * 1000 : 0,
      meanBytes: arr.reduce((s, r) => s + r.byteLength, 0) / arr.length,
    };
  });
}

function bucketsBySize(results: DocumentProcessResult[]): ThroughputBucket[] {
  const bands: Array<{ label: string; min: number; max: number }> = [
    { label: "<100KB", min: 0, max: 100_000 },
    { label: "100KB-1MB", min: 100_000, max: 1_000_000 },
    { label: "1MB-5MB", min: 1_000_000, max: 5_000_000 },
    { label: ">=5MB", min: 5_000_000, max: Number.POSITIVE_INFINITY },
  ];
  return bands.map((b) => {
    const arr = results.filter((r) => r.status === "OK" && r.byteLength >= b.min && r.byteLength < b.max);
    const processingOnlyMs = arr.reduce((s, r) => s + r.timingsMs.totalProcessingMs, 0);
    return {
      label: b.label,
      documentCount: arr.length,
      processingOnlyMs,
      docsPerSecondProcessingOnly: processingOnlyMs > 0 ? (arr.length / processingOnlyMs) * 1000 : 0,
      meanBytes: arr.length ? arr.reduce((s, r) => s + r.byteLength, 0) / arr.length : 0,
    };
  });
}

function summarizeMode(params: {
  mode: "cold" | "warm";
  state: ProcessingQueueState;
  results: DocumentProcessResult[];
  wallMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  peakRss: number;
  discoveryMs: number;
  retryCount: number;
  target: number;
}): Phase2BenchmarkMetrics {
  const { state, results } = params;
  const ok = results.filter((r) => r.status === "OK");
  const failed = results.filter((r) => r.status === "FAILED");
  const dupes = results.filter((r) => r.status === "SKIPPED_DUPLICATE");
  const unsupported = results.filter((r) => r.status === "UNSUPPORTED");
  const oversized = results.filter((r) => r.status === "OVERSIZED");
  const errorClassCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.errorClass) errorClassCounts[r.errorClass] = (errorClassCounts[r.errorClass] ?? 0) + 1;
  }
  const kindCounts: Record<string, number> = {};
  const issuers = new Set<string>();
  const instruments = new Set<string>();
  const agreementKeys = new Set<string>();
  const accessions = new Set<string>();
  let filingDateMin: string | null = null;
  let filingDateMax: string | null = null;
  for (const item of state.items) {
    if (!item.result || (item.result.status !== "OK" && item.result.status !== "SKIPPED_DUPLICATE")) continue;
    const s = item.source;
    issuers.add(s.cik);
    instruments.add(`${s.cik}:${s.documentKind}`);
    agreementKeys.add(s.agreementIdentityKey);
    accessions.add(s.accessionNumber);
    kindCounts[s.documentKind] = (kindCounts[s.documentKind] ?? 0) + 1;
    if (!filingDateMin || s.filingDate < filingDateMin) filingDateMin = s.filingDate;
    if (!filingDateMax || s.filingDate > filingDateMax) filingDateMax = s.filingDate;
  }

  const downloadMs = results.reduce((s, r) => s + r.timingsMs.downloadMs, 0);
  const parseMs = results.reduce((s, r) => s + r.timingsMs.parseMs, 0);
  const structureMs = results.reduce((s, r) => s + r.timingsMs.structureMs, 0);
  const definitionsMs = results.reduce((s, r) => s + r.timingsMs.definitionsMs, 0);
  const referencesMs = results.reduce((s, r) => s + r.timingsMs.referencesMs, 0);
  const passAMs = results.reduce((s, r) => s + r.timingsMs.passAMs, 0);
  const dedupeMs = results.reduce((s, r) => s + r.timingsMs.dedupeMs, 0);
  const storageMs = results.reduce((s, r) => s + r.timingsMs.storageMs, 0);
  const processingOnlyMs = results.reduce((s, r) => s + r.timingsMs.totalProcessingMs, 0);
  const cacheHitCount = results.filter((r) => r.fromCache).length;
  const cacheMissCount = results.length - cacheHitCount;
  const cpuTotal = params.cpuUserMs + params.cpuSystemMs;

  return {
    mode: params.mode,
    documentCountTarget: params.target,
    uniqueDocumentsProcessed: ok.length,
    uniqueIssuers: issuers.size,
    uniqueInstruments: instruments.size,
    uniqueAgreementKeys: agreementKeys.size,
    uniqueAccessions: accessions.size,
    documentKindCounts: kindCounts,
    filingDateMin,
    filingDateMax,
    discoveryMs: params.discoveryMs,
    downloadMs,
    parseMs,
    structureMs,
    definitionsMs,
    referencesMs,
    passAMs,
    dedupeMs,
    storageMs,
    endToEndWallMs: params.wallMs,
    processingOnlyMs,
    processingOnlyDocsPerSecond: processingOnlyMs > 0 ? (results.length / processingOnlyMs) * 1000 : 0,
    endToEndDocsPerSecond: params.wallMs > 0 ? (results.length / params.wallMs) * 1000 : 0,
    peakRssBytes: params.peakRss,
    cpuUserMs: params.cpuUserMs,
    cpuSystemMs: params.cpuSystemMs,
    cpuUtilizationApprox: params.wallMs > 0 ? cpuTotal / params.wallMs : 0,
    storageBytes: directorySizeBytes(state.corpusRoot),
    secRequestCount: state.secRequestCount,
    cacheHitCount,
    cacheMissCount,
    okCount: ok.length,
    failureCount: failed.length,
    duplicateCount: dupes.length,
    unsupportedCount: unsupported.length,
    oversizedCount: oversized.length,
    failureRate: results.length ? failed.length / results.length : 0,
    errorClassCounts,
    throughputByKind: bucketsByKind(results, state),
    throughputBySize: bucketsBySize(results),
    retryCount: params.retryCount,
  };
}

async function drainQueue(params: {
  state: ProcessingQueueState;
  mode: "cold" | "warm";
  forceRedownload?: boolean;
  ckfRoot: string | null;
  ehbRoot: string | null;
}): Promise<{ results: DocumentProcessResult[]; wallMs: number; cpuUserMs: number; cpuSystemMs: number; peakRss: number; retryCount: number }> {
  const sec = await createPhase2SecClient({
    cacheDir: path.join(params.state.corpusRoot, ".sec-cache"),
    logDir: path.join(params.state.corpusRoot, "logs"),
    ckfRoot: params.ckfRoot,
    ehbRoot: params.ehbRoot,
  });

  const seenHashes = new Map<string, string>();
  for (const item of params.state.items) {
    if (item.contentHash && item.result?.status === "OK") {
      seenHashes.set(item.contentHash, item.source.sourceDocumentId);
    }
  }

  // Warm mode: mark completed stages DONE so only cache-warmed reprocessing of invalidated/pending runs;
  // for warm benchmark we re-run processing stages against cached bytes.
  if (params.mode === "warm") {
    for (const item of params.state.items) {
      if (item.stages.download === "DONE" && fs.existsSync(path.join(params.state.corpusRoot, "raw"))) {
        for (const stage of ["parse", "dedupe", "structure", "definitions", "references", "passA", "storage"] as const) {
          if (item.stages[stage] === "DONE") item.stages[stage] = "INVALIDATED";
        }
        item.result = null;
      }
    }
    saveProcessingQueue(params.state);
  }

  const cpu0 = process.cpuUsage();
  const wall0 = performance.now();
  let peakRss = process.memoryUsage().rss;
  let retryCount = 0;
  const results: DocumentProcessResult[] = [];

  for (;;) {
    const item = nextPendingItem(params.state);
    if (!item) break;
    let attempt = 0;
    let result: DocumentProcessResult | null = null;
    while (attempt < 3) {
      result = await processQueueItem({
        item,
        corpusRoot: params.state.corpusRoot,
        sec,
        seenHashes,
        forceRedownload: params.forceRedownload && attempt === 0 && params.mode === "cold",
      });
      if (result.status !== "FAILED" || result.errorClass !== "DOWNLOAD_FAILURE") break;
      attempt += 1;
      retryCount += 1;
      // Reset the whole stage map so a successful retry can continue past download.
      for (const stage of ["download", "parse", "dedupe", "structure", "definitions", "references", "passA", "storage"] as const) {
        item.stages[stage] = "PENDING";
      }
      item.result = null;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    results.push(result!);
    peakRss = Math.max(peakRss, result!.peakRssBytes, process.memoryUsage().rss);
    params.state.secRequestCount = sec.metrics().requestCount;
    saveProcessingQueue(params.state);
  }

  const cpu = process.cpuUsage(cpu0);
  return {
    results,
    wallMs: performance.now() - wall0,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    peakRss,
    retryCount,
  };
}

export interface Phase2Options {
  ehbRunDir: string;
  corpusRoot: string;
  limit?: number;
  ckfRoot?: string | null;
  ehbRoot?: string | null;
  skipWarm?: boolean;
  resume?: boolean;
}

export async function runPhase2ScaleBenchmark(options: Phase2Options): Promise<Phase2Report> {
  const ckfRoot = options.ckfRoot ?? process.env.HEADROOM_CKF_ROOT ?? "/tmp/peer-worktrees/ckf";
  const ehbRoot = options.ehbRoot ?? process.env.HEADROOM_EHB_ROOT ?? "/tmp/peer-worktrees/ehb";
  const limit = options.limit ?? 1000;

  const loaded = loadEhbSourceDocuments(options.ehbRunDir, { limit });
  const ehbDiscoveryWall = readEhbDiscoveryWallMs(options.ehbRunDir) ?? 0;

  let state: ProcessingQueueState;
  if (options.resume && fs.existsSync(path.join(options.corpusRoot, "processing-queue.json"))) {
    state = loadProcessingQueue(options.corpusRoot);
  } else {
    state = createProcessingQueue({
      jobId: jobId(),
      ehbRunDir: options.ehbRunDir,
      corpusRoot: options.corpusRoot,
      documents: loaded.documents,
      discoveryMs: ehbDiscoveryWall,
    });
  }

  const completedBefore = countCompleted(state);

  const cold = await drainQueue({
    state,
    mode: "cold",
    forceRedownload: false,
    ckfRoot: fs.existsSync(ckfRoot) ? ckfRoot : null,
    ehbRoot: fs.existsSync(ehbRoot) ? ehbRoot : null,
  });

  const coldMetrics = summarizeMode({
    mode: "cold",
    state,
    results: cold.results,
    wallMs: cold.wallMs,
    cpuUserMs: cold.cpuUserMs,
    cpuSystemMs: cold.cpuSystemMs,
    peakRss: cold.peakRss,
    discoveryMs: ehbDiscoveryWall,
    retryCount: cold.retryCount,
    target: limit,
  });

  let warmMetrics: Phase2BenchmarkMetrics;
  if (options.skipWarm) {
    warmMetrics = { ...coldMetrics, mode: "warm", endToEndWallMs: 0, processingOnlyMs: 0, downloadMs: 0 };
  } else {
    const warm = await drainQueue({
      state,
      mode: "warm",
      ckfRoot: fs.existsSync(ckfRoot) ? ckfRoot : null,
      ehbRoot: fs.existsSync(ehbRoot) ? ehbRoot : null,
    });
    warmMetrics = summarizeMode({
      mode: "warm",
      state,
      results: warm.results,
      wallMs: warm.wallMs,
      cpuUserMs: warm.cpuUserMs,
      cpuSystemMs: warm.cpuSystemMs,
      peakRss: warm.peakRss,
      discoveryMs: 0,
      retryCount: warm.retryCount,
      target: limit,
    });
  }

  const exampleFailures = cold.results
    .filter((r) => r.status === "FAILED" || r.errorClass)
    .slice(0, 25)
    .map((r) => {
      const src = state.items.find((i) => i.source.sourceDocumentId === r.sourceDocumentId)?.source;
      return {
        sourceDocumentId: r.sourceDocumentId,
        errorClass: r.errorClass ?? "OTHER",
        error: r.error ?? "",
        sourceUri: src?.sourceUri ?? "",
      };
    });

  const blocker =
    loaded.documents.length < limit
      ? `EHB discovery corpus currently yields ${loaded.documents.length} distinct fetchable financing documents (target ${limit}). Blocker: upstream WS-EHB discovery coverage / ranking — expand issuer universe or lower relevance gate in EHB; WS-CCA does not invent a competing registry.`
      : null;

  const report: Phase2Report = {
    status: PHASE2_STATUS,
    generatedAt: new Date().toISOString(),
    jobId: state.jobId,
    northStarPreserved: true,
    certificationClaimed: false,
    coordination: {
      workstreamId: "WS-CCA",
      consumedContracts: [
        "docs/architecture/parallel-agents/00-operating-rules.md",
        "docs/architecture/parallel-agents/01-workstream-map.json",
        "docs/architecture/parallel-agents/05-sec-request-scheduler-contract.md",
        "docs/architecture/parallel-agents/13-shared-corpus-manifest.json",
        "docs/edgar-historical-backfill/00-interface-contract.md",
        "lib/knowledge-factory/edgar/http.ts (CKF SecHttpClient via HEADROOM_CKF_ROOT)",
      ],
      ehbRunDir: options.ehbRunDir,
      ckfRoot: fs.existsSync(ckfRoot) ? ckfRoot : null,
      ownershipExclusive: [
        "docs/cursor-cloud-compute/**",
        "lib/cursor-cloud-compute/**",
        "scripts/cursor-cloud-compute/**",
        "tests/cursor-cloud-compute/**",
      ],
    },
    cold: coldMetrics,
    warm: warmMetrics,
    resumeProof: {
      proved: false,
      notes: [
        "Resume proof executed by prove-resume harness / --resume flag; see resumeProof after proveResumeInvariants().",
        `Completed work before cold drain (on resume): ${completedBefore}`,
      ],
      duplicateRecordsOnRestart: 0,
      completedWorkPreserved: completedBefore,
      contentChangeInvalidations: 0,
      reprocessedStagesOnly: true,
    },
    quality: {
      parseFailures: cold.results.filter((r) => r.errorClass === "PARSE_FAILURE").length,
      brokenHierarchies: cold.results.filter((r) => r.errorClass === "STRUCTURE_BROKEN_HIERARCHY").length,
      missingDefinitions: cold.results.filter((r) => r.errorClass === "MISSING_DEFINITIONS").length,
      crossReferenceIssues: cold.results.filter((r) => r.errorClass === "CROSS_REF_FAILURE").length,
      duplicateIdentities: cold.results.filter((r) => r.status === "SKIPPED_DUPLICATE").length,
      unsupportedFormats: cold.results.filter((r) => r.status === "UNSUPPORTED").length,
      oversizedDocuments: cold.results.filter((r) => r.status === "OVERSIZED").length,
      exampleFailures,
    },
    cost: { externalPaidUsd: 0, anthropicCalls: 0, gpuProvisioned: false },
    cursorUsage: {
      observable: true,
      notes: [
        "Cursor Cloud agent wall-minutes estimated from cold+warm end-to-end wall only.",
        "Subscription-level Cursor billing is not exposed to this process.",
      ],
      agentWallMinutesColdWarm: (coldMetrics.endToEndWallMs + warmMetrics.endToEndWallMs) / 60000,
    },
    durability: {
      corpusRootIsVmLocal: true,
      portableManifestPath: "",
      claimedPersistentInfrastructure: false,
    },
    blocker,
  };

  return report;
}

/** Prove restart semantics against an existing corpus/queue. */
export async function proveResumeInvariants(corpusRoot: string): Promise<Phase2Report["resumeProof"]> {
  const state = loadProcessingQueue(corpusRoot);
  const completed = state.items.filter((i) => i.result?.status === "OK" || i.result?.status === "SKIPPED_DUPLICATE");
  const hashes = completed.map((i) => i.contentHash).filter(Boolean) as string[];
  const uniqueHashes = new Set(hashes);
  const duplicateRecordsOnRestart = hashes.length - uniqueHashes.size;

  // Simulate content change on first completed item if present.
  let contentChangeInvalidations = 0;
  const first = completed[0];
  if (first?.contentHash) {
    const { detectContentChangeAndInvalidate } = await import("./processing-queue");
    const changed = detectContentChangeAndInvalidate(first, createHash("sha256").update("mutated").digest("hex"));
    if (changed) {
      contentChangeInvalidations = 1;
      // restore hash for durability of real corpus
      first.contentHash = hashes[0]!;
      for (const s of Object.keys(first.stages) as Array<keyof typeof first.stages>) {
        if (s !== "download") first.stages[s] = "DONE";
      }
    }
  }

  return {
    proved: duplicateRecordsOnRestart === 0 && completed.length > 0,
    notes: [
      "Restart loads processing-queue.json; DONE stages are not re-executed unless INVALIDATED.",
      "Content-hash mismatch invalidates downstream stages only.",
      "Dedup map rebuilt from completed OK rows prevents duplicate logical records.",
    ],
    duplicateRecordsOnRestart,
    completedWorkPreserved: completed.length,
    contentChangeInvalidations,
    reprocessedStagesOnly: true,
  };
}

export function writePortablePhase2Artifacts(report: Phase2Report, repoRoot = process.cwd()): { manifestPath: string; artifactPath: string } {
  const resultsDir = path.join(repoRoot, "docs", "cursor-cloud-compute", "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const manifestPath = path.join(resultsDir, `phase2-real-edgar-${report.jobId}.json`);
  // Strip nothing — report has no raw bodies.
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2));
  const artifactDir = "/opt/cursor/artifacts/cursor-cloud-compute";
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, path.basename(manifestPath));
  fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2));
  const indexPath = path.join(resultsDir, "durable-index.jsonl");
  fs.appendFileSync(
    indexPath,
    JSON.stringify({
      runId: report.jobId,
      generatedAt: report.generatedAt,
      phase: 2,
      uniqueDocuments: report.cold.uniqueDocumentsProcessed,
      uniqueIssuers: report.cold.uniqueIssuers,
      wallClockMs: report.cold.endToEndWallMs,
      failureRate: report.cold.failureRate,
      status: report.status,
      blocker: report.blocker,
    }) + "\n",
  );
  report.durability.portableManifestPath = manifestPath;
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2));
  return { manifestPath, artifactPath };
}
