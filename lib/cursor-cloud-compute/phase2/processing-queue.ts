/**
 * Bounded, restartable processing queue for Phase 2 real-EDGAR jobs.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 *
 * Persistence:
 * - Queue state JSON under corpusRoot (VM-local working store).
 * - Portable manifest written separately for git / artifacts.
 * - Never silently claims VM-local paths as durable infrastructure.
 */
import fs from "node:fs";
import path from "node:path";
import type { ProcessingQueueState, QueueItemState, SourceDocumentRef, StageName, StageStatus } from "./types";
import { PHASE2_STATUS } from "./types";

const ALL_STAGES: StageName[] = ["download", "parse", "dedupe", "structure", "definitions", "references", "passA", "storage"];

function emptyStages(): Record<StageName, StageStatus> {
  return {
    download: "PENDING",
    parse: "PENDING",
    dedupe: "PENDING",
    structure: "PENDING",
    definitions: "PENDING",
    references: "PENDING",
    passA: "PENDING",
    storage: "PENDING",
  };
}

export function queueStatePath(corpusRoot: string): string {
  return path.join(corpusRoot, "processing-queue.json");
}

export function createProcessingQueue(params: {
  jobId: string;
  ehbRunDir: string;
  corpusRoot: string;
  documents: SourceDocumentRef[];
  discoveryMs: number;
}): ProcessingQueueState {
  fs.mkdirSync(params.corpusRoot, { recursive: true });
  const now = new Date().toISOString();
  const state: ProcessingQueueState = {
    version: 1,
    status: PHASE2_STATUS,
    jobId: params.jobId,
    createdAt: now,
    updatedAt: now,
    ehbRunDir: params.ehbRunDir,
    corpusRoot: params.corpusRoot,
    durableNote:
      "corpusRoot is a VM-local working store for this agent session. It is NOT durable infrastructure. Portable manifests under docs/cursor-cloud-compute/results/ and /opt/cursor/artifacts are the export surfaces.",
    items: params.documents.map(
      (source): QueueItemState => ({
        source,
        stages: emptyStages(),
        contentHash: null,
        lastError: null,
        result: null,
        updatedAt: now,
      }),
    ),
    discoveryMs: params.discoveryMs,
    secRequestCount: 0,
  };
  saveProcessingQueue(state);
  return state;
}

export function loadProcessingQueue(corpusRoot: string): ProcessingQueueState {
  const p = queueStatePath(corpusRoot);
  if (!fs.existsSync(p)) throw new Error(`processing queue not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf-8")) as ProcessingQueueState;
}

export function saveProcessingQueue(state: ProcessingQueueState): void {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(state.corpusRoot, { recursive: true });
  const tmp = queueStatePath(state.corpusRoot) + ".tmp";
  const finalPath = queueStatePath(state.corpusRoot);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, finalPath);
}

export function nextPendingItem(state: ProcessingQueueState): QueueItemState | null {
  return (
    state.items.find((item) => {
      if (item.result?.status === "SKIPPED_DUPLICATE") return false;
      // FAILED is terminal for the drain loop (download retries happen inside the worker).
      // Only PENDING / INVALIDATED stages are eligible for work.
      return ALL_STAGES.some((s) => item.stages[s] === "PENDING" || item.stages[s] === "INVALIDATED");
    }) ?? null
  );
}

export function markStage(item: QueueItemState, stage: StageName, status: StageStatus, error?: string | null): void {
  item.stages[stage] = status;
  item.updatedAt = new Date().toISOString();
  if (error) item.lastError = error;
}

/**
 * If on-disk bytes for a completed download no longer match the recorded
 * contentHash, invalidate all downstream stages so only those re-run.
 */
export function detectContentChangeAndInvalidate(item: QueueItemState, newHash: string): boolean {
  if (item.contentHash && item.contentHash !== newHash) {
    item.contentHash = newHash;
    for (const stage of ALL_STAGES) {
      if (stage === "download") {
        item.stages[stage] = "DONE";
      } else {
        item.stages[stage] = "INVALIDATED";
      }
    }
    item.updatedAt = new Date().toISOString();
    return true;
  }
  if (!item.contentHash) item.contentHash = newHash;
  return false;
}

export function stagesNeedingWork(item: QueueItemState): StageName[] {
  return ALL_STAGES.filter((s) => item.stages[s] === "PENDING" || item.stages[s] === "INVALIDATED");
}

export function countCompleted(state: ProcessingQueueState): number {
  return state.items.filter((i) => i.result && (i.result.status === "OK" || i.result.status === "SKIPPED_DUPLICATE")).length;
}
