/**
 * Hypothetical transaction simulation persistence.
 * Never mutates actual ledger / capacity consumption.
 */
import { Prisma, type IntelligenceLifecycleStatus, type PrismaClient } from "@prisma/client";
import { contentHashOf } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

export interface PersistSimulationInput {
  companyId: string;
  simulationId: string;
  simulationHash: string;
  transactionId: string;
  transactionHash: string;
  simulationStatus: string;
  result: unknown;
  proposedEffects?: unknown;
  postStateIdentity?: unknown;
  capacityCalculationRecordId?: string | null;
  /** Must be false or omitted — actual ledger mutation is refused. */
  mutatesActualLedger?: boolean;
  actor?: ActorProvenance;
}

export async function persistTransactionSimulation(
  prisma: PrismaClient,
  input: PersistSimulationInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.companyId, "persistTransactionSimulation");

  if (input.mutatesActualLedger === true) {
    throw new PersistenceContractError(
      "Refusing to persist a simulation that claims mutatesActualLedger=true — hypothetical results must not mutate actual capacity",
    );
  }

  const contentHash = contentHashOf({
    simulationId: input.simulationId,
    simulationHash: input.simulationHash,
    transactionId: input.transactionId,
    transactionHash: input.transactionHash,
    simulationStatus: input.simulationStatus,
    result: input.result,
  });

  const existing = await prisma.transactionSimulationRecord.findUnique({
    where: {
      companyId_simulationId_simulationHash: {
        companyId,
        simulationId: input.simulationId,
        simulationHash: input.simulationHash,
      },
    },
  });
  if (existing) {
    return { id: existing.id, contentHash: existing.contentHash, created: false, status: existing.status };
  }

  let row;
  try {
    row = await prisma.transactionSimulationRecord.create({
      data: {
        companyId,
        simulationId: input.simulationId,
        simulationHash: input.simulationHash,
        transactionId: input.transactionId,
        transactionHash: input.transactionHash,
        contentHash,
        simulationStatus: input.simulationStatus,
        authorityClass: "HYPOTHETICAL",
        mutatesActualLedger: false,
        capacityCalculationRecordId: input.capacityCalculationRecordId ?? null,
        payload: input.result as object,
        proposedEffects: (input.proposedEffects ?? undefined) as object | undefined,
        postStateIdentity: (input.postStateIdentity ?? undefined) as object | undefined,
        status: "ACTIVE",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.transactionSimulationRecord.findUnique({
        where: {
          companyId_simulationId_simulationHash: {
            companyId,
            simulationId: input.simulationId,
            simulationHash: input.simulationHash,
          },
        },
      });
      if (raced) return { id: raced.id, contentHash: raced.contentHash, created: false, status: raced.status };
    }
    throw err;
  }

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: "PERSISTENCE_WRITE",
    entityType: "TransactionSimulationRecord",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.simulation" },
    newState: {
      id: row.id,
      simulationId: input.simulationId,
      simulationHash: input.simulationHash,
      authorityClass: "HYPOTHETICAL",
      mutatesActualLedger: false,
    },
  });

  return { id: row.id, contentHash, created: true, status: row.status };
}

export async function getTransactionSimulation(
  prisma: PrismaClient,
  companyId: string,
  simulationId: string,
  simulationHash?: string,
) {
  requireCompanyId(companyId, "getTransactionSimulation");
  return prisma.transactionSimulationRecord.findFirst({
    where: {
      companyId,
      simulationId,
      ...(simulationHash ? { simulationHash } : {}),
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTransactionSimulationById(prisma: PrismaClient, companyId: string, id: string) {
  requireCompanyId(companyId, "getTransactionSimulationById");
  const row = await prisma.transactionSimulationRecord.findUnique({ where: { id } });
  if (!row) return null;
  assertSameTenant(companyId, row.companyId, "getTransactionSimulationById");
  return row;
}
