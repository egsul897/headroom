/**
 * Optional Neon persistence for learning-factory artifacts.
 * Never auto-promotes VERIFIED / production authority.
 * No-ops cleanly when DATABASE_URL is unreachable.
 *
 * Set NEON_TRANSPORT=https for PrismaNeonHTTP (Neon HTTPS / no TCP 5432).
 *
 * Writes ONLY learning_* tables. Production tables (ContractRule, Permission, …)
 * remain guarded — this module must never call those writers.
 */

import type { PrismaClient } from "@prisma/client";
import type { PackageAuditManifest } from "../types";
import { assertAutomatedKnowledgeState } from "../promotion-guards";
import { classifyNeonProbeError, type NeonProbeClass } from "./neon-database-url";
import {
  createClfPrismaClient,
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
  type NeonHttpsExecutor,
} from "./neon-transport";

export interface NeonPersistResult {
  attempted: boolean;
  ok: boolean;
  detail: string;
  insertedArtifacts: number;
  insertedErrors: number;
  insertedProposals: number;
}

export interface NeonProbeResult {
  live: boolean;
  detail: string;
  class: NeonProbeClass;
  transport?: "tcp" | "https";
  originalHost?: string;
  ipv4?: string | null;
}

export interface PersistNeonOptions {
  /** Injected writer for offline tests (mocked HTTPS driver). */
  executor?: NeonHttpsExecutor;
  /** Skip live probe when executor is injected. */
  skipProbe?: boolean;
}

export async function probeNeonLive(): Promise<NeonProbeResult> {
  if (!process.env.DATABASE_URL) {
    return { live: false, detail: "DATABASE_URL unset", class: "unset" };
  }
  const transport = getNeonTransportMode();
  let opened: Awaited<ReturnType<typeof createClfPrismaClient>> | undefined;
  try {
    opened = await createClfPrismaClient();
    await opened.client.$queryRaw`SELECT 1 as ok`;
    return {
      live: true,
      detail: `reachable via ${transport}`,
      class: "live",
      transport,
      originalHost: opened.originalHost,
      ipv4: opened.ipv4,
    };
  } catch (err) {
    const message = redactConnectionSecrets(
      err instanceof Error ? err.message : String(err),
    );
    const cls = classifyNeonProbeError(message);
    const detail =
      cls === "auth_failed"
        ? `Neon auth failed (${cls}, transport=${transport}): credentials rejected. ${message.slice(0, 180)}`
        : message.slice(0, 240);
    return {
      live: false,
      detail,
      class: cls,
      transport,
      originalHost: opened?.originalHost,
      ipv4: opened?.ipv4,
    };
  } finally {
    await opened?.disconnect();
  }
}

function prismaAsExecutor(client: PrismaClient): NeonHttpsExecutor {
  return {
    async execute(statement: string, params: unknown[] = []) {
      const trimmed = statement.trim().toUpperCase();
      if (trimmed.startsWith("SELECT") || trimmed.startsWith("WITH")) {
        const rows = await client.$queryRawUnsafe(statement, ...params);
        return rows as Record<string, unknown>[];
      }
      await client.$executeRawUnsafe(statement, ...params);
      return [];
    },
  };
}

/**
 * Persist a package audit into learning_* tables (OK, FAILED, ABSTAINED, …).
 * Failures are the learning signal — always persist when requested and reachable.
 */
export async function persistPackageManifestToNeon(
  manifest: PackageAuditManifest,
  options: PersistNeonOptions = {},
): Promise<NeonPersistResult> {
  // Artifacts on automated paths may only be PROPOSED | REVIEW_REQUIRED.
  for (const a of manifest.artifacts) {
    assertAutomatedKnowledgeState(a.state);
  }

  let executor = options.executor;
  let opened: Awaited<ReturnType<typeof createClfPrismaClient>> | undefined;

  try {
    if (!executor) {
      if (!process.env.DATABASE_URL) {
        return {
          attempted: true,
          ok: false,
          detail: "DATABASE_URL unset",
          insertedArtifacts: 0,
          insertedErrors: 0,
          insertedProposals: 0,
        };
      }
      if (!options.skipProbe) {
        const probe = await probeNeonLive();
        if (!probe.live) {
          return {
            attempted: true,
            ok: false,
            detail: `Neon unavailable (${probe.class}): ${probe.detail}`,
            insertedArtifacts: 0,
            insertedErrors: 0,
            insertedProposals: 0,
          };
        }
      }
      const transport = getNeonTransportMode();
      if (transport === "https") {
        executor = await createNeonHttpsExecutor(process.env.DATABASE_URL);
      } else {
        opened = await createClfPrismaClient();
        executor = prismaAsExecutor(opened.client);
      }
    }

    return await writeLearningManifest(executor, manifest);
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      detail: redactConnectionSecrets(
        err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
      ),
      insertedArtifacts: 0,
      insertedErrors: 0,
      insertedProposals: 0,
    };
  } finally {
    await opened?.disconnect();
  }
}

async function writeLearningManifest(
  executor: NeonHttpsExecutor,
  manifest: PackageAuditManifest,
): Promise<NeonPersistResult> {
  const packageId = `lp_${manifest.packageKey}`.slice(0, 64);

  await executor.execute(
    `INSERT INTO learning_packages
      (id, "packageKey", "companyId", "issuerCik", "issuerTicker", "issuerName", cohort, provenance, "usageRights", "evaluationOnly", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
     ON CONFLICT ("packageKey") DO UPDATE SET
       "issuerTicker" = EXCLUDED."issuerTicker",
       "companyId" = EXCLUDED."companyId",
       "evaluationOnly" = EXCLUDED."evaluationOnly",
       "updatedAt" = NOW()`,
    [
      packageId,
      manifest.packageKey,
      manifest.companyId,
      manifest.issuerCik,
      manifest.issuerTicker ?? null,
      null,
      manifest.cohort,
      "covenant-learning-factory",
      "PUBLIC_SEC_EDGAR",
      manifest.cohort === "HELD_OUT",
    ],
  );

  await executor.execute(
    `INSERT INTO learning_runs
      (id, "runId", "packageKey", status, "codeSha", "factoryVersion", "compilerVersion", "startedAt", "finishedAt", "manifestJson", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
     ON CONFLICT ("runId") DO UPDATE SET
       status = EXCLUDED.status,
       "finishedAt" = EXCLUDED."finishedAt",
       "manifestJson" = EXCLUDED."manifestJson",
       "updatedAt" = NOW()`,
    [
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
    ],
  );

  let insertedArtifacts = 0;
  for (const a of manifest.artifacts) {
    await executor.execute(
      `INSERT INTO learning_artifacts
        (id, "artifactId", "packageKey", "runId", kind, state, family, "sourceRefsJson", "payloadJson", "compilerVersion", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
       ON CONFLICT ("artifactId") DO NOTHING`,
      [
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
      ],
    );
    insertedArtifacts += 1;
  }

  let insertedErrors = 0;
  for (const e of manifest.errors) {
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
        JSON.stringify(e.correctiveHistory),
        new Date(e.createdAt),
      ],
    );
    insertedErrors += 1;
  }

  if (manifest.evaluation) {
    const ev = manifest.evaluation;
    await executor.execute(
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
      [
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
      ],
    );
  }

  let insertedProposals = 0;
  for (const p of manifest.improvementProposals ?? []) {
    const adjudicationStatus =
      p.adjudicationStatus ??
      (p.state === "ACCEPTED" || p.state === "MECHANICALLY_REPLAYED"
        ? "MECHANICALLY_REPLAYED"
        : p.state);
    const state =
      p.state === "ACCEPTED" ? "MECHANICALLY_REPLAYED" : p.state;
    const metrics = p.executableRule?.metrics;
    await executor.execute(
      `INSERT INTO learning_improvement_proposals
        (id, "proposalId", "packageKey", "runId", lever, summary, bounded, "autoApply", "evidenceJson", state, "adjudicationStatus", "createdAt",
         "trainFixed", "heldoutFixed", "sourcesSpanned")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)
       ON CONFLICT ("proposalId") DO NOTHING`,
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
          evidenceRefs: p.evidenceRefs ?? [],
          executableRule: p.executableRule ?? null,
          authorityStatus: "COMPUTED_NOT_CERTIFIED",
          adjudicationStatus,
          adjudicationClass:
            adjudicationStatus === "MECHANICALLY_REPLAYED"
              ? "MECHANICAL_REPLAY"
              : adjudicationStatus === "INDEPENDENTLY_VERIFIED"
                ? "INDEPENDENT_HELD_OUT"
                : null,
          trainFixed: metrics?.trainFixed ?? null,
          heldoutFixed: metrics?.heldoutFixed ?? null,
          sourcesSpanned: metrics?.sourcesSpanned ?? null,
        }),
        state,
        adjudicationStatus,
        new Date(p.createdAt),
        metrics?.trainFixed ?? null,
        metrics?.heldoutFixed ?? null,
        metrics?.sourcesSpanned ?? null,
      ],
    );
    insertedProposals += 1;
  }

  return {
    attempted: true,
    ok: true,
    detail: `persisted learning_* for status=${manifest.status}`,
    insertedArtifacts,
    insertedErrors,
    insertedProposals,
  };
}
