/**
 * Persist compiled contractual definitions into Neon SemanticTruthRecord
 * and calculation result snapshots into ExternalInputRecord (no new migration).
 */

import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { IRDefinition } from "@/lib/contract-model/ir/types";
import { IR_SCHEMA_VERSION } from "@/lib/contract-model/ir/types";
import type { ContractualMetricResult } from "./types";

function contentHashOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Upsert the IR definition as COMPILED semantic truth (idempotent on content hash).
 * Does not claim VERIFIED — inputs remain PUBLIC_FILING_RECONSTRUCTION / modeled.
 */
export async function persistContractualDefinition(
  prisma: PrismaClient,
  definition: IRDefinition,
): Promise<{ persisted: boolean; note: string }> {
  try {
    const semanticObjectId = definition.definitionId;
    const payload = definition as unknown as object;
    const contentHash = contentHashOf(payload);
    const existing = await prisma.semanticTruthRecord.findUnique({
      where: {
        companyId_instrumentKey_kind_semanticObjectId: {
          companyId: definition.companyId,
          instrumentKey: definition.instrumentKey,
          kind: "DEFINITION",
          semanticObjectId,
        },
      },
    });

    const data = {
      packageKey: `${definition.companyId}:${definition.instrumentKey}`,
      analysisRunId: null as string | null,
      candidateRef: null as string | null,
      sourceDocumentId: definition.sourceDocumentId,
      sourceSectionRef: "1.01",
      sourceCitation: definition.provenance?.sourceCitation ?? null,
      sourceExcerpt: definition.provenance?.excerpt?.slice(0, 500) ?? null,
      irSchemaVersion: definition.irSchemaVersion || IR_SCHEMA_VERSION,
      compilerAlgorithmVersion: "product-contractual-metrics.v1",
      compilerPromptVersion: "n/a-deterministic-package",
      toolPolicyVersion: "n/a",
      verifierAlgorithmVersion: null as string | null,
      verifierPromptVersion: null as string | null,
      verificationStatus: null as string | null,
      trustStatus: "COMPILED" as const,
      sufficiency: definition.sufficiency,
      sufficiencyReasons: definition.sufficiencyReasons,
      payloadSchemaVersion: IR_SCHEMA_VERSION,
      payload,
      contentHash,
    };

    if (!existing) {
      await prisma.semanticTruthRecord.create({
        data: {
          companyId: definition.companyId,
          instrumentKey: definition.instrumentKey,
          kind: "DEFINITION",
          semanticObjectId,
          ...data,
        },
      });
      return { persisted: true, note: "Created SemanticTruthRecord DEFINITION (COMPILED)" };
    }
    if (existing.contentHash === contentHash) {
      return { persisted: true, note: "SemanticTruthRecord unchanged (idempotent)" };
    }
    await prisma.semanticTruthRecord.update({
      where: { id: existing.id },
      data: { ...data, version: existing.version + 1 },
    });
    return { persisted: true, note: `Updated SemanticTruthRecord to v${existing.version + 1}` };
  } catch (err) {
    return {
      persisted: false,
      note: `SemanticTruthRecord persist skipped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Persist calculated metric value as ExternalInputRecord for reuse / audit.
 * reviewStatus stays UNVERIFIED — never auto-promotes to certified.
 */
export async function persistCalculationResult(
  prisma: PrismaClient,
  result: ContractualMetricResult,
): Promise<{ persisted: boolean; note: string }> {
  if (result.status !== "CALCULATED" || result.valueMillions == null) {
    return { persisted: false, note: "No calculated value to persist" };
  }
  try {
    const name = `contractual-metric:${result.metricKey}`;
    const existing = await prisma.externalInputRecord.findFirst({
      where: { companyId: result.companyId, name, asOfDate: new Date(result.asOf) },
    });
    const data = {
      companyId: result.companyId,
      kind: "PUBLIC_FILING_RECONSTRUCTION" as const,
      name,
      value: result.valueMillions,
      asOfDate: new Date(result.asOf),
      sourceRef: `${result.sourceDocumentId} ${result.sectionRef} — definition-executed`,
      reviewStatus: "UNVERIFIED" as const,
      fieldKey: `contractualMetrics.${result.metricKey}`,
    };
    if (existing) {
      await prisma.externalInputRecord.update({ where: { id: existing.id }, data });
      return { persisted: true, note: `Updated ExternalInputRecord ${name}` };
    }
    await prisma.externalInputRecord.create({ data });
    return { persisted: true, note: `Created ExternalInputRecord ${name}` };
  } catch (err) {
    return {
      persisted: false,
      note: `ExternalInputRecord persist skipped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
