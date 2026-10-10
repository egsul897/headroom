# Production IdP / membership / session integration — separate workstream

**Status:** NOT STARTED — blocked on real platform auth  
**Owner:** next platform / security remediation agent  
**Depends on:** Agent #8 trusted-identity boundary (`lib/capacity/identity/*`, PR #282) + HEADROOM-2 host mint (`lib/capacity/trusted-issuer-host.ts`, merged via #273/#279)  
**Does not:** invent a mock production IdP in this repository

## Why this is a separate workstream

Agent #8 delivered a fail-closed **adapter contract**, discrete **authorization permissions**, **audit**, and adversarial tests. It deliberately does **not** implement a login provider, session store, org membership DB, or service-account verifier.

`TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED"` and `TRUSTED_ISSUER_ACTIVATION.status === "BLOCKED"` until this workstream lands a real IdP.

Related prior handoff (still valid, now strengthened): `docs/integration/handoffs/05-production-identity-provider.md`.

## Required integrations

### 1. Real identity provider
- Choose and wire one production IdP (OIDC/SAML or first-party session store) — e.g. Auth.js / Clerk / Auth0 / custom session cookie backed by a server session table.
- Server-only credential verification: session cookie or m2m bearer → `ServerIdentityProvider.verifyCredentials`.
- Configure issuer URL, audience, JWKS (or session verifier) via **host environment variables** — never commit secrets; never log raw tokens.

### 2. Membership / tenant scope
- Persist User ↔ Company membership with explicit permission grants (not “admin ⇒ everything”).
- Map IdP claims → `AuthorizationPermission` + `companyScope` + optional `completenessRoles`.
- Every capacity / evidence decision must pass `companyId ∈ companyScope`.

### 3. Session validation
- Replace free-text `ReviewerNameField` / `reviewedBy` string authority for production paths.
- Untrusted reviewer strings must continue to fail closed for production authority (they may remain as audit labels only).

### 4. Dual mint bridge
Production hosts must satisfy **both** surfaces without weakening either:

| Surface | Module | Gate |
|---|---|---|
| WeakSet host mint (HEADROOM-2) | `trusted-issuer-host.ts` | `TRUSTED_ISSUER_ACTIVATION` |
| IdP-verified principal + permissions (Agent #8) | `identity/*` | `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION` |

Recommended boot path:
1. Implement `ServerIdentityProvider` against the real IdP.
2. On each server request: `verifyAndMintPrincipal` → `authorizeDecision` / `mintTrustedIssuerAuthorizationContext`.
3. Optionally adapt the verified principal into `HostVerifiedIdentity` via a **server-only** production mint helper inside `trusted-issuer-host` (not `mintHostVerifiedIdentityForTests`).
4. Only after ops sign-off flip both activation constants to `ACTIVE` in a dedicated, reviewed change.

### 5. Revocation / replay
- Live session kill / SA disable via `isRevoked`.
- Short TTL + `jti` consume for approval decisions.

### 6. Audit
- Persist `AuthorizationAuditRecord` fields (principal, company, decision, time, evidence id, basis) to durable storage.

## Acceptance (this workstream)

- With real IdP + membership + AUTHENTIC cert + completeness + both activations ACTIVE: production-authoritative remaining / `mayUseAsProductionCapacityInput` can succeed in a controlled environment.
- Without IdP / without membership scope / with client-injected credentials / with test harness only: unchanged fail-closed.
- Untrusted reviewer strings, client credentials, JSON clones, and fixture identities never activate production authority.
- No secrets in repo or logs.

## Explicit non-goals

- Fixture-based production activation
- Weakening fail-closed gates for demo AVAILABLE
- Broad IdP product UI redesign (can follow after server path works)
- Self-merge of activation flips
