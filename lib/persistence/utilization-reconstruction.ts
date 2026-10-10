/**
 * Durable utilization reconstruction → existing ContractLedgerUsage + envelope sidecar.
 *
 * Does NOT create a second ledger. Attributed APPROVED+AUTHENTIC rows project to
 * PrismaContractLedgerStore. Reconstruction envelope (layers, UNKNOWN, unallocated,
 * trace) lives on CapacityCalculationRecord — restart-safe without a parallel ledger.
 *
 * UNKNOWN_HISTORICAL_ACTIVITY must survive reload. Empty ledger ≠ zero usage.
 */
import type { IntelligenceAuthorityClass, PrismaClient } from "@prisma/client";
import { PrismaContractLedgerStore } from "@/lib/contract-model/runtime/capacity/store/prisma-store";
import type { LedgerUsageRecord } from "@/lib/contract-model/runtime/capacity/types";
import type {
  AttributedUtilizationUsage,
  HistoricalUtilizationEvent,
  UtilizationReconstructionResult,
} from "@/lib/capacity/utilization-evidence-reconstruction";
import type { UtilizationEvidenceRecord } from "@/lib/capacity/utilization-types";
import { contentHashOf } from "./hash";
import { persistCapacityCalculation, getLatestAuthorizedCapacityCalculation } from "./capacity-calculation";
import { persistUtilizationCompletenessRecord } from "./utilization-completeness";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

export const UTILIZATION_RECONSTRUCTION_CALC_PREFIX = "util-recon:";

export interface UtilizationReconstructionEnvelope {
  schemaVersion: "utilization-reconstruction-envelope.v1";
  companyId: string;
  capacityRuleId: string;
  asOf: string;
  layers: UtilizationReconstructionResult["layers"];
  unknownHistoricalActivity: boolean;
  reviewerConfirmedCompleteness: boolean;
  evidenceObserved: HistoricalUtilizationEvent[];
  usageAttributed: Array<Omit<AttributedUtilizationUsage, "record"> & { recordUsageId: string }>;
  usageUnallocated: HistoricalUtilizationEvent[];
  /** Full Agent #2 utilization evidence records for reload → resolveUtilization. */
  utilizationRecords: UtilizationEvidenceRecord[];
  completenessCertificate: UtilizationReconstructionResult["completenessCertificate"];
  blockers: string[];
  note: string;
  trace: UtilizationReconstructionResult["trace"];
  ledgerUsageIds: string[];
  contentHash: string;
}

export interface PersistUtilizationReconstructionInput {
  companyId: string;
  result: UtilizationReconstructionResult;
  /** Instrument key for ledger rows (default: company). */
  instrumentKey?: string;
  actor?: ActorProvenance;
  /**
   * When true and result includes a structurally reviewer-confirmed cert,
   * also persist UtilizationCompletenessRecord. Never invents a cert.
   */
  persistCompletenessCertificate?: boolean;
}

function reconstructionCalculationId(capacityRuleId: string): string {
  return `${UTILIZATION_RECONSTRUCTION_CALC_PREFIX}${capacityRuleId}`;
}

function envelopeContentHash(result: UtilizationReconstructionResult): string {
  return contentHashOf({
    companyId: result.companyId,
    capacityRuleId: result.capacityRuleId,
    asOf: result.asOf,
    layers: result.layers,
    unknownHistoricalActivity: result.unknownHistoricalActivity,
    reviewerConfirmedCompleteness: result.reviewerConfirmedCompleteness,
    evidenceObserved: result.evidenceObserved,
    usageAttributed: result.usageAttributed.map((u) => ({
      usageId: u.usageId,
      amount: u.amount,
      date: u.date,
      applicableProvision: u.applicableProvision,
      source: u.source,
      entity: u.entity,
      currency: u.currency,
      supersessionTreatment: u.supersessionTreatment,
      eventKind: u.eventKind,
    })),
    usageUnallocated: result.usageUnallocated,
    completenessCertificate: result.completenessCertificate,
    blockers: result.blockers,
  });
}

function authorityForReconstruction(result: UtilizationReconstructionResult): IntelligenceAuthorityClass {
  if (result.unknownHistoricalActivity) return "REFUSED";
  if (result.reviewerConfirmedCompleteness) return "REVIEW_REQUIRED";
  return "REFUSED";
}

/**
 * Map attributed reconstruction usage → ContractLedgerUsage shape.
 * Only APPROVED + AUTHENTIC attributed rows are projected (fail-closed).
 * Negative amounts (repayments) become REVERSED with absolute amount.
 */
export function attributedUsageToLedgerRecord(
  companyId: string,
  instrumentKey: string,
  attributed: AttributedUtilizationUsage,
  authenticity: HistoricalUtilizationEvent["authenticity"],
  approvalState: HistoricalUtilizationEvent["approvalState"],
): LedgerUsageRecord | null {
  if (approvalState !== "APPROVED" || authenticity !== "AUTHENTIC") {
    return null;
  }
  const absAmount = Math.abs(attributed.amount);
  const status: LedgerUsageRecord["status"] =
    attributed.amount < 0 || attributed.eventKind === "REPAYMENT" ? "REVERSED" : "RECORDED";
  const capacityPath =
    attributed.applicableProvision != null
      ? ({ kind: "RULE" as const, ruleId: attributed.applicableProvision })
      : ({
          kind: "UNRESOLVED" as const,
          candidateRuleIds: [] as string[],
          reason: "reconstruction attribution missing provision",
        });
  // Refuse unattributed UNRESOLVED with empty candidates at write time.
  if (capacityPath.kind === "UNRESOLVED") return null;

  return {
    usageId: attributed.usageId,
    companyId,
    instrumentKey,
    effectiveAsOf: attributed.date,
    amount: { amount: String(absAmount), currency: attributed.currency },
    capacityPath,
    transactionRef: `hist-util:${attributed.usageId}`,
    status,
    supersededByUsageId: null,
    provenance: {
      source: attributed.source,
      sourceVersion: attributed.eventKind,
      approvalRef: `historical-utilization:${attributed.usageId}`,
      approvalState: approvalState,
    },
  };
}

export async function persistUtilizationReconstruction(
  prisma: PrismaClient,
  input: PersistUtilizationReconstructionInput,
): Promise<{
  envelopeId: string;
  contentHash: string;
  created: boolean;
  ledgerAppended: number;
  ledgerSkippedDuplicate: number;
  ledgerSkippedIneligible: number;
  completenessRecordId: string | null;
  envelope: UtilizationReconstructionEnvelope;
}> {
  const companyId = requireCompanyId(input.companyId, "persistUtilizationReconstruction");
  assertSameTenant(companyId, input.result.companyId, "persistUtilizationReconstruction.result");
  if (!input.result.ok) {
    throw new PersistenceContractError(
      `Refusing to persist structurally refused utilization reconstruction: ${input.result.blockers.join("; ")}`,
    );
  }

  const contentHash = envelopeContentHash(input.result);
  const instrumentKey = input.instrumentKey ?? "company";
  const store = await PrismaContractLedgerStore.open(prisma, companyId);

  let ledgerAppended = 0;
  let ledgerSkippedDuplicate = 0;
  let ledgerSkippedIneligible = 0;
  const ledgerUsageIds: string[] = [];

  // Index authenticity/approval from observed events by eventId.
  const eventById = new Map(input.result.evidenceObserved.map((e) => [e.eventId, e]));

  for (const attributed of input.result.usageAttributed) {
    const src = eventById.get(attributed.usageId);
    const authenticity = src?.authenticity ?? "SYNTHETIC_LABELED";
    const approvalState = src?.approvalState ?? "UNKNOWN";
    const ledgerRow = attributedUsageToLedgerRecord(
      companyId,
      instrumentKey,
      attributed,
      authenticity,
      approvalState,
    );
    if (!ledgerRow) {
      ledgerSkippedIneligible += 1;
      continue;
    }
    const existing = store.getUsage(ledgerRow.usageId);
    if (existing) {
      ledgerSkippedDuplicate += 1;
      ledgerUsageIds.push(ledgerRow.usageId);
      continue;
    }
    const write = await store.appendUsage({ usage: ledgerRow });
    if (write.ok) {
      ledgerAppended += 1;
      ledgerUsageIds.push(ledgerRow.usageId);
    } else if (write.issues.some((i) => i.code === "DUPLICATE_USAGE_ID")) {
      ledgerSkippedDuplicate += 1;
      ledgerUsageIds.push(ledgerRow.usageId);
    } else {
      throw new PersistenceContractError(
        `Ledger append failed for ${ledgerRow.usageId}: ${write.issues.map((i) => i.message).join("; ")}`,
      );
    }
  }

  let completenessRecordId: string | null = null;
  if (
    input.persistCompletenessCertificate &&
    input.result.completenessCertificate != null &&
    input.result.reviewerConfirmedCompleteness
  ) {
    const certPersist = await persistUtilizationCompletenessRecord(prisma, {
      companyId,
      certificate: input.result.completenessCertificate,
      actor: input.actor,
    });
    completenessRecordId = certPersist.id;
  }

  const envelope: UtilizationReconstructionEnvelope = {
    schemaVersion: "utilization-reconstruction-envelope.v1",
    companyId,
    capacityRuleId: input.result.capacityRuleId,
    asOf: input.result.asOf,
    layers: input.result.layers,
    unknownHistoricalActivity: input.result.unknownHistoricalActivity,
    reviewerConfirmedCompleteness: input.result.reviewerConfirmedCompleteness,
    evidenceObserved: input.result.evidenceObserved,
    usageAttributed: input.result.usageAttributed.map((u) => ({
      usageId: u.usageId,
      amount: u.amount,
      date: u.date,
      applicableProvision: u.applicableProvision,
      source: u.source,
      entity: u.entity,
      currency: u.currency,
      supersessionTreatment: u.supersessionTreatment,
      eventKind: u.eventKind,
      recordUsageId: u.usageId,
    })),
    usageUnallocated: input.result.usageUnallocated,
    utilizationRecords: input.result.utilizationRecords,
    completenessCertificate: input.result.completenessCertificate,
    blockers: input.result.blockers,
    note: input.result.note,
    trace: input.result.trace,
    ledgerUsageIds,
    contentHash,
  };

  const calc = await persistCapacityCalculation(prisma, {
    companyId,
    calculationId: reconstructionCalculationId(input.result.capacityRuleId),
    asOfDate: input.result.asOf,
    instrumentKey,
    authorityClass: authorityForReconstruction(input.result),
    calculationStatus: "UTILIZATION_RECONSTRUCTION",
    utilizationSnapshotIdentity: contentHash,
    financialSnapshotIdentity: null,
    request: {
      kind: "UTILIZATION_RECONSTRUCTION",
      capacityRuleId: input.result.capacityRuleId,
      asOf: input.result.asOf,
      contentHash,
    },
    capacityOutput: null,
    missingInputs: input.result.unknownHistoricalActivity
      ? ["UNKNOWN_HISTORICAL_ACTIVITY", "REVIEWER_CONFIRMED_COMPLETENESS"]
      : undefined,
    refusalReasons: input.result.unknownHistoricalActivity
      ? ["UNKNOWN_HISTORICAL_ACTIVITY — empty/partial reconstruction is not zero usage"]
      : input.result.blockers,
    trace: envelope,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.utilization-reconstruction" },
  });

  return {
    envelopeId: calc.id,
    contentHash,
    created: calc.created,
    ledgerAppended,
    ledgerSkippedDuplicate,
    ledgerSkippedIneligible,
    completenessRecordId,
    envelope,
  };
}

/** Load latest ACTIVE reconstruction envelope for a capacity rule. */
export async function loadUtilizationReconstructionEnvelope(
  prisma: PrismaClient,
  companyId: string,
  capacityRuleId: string,
): Promise<{
  row: NonNullable<Awaited<ReturnType<typeof getLatestAuthorizedCapacityCalculation>>>;
  envelope: UtilizationReconstructionEnvelope;
} | null> {
  requireCompanyId(companyId, "loadUtilizationReconstructionEnvelope");
  const row = await getLatestAuthorizedCapacityCalculation(
    prisma,
    companyId,
    reconstructionCalculationId(capacityRuleId),
  );
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  const envelope = row.trace as unknown as UtilizationReconstructionEnvelope;
  if (!envelope || envelope.schemaVersion !== "utilization-reconstruction-envelope.v1") {
    throw new PersistenceContractError("CapacityCalculationRecord.trace is not a utilization reconstruction envelope");
  }
  assertSameTenant(companyId, envelope.companyId, "loadUtilizationReconstructionEnvelope");
  return { row, envelope };
}

/** Reload attributed ledger usages for a company (fresh Prisma read). */
export async function loadAttributedLedgerUsages(
  prisma: PrismaClient,
  companyId: string,
): Promise<LedgerUsageRecord[]> {
  requireCompanyId(companyId, "loadAttributedLedgerUsages");
  const store = await PrismaContractLedgerStore.open(prisma, companyId);
  return store.getUsages();
}

/**
 * Evaluate utilization authority from durable reconstruction + ledger.
 * Preserves UNKNOWN — never coerces empty ledger to VERIFIED_ZERO.
 */
export async function evaluatePersistedUtilizationAuthority(
  prisma: PrismaClient,
  args: {
    companyId: string;
    capacityRuleId: string;
  },
): Promise<{
  unknownHistoricalActivity: boolean;
  reviewerConfirmedCompleteness: boolean;
  envelope: UtilizationReconstructionEnvelope | null;
  activeLedgerCount: number;
  blockers: string[];
}> {
  const loaded = await loadUtilizationReconstructionEnvelope(prisma, args.companyId, args.capacityRuleId);
  const store = await PrismaContractLedgerStore.open(prisma, args.companyId);
  const active = store.getActiveUsages();
  if (!loaded) {
    return {
      unknownHistoricalActivity: true,
      reviewerConfirmedCompleteness: false,
      envelope: null,
      activeLedgerCount: active.length,
      blockers: [
        "no durable utilization reconstruction envelope — empty ledger is UNKNOWN_HISTORICAL_ACTIVITY, not zero",
      ],
    };
  }
  return {
    unknownHistoricalActivity: loaded.envelope.unknownHistoricalActivity,
    reviewerConfirmedCompleteness: loaded.envelope.reviewerConfirmedCompleteness,
    envelope: loaded.envelope,
    activeLedgerCount: active.length,
    blockers: [...loaded.envelope.blockers],
  };
}
