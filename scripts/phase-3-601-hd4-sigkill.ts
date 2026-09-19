/**
 * HD-4 real-process SIGKILL proof (mission §19): parent launches the crash child -> child completes N scripted calls
 * and persists them -> parent SIGKILLs it -> relaunch -> exactly the persisted calls replay, only the interrupted call
 * and later ones execute -> the final inventory equals an uninterrupted control child. ONE implementation, used by
 * the vitest suite and by the certification script. Zero model calls.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHILD = "scripts/phase-3-601-hd4-crash-child.ts";
export interface ChildRun { exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; ms: number }
export interface ChildResult { source: string; usable: boolean; frozenContentHash: string; items: number; telemetryCostUsd: number | null; liveCalls: string[]; accounting: { logicalCalls: number; liveCalls: number; replayedCalls: number; liveCostUsd: number; historicalReplayedCostUsd: number; providerCallsAvoided: number } | null; log: { origin: string; stage: string; passId: string; requestHash: string; occurrence: number }[]; inventoryProjection: unknown }

const recordCount = (dir: string) => { const d = join(dir, "durable-calls"); return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).length : 0; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function launch(dir: string, delayMs: number) {
  // ONE process: node with the tsx loader imported directly. The tsx CLI wrapper would spawn a grandchild that a
  // SIGKILL to the wrapper does not reach - the orphan keeps running, which is not the failure mode being certified.
  const child = spawn(process.execPath, ["--import", "tsx", CHILD, dir, String(delayMs)], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.on("data", (d) => { stdout += d; }); child.stderr.on("data", (d) => { stderr += d; });
  const started = Date.now();
  const done = new Promise<ChildRun>((resolve) => child.on("exit", (code, signal) => resolve({ exitCode: code, signal, stdout, stderr, ms: Date.now() - started })));
  return { child, done };
}
async function runToCompletion(dir: string, delayMs: number): Promise<{ run: ChildRun; result: ChildResult }> {
  const { done } = launch(dir, delayMs);
  const run = await done;
  if (run.exitCode !== 0) throw new Error(`child failed (${run.exitCode}/${run.signal}): ${run.stderr.slice(-800)}`);
  return { run, result: JSON.parse(readFileSync(join(dir, "child-result.json"), "utf8")) as ChildResult };
}

export interface SigkillProof {
  killAfterRecords: number; delayMs: number;
  control: { dir: string; hash: string; logicalCalls: number; liveCalls: number; ms: number };
  crash: { dir: string; pid: number | undefined; recordsAtKill: number; signal: NodeJS.Signals | null; exitCode: number | null; childResultWritten: boolean; frozenInventoryWritten: boolean; ms: number };
  restart: { source: string; usable: boolean; hash: string; accounting: ChildResult["accounting"]; liveCallSequence: string[]; replayPrefixInOrder: boolean; interruptedCallExecutedLive: boolean; noPersistedCallReExecuted: boolean; hashEqualsControl: boolean; projectionEqualsControl: boolean; telemetryCostEqualsControl: boolean; ms: number };
  thirdLaunch: { source: string; liveCalls: number; hashEqualsControl: boolean };
  passed: boolean; failures: string[];
}

export async function sigkillProof(opts: { killAfterRecords: number; delayMs?: number; baseDir?: string }): Promise<SigkillProof> {
  const delayMs = opts.delayMs ?? 120;
  const mk = (tag: string) => mkdtempSync(join(opts.baseDir ?? tmpdir(), `hd4-sigkill-${tag}-`));
  const failures: string[] = [];
  // 1. control
  const cDir = mk("control");
  const control = await runToCompletion(cDir, 0);
  if (control.result.accounting?.liveCalls !== control.result.accounting?.logicalCalls) failures.push("control had replays");
  // 2. crash
  const xDir = mk("crash");
  const { child, done } = launch(xDir, delayMs);
  let recordsAtKill = 0;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) { recordsAtKill = recordCount(xDir); if (recordsAtKill >= opts.killAfterRecords) break; await sleep(15); }
  child.kill("SIGKILL");
  const crashRun = await done;
  recordsAtKill = recordCount(xDir); // whatever landed before the kill is what a restart may legitimately replay
  const crash = { dir: xDir, pid: child.pid, recordsAtKill, signal: crashRun.signal, exitCode: crashRun.exitCode, childResultWritten: existsSync(join(xDir, "child-result.json")), frozenInventoryWritten: existsSync(join(xDir, "frozen-inventory.json")), ms: crashRun.ms };
  if (crash.signal !== "SIGKILL") failures.push(`child did not die by SIGKILL (${crash.signal}/${crash.exitCode})`);
  if (crash.childResultWritten || crash.frozenInventoryWritten) failures.push("the killed child produced an ensemble or result");
  if (recordsAtKill < opts.killAfterRecords) failures.push(`only ${recordsAtKill} records at kill`);
  if (recordsAtKill >= control.result.accounting!.logicalCalls) failures.push("kill landed after every call - nothing was interrupted");
  // 3. restart
  const r = await runToCompletion(xDir, 0);
  const total = control.result.accounting!.logicalCalls;
  const persistedKeys = new Set(readdirSync(join(xDir, "durable-calls")).filter((f) => f.endsWith(".json") && !f.startsWith("origin")).map((f) => f.replace(/\.json$/, "")));
  const log = r.result.log;
  const replayPrefixInOrder = log.slice(0, recordsAtKill).every((e) => e.origin === "DURABLE_REPLAY") && log.slice(recordsAtKill).every((e) => e.origin === "LIVE_PROVIDER");
  const interruptedCallExecutedLive = log[recordsAtKill]?.origin === "LIVE_PROVIDER";
  void persistedKeys;
  const restart = { source: r.result.source, usable: r.result.usable, hash: r.result.frozenContentHash, accounting: r.result.accounting, liveCallSequence: r.result.liveCalls, replayPrefixInOrder, interruptedCallExecutedLive, noPersistedCallReExecuted: r.result.accounting!.liveCalls === total - recordsAtKill, hashEqualsControl: r.result.frozenContentHash === control.result.frozenContentHash, projectionEqualsControl: JSON.stringify(r.result.inventoryProjection) === JSON.stringify(control.result.inventoryProjection), telemetryCostEqualsControl: r.result.telemetryCostUsd === control.result.telemetryCostUsd, ms: r.run.ms };
  if (restart.source !== "EXECUTED" || !restart.usable) failures.push(`restart source ${restart.source} usable ${restart.usable}`);
  if (restart.accounting?.replayedCalls !== recordsAtKill) failures.push(`replayed ${restart.accounting?.replayedCalls} != persisted ${recordsAtKill}`);
  if (restart.accounting?.liveCalls !== total - recordsAtKill) failures.push(`live ${restart.accounting?.liveCalls} != ${total - recordsAtKill}`);
  if (restart.accounting?.liveCostUsd === undefined || (restart.accounting?.historicalReplayedCostUsd ?? 0) <= 0) failures.push("historical replayed cost not reported");
  if (!replayPrefixInOrder || !interruptedCallExecutedLive) failures.push("ordering not deterministic");
  if (!restart.hashEqualsControl || !restart.projectionEqualsControl || !restart.telemetryCostEqualsControl) failures.push("restart result differs from control");
  // 4. a third launch resumes the persisted ensemble with no calls at all (HD-3 layer)
  const t = await runToCompletion(xDir, 0);
  const thirdLaunch = { source: t.result.source, liveCalls: t.result.liveCalls.length, hashEqualsControl: t.result.frozenContentHash === control.result.frozenContentHash };
  if (thirdLaunch.source !== "RESUMED_FROM_ENSEMBLE_PERSISTENCE" || thirdLaunch.liveCalls !== 0 || !thirdLaunch.hashEqualsControl) failures.push("third launch did not resume the ensemble");
  return { killAfterRecords: opts.killAfterRecords, delayMs, control: { dir: cDir, hash: control.result.frozenContentHash, logicalCalls: total, liveCalls: control.result.accounting!.liveCalls, ms: control.run.ms }, crash, restart, thirdLaunch, passed: failures.length === 0, failures };
}
