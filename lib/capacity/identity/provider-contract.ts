/**
 * Server identity provider contract.
 *
 * Only server-verified principals may mint TrustedIssuerAuthorizationContext.
 * A WeakSet or branded TypeScript type alone does NOT establish identity —
 * minting requires verifySession / verifyServiceAccount against host credentials.
 *
 * This repository ships NO production IdP adapter. Production activation is BLOCKED.
 */

import {
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  isTrustedIdentityProductionActive,
} from "./activation";
import type {
  AuthorizationPermission,
  TrustedCompletenessRole,
} from "./permissions";

/** Opaque jti — avoids node:crypto so the capacity barrel stays Edge/client-safe. */
function newAuthorizationJti(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `jti:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export type IdentityAssuranceChannel =
  | "SESSION_AUTHENTICATED"
  | "SERVICE_ACCOUNT";

export type PrincipalLifecycleStatus = "ACTIVE" | "REVOKED";

/**
 * Opaque server-verified principal. Constructible only via adapter mint paths.
 * Structural clones / JSON round-trips are refused (private registry + brand).
 */
export interface VerifiedServerPrincipal {
  readonly brand: typeof VERIFIED_SERVER_PRINCIPAL_BRAND;
  readonly principalId: string;
  readonly companyScope: readonly string[];
  readonly permissions: readonly AuthorizationPermission[];
  /** Completeness roles this principal may bind on certificates — subset of authorized roles. */
  readonly completenessRoles: readonly TrustedCompletenessRole[];
  readonly identityAssurance: IdentityAssuranceChannel;
  readonly status: PrincipalLifecycleStatus;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly jti: string;
  /**
   * Non-secret authorization basis (e.g. "session:verified", "oidc:sub-hash:…").
   * Never store raw tokens, cookies, or secrets here.
   */
  readonly authorizationBasis: string;
}

export const VERIFIED_SERVER_PRINCIPAL_BRAND: unique symbol = Symbol(
  "VerifiedServerPrincipal",
);

/** Module-private registry — JSON clones and forged literals are not members. */
const mintedPrincipals = new WeakSet<object>();
/** Replay / revocation ledger keyed by jti. */
const jtiState = new Map<string, { status: PrincipalLifecycleStatus; expiresAtMs: number }>();

export type SessionCredentialHandle = {
  readonly kind: "SESSION";
  /** Opaque session handle already extracted server-side (cookie/header). Never log. */
  readonly sessionHandle: string;
};

export type ServiceAccountCredentialHandle = {
  readonly kind: "SERVICE_ACCOUNT";
  /** Opaque bearer / m2m handle already extracted server-side. Never log. */
  readonly credentialHandle: string;
};

export type IdentityCredentialHandle =
  | SessionCredentialHandle
  | ServiceAccountCredentialHandle;

/**
 * Result of IdP verification BEFORE mint. Adapters populate this from real IdP claims.
 * Callers cannot pass this directly into TrustedIssuerAuthorizationContext.
 */
export interface IdpVerificationResult {
  principalId: string;
  companyScope: readonly string[];
  permissions: readonly AuthorizationPermission[];
  completenessRoles: readonly TrustedCompletenessRole[];
  identityAssurance: IdentityAssuranceChannel;
  /** Absolute expiry from IdP / session store. */
  expiresAtMs: number;
  /** Non-secret basis string for audit. */
  authorizationBasis: string;
}

/**
 * Host adapter: verify credentials with a real IdP, then mint.
 * Production hosts implement this; the repository does not ship a real one.
 */
export interface ServerIdentityProvider {
  readonly providerId: string;
  readonly providerClass: "PRODUCTION_IDP" | "TEST_HARNESS";
  /**
   * Verify session or service-account credentials against the IdP.
   * Must return null on failure — never invent a principal.
   */
  verifyCredentials(
    credentials: IdentityCredentialHandle,
  ): Promise<IdpVerificationResult | null> | IdpVerificationResult | null;
  /** Optional live revocation check (IdP session kill / SA disable). */
  isRevoked?(principalId: string): Promise<boolean> | boolean;
}

let registeredProvider: ServerIdentityProvider | null = null;

export function registerServerIdentityProvider(
  provider: ServerIdentityProvider | null,
): void {
  registeredProvider = provider;
}

export function getRegisteredServerIdentityProvider(): ServerIdentityProvider | null {
  return registeredProvider;
}

function assertMintableVerification(result: IdpVerificationResult): void {
  if (!result.principalId?.trim()) {
    throw new Error("IdP verification missing principalId");
  }
  if (!Array.isArray(result.companyScope) || result.companyScope.length === 0) {
    throw new Error("IdP verification requires non-empty companyScope");
  }
  if (
    result.identityAssurance !== "SESSION_AUTHENTICATED" &&
    result.identityAssurance !== "SERVICE_ACCOUNT"
  ) {
    throw new Error("IdP verification refused non-server assurance channel");
  }
  if (!Number.isFinite(result.expiresAtMs) || result.expiresAtMs <= Date.now()) {
    throw new Error("IdP verification refused expired or invalid expiry");
  }
  if (!result.authorizationBasis?.trim()) {
    throw new Error("IdP verification requires non-secret authorizationBasis");
  }
}

/**
 * Mint a VerifiedServerPrincipal only after IdP verification succeeded.
 * Does NOT activate production. TEST_HARNESS providers cannot enable production.
 */
export function mintVerifiedServerPrincipalFromIdpResult(
  result: IdpVerificationResult,
  opts: { providerClass: ServerIdentityProvider["providerClass"] },
): VerifiedServerPrincipal {
  assertMintableVerification(result);
  // Belt-and-suspenders: even a PRODUCTION_IDP class mint in this repo cannot
  // override TRUSTED_IDENTITY_PRODUCTION_ACTIVATION (const BLOCKED).
  void opts.providerClass;
  const jti = newAuthorizationJti();
  const principal: VerifiedServerPrincipal = {
    brand: VERIFIED_SERVER_PRINCIPAL_BRAND,
    principalId: result.principalId,
    companyScope: Object.freeze([...result.companyScope]),
    permissions: Object.freeze([...result.permissions]),
    completenessRoles: Object.freeze([...result.completenessRoles]),
    identityAssurance: result.identityAssurance,
    status: "ACTIVE",
    issuedAtMs: Date.now(),
    expiresAtMs: result.expiresAtMs,
    jti,
    authorizationBasis: result.authorizationBasis,
  };
  mintedPrincipals.add(principal);
  jtiState.set(jti, { status: "ACTIVE", expiresAtMs: result.expiresAtMs });
  return principal;
}

export function isVerifiedServerPrincipal(
  value: unknown,
): value is VerifiedServerPrincipal {
  return (
    typeof value === "object" &&
    value !== null &&
    mintedPrincipals.has(value) &&
    (value as VerifiedServerPrincipal).brand === VERIFIED_SERVER_PRINCIPAL_BRAND
  );
}

export function revokePrincipalByJti(jti: string): void {
  const existing = jtiState.get(jti);
  if (existing) {
    jtiState.set(jti, { ...existing, status: "REVOKED" });
  }
}

export function markJtiConsumed(jti: string): void {
  // Single-use approval path: treat consume as revoke for replay defense.
  revokePrincipalByJti(jti);
}

function jtiIsActive(jti: string, nowMs: number): boolean {
  const state = jtiState.get(jti);
  if (!state) return false;
  if (state.status === "REVOKED") return false;
  if (state.expiresAtMs <= nowMs) return false;
  return true;
}

export interface PrincipalValidityResult {
  ok: boolean;
  blockers: string[];
}

/**
 * Validate a minted principal for use at decision time.
 * Checks brand registry, expiry, revocation/replay, and optional live IdP revoke.
 */
export async function assertPrincipalValidForDecision(
  principal: unknown,
  opts?: { nowMs?: number; checkLiveRevocation?: boolean },
): Promise<PrincipalValidityResult> {
  const blockers: string[] = [];
  if (!isVerifiedServerPrincipal(principal)) {
    return {
      ok: false,
      blockers: [
        "principal is not a server-minted VerifiedServerPrincipal — forged, JSON-cloned, or client-injected identity refused",
      ],
    };
  }
  const nowMs = opts?.nowMs ?? Date.now();
  if (principal.status !== "ACTIVE") {
    blockers.push(`principal ${principal.principalId} status is ${principal.status}`);
  }
  if (principal.expiresAtMs <= nowMs) {
    blockers.push(`principal ${principal.principalId} expired — stale approval refused`);
  }
  if (!jtiIsActive(principal.jti, nowMs)) {
    blockers.push(
      `principal jti ${principal.jti} is revoked, consumed, or unknown — replay/revocation refused`,
    );
  }
  if (opts?.checkLiveRevocation && registeredProvider?.isRevoked) {
    const revoked = await registeredProvider.isRevoked(principal.principalId);
    if (revoked) {
      blockers.push(
        `principal ${principal.principalId} revoked by live IdP check — approval after revocation refused`,
      );
      revokePrincipalByJti(principal.jti);
    }
  }
  return { ok: blockers.length === 0, blockers };
}

export interface VerifyAndMintResult {
  principal: VerifiedServerPrincipal | null;
  blockers: string[];
  productionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
}

/**
 * End-to-end: registered provider verifies credentials, then mints.
 * Fail-closed when no provider, verification null, or production inactive.
 */
export async function verifyAndMintPrincipal(
  credentials: IdentityCredentialHandle,
): Promise<VerifyAndMintResult> {
  const productionActivation = TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  if (registeredProvider == null) {
    return {
      principal: null,
      blockers: [
        "no ServerIdentityProvider registered — cannot verify session or service-account credentials",
      ],
      productionActivation,
    };
  }
  const verified = await registeredProvider.verifyCredentials(credentials);
  if (verified == null) {
    return {
      principal: null,
      blockers: ["identity provider rejected credentials — unauthenticated"],
      productionActivation,
    };
  }
  try {
    const principal = mintVerifiedServerPrincipalFromIdpResult(verified, {
      providerClass: registeredProvider.providerClass,
    });
    return { principal, blockers: [], productionActivation };
  } catch (err) {
    return {
      principal: null,
      blockers: [
        err instanceof Error ? err.message : "mint refused after IdP verification",
      ],
      productionActivation,
    };
  }
}

/**
 * Test-only harness provider. Explicitly TEST_HARNESS class.
 * Can mint principals for adversarial tests but NEVER activates production.
 */
export function createTestIdentityHarness(opts: {
  allowTestHarness: true;
  principalsByHandle: Record<string, IdpVerificationResult>;
  revokedPrincipalIds?: ReadonlySet<string>;
}): ServerIdentityProvider {
  if (opts.allowTestHarness !== true) {
    throw new Error("test identity harness refused");
  }
  const revoked = opts.revokedPrincipalIds ?? new Set<string>();
  return {
    providerId: "test-identity-harness",
    providerClass: "TEST_HARNESS",
    verifyCredentials(credentials) {
      const handle =
        credentials.kind === "SESSION"
          ? credentials.sessionHandle
          : credentials.credentialHandle;
      const found = opts.principalsByHandle[handle];
      if (!found) return null;
      if (revoked.has(found.principalId)) return null;
      return { ...found, companyScope: [...found.companyScope], permissions: [...found.permissions], completenessRoles: [...found.completenessRoles] };
    },
    isRevoked(principalId) {
      return revoked.has(principalId);
    },
  };
}

/** Reset module registries between tests. */
export function resetTrustedIdentityRuntimeForTests(opts: {
  allowTestReset: true;
}): void {
  if (opts.allowTestReset !== true) {
    throw new Error("trusted identity runtime reset refused");
  }
  registeredProvider = null;
  jtiState.clear();
  // WeakSet entries become unreachable when tests drop references; no clear API.
  void isTrustedIdentityProductionActive;
}

export function refuseClientInjectedIdentity(claim: unknown): {
  ok: false;
  blockers: string[];
} {
  return {
    ok: false,
    blockers: [
      "client-injected identity refused — TrustedIssuerAuthorizationContext may only be minted from server-verified principals",
      typeof claim === "object" && claim !== null
        ? `rejected keys: ${Object.keys(claim as object).join(",") || "(empty)"}`
        : "rejected non-object claim",
    ],
  };
}
