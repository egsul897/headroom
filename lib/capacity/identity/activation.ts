/**
 * Fail-closed production activation for trusted identity.
 *
 * Repository state: BLOCKED. No production IdP is wired. Test harnesses and
 * WeakSet/branded object tricks MUST NOT flip this to ACTIVE.
 */

export type TrustedIdentityActivationStatus = "ACTIVE" | "BLOCKED";

export interface TrustedIdentityActivationState {
  readonly status: TrustedIdentityActivationStatus;
  readonly reason: string;
  readonly requirements: readonly string[];
}

/**
 * Concrete deployment requirements before production activation may be considered.
 * Satisfying docs alone does not activate — a real adapter + host config is required.
 */
export const TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS = [
  "Register a ServerIdentityProvider implementation that verifies sessions or service accounts against a real IdP (OIDC/SAML/session store) — never certificate JSON or client role strings",
  "Configure IdP issuer URL, audience, and JWKS (or equivalent session verifier) via host environment — never commit secrets",
  "Map IdP claims → AuthorizationPermission grants explicitly per company scope; do not expand org-member/admin/lawyer into every permission",
  "Enforce tenant isolation: every decision carries companyId that must be in the principal's companyScope",
  "Enforce revocation + expiry: revoked/expired principals refuse; approval tokens are single-use or short-TTL with jti replay protection",
  "Wire authorizeDecision / mintTrustedIssuerAuthorizationContext only on server routes after verifyAndMint",
  "Emit AuthorizationAuditRecord for every decision (principal, company, decision, time, evidence id, basis)",
  "Keep SYNTHETIC / TEST_FIXTURE / demo registries out of production requireNonFixtureIdentity paths",
] as const;

/**
 * Repository-level production activation. Intentionally a const object that
 * cannot be mutated into ACTIVE by registering a test provider.
 */
export const TRUSTED_IDENTITY_PRODUCTION_ACTIVATION: TrustedIdentityActivationState = {
  status: "BLOCKED",
  reason:
    "No production identity provider is present in this repository. Login is a free-text reviewer name (localStorage); there is no lib/auth.ts, no session store, and no service-account verifier. Production trusted-identity authority remains fail-closed.",
  requirements: TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS,
};

export function isTrustedIdentityProductionActive(): boolean {
  return TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "ACTIVE";
}

/** Machine-readable inventory of what actually exists today. */
export const TRUSTED_IDENTITY_INVENTORY = {
  contractVersion: "trusted-identity-boundary.v1",
  inspectedAtCommitHint: "post-#268 main",
  loginSessionProvider: {
    present: false,
    detail:
      "No NextAuth/Clerk/Auth0/Lucia/iron-session (or equivalent) module. Onboarding review uses ReviewerNameField free-text + localStorage.",
  },
  serverSideSessionValidation: {
    present: false,
    detail: "reviewedBy is a required string; MissingReviewerError if blank — not cryptographic session validation.",
  },
  organizationMembership: {
    present: "partial",
    detail:
      "Company rows + tenantKind (CUSTOMER|EVALUATION) exist; no User/Membership/Role tables for org RBAC.",
  },
  reviewerAuthorization: {
    present: "string-label-only",
    detail:
      "CandidateReviewEvent.reviewedBy and CompletenessIssuerRole are labels. No server-verified reviewer role store.",
  },
  serviceAccountAuthentication: {
    present: false,
    detail: "No service-account credential verifier or m2m token path for trusted issuer minting.",
  },
  tenantIsolation: {
    present: "parameter-scoped",
    detail:
      "Most loaders take companyId as a parameter; cross-tenant enforcement is not bound to an authenticated principal.",
  },
  auditLogging: {
    present: "partial",
    detail:
      "CandidateReviewEvent / claim-review logs exist for onboarding; no verified-principal authorization audit for capacity approvals.",
  },
  trustedIssuerAuthorizationContext: {
    present: true,
    detail:
      "lib/capacity/completeness-issuer-auth.ts evaluates principals when supplied; host minting of those principals was unwired / fail-closed.",
  },
  productionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
} as const;
