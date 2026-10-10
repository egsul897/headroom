/**
 * Durable Neon persistence for canonical unified transaction execution (#293/#294).
 *
 * Architecture:
 *   executeUnifiedVerifiedTransaction (pure, unchanged)
 *     → persistUnifiedTransactionExecution (this module)
 *         → lib/persistence/** → Neon PostgreSQL
 *
 * Does NOT rewrite engines. Does NOT mutate the actual ledger from simulations.
 * Does NOT bypass identity / issuer / operative / evidence gates.
 * Production-authoritative persistence remains refused while activation is BLOCKED.
 *
 * Multi-step writes use compensating invalidation on failure so a partial
 * persistence never appears as a complete authoritative record.
 */
import { Prisma, type IntelligenceAuthorityClass, type PrismaClient } from "@prisma/client";
import {
  persistCapacityCalculation,
  persistFinancialEvidenceBundle,
  persistTransactionSimulation,
  persistUtilizationCompletenessRecord,
  appendInstitutionalAuditEvent,
  invalidateDependentArtifacts,
  contentHashOf,
  PRODUCTION_ACTIVATION_STATUS,
  PersistenceContractError,
  type ActorProvenance,
  type InvalidatableEntityType,
} from "@/lib/persistence";
import { toProductExecutionHandoff } from "./product-handoff";
import { executeUnifiedVerifiedTransaction } from "./execute";
import type {
  ProductExecutionHandoff,
  UnifiedTransactionExecutionRequest,
  UnifiedTransactionExecutionResult,
} from "./types";

export const PRODUCT_EXECUTION_PERSISTENCE_VERSION = "product-execution-persistence.v1";

export interface PersistUnifiedExecutionInput {
  request: UnifiedTransactionExecutionRequest;
  result: UnifiedTransactionExecutionResult;
  packageKey?: string;
  actor?: ActorProvenance;
  requireCompletePersistence?: boolean;
}

export interface UnifiedExecutionPersistenceRecord {
  persistenceVersion: typeof PRODUCT_EXECUTION_PERSISTENCE_VERSION;
  companyId: string;
  calculationId: string;
  contentHash: string;
  complete: boolean;
  financialEvidenceBundleId: string | null;
  utilizationCompletenessRecordId: string | null;
  capacityCalculationRecordId: string | null;
  transactionSimulationRecordId: string | null;
  operativeAuthoritySnapshotId: string | null;
  auditEventIds: string[];
  handoffs: Record<ProductExecutionHandoff["surface"], ProductExecutionHandoff>;
  errors: string[];
}

function mapAuthorityClass(result: UnifiedTransactionExecutionResult): IntelligenceAuthorityClass {
  if (result.productionAuthority === "PRODUCTION_AUTHORITY_ACTIVE") {
    if (PRODUCTION_ACTIVATION_STATUS === "BLOCKED") return "HYPOTHETICAL";
    return "PRODUCTION_AUTHORITATIVE";
  }
  // Preserve provisional classification even when executionStatus is REFUSED.
  if (result.operativeAuthority.authority === "PROVISIONAL_IDENTITY_BLOCKED") return "PROVISIONAL";
  if (
    result.executionStatus === "REFUSED" ||
    result.executionStatus === "UNSUPPORTED" ||
    result.executionStatus === "INSUFFICIENT" ||
    result.executionStatus === "NEEDS_INPUT"
  ) {
    return "REFUSED";
  }
  if (
    result.executionStatus === "EXECUTED_HYPOTHETICAL" ||
    result.mode === "HYPOTHETICAL" ||
    result.productionAuthority === "HYPOTHETICAL_ONLY" ||
    result.productionAuthority === "PRODUCTION_AUTHORITY_BLOCKED"
  ) {
    return "HYPOTHETICAL";
  }
  return "VERIFIED_CALCULATION";
}

function calculationIdOf(
  request: UnifiedTransactionExecutionRequest,
  result: UnifiedTransactionExecutionResult,
): string {
  const txId = request.transaction.transactionId ?? result.postStateIdentity.transactionId ?? "anon";
  return `ute-calc:${request.companyId}:${request.instrumentKey}:${request.selectedLegalPath.pathId}:${txId}:${request.transaction.date}`;
}

async function compensatePartial(
  prisma: PrismaClient,
  companyId: string,
  written: Array<{ entityType: InvalidatableEntityType; entityId: string }>,
  reason: string,
): Promise<void> {
  if (written.length === 0) return;
  await invalidateDependentArtifacts(prisma, {
    companyId,
    sourceEntityType: "UnifiedTransactionExecution",
    sourceEntityId: "persistence-failure",
    dependents: written,
    reason,
    markAs: "INVALIDATED",
    actor: { kind: "SYSTEM", component: "product.persist-execution.compensate" },
  });
}

/**
 * Persist the minimum sufficient complete record for reproducibility.
 */
export async function persistUnifiedTransactionExecution(
  prisma: PrismaClient,
  input: PersistUnifiedExecutionInput,
): Promise<UnifiedExecutionPersistenceRecord> {
  const { request, result } = input;
  const actor: ActorProvenance = input.actor ?? {
    kind: "SYSTEM",
    component: "product.verified-transaction-execution.persist",
  };
  const requireComplete = input.requireCompletePersistence !== false;
  const packageKey = input.packageKey ?? `pkg:${request.instrumentKey}`;
  const calculationId = calculationIdOf(request, result);
  const handoffs = {
    POSITION: toProductExecutionHandoff(result, "POSITION"),
    ASK: toProductExecutionHandoff(result, "ASK"),
    SIMULATE: toProductExecutionHandoff(result, "SIMULATE"),
  };
  const errors: string[] = [];
  const auditEventIds: string[] = [];
  const written: Array<{ entityType: InvalidatableEntityType; entityId: string }> = [];

  let financialEvidenceBundleId: string | null = null;
  let utilizationCompletenessRecordId: string | null = null;
  let capacityCalculationRecordId: string | null = null;
  let transactionSimulationRecordId: string | null = null;
  let operativeAuthoritySnapshotId: string | null = null;

  const verifiedIrIdentity = contentHashOf(request.verifiedExecutableRule);
  const financialSnapshotIdentity = contentHashOf([...request.financialEvidence.metrics]);
  const utilizationSnapshotIdentity = contentHashOf({
    records: request.utilization.records,
    certificate: request.utilization.completenessCertificate ?? null,
  });
  const authorityClass = mapAuthorityClass(result);

  try {
    // 1) Operative authority claim snapshot
    const operativePayload = {
      kind: "PRODUCT_OPERATIVE_SOURCE_AUTHORITY",
      companyId: request.companyId,
      packageKey,
      asOfDate: request.operativeSourceAuthority.effectiveAsOfDate,
      claim: request.operativeSourceAuthority,
      evaluation: result.operativeAuthority,
    };
    const operativeHash = contentHashOf(operativePayload);
    const existingOp = await prisma.operativeAuthoritySnapshot.findUnique({
      where: {
        companyId_packageKey_asOfDate_contentHash: {
          companyId: request.companyId,
          packageKey,
          asOfDate: request.operativeSourceAuthority.effectiveAsOfDate,
          contentHash: operativeHash,
        },
      },
    });
    if (existingOp) {
      operativeAuthoritySnapshotId = existingOp.id;
    } else {
      const prior = await prisma.operativeAuthoritySnapshot.findMany({
        where: {
          companyId: request.companyId,
          packageKey,
          asOfDate: request.operativeSourceAuthority.effectiveAsOfDate,
          status: "ACTIVE",
          NOT: { contentHash: operativeHash },
        },
      });
      try {
        const created = await prisma.operativeAuthoritySnapshot.create({
          data: {
            companyId: request.companyId,
            packageKey,
            asOfDate: request.operativeSourceAuthority.effectiveAsOfDate,
            contentHash: operativeHash,
            authorityClassification: request.operativeSourceAuthority.authorityClassification,
            instrumentKey: request.instrumentKey,
            provisionalIdentity: request.operativeSourceAuthority.provisionalIdentity,
            engineVersion: PRODUCT_EXECUTION_PERSISTENCE_VERSION,
            payload: operativePayload as object,
            sourceFingerprint: {
              sourceDocumentId: request.operativeSourceAuthority.sourceDocumentId,
              verifiedIrIdentity,
            } as object,
            status: "ACTIVE",
          },
        });
        for (const p of prior) {
          await prisma.operativeAuthoritySnapshot.update({
            where: { id: p.id },
            data: { status: "SUPERSEDED", supersededById: created.id },
          });
        }
        operativeAuthoritySnapshotId = created.id;
        written.push({ entityType: "OperativeAuthoritySnapshot", entityId: created.id });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const raced = await prisma.operativeAuthoritySnapshot.findUnique({
            where: {
              companyId_packageKey_asOfDate_contentHash: {
                companyId: request.companyId,
                packageKey,
                asOfDate: request.operativeSourceAuthority.effectiveAsOfDate,
                contentHash: operativeHash,
              },
            },
          });
          if (!raced) throw err;
          operativeAuthoritySnapshotId = raced.id;
        } else {
          throw err;
        }
      }
    }

    // 2) Financial evidence
    const fin = await persistFinancialEvidenceBundle(prisma, {
      companyId: request.companyId,
      bundleKey: `ute-fin:${request.instrumentKey}:${request.transaction.date}`,
      asOfDate: request.transaction.date,
      metrics: [...request.financialEvidence.metrics],
      actor,
    });
    financialEvidenceBundleId = fin.id;
    if (fin.created) written.push({ entityType: "FinancialEvidenceBundle", entityId: fin.id });

    // 3) Utilization completeness (when supplied)
    const cert = request.utilization.completenessCertificate;
    if (cert) {
      const util = await persistUtilizationCompletenessRecord(prisma, {
        companyId: request.companyId,
        certificate: cert,
        actor,
      });
      utilizationCompletenessRecordId = util.id;
      if (util.created) {
        written.push({ entityType: "UtilizationCompletenessRecord", entityId: util.id });
      }
    }

    // 4) Capacity calculation (including refusals)
    const calc = await persistCapacityCalculation(prisma, {
      companyId: request.companyId,
      calculationId,
      asOfDate: request.transaction.date,
      instrumentKey: request.instrumentKey,
      authorityClass,
      calculationStatus: result.executionStatus,
      operativeAuthoritySnapshotId,
      verifiedIrIdentity,
      financialSnapshotIdentity,
      utilizationSnapshotIdentity,
      request: {
        companyId: request.companyId,
        instrumentKey: request.instrumentKey,
        transaction: request.transaction,
        selectedLegalPath: request.selectedLegalPath,
        verifiedExecutableRule: request.verifiedExecutableRule,
        mode: request.mode ?? "HYPOTHETICAL",
        productionAuthority: result.productionAuthority,
      },
      capacityOutput: result.verified.capacity,
      missingInputs: result.missingInputs,
      refusalReasons: result.blockers,
      reviewConditions: result.conditions,
      trace: result.trace,
      actor,
    });
    capacityCalculationRecordId = calc.id;
    if (calc.created) written.push({ entityType: "CapacityCalculationRecord", entityId: calc.id });

    // 5) Hypothetical simulation — never ledger mutation
    const sim = result.verified.simulation;
    const txBuilt = result.verified.transaction;
    if (sim?.outcome === "EXECUTED" && txBuilt) {
      const simulationId = handoffs.SIMULATE.traceId;
      const simulationHash = contentHashOf({
        simulationId,
        outcome: sim.outcome,
        simulationStatus: sim.simulation.simulationStatus,
        simulationIdentity: sim.simulation.simulationIdentity,
        postState: result.postStateIdentity,
      });
      const persistedSim = await persistTransactionSimulation(prisma, {
        companyId: request.companyId,
        simulationId,
        simulationHash,
        transactionId: txBuilt.transactionId,
        transactionHash: sim.simulation.transactionIdentity.transactionHash,
        simulationStatus: String(sim.simulation.simulationStatus),
        result: {
          outcome: sim.outcome,
          packageHash: sim.packageHash,
          simulation: sim.simulation,
        },
        proposedEffects: sim.simulation.effects,
        postStateIdentity: {
          ...result.postStateIdentity,
          simulationPostStateHash: sim.simulation.postStateIdentity?.postStateHash ?? null,
        },
        capacityCalculationRecordId,
        mutatesActualLedger: false,
        actor,
      });
      transactionSimulationRecordId = persistedSim.id;
      if (persistedSim.created) {
        written.push({ entityType: "TransactionSimulationRecord", entityId: persistedSim.id });
      }
    }

    // 6) Completeness audit
    const audit = await appendInstitutionalAuditEvent(prisma, {
      companyId: request.companyId,
      action: result.blockers.length > 0 ? "AUTHORITY_REFUSAL" : "CAPACITY_RECALCULATION",
      entityType: "UnifiedTransactionExecution",
      entityId: calculationId,
      actor,
      newState: {
        executionStatus: result.executionStatus,
        productionAuthority: result.productionAuthority,
        authorityClass,
        complete: true,
        financialEvidenceBundleId,
        utilizationCompletenessRecordId,
        capacityCalculationRecordId,
        transactionSimulationRecordId,
        operativeAuthoritySnapshotId,
        handoffTraceIds: {
          POSITION: handoffs.POSITION.traceId,
          ASK: handoffs.ASK.traceId,
          SIMULATE: handoffs.SIMULATE.traceId,
        },
      },
      evidenceRefs: {
        verifiedIrIdentity,
        financialSnapshotIdentity,
        utilizationSnapshotIdentity,
        sourceCitations: result.sourceCitations,
      },
    });
    auditEventIds.push(audit.eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    await compensatePartial(
      prisma,
      request.companyId,
      written,
      `Incomplete unified-execution persistence: ${message}`,
    );
    if (requireComplete) {
      throw err instanceof PersistenceContractError
        ? err
        : new PersistenceContractError(`Unified execution persistence failed: ${message}`);
    }
  }

  const complete =
    errors.length === 0 &&
    capacityCalculationRecordId != null &&
    operativeAuthoritySnapshotId != null &&
    financialEvidenceBundleId != null;

  return {
    persistenceVersion: PRODUCT_EXECUTION_PERSISTENCE_VERSION,
    companyId: request.companyId,
    calculationId,
    contentHash: contentHashOf({
      calculationId,
      verifiedIrIdentity,
      financialSnapshotIdentity,
      utilizationSnapshotIdentity,
      executionStatus: result.executionStatus,
    }),
    complete,
    financialEvidenceBundleId,
    utilizationCompletenessRecordId,
    capacityCalculationRecordId,
    transactionSimulationRecordId,
    operativeAuthoritySnapshotId,
    auditEventIds,
    handoffs,
    errors,
  };
}

export interface ExecuteAndPersistOptions {
  packageKey?: string;
  actor?: ActorProvenance;
  requireCompletePersistence?: boolean;
}

/** Canonical product entry: pure VTE then durable Neon persist. */
export async function executeAndPersistUnifiedVerifiedTransaction(
  prisma: PrismaClient,
  request: UnifiedTransactionExecutionRequest,
  opts?: ExecuteAndPersistOptions,
): Promise<{
  result: UnifiedTransactionExecutionResult;
  persistence: UnifiedExecutionPersistenceRecord;
}> {
  const result = await executeUnifiedVerifiedTransaction(request);
  const persistence = await persistUnifiedTransactionExecution(prisma, {
    request,
    result,
    packageKey: opts?.packageKey,
    actor: opts?.actor,
    requireCompletePersistence: opts?.requireCompletePersistence,
  });
  return { result, persistence };
}

/** Tenant-scoped read-back of a persisted unified execution. */
export async function loadPersistedUnifiedExecution(
  prisma: PrismaClient,
  companyId: string,
  calculationId: string,
) {
  const calc = await prisma.capacityCalculationRecord.findFirst({
    where: { companyId, calculationId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!calc) return null;

  const [operative, financial, simulation, audits] = await Promise.all([
    calc.operativeAuthoritySnapshotId
      ? prisma.operativeAuthoritySnapshot.findFirst({
          where: { id: calc.operativeAuthoritySnapshotId, companyId },
        })
      : Promise.resolve(null),
    calc.financialSnapshotIdentity
      ? prisma.financialEvidenceBundle.findFirst({
          where: { companyId, contentHash: calc.financialSnapshotIdentity },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    prisma.transactionSimulationRecord.findFirst({
      where: { companyId, capacityCalculationRecordId: calc.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.institutionalAuditEvent.findMany({
      where: {
        companyId,
        entityType: "UnifiedTransactionExecution",
        entityId: calculationId,
      },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const financialUsable = financial?.status === "ACTIVE";
  const operativeUsable = operative == null || operative.status === "ACTIVE";

  return {
    calculation: calc,
    operative,
    financial,
    simulation,
    audits,
    reusableAsCurrentAuthority:
      calc.status === "ACTIVE" &&
      calc.authorityClass !== "PRODUCTION_AUTHORITATIVE" &&
      operativeUsable &&
      (financial == null || financialUsable) &&
      (simulation == null || simulation.mutatesActualLedger === false),
  };
}
