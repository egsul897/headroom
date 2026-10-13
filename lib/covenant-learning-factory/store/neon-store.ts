/**
 * Optional Neon persistence for learning-factory artifacts.
 * Never auto-promotes VERIFIED / production authority.
 * No-ops cleanly when DATABASE_URL is unreachable.
 */

import type { PackageAuditManifest } from "../types";
import { assertAutomatedKnowledgeState, assertLearningFactoryCannotWriteProductionAuthority } from "../promotion-guards";

export interface NeonPersistResult {
  attempted: boolean;
  ok: boolean;
  detail: string;
  insertedArtifacts: number;
  insertedErrors: number;
}

export async function probeNeonLive(): Promise<{ live: boolean; detail: string }> {
  if (!process.env.DATABASE_URL) {
    return { live: false, detail: "DATABASE_URL unset" };
  }
  try {
    const { prisma } = await import("../../prisma");
    await prisma.$queryRaw`SELECT 1 as ok`;
    return { live: true, detail: "reachable" };
  } catch (err) {
    return {
      live: false,
      detail: err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
    };
  }
}

/**
 * Persist a package audit into learning_* tables when the migration is applied.
 * Falls back with a clear detail string if tables are missing or Neon is down.
 */
export async function persistPackageManifestToNeon(
  manifest: PackageAuditManifest,
): Promise<NeonPersistResult> {
  assertLearningFactoryCannotWriteProductionAuthority("ContractRule");
  for (const a of manifest.artifacts) {
    assertAutomatedKnowledgeState(a.state);
  }

  const probe = await probeNeonLive();
  if (!probe.live) {
    return {
      attempted: true,
      ok: false,
      detail: `Neon unavailable: ${probe.detail}`,
      insertedArtifacts: 0,
      insertedErrors: 0,
    };
  }

  try {
    const { prisma } = await import("../../prisma");
    // Dynamic access — tables arrive via additive migration.
    const client = prisma as unknown as {
      learningPackage?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
      learningRun?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
      learningArtifact?: {
        createMany: (args: unknown) => Promise<{ count: number }>;
      };
      learningErrorLedgerEntry?: {
        createMany: (args: unknown) => Promise<{ count: number }>;
      };
      learningEvaluationOutcome?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
      $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown>;
    };

    if (!client.learningPackage || !client.learningRun) {
      // Prisma client not regenerated with new models — use raw SQL upserts.
      await client.$executeRawUnsafe(
        `INSERT INTO learning_packages
          (id, "packageKey", "companyId", "issuerCik", "issuerTicker", "issuerName", cohort, provenance, "usageRights", "evaluationOnly", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         ON CONFLICT ("packageKey") DO UPDATE SET
           "issuerTicker" = EXCLUDED."issuerTicker",
           "updatedAt" = NOW()`,
        `lp_${manifest.packageKey}`.slice(0, 64),
        manifest.packageKey,
        manifest.companyId,
        manifest.issuerCik,
        manifest.issuerTicker ?? null,
        null,
        manifest.cohort,
        "covenant-learning-factory",
        "PUBLIC_SEC_EDGAR",
        manifest.cohort === "HELD_OUT",
      );

      await client.$executeRawUnsafe(
        `INSERT INTO learning_runs
          (id, "runId", "packageKey", status, "codeSha", "factoryVersion", "compilerVersion", "startedAt", "finishedAt", "manifestJson", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
         ON CONFLICT ("runId") DO UPDATE SET
           status = EXCLUDED.status,
           "finishedAt" = EXCLUDED."finishedAt",
           "manifestJson" = EXCLUDED."manifestJson",
           "updatedAt" = NOW()`,
        manifest.runId,
        manifest.runId,
        manifest.packageKey,
        manifest.status,
        manifest.codeSha,
        manifest.factoryVersion,
        manifest.compilerVersion,
        new Date(manifest.startedAt),
        new Date(manifest.finishedAt),
        JSON.stringify(manifest),
      );

      let insertedArtifacts = 0;
      for (const a of manifest.artifacts) {
        await client.$executeRawUnsafe(
          `INSERT INTO learning_artifacts
            (id, "artifactId", "packageKey", "runId", kind, state, family, "sourceRefsJson", "payloadJson", "compilerVersion", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
           ON CONFLICT ("artifactId") DO NOTHING`,
          a.artifactId,
          a.artifactId,
          a.packageKey,
          manifest.runId,
          a.kind,
          a.state,
          a.family ?? null,
          JSON.stringify(a.sourceRefs),
          JSON.stringify(a.payload),
          a.compilerVersion,
          new Date(a.createdAt),
        );
        insertedArtifacts += 1;
      }

      let insertedErrors = 0;
      for (const e of manifest.errors) {
        await client.$executeRawUnsafe(
          `INSERT INTO learning_error_ledger_entries
            (id, "errorId", "packageKey", "runId", class, severity, message, stage, "evidenceJson", "correctiveHistoryJson", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
           ON CONFLICT ("errorId") DO NOTHING`,
          e.errorId,
          e.errorId,
          e.packageKey,
          e.runId,
          e.class,
          e.severity,
          e.message,
          e.stage,
          JSON.stringify(e.evidence ?? {}),
          JSON.stringify(e.correctiveHistory),
          new Date(e.createdAt),
        );
        insertedErrors += 1;
      }

      if (manifest.evaluation) {
        const ev = manifest.evaluation;
        // notesJson carries dangerousOmissionsStatus + metricDefinitions until a follow-on migration.
        await client.$executeRawUnsafe(
          `INSERT INTO learning_evaluation_outcomes
            (id, "evaluationId", "packageKey", "runId", cohort, "sourceFidelityPass", "coverageScore",
             "calculationCorrectness", "dangerousOmissionCount", "abstentionCount",
             "supportedStructureUnits", "verifiedExecutableUnits", "unsupportedUnits",
             "refusedExecutableUnits", independent, "notesJson", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15::jsonb,$16)
           ON CONFLICT ("evaluationId") DO UPDATE SET
             "sourceFidelityPass" = EXCLUDED."sourceFidelityPass",
             "coverageScore" = EXCLUDED."coverageScore",
             "dangerousOmissionCount" = EXCLUDED."dangerousOmissionCount",
             "notesJson" = EXCLUDED."notesJson"`,
          ev.evaluationId,
          ev.evaluationId,
          ev.packageKey,
          ev.runId,
          ev.cohort,
          ev.sourceFidelityPass,
          ev.coverageScore,
          ev.calculationCorrectness,
          ev.dangerousOmissionCount,
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
        );
      }

      return {
        attempted: true,
        ok: true,
        detail: "persisted via raw SQL",
        insertedArtifacts,
        insertedErrors,
      };
    }

    return {
      attempted: true,
      ok: false,
      detail: "Prisma models present but upsert path not wired in this build",
      insertedArtifacts: 0,
      insertedErrors: 0,
    };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
      insertedArtifacts: 0,
      insertedErrors: 0,
    };
  }
}
