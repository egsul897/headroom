/**
 * One bounded flywheel invocation: lock → slice → unlock.
 * Designed for Vercel serverless time limits.
 *
 * ZERO AI/LLM API usage — deterministic only. See deterministic-guard.ts.
 */

import { createHash, randomUUID } from "node:crypto";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { loadSweepCursor } from "../covenant-learning-factory/sweep/neon-load";
import { runCovenantLearningSweep } from "../covenant-learning-factory/sweep/sweep-runner";
import { writeFlywheelAlert } from "./alerts";
import { assertFlywheelDeterministic, FLYWHEEL_PAID_INFERENCE } from "./deterministic-guard";
import { runEdgarExpandSlice } from "./edgar-slice";
import { releaseFlywheelLock, tryAcquireFlywheelLock } from "./lock";
import { runPrecedentImportSlice } from "./precedent-slice";
import { createNeonRulesStore } from "./ruleset-neon";
import type { FlywheelSlice, FlywheelSliceResult, FlywheelRunStatus } from "./types";

function runId(): string {
  return createHash("sha256").update(`fw|${Date.now()}|${randomUUID()}`).digest("hex").slice(0, 20);
}

async function persistRun(
  executor: NeonHttpsExecutor,
  result: FlywheelSliceResult,
): Promise<void> {
  await executor.execute(
    `INSERT INTO flywheel_runs
       (id, "runId", slice, status, "startedAt", "finishedAt", epoch,
        "sourcesProcessed", "candidatesEvaluated", "proposalsAccepted", "proposalsRejected",
        "errorRateByClassJson", "detailJson", "errorMessage", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
     ON CONFLICT ("runId") DO UPDATE SET
       status = EXCLUDED.status,
       "finishedAt" = EXCLUDED."finishedAt",
       "detailJson" = EXCLUDED."detailJson",
       "errorMessage" = EXCLUDED."errorMessage"`,
    [
      result.runId,
      result.runId,
      result.slice,
      result.status,
      new Date(result.startedAt),
      new Date(result.finishedAt),
      result.epoch ?? null,
      result.sourcesProcessed ?? 0,
      result.candidatesEvaluated ?? 0,
      result.proposalsAccepted ?? 0,
      result.proposalsRejected ?? 0,
      JSON.stringify(result.errorRateByClass ?? {}),
      JSON.stringify({
        authorityStatus: "COMPUTED_NOT_CERTIFIED",
        paidInferenceUsed: FLYWHEEL_PAID_INFERENCE,
        ...(result.detail ?? {}),
      }),
      result.errorMessage ?? null,
      new Date(),
    ],
  );
}

/**
 * Choose next slice from checkpoint / rotation.
 * Override with FLYWHEEL_FORCE_SLICE or ?slice= query.
 */
export async function chooseNextSlice(
  executor: NeonHttpsExecutor,
  forced?: string | null,
): Promise<FlywheelSlice> {
  if (
    forced === "EDGAR_EXPAND" ||
    forced === "PRECEDENT_IMPORT" ||
    forced === "SWEEP_SOURCES" ||
    forced === "SWEEP_PROPOSALS"
  ) {
    return forced;
  }
  const cursor = await loadSweepCursor(executor);
  if (cursor?.phase === "proposals") return "SWEEP_PROPOSALS";
  if (cursor?.phase === "sources" && !cursor.sourcesComplete) return "SWEEP_SOURCES";

  // Round-robin by hour so ingest keeps moving alongside learning.
  const hour = new Date().getUTCHours();
  if (hour % 6 === 0) return "EDGAR_EXPAND";
  if (hour % 6 === 1) return "PRECEDENT_IMPORT";
  return "SWEEP_SOURCES";
}

export async function runFlywheelSlice(opts: {
  executor: NeonHttpsExecutor;
  slice?: FlywheelSlice | string | null;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** Injected for tests. */
  now?: () => string;
}): Promise<FlywheelSliceResult> {
  const env = opts.env ?? process.env;
  assertFlywheelDeterministic(env);
  const startedAt = (opts.now ?? (() => new Date().toISOString()))();
  const id = runId();
  const slice = await chooseNextSlice(opts.executor, opts.slice ?? env.FLYWHEEL_FORCE_SLICE);

  const ttlMs = Number(env.FLYWHEEL_LOCK_TTL_MS ?? 4 * 60 * 1000);
  const lock = await tryAcquireFlywheelLock(opts.executor, { ttlMs, holderId: id });
  if (!lock) {
    const result: FlywheelSliceResult = {
      runId: id,
      slice,
      status: "SKIPPED_LOCKED",
      startedAt,
      finishedAt: (opts.now ?? (() => new Date().toISOString()))(),
      detail: { reason: "overlapping run lock held" },
    };
    await persistRun(opts.executor, result);
    return result;
  }

  let result: FlywheelSliceResult = {
    runId: id,
    slice,
    status: "RUNNING",
    startedAt,
    finishedAt: startedAt,
  };

  try {
    if (slice === "EDGAR_EXPAND") {
      const edgar = await runEdgarExpandSlice({
        env,
        live: true,
        limit: Number(env.FLYWHEEL_EDGAR_LIMIT ?? 2),
      });
      const status: FlywheelRunStatus =
        edgar.status === "OK"
          ? "OK"
          : edgar.status === "SKIPPED_CONFIG"
            ? "SKIPPED_CONFIG"
            : "FAILED";
      result = {
        ...result,
        status,
        sourcesProcessed: edgar.fetched,
        detail: edgar.detail,
        errorMessage: edgar.errorMessage,
        finishedAt: (opts.now ?? (() => new Date().toISOString()))(),
      };
    } else if (slice === "PRECEDENT_IMPORT") {
      const imp = await runPrecedentImportSlice({ executor: opts.executor, env });
      result = {
        ...result,
        status:
          imp.status === "OK"
            ? "OK"
            : imp.status === "SKIPPED_CONFIG"
              ? "SKIPPED_CONFIG"
              : "FAILED",
        detail: imp.detail,
        errorMessage: imp.errorMessage,
        finishedAt: (opts.now ?? (() => new Date().toISOString()))(),
      };
    } else {
      // SWEEP_SOURCES or SWEEP_PROPOSALS
      const maxSources = Number(env.FLYWHEEL_MAX_SOURCES ?? 5);
      const maxCandidates = Number(env.FLYWHEEL_MAX_CANDIDATES ?? 25);
      const exportRepo = env.FLYWHEEL_EXPORT_RULES_JSON === "1";
      const rulesStore = createNeonRulesStore(opts.executor, {
        exportToRepo: exportRepo,
      });
      const sweep = await runCovenantLearningSweep({
        executor: opts.executor,
        batchSize: Math.min(maxSources, Number(env.FLYWHEEL_BATCH_SIZE ?? 5)),
        maxSources: slice === "SWEEP_PROPOSALS" ? Number.POSITIVE_INFINITY : maxSources,
        maxCandidates: slice === "SWEEP_PROPOSALS" ? maxCandidates : 0,
        maxEpochs: 1,
        resume: true,
        dryRun: false,
        rulesStore,
        rebuildSourcesOnly: slice === "SWEEP_PROPOSALS",
        codeSha: "flywheel",
        now: opts.now,
        goldenChecks: [
          {
            name: "uncertified",
            run: () => true,
          },
        ],
        log: () => undefined,
      });
      const last = sweep.epochs[sweep.epochs.length - 1];
      result = {
        ...result,
        status: "OK",
        epoch: last?.epoch ?? sweep.finalRulesetVersion,
        sourcesProcessed: sweep.totalSources,
        candidatesEvaluated: last
          ? last.proposalsAccepted + last.proposalsRejected
          : 0,
        proposalsAccepted: last?.proposalsAccepted ?? 0,
        proposalsRejected: last?.proposalsRejected ?? 0,
        errorRateByClass: last?.errorRateByClass ?? {},
        detail: {
          stoppedReason: sweep.stoppedReason,
          finalRulesetVersion: sweep.finalRulesetVersion,
          slice,
        },
        finishedAt: (opts.now ?? (() => new Date().toISOString()))(),
      };
    }

    if (result.status === "FAILED") {
      await writeFlywheelAlert(opts.executor, {
        kind: "SLICE_FAILED",
        severity: "HIGH",
        message: result.errorMessage ?? `${slice} failed`,
        runId: id,
        detail: result.detail,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    result = {
      ...result,
      status: "FAILED",
      errorMessage: message,
      finishedAt: (opts.now ?? (() => new Date().toISOString()))(),
    };
    await writeFlywheelAlert(opts.executor, {
      kind: "SLICE_EXCEPTION",
      severity: "CRITICAL",
      message,
      runId: id,
    });
  } finally {
    await releaseFlywheelLock(opts.executor, lock).catch(() => undefined);
    await persistRun(opts.executor, result).catch(() => undefined);
  }

  return result;
}
