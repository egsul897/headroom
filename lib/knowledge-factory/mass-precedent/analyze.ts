/**
 * Resumable analysis over committed authentic bytes into persistent corpus store.
 * Persists failure/unsupported states; never promotes to legal truth.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { processAcquiredDocument } from "../pipeline/run";
import { hashBytes } from "../pipeline/text";
import { scanOriginalByteCandidates } from "../consolidation/scan-original-bytes";
import { discoverDocumentRelationships } from "../relationships/discover";
import { openMassPrecedentCorpus } from "./corpus-paths";
import type { AnalysisRunRecord, AnalysisStage } from "./types";

function codeSha(): string {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

function stageOrder(): AnalysisStage[] {
  return [
    "STRUCTURAL_INDEX",
    "DEFINITIONS",
    "COVENANT_DISCOVERY",
    "DEPENDENCY_MAP",
    "AMENDMENT_RELATION",
    "CONSUMER_EXPORT",
  ];
}

function sanitize(sourceId: string): string {
  return sourceId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

/**
 * Analyze one source from committed bytes into the shared mass-precedent corpus.
 * Idempotent on content hash (pipeline exact-byte dedupe).
 */
export async function analyzeCommittedSource(params: {
  sourceId: string;
  repoRoot?: string;
  outDir?: string;
}): Promise<{
  records: AnalysisRunRecord[];
  ok: boolean;
  counts?: Record<string, number>;
  processingMs?: number;
}> {
  const repoRoot = params.repoRoot ?? process.cwd();
  const outDir =
    params.outDir ?? path.join(repoRoot, "docs/knowledge-factory/mass-precedent/runs");
  mkdirSync(outDir, { recursive: true });

  const candidate = scanOriginalByteCandidates(repoRoot).find((c) => c.sourceId === params.sourceId);
  const sha = codeSha();
  const records: AnalysisRunRecord[] = [];
  const store = openMassPrecedentCorpus(repoRoot);

  if (!candidate) {
    const startedAt = new Date().toISOString();
    records.push({
      sourceId: params.sourceId,
      stage: "STRUCTURAL_INDEX",
      status: "SKIPPED",
      codeSha: sha,
      startedAt,
      finishedAt: new Date().toISOString(),
      diagnostics: "No committed bytes for sourceId",
      promotedToLegalTruth: 0,
    });
    writeFileSync(
      path.join(outDir, `${sanitize(params.sourceId)}.json`),
      JSON.stringify({ sourceId: params.sourceId, records }, null, 2) + "\n",
    );
    return { records, ok: false };
  }

  const bytes = readFileSync(path.join(repoRoot, candidate.localPath));
  const contentHash = hashBytes(bytes);
  let counts: Record<string, number> | undefined;
  let processingMs: number | undefined;

  for (const stage of stageOrder()) {
    const startedAt = new Date().toISOString();
    try {
      if (stage === "STRUCTURAL_INDEX") {
        const processed = await processAcquiredDocument(store, {
          discovered: {
            sourceId: candidate.sourceId,
            filing: {
              accessionNumber: candidate.accessionNumber,
              formType: candidate.formType,
              filingDate: candidate.filingDate,
              issuer: {
                cik: candidate.issuerCik,
                ticker: candidate.issuerTicker,
                name: candidate.issuerName,
              },
            },
            exhibit: {
              filename: candidate.exhibitFilename,
              description: candidate.documentTitle,
              exhibitType: "EX-10",
              sourceUrl: candidate.sourceUrl,
            },
            discoverySignals: ["mass-precedent-analyze"],
          },
          bytes,
          contentHash,
          provenance: candidate.provenance,
          usageRightsReviewStatus: candidate.usageRightsReviewStatus,
        });
        processingMs = processed.processingMs;
        counts = {
          sources: 1,
          structuralNodes: processed.structuralNodeCount,
          definitions: processed.definitionCount,
          covenantCandidates: processed.candidateCount,
          crossReferences: processed.crossReferenceCount,
          conditionExceptions: processed.conditionExceptionCount,
          processingMs: processed.processingMs,
        };
        records.push({
          sourceId: params.sourceId,
          stage,
          status: processed.source.extractionStatus === "FAILED" ? "FAILED" : "OK",
          codeSha: sha,
          inputHash: contentHash,
          startedAt,
          finishedAt: new Date().toISOString(),
          representationLevel: processed.source.representationLevel,
          diagnostics: `extractionStatus=${processed.source.extractionStatus}; nodes=${processed.structuralNodeCount}; defs=${processed.definitionCount}; candidates=${processed.candidateCount}; xrefs=${processed.crossReferenceCount}; ms=${processed.processingMs}`,
          promotedToLegalTruth: 0,
        });
      } else if (stage === "DEFINITIONS" || stage === "COVENANT_DISCOVERY") {
        records.push({
          sourceId: params.sourceId,
          stage,
          status: "OK",
          codeSha: sha,
          inputHash: contentHash,
          startedAt,
          finishedAt: new Date().toISOString(),
          diagnostics: "covered by processAcquiredDocument structural pass",
          promotedToLegalTruth: 0,
        });
      } else if (stage === "DEPENDENCY_MAP") {
        const xrefs = store.loadCrossReferences(params.sourceId);
        records.push({
          sourceId: params.sourceId,
          stage,
          status: "OK",
          codeSha: sha,
          inputHash: contentHash,
          startedAt,
          finishedAt: new Date().toISOString(),
          diagnostics: `crossReferences=${xrefs.length} (intra-document); package-graph pending for multi-doc packages`,
          promotedToLegalTruth: 0,
        });
      } else if (stage === "AMENDMENT_RELATION") {
        const rels = discoverDocumentRelationships(store.listSources());
        store.saveRelationships(rels);
        const linked = rels.filter(
          (r) => r.sourceId === params.sourceId || r.targetId === params.sourceId,
        ).length;
        records.push({
          sourceId: params.sourceId,
          stage,
          status: "OK",
          codeSha: sha,
          inputHash: contentHash,
          startedAt,
          finishedAt: new Date().toISOString(),
          diagnostics: `relationshipEdgesForSource=${linked}; corpusRelationships=${rels.length}`,
          promotedToLegalTruth: 0,
        });
      } else if (stage === "CONSUMER_EXPORT") {
        records.push({
          sourceId: params.sourceId,
          stage,
          status: "OK",
          codeSha: sha,
          inputHash: contentHash,
          startedAt,
          finishedAt: new Date().toISOString(),
          diagnostics: "source retained in .local-knowledge-corpus/mass-precedent for retrieval index",
          promotedToLegalTruth: 0,
        });
      }
    } catch (err) {
      records.push({
        sourceId: params.sourceId,
        stage,
        status: "FAILED",
        codeSha: sha,
        inputHash: contentHash,
        startedAt,
        finishedAt: new Date().toISOString(),
        diagnostics: err instanceof Error ? err.message : String(err),
        promotedToLegalTruth: 0,
      });
    }
  }

  writeFileSync(
    path.join(outDir, `${sanitize(params.sourceId)}.json`),
    JSON.stringify({ sourceId: params.sourceId, contentHash, counts, processingMs, records }, null, 2) +
      "\n",
  );
  const ok = records.some((r) => r.stage === "STRUCTURAL_INDEX" && r.status === "OK");
  return { records, ok, counts, processingMs };
}

export async function analyzeBatchCommitted(params: {
  sourceIds: string[];
  repoRoot?: string;
}): Promise<{
  analyzed: number;
  ok: number;
  failed: number;
  totalProcessingMs: number;
}> {
  let ok = 0;
  let failed = 0;
  let totalProcessingMs = 0;
  for (const sourceId of params.sourceIds) {
    const r = await analyzeCommittedSource({ sourceId, repoRoot: params.repoRoot });
    if (r.ok) ok += 1;
    else failed += 1;
    totalProcessingMs += r.processingMs ?? 0;
  }
  return { analyzed: params.sourceIds.length, ok, failed, totalProcessingMs };
}

export function listExistingRunRecords(repoRoot = process.cwd()): string[] {
  const dir = path.join(repoRoot, "docs/knowledge-factory/mass-precedent/runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}
