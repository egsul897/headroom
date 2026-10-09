/**
 * Filesystem persistence for intelligence-loop runs, patterns, and engineering queue.
 * Idempotent / resumable — same runId overwrites atomically; list by mtime.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import type { DraftingPattern, EngineeringTask, LoopRunRecord } from "./types";
import { seedDraftingPatterns } from "./patterns";

export const LOOP_ROOT =
  process.env.HEADROOM_INTELLIGENCE_LOOP_ROOT ??
  path.join(process.cwd(), ".local-knowledge-corpus", "intelligence-loop");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWriteJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, filePath);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function runsDir(): string {
  const d = path.join(LOOP_ROOT, "runs");
  ensureDir(d);
  return d;
}

export function patternsPath(): string {
  return path.join(LOOP_ROOT, "patterns", "drafting-patterns.json");
}

export function engineeringQueuePath(): string {
  return path.join(LOOP_ROOT, "engineering-queue.json");
}

export function publishIndexPath(): string {
  return path.join(LOOP_ROOT, "publish-index.json");
}

export function dashboardOverlayPath(companyId: string): string {
  return path.join(LOOP_ROOT, "dashboard-overlays", `${companyId}.json`);
}

export function saveRun(run: LoopRunRecord): void {
  const file = path.join(runsDir(), `${run.runId}.json`);
  atomicWriteJson(file, run);
}

export function loadRun(runId: string): LoopRunRecord | null {
  return readJson<LoopRunRecord>(path.join(runsDir(), `${runId}.json`));
}

export function listRunIds(limit = 50): string[] {
  const dir = runsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const full = path.join(dir, f);
      return { id: f.replace(/\.json$/, ""), mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((x) => x.id);
}

export function loadPatterns(): DraftingPattern[] {
  const existing = readJson<DraftingPattern[]>(patternsPath());
  if (existing?.length) return existing;
  const seeded = seedDraftingPatterns();
  savePatterns(seeded);
  return seeded;
}

export function savePatterns(patterns: DraftingPattern[]): void {
  atomicWriteJson(patternsPath(), patterns);
}

export function loadEngineeringQueue(): EngineeringTask[] {
  return readJson<EngineeringTask[]>(engineeringQueuePath()) ?? [];
}

export function saveEngineeringQueue(tasks: EngineeringTask[]): void {
  atomicWriteJson(engineeringQueuePath(), tasks);
}

export interface DashboardExerciseOverlay {
  companyId: string;
  updatedAt: string;
  runId: string;
  transactions: Array<{
    metricId: string;
    exerciseId: string;
    scenario: string;
    summary: string;
    status: "COMPUTED" | "CONDITIONAL" | "MISSING_FINANCIALS" | "MISSING_RULEBOOK" | "AI_SURFACED";
    askHref: string;
    outcome: string;
    missingInputs: string[];
    citations: Array<{ sectionRef: string; excerpt: string }>;
    analysis: string;
    gaps: string[];
  }>;
}

export function saveDashboardOverlay(overlay: DashboardExerciseOverlay): void {
  atomicWriteJson(dashboardOverlayPath(overlay.companyId), overlay);
}

export function loadDashboardOverlay(companyId: string): DashboardExerciseOverlay | null {
  return readJson<DashboardExerciseOverlay>(dashboardOverlayPath(companyId));
}

export function updatePublishIndex(entry: {
  runId: string;
  at: string;
  documentsProcessed: number;
  executions: number;
  substantive: number;
}): void {
  const prev = readJson<{ entries: typeof entry[] }>(publishIndexPath()) ?? { entries: [] };
  const entries = [entry, ...prev.entries.filter((e) => e.runId !== entry.runId)].slice(0, 100);
  atomicWriteJson(publishIndexPath(), { updatedAt: entry.at, entries });
}
