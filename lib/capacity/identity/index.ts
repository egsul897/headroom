/**
 * Trusted identity boundary (HEADROOM Agent #8).
 *
 * Ownership: authentication adapter contract, authorization boundary, security tests.
 * Does not implement financial extraction or covenant compilation.
 */

export {
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS,
  TRUSTED_IDENTITY_INVENTORY,
  isTrustedIdentityProductionActive,
  type TrustedIdentityActivationStatus,
  type TrustedIdentityActivationState,
} from "./activation";

export {
  AUTHORIZATION_PERMISSIONS,
  DECISION_REQUIRED_PERMISSION,
  PERMISSION_BUNDLES,
  hasPermission,
  permissionForDecision,
  type AuthorizationPermission,
  type AuthorizationDecisionKind,
  type TrustedCompletenessRole,
} from "./permissions";

export {
  VERIFIED_SERVER_PRINCIPAL_BRAND,
  registerServerIdentityProvider,
  getRegisteredServerIdentityProvider,
  mintVerifiedServerPrincipalFromIdpResult,
  isVerifiedServerPrincipal,
  revokePrincipalByJti,
  markJtiConsumed,
  assertPrincipalValidForDecision,
  verifyAndMintPrincipal,
  createTestIdentityHarness,
  resetTrustedIdentityRuntimeForTests,
  refuseClientInjectedIdentity,
  type IdentityAssuranceChannel,
  type PrincipalLifecycleStatus,
  type VerifiedServerPrincipal,
  type SessionCredentialHandle,
  type ServiceAccountCredentialHandle,
  type IdentityCredentialHandle,
  type IdpVerificationResult,
  type ServerIdentityProvider,
  type PrincipalValidityResult,
  type VerifyAndMintResult,
} from "./provider-contract";

export {
  recordAuthorizationAudit,
  getAuthorizationAuditLog,
  clearAuthorizationAuditLogForTests,
  type AuthorizationAuditRecord,
} from "./audit";

export {
  mintTrustedIssuerAuthorizationContext,
  refuseUntrustedTrustedIssuerConstruction,
  type MintTrustedIssuerAuthResult,
} from "./bridge";

export {
  authorizeDecision,
  type AuthorizeDecisionRequest,
  type AuthorizeDecisionResult,
} from "./authorize-decision";

/** Success marker for Agent #8 mission closeout. */
export const TRUSTED_IDENTITY_BOUNDARY_VERIFIED = "TRUSTED_IDENTITY_BOUNDARY_VERIFIED" as const;
