# Trusted identity boundary (HEADROOM Agent #8)

**Status:** binding for production identity → `TrustedIssuerAuthorizationContext`  
**Contract version:** `trusted-identity-boundary.v1`  
**Implementation:** `lib/capacity/identity/*`  
**Success marker:** `TRUSTED_IDENTITY_BOUNDARY_VERIFIED`  
**Production activation:** **BLOCKED**

## Identity inventory (as inspected)

| Capability | Present? | Notes |
|---|---|---|
| Login / session provider | **No** | No NextAuth/Clerk/Auth0/Lucia/`lib/auth.ts`. Review UI uses free-text `ReviewerNameField` + `localStorage`. |
| Server-side session validation | **No** | `reviewedBy` is a required string (`MissingReviewerError` if blank), not a verified session. |
| Organization / company membership | **Partial** | `Company` + `tenantKind`; no User/Membership/RBAC tables. |
| Reviewer authorization | **String label only** | `CandidateReviewEvent.reviewedBy`, `CompletenessIssuerRole` — not server-verified roles. |
| Service-account authentication | **No** | No m2m / SA verifier wired to trusted issuer minting. |
| Tenant isolation | **Parameter-scoped** | Loaders take `companyId`; not bound to an authenticated principal. |
| Audit logging | **Partial** | Onboarding review events exist; capacity authorization audit is new in this boundary. |
| `TrustedIssuerAuthorizationContext` | **Yes (consumer)** | `completeness-issuer-auth.ts` evaluates when supplied; host minting was unwired. |

**Do not assume a production IdP exists.** This repository does not invent one.

## Authority rules

1. Only server-verified principals (`VerifiedServerPrincipal`) may mint `TrustedIssuerAuthorizationContext`.
2. A WeakSet or branded TypeScript type alone does **not** establish identity — minting requires `ServerIdentityProvider.verifyCredentials` against session/service-account handles.
3. Permissions are discrete:
   - `UPLOAD_DOCUMENTS`
   - `SUBMIT_EVIDENCE`
   - `REVIEW_EVIDENCE`
   - `APPROVE_FINANCIAL_METRICS`
   - `CERTIFY_UTILIZATION_COMPLETENESS`
   - `AUTHORIZE_PRODUCTION_CAPACITY`
4. Lawyer / admin / organization member labels do **not** automatically receive every permission.
5. Certifying utilization completeness ≠ authorizing production capacity.
6. Cross-tenant `companyId` outside `companyScope` is refused.
7. Expired, revoked, or replayed (`jti` consumed) principals are refused.
8. Client-injected role strings, certificate JSON, and fixture registries cannot mint trusted auth.
9. `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED"` — test harnesses cannot flip production activation.

## Adapter contract

```ts
interface ServerIdentityProvider {
  providerId: string;
  providerClass: "PRODUCTION_IDP" | "TEST_HARNESS";
  verifyCredentials(credentials: IdentityCredentialHandle): IdpVerificationResult | null;
  isRevoked?(principalId: string): boolean | Promise<boolean>;
}
```

Host boot (future, not shipped):

1. Implement `ServerIdentityProvider` against a real IdP (OIDC/SAML/session store).
2. `registerServerIdentityProvider(provider)`.
3. On each server route: extract opaque session/SA handle → `verifyAndMintPrincipal` → `authorizeDecision`.
4. Pass minted `trustedIssuerAuth` into utilization / remaining gates.
5. Only after real IdP wiring + ops sign-off may `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION` become `ACTIVE` (code change outside this fail-closed default).

## Deployment requirements

See `TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS` in `lib/capacity/identity/activation.ts`:

1. Real IdP session / service-account verification (not certificate JSON).
2. Configure issuer URL, audience, JWKS (or session verifier) via host env — **no secrets in code or logs**.
3. Explicit IdP claim → `AuthorizationPermission` mapping per company scope.
4. Tenant isolation on every decision.
5. Revocation + expiry + `jti` replay protection.
6. Server-route-only minting after `verifyAndMint`.
7. `AuthorizationAuditRecord` for every decision (principal, company, decision, time, evidence id, basis).
8. Keep synthetic/fixture registries out of production `requireNonFixtureIdentity` paths.

## Security properties enforced in tests

| Attack | Defense |
|---|---|
| Client-side authority injection | `refuseClientInjectedIdentity` / brand registry |
| Role-string forgery | Permissions checked independently of certificate `issuer.role` |
| Cross-tenant approval | `companyScope` must include decision `companyId` |
| Replay of stale approvals | `expiresAtMs` + `jti` consume/revoke |
| Privilege escalation | Discrete permissions; counsel ≠ production capacity |
| Approval after revocation | `jti` revoke + optional live `isRevoked` |
| Synthetic fixture activation | Production activation const remains BLOCKED |
| Confused-deputy | Provider must verify credentials; callers cannot pass raw IdP JSON into context mint |

## Relation to PR #268 / #273 / #279

- **#268 (merged):** authenticity + trusted-issuer *evaluation* on main.
- **#273 / #279 (merged):** financial-evidence contract + WeakSet `trusted-issuer-host` + `verified-input-contract`. `TRUSTED_ISSUER_ACTIVATION = BLOCKED`.
- **This boundary (Agent #8 / #282):** stronger IdP verification + discrete permissions + audit + tenant/replay/revocation. Coexists with `trusted-issuer-host`; production capacity input requires **both** activations ACTIVE. Does not invent a fake production IdP.

## Separate workstream

Real IdP / membership / session wiring is **out of scope** here. See:

`docs/intelligence-factory/PRODUCTION-IDP-INTEGRATION-WORKSTREAM.md`

(also extends `docs/integration/handoffs/05-production-identity-provider.md`).

## Explicit non-claims

- No production IdP implementation
- No production secrets
- No production Neon writes
- No auto-merge / self-merge
- No bypass of human review
- No financial extraction or covenant compilation in this workstream

## Verdict

`TRUSTED_IDENTITY_BOUNDARY_VERIFIED`  
**Production activation:** `BLOCKED`
