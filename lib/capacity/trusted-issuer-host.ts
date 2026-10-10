/**
 * Bounded host wiring for TrustedIssuerAuthorizationContext (HEADROOM-2 Scope C).
 *
 * Production identity MUST come from a host-verified session or service-account
 * principal. This module never constructs trusted identity from:
 *   - a certificate's claimed role
 *   - fixture metadata
 *   - user-supplied JSON
 *   - a client-side assertion
 *   - a hardcoded test actor
 *
 * Activation status: BLOCKED until a real HostIdentityProvider is registered by
 * the production host. Until then, resolveTrustedIssuerAuthFromHost fails closed.
 */

import {
  productionTrustedIssuerAuth,
  type CompletenessIdentityAssurance,
  type CompletenessIssuerPrincipal,
  type TrustedIssuerAuthorizationContext,
} from "./completeness-issuer-auth";
import type { CompletenessIssuerRole } from "./utilization-types";

/**
 * Host-verified identity. Only mint helpers / provider implementations that
 * register into the WeakSet may produce accepted principals. Plain object
 * literals from certificates / fixtures / request JSON are rejected.
 */
export interface HostVerifiedIdentity {
  readonly actorId: string;
  readonly authorizedRoles: readonly CompletenessIssuerRole[];
  readonly identityAssurance: Exclude<
    CompletenessIdentityAssurance,
    "TEST_FIXTURE_REGISTRY"
  >;
  readonly status: "ACTIVE";
}

/** Runtime registry of minted host identities — structural clones are refused. */
const mintedHostIdentities = new WeakSet<object>();

export interface HostIdentityProvider {
  /**
   * Resolve the current request / job principal from the host auth system.
   * Returns null when unauthenticated. Must not invent principals.
   * Implementations must mint via mintHostVerifiedIdentityForTests (tests) or
   * the internal mint helper used by production adapters.
   */
  verifyCurrentPrincipal(): HostVerifiedIdentity | null;
}

/** Activation status for production trusted-issuer wiring. */
export type TrustedIssuerActivationStatus = "ACTIVE" | "BLOCKED";

export const TRUSTED_ISSUER_ACTIVATION: {
  status: TrustedIssuerActivationStatus;
  blocker: string;
} = {
  status: "BLOCKED",
  blocker:
    "No production HostIdentityProvider is registered — session/service-account identity cannot be verified in this repository surface. Production trusted-issuer authority remains fail-closed.",
};

let registeredProvider: HostIdentityProvider | null = null;

/**
 * Register the host identity provider. Production hosts call this once at boot
 * with a real session/service-account verifier. Tests may register a provider
 * that mints HostVerifiedIdentity only through mintHostVerifiedIdentityForTests.
 */
export function registerHostIdentityProvider(provider: HostIdentityProvider | null): void {
  registeredProvider = provider;
}

export function getRegisteredHostIdentityProvider(): HostIdentityProvider | null {
  return registeredProvider;
}

function mintHostVerifiedIdentity(principal: {
  actorId: string;
  authorizedRoles: readonly CompletenessIssuerRole[];
  identityAssurance: "SESSION_AUTHENTICATED" | "SERVICE_ACCOUNT";
}): HostVerifiedIdentity {
  if (!principal.actorId?.trim()) {
    throw new Error("host verified identity requires actorId");
  }
  if (
    principal.identityAssurance !== "SESSION_AUTHENTICATED" &&
    principal.identityAssurance !== "SERVICE_ACCOUNT"
  ) {
    throw new Error("host verified identity refuses TEST_FIXTURE_REGISTRY assurance");
  }
  const identity: HostVerifiedIdentity = {
    actorId: principal.actorId,
    authorizedRoles: [...principal.authorizedRoles],
    identityAssurance: principal.identityAssurance,
    status: "ACTIVE",
  };
  mintedHostIdentities.add(identity);
  return identity;
}

/**
 * Test-only mint. Production adapters should use the same WeakSet registration
 * path via a dedicated host adapter module when one exists — never certificate JSON.
 */
export function mintHostVerifiedIdentityForTests(
  principal: {
    actorId: string;
    authorizedRoles: readonly CompletenessIssuerRole[];
    identityAssurance: "SESSION_AUTHENTICATED" | "SERVICE_ACCOUNT";
  },
  opts: { allowTestMint: true },
): HostVerifiedIdentity {
  if (opts.allowTestMint !== true) {
    throw new Error("host verified identity mint refused");
  }
  return mintHostVerifiedIdentity(principal);
}

function isHostVerifiedIdentity(value: unknown): value is HostVerifiedIdentity {
  return typeof value === "object" && value !== null && mintedHostIdentities.has(value);
}

/**
 * Refuse plain JSON / certificate-shaped claims that look like issuers.
 * Structural lookalikes without WeakSet registration are never accepted.
 */
export function refuseUntrustedIssuerClaim(claim: unknown): {
  ok: false;
  blockers: string[];
} {
  return {
    ok: false,
    blockers: [
      "untrusted issuer claim refused — trusted identity cannot be constructed from certificate role, fixture metadata, user-supplied JSON, or client assertion",
      typeof claim === "object" && claim !== null
        ? `rejected claim keys: ${Object.keys(claim as object).join(",") || "(empty)"}`
        : "rejected non-object claim",
    ],
  };
}

/**
 * Build production TrustedIssuerAuthorizationContext from host-verified identities only.
 * Fail-closed when the WeakSet brand is missing or assurance is fixture-grade.
 */
export function trustedIssuerAuthFromHostIdentities(
  identities: readonly HostVerifiedIdentity[],
): TrustedIssuerAuthorizationContext | null {
  if (identities.length === 0) return null;
  const principals: CompletenessIssuerPrincipal[] = [];
  for (const id of identities) {
    if (!isHostVerifiedIdentity(id)) {
      return null;
    }
    if (id.status !== "ACTIVE") return null;
    if (
      id.identityAssurance !== "SESSION_AUTHENTICATED" &&
      id.identityAssurance !== "SERVICE_ACCOUNT"
    ) {
      return null;
    }
    principals.push({
      actorId: id.actorId,
      authorizedRoles: [...id.authorizedRoles],
      identityAssurance: id.identityAssurance,
      status: "ACTIVE",
    });
  }
  return productionTrustedIssuerAuth(principals);
}

export interface ResolveTrustedIssuerAuthResult {
  auth: TrustedIssuerAuthorizationContext | null;
  activation: TrustedIssuerActivationStatus;
  blockers: string[];
}

/**
 * Resolve trusted issuer auth from the registered host provider.
 * When no provider is registered (current production state), returns BLOCKED
 * with null auth — callers must fail closed.
 */
export function resolveTrustedIssuerAuthFromHost(): ResolveTrustedIssuerAuthResult {
  if (registeredProvider == null) {
    return {
      auth: null,
      activation: "BLOCKED",
      blockers: [TRUSTED_ISSUER_ACTIVATION.blocker],
    };
  }
  const identity = registeredProvider.verifyCurrentPrincipal();
  if (identity == null) {
    return {
      auth: null,
      activation: "BLOCKED",
      blockers: ["host identity provider returned no authenticated principal"],
    };
  }
  if (!isHostVerifiedIdentity(identity)) {
    return {
      auth: null,
      activation: "BLOCKED",
      blockers: [
        "host identity provider returned an unbranded principal — refused (possible forged object)",
      ],
    };
  }
  const auth = trustedIssuerAuthFromHostIdentities([identity]);
  if (auth == null) {
    return {
      auth: null,
      activation: "BLOCKED",
      blockers: ["failed to build TrustedIssuerAuthorizationContext from host identity"],
    };
  }
  // Provider is registered and returned a branded principal — local activation
  // for this resolution is ACTIVE. Repository-level TRUSTED_ISSUER_ACTIVATION
  // remains BLOCKED until a production provider is permanently wired.
  return { auth, activation: "ACTIVE", blockers: [] };
}
