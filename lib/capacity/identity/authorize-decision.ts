/**
 * Authorization boundary for evidence / financial / utilization / capacity decisions.
 * Fail-closed. Records audit. Never trusts client role strings.
 */

import { recordAuthorizationAudit, type AuthorizationAuditRecord } from "./audit";
import {
  mintTrustedIssuerAuthorizationContext,
  type MintTrustedIssuerAuthResult,
} from "./bridge";
import {
  hasPermission,
  permissionForDecision,
  type AuthorizationDecisionKind,
} from "./permissions";
import {
  assertPrincipalValidForDecision,
  isVerifiedServerPrincipal,
  markJtiConsumed,
  refuseClientInjectedIdentity,
  type VerifiedServerPrincipal,
} from "./provider-contract";
import {
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
} from "./activation";
import type { TrustedIssuerAuthorizationContext } from "../completeness-issuer-auth";

export interface AuthorizeDecisionRequest {
  principal: unknown;
  companyId: string;
  decision: AuthorizationDecisionKind;
  evidenceId?: string | null;
  /** When true, jti is consumed after a successful grant (anti-replay). */
  consumeOnGrant?: boolean;
  nowMs?: number;
  checkLiveRevocation?: boolean;
}

export interface AuthorizeDecisionResult {
  granted: boolean;
  blockers: string[];
  audit: AuthorizationAuditRecord;
  productionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  /**
   * Populated only for CERTIFY_UTILIZATION_COMPLETENESS /
   * AUTHORIZE_PRODUCTION_CAPACITY when mint succeeds.
   */
  trustedIssuerAuth: TrustedIssuerAuthorizationContext | null;
}

function auditDenied(
  req: AuthorizeDecisionRequest,
  blockers: string[],
  partial?: {
    principalId?: string;
    authorizationBasis?: string;
    identityAssurance?: AuthorizationAuditRecord["identityAssurance"];
    jti?: string | null;
  },
): AuthorizeDecisionResult {
  const requiredPermission = permissionForDecision(req.decision);
  const audit = recordAuthorizationAudit({
    atMs: req.nowMs ?? Date.now(),
    principalId: partial?.principalId ?? "UNVERIFIED",
    companyId: req.companyId,
    decision: req.decision,
    requiredPermission,
    granted: false,
    evidenceId: req.evidenceId ?? null,
    authorizationBasis: partial?.authorizationBasis ?? "none",
    identityAssurance: partial?.identityAssurance ?? "UNVERIFIED",
    blockers,
    jti: partial?.jti ?? null,
  });
  return {
    granted: false,
    blockers,
    audit,
    productionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    trustedIssuerAuth: null,
  };
}

/**
 * Authorize one discrete decision against a server-verified principal.
 */
export async function authorizeDecision(
  req: AuthorizeDecisionRequest,
): Promise<AuthorizeDecisionResult> {
  const requiredPermission = permissionForDecision(req.decision);

  if (!isVerifiedServerPrincipal(req.principal)) {
    const refused = refuseClientInjectedIdentity(req.principal);
    return auditDenied(req, refused.blockers);
  }

  const principal: VerifiedServerPrincipal = req.principal;
  const validity = await assertPrincipalValidForDecision(principal, {
    nowMs: req.nowMs,
    checkLiveRevocation: req.checkLiveRevocation,
  });
  if (!validity.ok) {
    return auditDenied(req, validity.blockers, {
      principalId: principal.principalId,
      authorizationBasis: principal.authorizationBasis,
      identityAssurance: principal.identityAssurance,
      jti: principal.jti,
    });
  }

  if (!principal.companyScope.includes(req.companyId)) {
    return auditDenied(
      req,
      [
        `cross-tenant approval refused — principal companyScope does not include ${req.companyId}`,
      ],
      {
        principalId: principal.principalId,
        authorizationBasis: principal.authorizationBasis,
        identityAssurance: principal.identityAssurance,
        jti: principal.jti,
      },
    );
  }

  if (!hasPermission(principal.permissions, requiredPermission)) {
    return auditDenied(
      req,
      [
        `permission denied — ${requiredPermission} not granted (decision ${req.decision}); role-string forgery / privilege escalation refused`,
      ],
      {
        principalId: principal.principalId,
        authorizationBasis: principal.authorizationBasis,
        identityAssurance: principal.identityAssurance,
        jti: principal.jti,
      },
    );
  }

  let trustedIssuerAuth: TrustedIssuerAuthorizationContext | null = null;
  let mintBlockers: string[] = [];

  if (
    req.decision === "CERTIFY_UTILIZATION_COMPLETENESS" ||
    req.decision === "AUTHORIZE_PRODUCTION_CAPACITY"
  ) {
    const mint: MintTrustedIssuerAuthResult =
      await mintTrustedIssuerAuthorizationContext({
        principal,
        companyId: req.companyId,
        forProductionCapacity: req.decision === "AUTHORIZE_PRODUCTION_CAPACITY",
        nowMs: req.nowMs,
        checkLiveRevocation: req.checkLiveRevocation,
      });
    trustedIssuerAuth = mint.auth;
    mintBlockers = mint.blockers;
    if (req.decision === "AUTHORIZE_PRODUCTION_CAPACITY" && mint.auth == null) {
      return auditDenied(req, mintBlockers, {
        principalId: principal.principalId,
        authorizationBasis: principal.authorizationBasis,
        identityAssurance: principal.identityAssurance,
        jti: principal.jti,
      });
    }
    // Completeness cert may succeed for non-production mint (forProductionCapacity false)
    // even while production activation is BLOCKED — but production capacity never does.
    if (
      req.decision === "CERTIFY_UTILIZATION_COMPLETENESS" &&
      mint.auth == null
    ) {
      return auditDenied(req, mintBlockers, {
        principalId: principal.principalId,
        authorizationBasis: principal.authorizationBasis,
        identityAssurance: principal.identityAssurance,
        jti: principal.jti,
      });
    }
  }

  if (req.consumeOnGrant) {
    markJtiConsumed(principal.jti);
  }

  const audit = recordAuthorizationAudit({
    atMs: req.nowMs ?? Date.now(),
    principalId: principal.principalId,
    companyId: req.companyId,
    decision: req.decision,
    requiredPermission,
    granted: true,
    evidenceId: req.evidenceId ?? null,
    authorizationBasis: principal.authorizationBasis,
    identityAssurance: principal.identityAssurance,
    blockers: mintBlockers,
    jti: principal.jti,
  });

  return {
    granted: true,
    blockers: [],
    audit,
    productionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    trustedIssuerAuth,
  };
}
