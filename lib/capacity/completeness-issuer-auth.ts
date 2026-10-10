/**
 * Trusted identity / authorization for completeness-certificate issuers.
 *
 * A certificate's `issuer.role` field is NEVER sufficient on its own.
 * Production remaining-capacity authority requires that the certificate's
 * `issuer.actorId` resolve in a trusted principal registry with the claimed
 * role among that principal's authorizedRoles, and with non-fixture
 * identity assurance (SESSION_AUTHENTICATED or SERVICE_ACCOUNT).
 *
 * Callers cannot forge authority by stuffing COUNSEL_REVIEWER into a
 * certificate — the authorization context must independently confirm it.
 */
import type { CompletenessIssuerRole } from "./utilization-types";

/** How the principal's identity was established outside the certificate blob. */
export type CompletenessIdentityAssurance =
  | "SESSION_AUTHENTICATED"
  | "SERVICE_ACCOUNT"
  | "TEST_FIXTURE_REGISTRY";

export interface CompletenessIssuerPrincipal {
  actorId: string;
  /**
   * Roles this principal is authorized to exercise — sourced from the
   * identity / RBAC store, not from the certificate under evaluation.
   */
  authorizedRoles: CompletenessIssuerRole[];
  identityAssurance: CompletenessIdentityAssurance;
  status: "ACTIVE" | "REVOKED";
}

/**
 * Trusted authorization context supplied by the host — never constructed
 * from the certificate itself.
 */
export interface TrustedIssuerAuthorizationContext {
  /**
   * Principals looked up from the trusted identity/authorization store
   * for the actorId(s) under consideration.
   */
  principals: readonly CompletenessIssuerPrincipal[];
  /**
   * When true (required for PRODUCTION), reject TEST_FIXTURE_REGISTRY
   * and SYSTEM_FIXTURE principals even if listed.
   */
  requireNonFixtureIdentity: boolean;
}

export interface IssuerAuthorizationResult {
  ok: boolean;
  blockers: string[];
  matchedPrincipal: CompletenessIssuerPrincipal | null;
}

/**
 * Authorize a certificate's claimed issuer against the trusted identity store.
 * Fail-closed: missing principal, revoked, role mismatch, or fixture identity
 * under production requirements all refuse.
 */
export function authorizeCompletenessIssuer(
  claimed: { actorId: string; role: CompletenessIssuerRole },
  auth: TrustedIssuerAuthorizationContext | null | undefined,
): IssuerAuthorizationResult {
  const blockers: string[] = [];
  if (auth == null) {
    return {
      ok: false,
      blockers: [
        "trusted issuer authorization context missing — caller-supplied issuer.role alone cannot establish completeness authority",
      ],
      matchedPrincipal: null,
    };
  }
  if (!claimed.actorId || claimed.actorId.trim() === "") {
    return {
      ok: false,
      blockers: ["issuer actorId missing — cannot bind to trusted identity"],
      matchedPrincipal: null,
    };
  }

  const matches = auth.principals.filter((p) => p.actorId === claimed.actorId);
  if (matches.length === 0) {
    return {
      ok: false,
      blockers: [
        `issuer actorId "${claimed.actorId}" not found in trusted identity/authorization registry — forged or unauthorized issuer`,
      ],
      matchedPrincipal: null,
    };
  }

  const principal = matches[0]!;
  if (principal.status === "REVOKED") {
    blockers.push(`issuer actorId "${claimed.actorId}" is REVOKED in trusted registry`);
  }
  if (!principal.authorizedRoles.includes(claimed.role)) {
    blockers.push(
      `issuer actorId "${claimed.actorId}" is not authorized for role ${claimed.role} (authorized: ${principal.authorizedRoles.join(",") || "none"}) — certificate role field is not independently trusted`,
    );
  }
  if (auth.requireNonFixtureIdentity) {
    if (principal.identityAssurance === "TEST_FIXTURE_REGISTRY") {
      blockers.push(
        "TEST_FIXTURE_REGISTRY identity cannot establish production completeness authority",
      );
    }
    if (claimed.role === "SYSTEM_FIXTURE") {
      blockers.push("SYSTEM_FIXTURE role cannot establish production completeness authority");
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    matchedPrincipal: blockers.length === 0 ? principal : principal,
  };
}

/** Production host context: only session/service-account principals qualify. */
export function productionTrustedIssuerAuth(
  principals: readonly CompletenessIssuerPrincipal[],
): TrustedIssuerAuthorizationContext {
  return {
    principals,
    requireNonFixtureIdentity: true,
  };
}

/** Demo / unit-test registry — never production-authoritative. */
export function demoTrustedIssuerAuth(
  principals: readonly CompletenessIssuerPrincipal[] = [
    {
      actorId: "demo-fixture",
      authorizedRoles: ["SYSTEM_FIXTURE"],
      identityAssurance: "TEST_FIXTURE_REGISTRY",
      status: "ACTIVE",
    },
  ],
): TrustedIssuerAuthorizationContext {
  return {
    principals,
    requireNonFixtureIdentity: false,
  };
}

/** Build a session-authenticated counsel principal for tests / wiring. */
export function sessionCounselPrincipal(actorId: string): CompletenessIssuerPrincipal {
  return {
    actorId,
    authorizedRoles: ["COUNSEL_REVIEWER"],
    identityAssurance: "SESSION_AUTHENTICATED",
    status: "ACTIVE",
  };
}

/** Build a session-authenticated ledger-custodian principal. */
export function sessionCustodianPrincipal(actorId: string): CompletenessIssuerPrincipal {
  return {
    actorId,
    authorizedRoles: ["LEDGER_CUSTODIAN"],
    identityAssurance: "SESSION_AUTHENTICATED",
    status: "ACTIVE",
  };
}
