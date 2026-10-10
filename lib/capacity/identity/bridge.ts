/**
 * Bridge: VerifiedServerPrincipal → TrustedIssuerAuthorizationContext.
 *
 * Only server-minted principals with CERTIFY_UTILIZATION_COMPLETENESS (and
 * optionally AUTHORIZE_PRODUCTION_CAPACITY) may produce a production context.
 * WeakSet/brand membership alone is insufficient — validity, tenant scope,
 * permissions, and (for production authority) repository activation apply.
 */

import {
  productionTrustedIssuerAuth,
  type TrustedIssuerAuthorizationContext,
  type CompletenessIssuerPrincipal,
} from "../completeness-issuer-auth";
import {
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  isTrustedIdentityProductionActive,
} from "./activation";
import {
  assertPrincipalValidForDecision,
  isVerifiedServerPrincipal,
  type VerifiedServerPrincipal,
} from "./provider-contract";
import { hasPermission } from "./permissions";

export interface MintTrustedIssuerAuthResult {
  auth: TrustedIssuerAuthorizationContext | null;
  blockers: string[];
  productionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  matchedPrincipal: CompletenessIssuerPrincipal | null;
}

function toCompletenessPrincipal(
  principal: VerifiedServerPrincipal,
): CompletenessIssuerPrincipal | null {
  if (!hasPermission(principal.permissions, "CERTIFY_UTILIZATION_COMPLETENESS")) {
    return null;
  }
  if (principal.completenessRoles.length === 0) {
    return null;
  }
  return {
    actorId: principal.principalId,
    authorizedRoles: [...principal.completenessRoles],
    identityAssurance: principal.identityAssurance,
    status: principal.status === "ACTIVE" ? "ACTIVE" : "REVOKED",
  };
}

/**
 * Mint TrustedIssuerAuthorizationContext from a server-verified principal.
 *
 * For production-authoritative capacity paths, also requires
 * AUTHORIZE_PRODUCTION_CAPACITY and repository activation ACTIVE.
 * Today activation is BLOCKED, so production mint always fails closed.
 */
export async function mintTrustedIssuerAuthorizationContext(args: {
  principal: unknown;
  companyId: string;
  /**
   * When true, require AUTHORIZE_PRODUCTION_CAPACITY + production activation.
   * Utilization completeness certifier mint without production capacity uses false.
   */
  forProductionCapacity: boolean;
  nowMs?: number;
  checkLiveRevocation?: boolean;
}): Promise<MintTrustedIssuerAuthResult> {
  const productionActivation = TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  const validity = await assertPrincipalValidForDecision(args.principal, {
    nowMs: args.nowMs,
    checkLiveRevocation: args.checkLiveRevocation,
  });
  if (!validity.ok || !isVerifiedServerPrincipal(args.principal)) {
    return {
      auth: null,
      blockers: validity.blockers,
      productionActivation,
      matchedPrincipal: null,
    };
  }
  const principal = args.principal;
  if (!principal.companyScope.includes(args.companyId)) {
    return {
      auth: null,
      blockers: [
        `cross-tenant approval refused — principal ${principal.principalId} companyScope does not include ${args.companyId}`,
      ],
      productionActivation,
      matchedPrincipal: null,
    };
  }
  if (!hasPermission(principal.permissions, "CERTIFY_UTILIZATION_COMPLETENESS")) {
    return {
      auth: null,
      blockers: [
        `principal ${principal.principalId} lacks CERTIFY_UTILIZATION_COMPLETENESS — counsel/admin/member labels alone are insufficient`,
      ],
      productionActivation,
      matchedPrincipal: null,
    };
  }
  const matched = toCompletenessPrincipal(principal);
  if (matched == null) {
    return {
      auth: null,
      blockers: [
        `principal ${principal.principalId} has no bindable completenessRoles`,
      ],
      productionActivation,
      matchedPrincipal: null,
    };
  }
  if (args.forProductionCapacity) {
    if (!hasPermission(principal.permissions, "AUTHORIZE_PRODUCTION_CAPACITY")) {
      return {
        auth: null,
        blockers: [
          `principal ${principal.principalId} lacks AUTHORIZE_PRODUCTION_CAPACITY — certifying utilization does not authorize production capacity`,
        ],
        productionActivation,
        matchedPrincipal: matched,
      };
    }
    if (!isTrustedIdentityProductionActive()) {
      return {
        auth: null,
        blockers: [
          TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.reason,
          "production TrustedIssuerAuthorizationContext mint refused while TRUSTED_IDENTITY_PRODUCTION_ACTIVATION is BLOCKED",
        ],
        productionActivation,
        matchedPrincipal: matched,
      };
    }
  }
  const auth = productionTrustedIssuerAuth([matched]);
  return {
    auth,
    blockers: [],
    productionActivation,
    matchedPrincipal: matched,
  };
}

/**
 * Refuse constructing TrustedIssuerAuthorizationContext from certificate blobs,
 * fixture registries, or role-string forgery.
 */
export function refuseUntrustedTrustedIssuerConstruction(claim: unknown): {
  ok: false;
  blockers: string[];
} {
  return {
    ok: false,
    blockers: [
      "untrusted TrustedIssuerAuthorizationContext construction refused — only mintTrustedIssuerAuthorizationContext from VerifiedServerPrincipal is permitted",
      typeof claim === "object" && claim !== null
        ? `rejected claim keys: ${Object.keys(claim as object).join(",") || "(empty)"}`
        : "rejected non-object claim",
    ],
  };
}
