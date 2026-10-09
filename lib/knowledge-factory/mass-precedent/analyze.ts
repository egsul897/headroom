/**
 * Resumable analysis over committed authentic bytes.
 * Persists failure/unsupported states; never promotes to legal truth.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { CorpusStore } from "../store/corpus-store";
import { processAcquiredDocument } from "../pipeline/run";
import { hashBytes } from "../pipeline/text";
import { buildCanonicalConsumerExport } from "../export/build-canonical-export";
import { scanOriginalByteCandidates } from "../consolidation/scan-original-bytes";
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
 * Analyze one source from committed bytes. Writes run records under
 * docs/knowledge-factory/mass-precedent/runs/ (safe to commit summaries).
 */
export async function analyzeCommittedSource(params: {
  sourceId: string;
  repoRoot?: string;
  outDir?: string;
}): Promise<{ records: AnalysisRunRecord[]; ok: boolean; counts?: Record<string, number> }> {
  const repoRoot = params.repoRoot ?? process.cwd();
  const outDir =
    params.outDir ?? path.join(repoRoot, "docs/knowledge-factory/mass-precedent/runs");
  mkdirSync(outDir, { recursive: true });

  const candidate = scanOriginalByteCandidates(repoRoot).find((c) => c.sourceId === params.sourceId);
  const sha = codeSha();
  const records: AnalysisRunRecord[] = [];

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
  const workRoot = mkdtempSync(path.join(tmpdir(), "kf-mass-"));
  const store = new CorpusStore({
    root: workRoot,
    bytes: path.join(workRoot, "bytes"),
    manifests: path.join(workRoot, "manifests"),
    checkpoints: path.join(workRoot, "checkpoints"),
    cache: path.join(workRoot, "cache"),
  });

  let counts: Record<string, number> | undefined;

  try {
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
          records.push({
            sourceId: params.sourceId,
            stage,
            status: "OK",
            codeSha: sha,
            inputHash: contentHash,
            startedAt,
            finishedAt: new Date().toISOString(),
            representationLevel: processed.source.representationLevel,
            diagnostics: `extractionStatus=${processed.source.extractionStatus}; nodes=${processed.structuralNodeCount}; defs=${processed.definitionCount}; candidates=${processed.candidateCount}`,
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
        } else if (stage === "CONSUMER_EXPORT") {
          const exportDoc = buildCanonicalConsumerExport(store, {
            compact: true,
            durabilityClaim: "NONE",
          });
          counts = {
            sources: exportDoc.counts.sources,
            structuralNodes: exportDoc.counts.structuralNodes,
            definitions: exportDoc.counts.definitions,
            covenantCandidates: exportDoc.counts.covenantCandidates,
            dependencyEdges: exportDoc.counts.dependencyEdges,
          };
          records.push({
            sourceId: params.sourceId,
            stage,
            status: "OK",
            codeSha: sha,
            inputHash: contentHash,
            startedAt,
            finishedAt: new Date().toISOString(),
            diagnostics: `export sources=${exportDoc.counts.sources} candidates=${exportDoc.counts.covenantCandidates} defs=${exportDoc.counts.definitions}`,
            promotedToLegalTruth: 0,
          });
        } else if (stage === "DEPENDENCY_MAP" || stage === "AMENDMENT_RELATION") {
          records.push({
            sourceId: params.sourceId,
            stage,
            status: "UNSUPPORTED",
            codeSha: sha,
            inputHash: contentHash,
            startedAt,
            finishedAt: new Date().toISOString(),
            diagnostics:
              "Stage requires package-graph / atlas adapters — recorded as UNSUPPORTED for safe replay",
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
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  writeFileSync(
    path.join(outDir, `${sanitize(params.sourceId)}.json`),
    JSON.stringify({ sourceId: params.sourceId, contentHash, counts, records }, null, 2) + "\n",
  );
  const ok = records.some((r) => r.stage === "STRUCTURAL_INDEX" && r.status === "OK");
  return { records, ok, counts };
}

export async function analyzeBatchCommitted(params: {
  sourceIds: string[];
  repoRoot?: string;
}): Promise<{ analyzed: number; ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const sourceId of params.sourceIds) {
    const r = await analyzeCommittedSource({ sourceId, repoRoot: params.repoRoot });
    if (r.ok) ok += 1;
    else failed += 1;
  }
  return { analyzed: params.sourceIds.length, ok, failed };
}

export function listExistingRunRecords(repoRoot = process.cwd()): string[] {
  const dir = path.join(repoRoot, "docs/knowledge-factory/mass-precedent/runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}
