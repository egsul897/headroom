/**
 * Durable persistence for Cursor Cloud compute assessment results.
 *
 * Agent VM disk is ephemeral. This module writes outside the VM when possible:
 *   1. Git-tracked JSON under docs/cursor-cloud-compute/results/ (durable via remote)
 *   2. /opt/cursor/artifacts (agent artifact store)
 *   3. Optional Vercel Blob when BLOB_READ_WRITE_TOKEN is set (no write attempted
 *      without the token — never initiates paid storage)
 *   4. Optional Postgres when DATABASE_URL is set (schema-light JSON row via raw
 *      SQL only if a table already exists; otherwise records SKIPPED)
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ComputeAssessmentReport, DurableStoreWriteResult } from "./types";

export function reportFilename(runId: string): string {
  return `compute-assessment-${runId}.json`;
}

export function writeJsonFile(absPath: string, report: ComputeAssessmentReport): DurableStoreWriteResult {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const body = JSON.stringify(report, null, 2);
  fs.writeFileSync(absPath, body, "utf-8");
  return {
    backend: "filesystem",
    uri: absPath,
    bytesWritten: Buffer.byteLength(body, "utf-8"),
    durableOutsideAgentVm: absPath.includes("/docs/") || absPath.includes("/opt/cursor/artifacts"),
  };
}

export async function writeGitTrackedResults(report: ComputeAssessmentReport, repoRoot = process.cwd()): Promise<DurableStoreWriteResult> {
  const abs = path.join(repoRoot, "docs", "cursor-cloud-compute", "results", reportFilename(report.runId));
  const result = writeJsonFile(abs, report);
  return { ...result, backend: "git-tracked-json", durableOutsideAgentVm: true };
}

export async function writeArtifactStore(report: ComputeAssessmentReport): Promise<DurableStoreWriteResult> {
  const abs = path.join("/opt/cursor/artifacts", "cursor-cloud-compute", reportFilename(report.runId));
  const result = writeJsonFile(abs, report);
  return { ...result, backend: "cursor-artifacts", durableOutsideAgentVm: true };
}

export async function writeSqliteMirror(report: ComputeAssessmentReport, repoRoot = process.cwd()): Promise<DurableStoreWriteResult> {
  // Pure JSON sidecar + content hash index — avoids adding a native sqlite dep.
  // The index is append-only and git-tracked alongside the full report.
  const indexPath = path.join(repoRoot, "docs", "cursor-cloud-compute", "results", "durable-index.jsonl");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const body = JSON.stringify(report);
  const contentHash = createHash("sha256").update(body).digest("hex");
  const row = {
    runId: report.runId,
    generatedAt: report.generatedAt,
    contentHash,
    documentCount: report.benchmark.documentCountProcessed,
    wallClockMs: report.benchmark.wallClockMs,
    failureRate: report.benchmark.failureRate,
    status: report.status,
  };
  fs.appendFileSync(indexPath, `${JSON.stringify(row)}\n`, "utf-8");
  return {
    backend: "git-tracked-jsonl-index",
    uri: indexPath,
    bytesWritten: Buffer.byteLength(JSON.stringify(row), "utf-8") + 1,
    durableOutsideAgentVm: true,
  };
}

export async function maybeWriteVercelBlob(report: ComputeAssessmentReport): Promise<DurableStoreWriteResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      backend: "vercel-blob",
      uri: "skipped://no-BLOB_READ_WRITE_TOKEN",
      bytesWritten: 0,
      durableOutsideAgentVm: false,
    };
  }
  // Token present: use existing provider without introducing a new paid plan.
  const { put } = await import("@vercel/blob");
  const body = JSON.stringify(report);
  const pathname = `cursor-cloud-compute/${reportFilename(report.runId)}`;
  // access:private matches lib/document-storage/vercel-blob-provider.ts.
  // SDK reads BLOB_READ_WRITE_TOKEN from the environment; no new paid plan is created here.
  const uploaded = await put(pathname, body, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return {
    backend: "vercel-blob",
    uri: uploaded.url,
    bytesWritten: Buffer.byteLength(body, "utf-8"),
    durableOutsideAgentVm: true,
  };
}

export async function maybeWritePostgres(report: ComputeAssessmentReport): Promise<DurableStoreWriteResult> {
  if (!process.env.DATABASE_URL) {
    return {
      backend: "postgres",
      uri: "skipped://no-DATABASE_URL",
      bytesWritten: 0,
      durableOutsideAgentVm: false,
    };
  }
  // Fail closed without inventing a new Prisma model: only write if the
  // optional assessment table already exists. No schema migration here.
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'CursorCloudComputeAssessment'`,
    );
    if (tables.length === 0) {
      await prisma.$disconnect();
      return {
        backend: "postgres",
        uri: "skipped://CursorCloudComputeAssessment-table-absent",
        bytesWritten: 0,
        durableOutsideAgentVm: false,
      };
    }
    const body = JSON.stringify(report);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CursorCloudComputeAssessment" (id, "runId", "generatedAt", payload) VALUES ($1, $2, $3, $4::jsonb)`,
      report.runId,
      report.runId,
      new Date(report.generatedAt),
      body,
    );
    await prisma.$disconnect();
    return {
      backend: "postgres",
      uri: `postgres://CursorCloudComputeAssessment/${report.runId}`,
      bytesWritten: Buffer.byteLength(body, "utf-8"),
      durableOutsideAgentVm: true,
    };
  } catch (err) {
    return {
      backend: "postgres",
      uri: `error://${err instanceof Error ? err.message : String(err)}`,
      bytesWritten: 0,
      durableOutsideAgentVm: false,
    };
  }
}

export async function persistAssessmentReport(
  report: ComputeAssessmentReport,
  repoRoot = process.cwd(),
  options?: { appendIndex?: boolean },
): Promise<DurableStoreWriteResult[]> {
  const appendIndex = options?.appendIndex ?? true;
  const writes: DurableStoreWriteResult[] = [];
  writes.push(await writeGitTrackedResults(report, repoRoot));
  if (appendIndex) writes.push(await writeSqliteMirror(report, repoRoot));
  writes.push(await writeArtifactStore(report));
  writes.push(await maybeWriteVercelBlob(report));
  writes.push(await maybeWritePostgres(report));
  return writes;
}
