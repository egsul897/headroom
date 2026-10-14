/**
 * Persist sweep run artifacts / errors / proposals / evaluations into learning_* via HTTPS.
 * COMPUTED_NOT_CERTIFIED only. Never ContractRule.
 */

import { createHash } from "node:crypto";
import type { ComputationResult } from "../../contract-model/covenant-computation/types";
import type { LearnedRule, LearnedRuleSet } from "../learned-rules/types";
import type { ImprovementProposal, LearningErrorRecord, LearningEvaluationRecord } from "../types";
import type { NeonHttpsExecutor } from "../store/neon-transport";

function id(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export async function persistSweepPackage(
  executor: NeonHttpsExecutor,
  args: {
    packageKey: string;
    companyId: string;
    issuerCik: string;
    issuerTicker?: string | null;
  },
): Promise<void> {
  await executor.execute(
    `INSERT INTO learning_packages
      (id, "packageKey", "companyId", "issuerCik", "issuerTicker", "issuerName", cohort, provenance, "usageRights", "evaluationOnly", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
     ON CONFLICT ("packageKey") DO UPDATE SET
       "issuerTicker" = EXCLUDED."issuerTicker",
       "companyId" = EXCLUDED."companyId",
       "updatedAt" = NOW()`,
    [
      id(["pkg", args.packageKey]),
      args.packageKey,
      args.companyId,
      args.issuerCik || "unknown",
      args.issuerTicker ?? null,
      null,
      "TRAIN_DEV",
      "covenant-learning-factory-sweep",
      "PUBLIC_SEC_EDGAR",
      false,
    ],
  );
}

export async function persistSweepRun(
  executor: NeonHttpsExecutor,
  args: {
    runId: string;
    packageKey: string;
    status: string;
    codeSha: string;
    startedAt: string;
    finishedAt: string;
    epoch: number;
    rulesetVersion: number;
    errorCount: number;
    covenantCount: number;
  },
): Promise<void> {
  await executor.execute(
    `INSERT INTO learning_runs
      (id, "runId", "packageKey", status, "codeSha", "factoryVersion", "compilerVersion",
       "startedAt", "finishedAt", "manifestJson", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
     ON CONFLICT ("runId") DO UPDATE SET
       status = EXCLUDED.status,
       "finishedAt" = EXCLUDED."finishedAt",
       "manifestJson" = EXCLUDED."manifestJson",
       "updatedAt" = NOW()`,
    [
      args.runId,
      args.runId,
      args.packageKey,
      args.status,
      args.codeSha,
      "clf-sweep.v1",
      "covenant-computation.v1",
      new Date(args.startedAt),
      new Date(args.finishedAt),
      JSON.stringify({
        authorityStatus: "COMPUTED_NOT_CERTIFIED",
        certified: false,
        epoch: args.epoch,
        rulesetVersion: args.rulesetVersion,
        errorCount: args.errorCount,
        covenantCount: args.covenantCount,
      }),
    ],
  );
}

export async function persistSweepArtifact(
  executor: NeonHttpsExecutor,
  args: {
    artifactId: string;
    packageKey: string;
    runId: string;
    result: ComputationResult;
    rulesetVersion: number;
  },
): Promise<void> {
  await executor.execute(
    `INSERT INTO learning_artifacts
      (id, "artifactId", "packageKey", "runId", kind, state, family, "sourceRefsJson", "payloadJson", "compilerVersion", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
     ON CONFLICT ("artifactId") DO NOTHING`,
    [
      args.artifactId,
      args.artifactId,
      args.packageKey,
      args.runId,
      "CALCULATION",
      "PROPOSED",
      "COVENANT_COMPUTATION",
      JSON.stringify(args.result.baskets.map((b) => b.sourceDocumentId)),
      JSON.stringify({
        schemaVersion: "covenant-computation.v1",
        certification: "COMPUTED_NOT_CERTIFIED",
        runId: args.runId,
        rulesetVersion: args.rulesetVersion,
        result: args.result,
      }),
      "covenant-computation.v1",
      new Date(),
    ],
  );
}

export async function persistSweepErrors(
  executor: NeonHttpsExecutor,
  errors: LearningErrorRecord[],
): Promise<number> {
  let n = 0;
  for (const e of errors) {
    await executor.execute(
      `INSERT INTO learning_error_ledger_entries
        (id, "errorId", "packageKey", "runId", class, severity, message, stage, "evidenceJson", "correctiveHistoryJson", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
       ON CONFLICT ("errorId") DO NOTHING`,
      [
        e.errorId,
        e.errorId,
        e.packageKey,
        e.runId,
        e.class,
        e.severity,
        e.message,
        e.stage,
        JSON.stringify(e.evidence ?? {}),
        JSON.stringify(e.correctiveHistory ?? []),
        new Date(e.createdAt),
      ],
    );
    n += 1;
  }
  return n;
}

export async function persistSweepProposal(
  executor: NeonHttpsExecutor,
  p: ImprovementProposal,
): Promise<void> {
  const adjudicationStatus =
    p.adjudicationStatus ??
    (p.state === "ACCEPTED" ? "MECHANICALLY_REPLAYED" : p.state);
  await executor.execute(
    `INSERT INTO learning_improvement_proposals
      (id, "proposalId", "packageKey", "runId", lever, summary, bounded, "autoApply", "evidenceJson", state, "adjudicationStatus", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
     ON CONFLICT ("proposalId") DO UPDATE SET
       state = EXCLUDED.state,
       "autoApply" = EXCLUDED."autoApply",
       "evidenceJson" = EXCLUDED."evidenceJson",
       "adjudicationStatus" = EXCLUDED."adjudicationStatus"`,
    [
      p.proposalId,
      p.proposalId,
      p.packageKey,
      p.runId,
      p.lever,
      p.summary,
      p.bounded,
      p.autoApply,
      JSON.stringify({
        evidenceRefs: p.evidenceRefs,
        executableRule: p.executableRule ?? null,
        authorityStatus: "COMPUTED_NOT_CERTIFIED",
        adjudicationStatus,
        adjudicationClass:
          adjudicationStatus === "MECHANICALLY_REPLAYED"
            ? "MECHANICAL_REPLAY"
            : adjudicationStatus === "INDEPENDENTLY_VERIFIED"
              ? "INDEPENDENT_HELD_OUT"
              : null,
      }),
      // Persist canonical state; map legacy ACCEPTED → MECHANICALLY_REPLAYED.
      adjudicationStatus === "MECHANICALLY_REPLAYED" ? "MECHANICALLY_REPLAYED" : p.state === "ACCEPTED" ? "MECHANICALLY_REPLAYED" : p.state,
      adjudicationStatus,
      new Date(p.createdAt),
    ],
  );
}

export async function persistSweepEvaluation(
  executor: NeonHttpsExecutor,
  ev: LearningEvaluationRecord,
): Promise<void> {
  await executor.execute(
    `INSERT INTO learning_evaluation_outcomes
      (id, "evaluationId", "packageKey", "runId", cohort, "sourceFidelityPass", "coverageScore",
       "calculationCorrectness", "dangerousOmissionCount", "abstentionCount",
       "supportedStructureUnits", "verifiedExecutableUnits", "unsupportedUnits",
       "refusedExecutableUnits", independent, "notesJson", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15::jsonb,$16)
     ON CONFLICT ("evaluationId") DO UPDATE SET
       "notesJson" = EXCLUDED."notesJson",
       "coverageScore" = EXCLUDED."coverageScore"`,
    [
      ev.evaluationId,
      ev.evaluationId,
      ev.packageKey,
      ev.runId,
      ev.cohort,
      ev.sourceFidelityPass,
      ev.coverageScore,
      ev.calculationCorrectness,
      ev.dangerousOmissionCount ?? 0,
      ev.abstentionCount,
      ev.supportedStructureUnits,
      ev.verifiedExecutableUnits,
      ev.unsupportedUnits,
      ev.refusedExecutableUnits,
      JSON.stringify({
        notes: ev.notes,
        dangerousOmissionsStatus: ev.dangerousOmissionsStatus,
        metricDefinitions: ev.metricDefinitions,
      }),
      new Date(ev.createdAt),
    ],
  );
}

export async function persistRuleSetArtifact(
  executor: NeonHttpsExecutor,
  ruleset: LearnedRuleSet,
): Promise<void> {
  const packageKey = "clf-sweep:ruleset";
  await persistSweepPackage(executor, {
    packageKey,
    companyId: "clf-sweep",
    issuerCik: "0000000000",
  });
  const artifactId = `learned-rules:v${ruleset.rulesetVersion}`;
  const runId = `ruleset-run-v${ruleset.rulesetVersion}`;
  await persistSweepRun(executor, {
    runId,
    packageKey,
    status: "OK",
    codeSha: "ruleset",
    startedAt: ruleset.updatedAt,
    finishedAt: ruleset.updatedAt,
    epoch: ruleset.writtenFrom?.epoch ?? 0,
    rulesetVersion: ruleset.rulesetVersion,
    errorCount: 0,
    covenantCount: ruleset.rules.length,
  });
  await executor.execute(
    `INSERT INTO learning_artifacts
      (id, "artifactId", "packageKey", "runId", kind, state, family, "sourceRefsJson", "payloadJson", "compilerVersion", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
     ON CONFLICT ("artifactId") DO UPDATE SET "payloadJson" = EXCLUDED."payloadJson"`,
    [
      artifactId,
      artifactId,
      packageKey,
      runId,
      "CALCULATION",
      "PROPOSED",
      "LEARNED_RULESET",
      JSON.stringify(
        ruleset.writtenFrom?.mechanicallyReplayedRuleIds ??
          ruleset.writtenFrom?.acceptedRuleIds ??
          [],
      ),
      JSON.stringify(ruleset),
      `learned-rules.v${ruleset.rulesetVersion}`,
      new Date(),
    ],
  );
}

export function proposalFromRule(args: {
  rule: LearnedRule;
  runId: string;
  packageKey?: string;
  /** True when mechanical replay gate passed → MECHANICALLY_REPLAYED (not verified). */
  accepted: boolean;
}): ImprovementProposal {
  const state = args.accepted ? ("MECHANICALLY_REPLAYED" as const) : ("REJECTED" as const);
  return {
    proposalId: args.rule.ruleId,
    packageKey: args.packageKey ?? "clf-sweep:global",
    runId: args.runId,
    lever: "INTERPRETATION",
    summary: args.accepted
      ? `MECHANICALLY_REPLAYED ${args.rule.kind}: /${args.rule.pattern}/ → ${JSON.stringify(args.rule.effect)} (not INDEPENDENTLY_VERIFIED)`
      : `REJECTED ${args.rule.kind}: /${args.rule.pattern}/`,
    bounded: true,
    autoApply: args.accepted,
    evidenceRefs: args.rule.provenance.ledgerErrorIds,
    createdAt: args.rule.provenance.synthesizedAt,
    state,
    adjudicationStatus: state,
    executableRule: {
      ...args.rule,
      state: args.accepted ? "MECHANICALLY_REPLAYED" : "REJECTED",
      metrics: {
        errorsBefore: args.rule.metrics?.errorsBefore ?? 0,
        errorsAfter: args.rule.metrics?.errorsAfter ?? 0,
        sourcesReplayed: args.rule.metrics?.sourcesReplayed ?? 0,
        goldenOk: args.rule.metrics?.goldenOk ?? false,
        adjudicationClass: args.accepted ? "MECHANICAL_REPLAY" : undefined,
      },
    },
  };
}
