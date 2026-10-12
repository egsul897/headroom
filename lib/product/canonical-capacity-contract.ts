/**
 * Canonical pre-transaction capacity identity consumed by Position, Simulate,
 * financial/utilization evaluation, audit, and (when authorized) persistence.
 *
 * UI adapters must not synthesize legal authority or convert modeled amounts
 * into verified remaining. Publication status is explicit and fail-closed.
 */

import type {
  CapacityPublicationClass,
  ExecutableOperativeUnit,
  OperativeCovenantPackageResult,
  RejectedOperativeUnit,
} from "@/lib/contract-model/analysis/operative-covenant-package";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";

export const CANONICAL_CAPACITY_CONTRACT_VERSION = "canonical-capacity-contract.v1";

export type CanonicalPublicationStatus =
  | "GROSS_CONTRACTUAL_ONLY"
  | "MODELED_HYPOTHETICAL_ONLY"
  | "UNSUPPORTED_OR_UNKNOWN"
  | "VERIFIED_REMAINING_BLOCKED"
  | "PRODUCTION_AVAILABLE_BLOCKED";

export type CanonicalCapacityUnit = {
  unitId: string;
  governingDocumentId: string;
  sourceSectionRef: string;
  sourceSpan: { charStart: number | null; charEnd: number | null };
  operativeTextExcerpt: string;
  executableRuleIdentity: string | null;
  provisionKind: string;
  capacityClass: CapacityPublicationClass;
  /** Gross contractual from VE IR ($M). Never remaining. */
  grossContractualMm: number | null;
  /** Modeled/hypothetical only ($M). Never published as verified remaining. */
  modeledHypotheticalMm: number | null;
  /** Always null until utilization completeness + trusted issuer. */
  verifiedRemainingMm: null;
  /** Always null while trusted-identity BLOCKED. */
  productionAvailableMm: null;
  publicationStatus: CanonicalPublicationStatus;
  fidelityVerdict: string | null;
  missingInputs: string[];
  exceptionsAndConditions: string[];
  definedTermDependencies: string[];
};

export type CanonicalCapacityContract = {
  version: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  asOfDate: string;
  /** Shared package-level constraints / refusal reasons. */
  sharedConstraints: string[];
  financialSnapshotPresent: boolean;
  utilizationCompletenessPresent: boolean;
  trustedIdentityActivation: string;
  productionAuthorityActive: boolean;
  units: CanonicalCapacityUnit[];
  rejected: Array<{
    unitId: string;
    governingDocumentId: string;
    sourceSectionRef: string;
    reason: string;
    publicationStatus: "UNSUPPORTED_OR_UNKNOWN";
  }>;
  /** Identity string Position and Simulate must share for pre-transaction state. */
  preTransactionCapacityIdentity: string;
  limitations: string[];
};

function publicationStatusFor(u: ExecutableOperativeUnit): CanonicalPublicationStatus {
  if (u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL") return "GROSS_CONTRACTUAL_ONLY";
  if (u.capacityClass === "MODELED_HYPOTHETICAL") return "MODELED_HYPOTHETICAL_ONLY";
  if (u.capacityClass === "VERIFIED_REMAINING") return "VERIFIED_REMAINING_BLOCKED";
  if (u.capacityClass === "PRODUCTION_AVAILABLE") return "PRODUCTION_AVAILABLE_BLOCKED";
  return "UNSUPPORTED_OR_UNKNOWN";
}

function unitFromExecutable(u: ExecutableOperativeUnit): CanonicalCapacityUnit {
  return {
    unitId: u.unitId,
    governingDocumentId: u.documentId,
    sourceSectionRef: u.sourceRef,
    sourceSpan: u.sourceSpan,
    operativeTextExcerpt: u.operativeText.slice(0, 280),
    executableRuleIdentity:
      u.executableAuthority === "VERIFIED_EXECUTABLE" ? `ve:${u.unitId}` : null,
    provisionKind: u.provisionKind,
    capacityClass: u.capacityClass,
    grossContractualMm:
      u.sourceBackedGrossCapacityUsd != null ? u.sourceBackedGrossCapacityUsd / 1_000_000 : null,
    modeledHypotheticalMm:
      u.modeledHypotheticalCapacityUsd != null
        ? u.modeledHypotheticalCapacityUsd / 1_000_000
        : null,
    verifiedRemainingMm: null,
    productionAvailableMm: null,
    publicationStatus: publicationStatusFor(u),
    fidelityVerdict: u.fidelityVerdict,
    missingInputs: u.missingDependencies,
    exceptionsAndConditions: u.exceptionsAndConditions,
    definedTermDependencies: u.definedTermDependencies,
  };
}

function rejectedFrom(u: RejectedOperativeUnit) {
  return {
    unitId: u.unitId,
    governingDocumentId: u.documentId,
    sourceSectionRef: u.sourceRef,
    reason: u.reason,
    publicationStatus: "UNSUPPORTED_OR_UNKNOWN" as const,
  };
}

/**
 * Project operative package compile result into the canonical capacity contract.
 * Does not invent financial/utilization completeness.
 */
export function canonicalCapacityFromOperativePackage(
  result: OperativeCovenantPackageResult,
  opts?: {
    financialSnapshotPresent?: boolean;
    utilizationCompletenessPresent?: boolean;
    productionAuthorityActive?: boolean;
  },
): CanonicalCapacityContract {
  const financialSnapshotPresent = opts?.financialSnapshotPresent ?? false;
  const utilizationCompletenessPresent = opts?.utilizationCompletenessPresent ?? false;
  const productionAuthorityActive = opts?.productionAuthorityActive ?? false;

  const units = result.executableUnits.map(unitFromExecutable);
  const rejected = result.rejectedUnits.map(rejectedFrom);

  const sharedConstraints = [
    ...result.diagnostics.humanInterventions.map((h) => `${h.kind}:${h.detail}`),
    result.diagnostics.autonomousCompilationRationale,
  ];
  if (!financialSnapshotPresent) {
    sharedConstraints.push("FINANCIAL_SNAPSHOT_ABSENT");
  }
  if (!utilizationCompletenessPresent) {
    sharedConstraints.push("UTILIZATION_COMPLETENESS_ABSENT — verified remaining null");
  }
  if (TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED") {
    sharedConstraints.push("TRUSTED_IDENTITY_PRODUCTION_ACTIVATION=BLOCKED");
  }

  const identityPayload = {
    version: CANONICAL_CAPACITY_CONTRACT_VERSION,
    companyId: result.companyId,
    packageKey: result.packageKey,
    instrumentKey: result.instrumentKey,
    asOfDate: result.asOfDate,
    unitIds: units.map((u) => u.unitId).sort(),
    gross: units.map((u) => [u.unitId, u.grossContractualMm]),
    modeled: units.map((u) => [u.unitId, u.modeledHypotheticalMm]),
    rejectedIds: rejected.map((r) => r.unitId).sort(),
  };

  return {
    version: CANONICAL_CAPACITY_CONTRACT_VERSION,
    companyId: result.companyId,
    packageKey: result.packageKey,
    instrumentKey: result.instrumentKey,
    asOfDate: result.asOfDate,
    sharedConstraints,
    financialSnapshotPresent,
    utilizationCompletenessPresent,
    trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    productionAuthorityActive,
    units,
    rejected,
    preTransactionCapacityIdentity: JSON.stringify(identityPayload),
    limitations: [
      "GROSS ≠ MODELED ≠ VERIFIED_REMAINING ≠ AVAILABLE — partitions must not be coalesced.",
      "Verified remaining requires utilization completeness + trusted issuer.",
      "Production AVAILABLE refused while trusted-identity BLOCKED.",
      "UI adapters must not synthesize legal authority.",
    ],
  };
}
