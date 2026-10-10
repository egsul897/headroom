export type {
  UtilizationKnowledgeKind,
  UtilizationRecordKind,
  UtilizationEvidenceRecord,
  UtilizationCompletenessCertificate,
  UtilizationResolution,
  CompletenessIssuerRole,
} from "./utilization-types";
export {
  resolveUtilization,
  evidenceFromAttributedLedger,
  type ResolveUtilizationArgs,
} from "./utilization-resolver";
export {
  computeVerifiedRemaining,
  type GrossCapacityInput,
  type VerifiedRemainingResult,
  type RemainingClaimStatus,
  type CapacityPublicationLabel,
  type ComputeVerifiedRemainingArgs,
} from "./verified-remaining";
export {
  toProductCapacityView,
  buildSharedProductCapacityViews,
  assertProductCapacityConsistency,
  refuseAuthoritativeRemaining,
  type ProductSurface,
  type ProductCapacityView,
} from "./product-capacity-view";
export {
  decideSolverUtilizationAuthority,
  authorityFromUtilizationResolution,
  assertMayPublishRemaining,
  evaluateCompletenessForRemainingClaim,
  productionAuthorityOk,
  type UtilizationAuthorityKind,
  type UtilizationAuthorityDecision,
  type SolverUsageObservation,
  type SolverCompletenessCertInput,
} from "./utilization-authority";
export {
  authorizeCompletenessIssuer,
  productionTrustedIssuerAuth,
  demoTrustedIssuerAuth,
  sessionCounselPrincipal,
  sessionCustodianPrincipal,
  type CompletenessIssuerPrincipal,
  type CompletenessIdentityAssurance,
  type TrustedIssuerAuthorizationContext,
  type IssuerAuthorizationResult,
} from "./completeness-issuer-auth";
/** Thin joint marker — does not invent a parallel authority path. */
export {
  REMAINING_AUTHORITY_CONTRACT_VERSION,
  mayPublishRemainingCapacity,
  type RemainingRefusalReason,
} from "./remaining-authority";
export {
  validateFinancialMetricEvidence,
  validateAuthenticatedFinancialSnapshot,
  type FinancialMetricKey,
  type FinancialMetricEvidence,
  type AuthenticatedFinancialSnapshotEvidence,
  type FinancialEvidenceValidationResult,
  type FinancialVerificationStatus,
  type AmendmentRestatementStatus,
  type FinancialEvidenceAuthenticity,
  type FinancialEvidenceRefusalReason,
} from "./financial-evidence";
export {
  TRUSTED_ISSUER_ACTIVATION,
  registerHostIdentityProvider,
  getRegisteredHostIdentityProvider,
  mintHostVerifiedIdentityForTests,
  refuseUntrustedIssuerClaim,
  trustedIssuerAuthFromHostIdentities,
  resolveTrustedIssuerAuthFromHost,
  type HostVerifiedIdentity,
  type HostIdentityProvider,
  type TrustedIssuerActivationStatus,
  type ResolveTrustedIssuerAuthResult,
} from "./trusted-issuer-host";
export {
  VERIFIED_INPUT_CONTRACT_VERSION,
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
  type VerifiedInputTrustClass,
  type VerifiedCapacityInputHandoff,
  type BuildVerifiedCapacityInputArgs,
  type VerifiedUtilizationHandoffInput,
} from "./verified-input-contract";
/** Agent #9 statement ingestion + utilization reconstruction (feeds Agent #2 contract). */
export {
  normalizeFinancialStatementEvidence,
  statementBalancesDoNotEstablishBasketAttribution,
  type AccountingDefinitionBasis,
  type FinancialStatementFamily,
  type FinancialMetricAdjustment,
  type StatementCapacityMetricKey,
  type RawFinancialStatementLine,
  type StatementMetricDefinitionMapping,
  type FinancialStatementIngestionInput,
  type FinancialStatementIngestionResult,
  type StatementIngestionRefusalReason,
  type StatementNormalizationTraceEntry,
} from "./financial-statement-ingestion";
export {
  reconstructUtilizationEvidence,
  toVerifiedUtilizationHandoffInput,
  type HistoricalUtilizationEventKind,
  type HistoricalUtilizationEvent,
  type SupersessionTreatment,
  type UtilizationCompletenessLayer,
  type UtilizationReconstructionInput,
  type UtilizationReconstructionResult,
  type AttributedUtilizationUsage,
  type UtilizationReconstructionTraceEntry,
} from "./utilization-evidence-reconstruction";
/**
 * Trusted identity boundary (Agent #8) — fail-closed until a real IdP adapter
 * is activated. Stronger than WeakSet-only host minting: requires
 * ServerIdentityProvider.verifyCredentials + discrete permissions + audit.
 * Does not weaken TRUSTED_ISSUER_ACTIVATION / evaluateCompletenessForRemainingClaim.
 */
export {
  TRUSTED_IDENTITY_BOUNDARY_VERIFIED,
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS,
  TRUSTED_IDENTITY_INVENTORY,
  isTrustedIdentityProductionActive,
  AUTHORIZATION_PERMISSIONS,
  PERMISSION_BUNDLES,
  authorizeDecision,
  verifyAndMintPrincipal,
  mintTrustedIssuerAuthorizationContext,
  registerServerIdentityProvider,
  createTestIdentityHarness,
  resetTrustedIdentityRuntimeForTests,
  refuseClientInjectedIdentity,
  refuseUntrustedTrustedIssuerConstruction,
  getAuthorizationAuditLog,
  clearAuthorizationAuditLogForTests,
  type AuthorizationPermission,
  type AuthorizationDecisionKind,
  type VerifiedServerPrincipal,
  type ServerIdentityProvider,
  type IdpVerificationResult,
  type AuthorizeDecisionResult,
  type TrustedIdentityActivationState,
} from "./identity";
