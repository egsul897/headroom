/**
 * Neon-first institutional persistence layer.
 *
 * Wraps canonical computation outputs — does not replace the covenant engine,
 * solver, or simulator. See docs/persistence/.
 */

export { contentHashOf, stableStringify, fingerprintParts } from "./hash";
export {
  actorProvenanceString,
  PRODUCTION_ACTIVATION_STATUS,
  OPERATIVE_AUTHORITY_ENGINE_VERSION,
  CAPACITY_CALCULATION_ENGINE_VERSION,
  TenantIsolationError,
  PersistenceContractError,
  type ActorProvenance,
} from "./types";
export { assertSameTenant, requireCompanyId } from "./tenant";
export { appendInstitutionalAuditEvent, listInstitutionalAuditEvents } from "./audit";
export {
  persistOperativeAuthoritySnapshot,
  getLatestOperativeAuthoritySnapshot,
  getOperativeAuthoritySnapshotById,
  listOperativeAuthorityHistory,
} from "./operative-authority";
export {
  persistContextRetrievalManifest,
  getContextRetrievalManifest,
  getContextRetrievalManifestById,
} from "./context-manifest";
export {
  persistFinancialEvidenceBundle,
  getLatestFinancialEvidenceBundle,
  getFinancialEvidenceBundleById,
  revokeFinancialEvidenceBundle,
} from "./financial-evidence";
export {
  persistUtilizationCompletenessRecord,
  getActiveCompletenessRecord,
  getProductionEligibleCompletenessRecord,
  revokeCompletenessRecord,
} from "./utilization-completeness";
export {
  persistCapacityCalculation,
  getLatestAuthorizedCapacityCalculation,
  getCapacityCalculationById,
  getCapacityCalculationByInputHash,
} from "./capacity-calculation";
export {
  persistTransactionSimulation,
  getTransactionSimulation,
  getTransactionSimulationById,
} from "./simulation";
export {
  invalidateDependentArtifacts,
  listInvalidationsForDependent,
  type InvalidatableEntityType,
} from "./invalidation";
