import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { loadSweepCursor } from "../covenant-learning-factory/sweep/neon-load";
import { FLYWHEEL_PAID_INFERENCE } from "./deterministic-guard";
import { readFlywheelLock } from "./lock";
import { AUTHORITY_STATUS, type FlywheelStatus } from "./types";

function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
}

export async function getFlywheelStatus(executor: NeonHttpsExecutor): Promise<FlywheelStatus> {
  const lock = await readFlywheelLock(executor);
  const checkpoint = await loadSweepCursor(executor);

  const runRows = await executor.execute(
    `SELECT "runId", slice, status, "startedAt", "finishedAt", epoch,
            "sourcesProcessed", "candidatesEvaluated",
            "proposalsAccepted", "proposalsMechanicallyReplayed", "proposalsRejected",
            "errorRateByClassJson", "errorMessage"
     FROM flywheel_runs
     ORDER BY "startedAt" DESC
     LIMIT 1`,
  ).catch(() => [] as Record<string, unknown>[]);

  const rulesRows = await executor.execute(
    `SELECT "rulesetVersion", "acceptedCount", "mechanicallyReplayedCount",
            "independentlyVerifiedCount", "updatedAt"
     FROM learning_rulesets
     ORDER BY "rulesetVersion" DESC
     LIMIT 1`,
  ).catch(() => [] as Record<string, unknown>[]);

  const countSources = await executor
    .execute(`SELECT COUNT(*)::int AS n FROM knowledge_sources`)
    .catch(() => [{ n: 0 }]);
  const countProposals = await executor
    .execute(`SELECT COUNT(*)::int AS n FROM learning_improvement_proposals`)
    .catch(() => [{ n: 0 }]);
  const countAlerts = await executor
    .execute(`SELECT COUNT(*)::int AS n FROM flywheel_alerts WHERE "ackedAt" IS NULL`)
    .catch(() => [{ n: 0 }]);

  const alertRows = await executor.execute(
    `SELECT "alertId", severity, kind, message, "runId", "createdAt"
     FROM flywheel_alerts
     WHERE "ackedAt" IS NULL
     ORDER BY "createdAt" DESC
     LIMIT 10`,
  ).catch(() => [] as Record<string, unknown>[]);

  const run = runRows[0];
  const rules = rulesRows[0];

  let errorRateByClass: Record<string, number> | null = null;
  const rawClass = run?.errorRateByClassJson ?? run?.errorratebyclassjson;
  if (rawClass && typeof rawClass === "object") {
    errorRateByClass = rawClass as Record<string, number>;
  } else if (typeof rawClass === "string") {
    try {
      errorRateByClass = JSON.parse(rawClass) as Record<string, number>;
    } catch {
      errorRateByClass = null;
    }
  }

  const mechanicallyReplayed = run
    ? asNum(
        run.proposalsMechanicallyReplayed ??
          run.proposalsmechanicallyreplayed ??
          run.proposalsAccepted ??
          run.proposalsaccepted,
      )
    : 0;
  const mechRules = rules
    ? asNum(
        rules.mechanicallyReplayedCount ??
          rules.mechanicallyreplayedcount ??
          rules.acceptedCount ??
          rules.acceptedcount,
      )
    : 0;
  const verifiedRules = rules
    ? asNum(rules.independentlyVerifiedCount ?? rules.independentlyverifiedcount)
    : 0;

  return {
    authorityStatus: AUTHORITY_STATUS,
    paidInferenceUsed: FLYWHEEL_PAID_INFERENCE,
    adjudicationHonesty: {
      acceptMeans: "MECHANICALLY_REPLAYED",
      independentlyVerifiedRequires: "held-out adjudicated goldens",
      productionTreatsMechanicallyReplayedAsVerified: false,
    },
    lock,
    latestRun: run
      ? {
          runId: String(run.runId ?? run.runid ?? ""),
          slice: String(run.slice ?? ""),
          status: String(run.status ?? ""),
          startedAt:
            run.startedAt instanceof Date
              ? run.startedAt.toISOString()
              : String(run.startedAt ?? run.startedat ?? ""),
          finishedAt: run.finishedAt
            ? run.finishedAt instanceof Date
              ? run.finishedAt.toISOString()
              : String(run.finishedAt)
            : null,
          epoch: run.epoch == null ? null : asNum(run.epoch),
          sourcesProcessed: asNum(run.sourcesProcessed ?? run.sourcesprocessed),
          candidatesEvaluated: asNum(run.candidatesEvaluated ?? run.candidatesevaluated),
          proposalsMechanicallyReplayed: mechanicallyReplayed,
          proposalsAccepted: mechanicallyReplayed,
          proposalsRejected: asNum(run.proposalsRejected ?? run.proposalsrejected),
          errorRateByClass,
          errorMessage: run.errorMessage ? String(run.errorMessage) : null,
        }
      : null,
    ruleset: {
      version: rules ? asNum(rules.rulesetVersion ?? rules.rulesetversion) : null,
      mechanicallyReplayedCount: mechRules,
      independentlyVerifiedCount: verifiedRules,
      acceptedCount: mechRules + verifiedRules,
      updatedAt: rules
        ? rules.updatedAt instanceof Date
          ? rules.updatedAt.toISOString()
          : String(rules.updatedAt ?? rules.updatedat ?? "")
        : null,
    },
    checkpoint: {
      epoch: checkpoint?.epoch ?? null,
      phase: checkpoint?.phase ?? null,
      sourcesComplete: checkpoint?.sourcesComplete ?? null,
      candidateIndex: checkpoint?.candidateIndex ?? null,
      afterSourceId: checkpoint?.afterSourceId ?? null,
    },
    counts: {
      knowledgeSources: asNum(countSources[0]?.n),
      learningProposals: asNum(countProposals[0]?.n),
      openAlerts: asNum(countAlerts[0]?.n),
    },
    recentAlerts: alertRows.map((a) => ({
      alertId: String(a.alertId ?? a.alertid ?? ""),
      severity: String(a.severity ?? ""),
      kind: String(a.kind ?? ""),
      message: String(a.message ?? ""),
      runId: a.runId ? String(a.runId) : a.runid ? String(a.runid) : null,
      createdAt:
        a.createdAt instanceof Date
          ? a.createdAt.toISOString()
          : String(a.createdAt ?? a.createdat ?? ""),
    })),
    scheduleHint: {
      vercelCron: "*/15 * * * * → POST /api/flywheel/cron",
      githubActions: "cron 0 */2 * * * → workflow flywheel-schedule.yml",
    },
  };
}
