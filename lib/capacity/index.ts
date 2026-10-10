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
/** Trusted identity boundary — fail-closed until a real IdP adapter is activated. */
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
