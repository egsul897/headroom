/**
 * Workspace / tenant access gate for the CFO product workflow.
 *
 * Trusted-identity production activation remains BLOCKED. This module still
 * refuse-closes explicit cross-tenant access when a principal is supplied,
 * and refuse-closes production publication claims without an authorized
 * principal. It never invents an authenticated session.
 */

import { authorizeDecision } from "@/lib/capacity/identity/authorize-decision";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";

export type WorkspaceAccessDecision =
  | {
      allowed: true;
      companyId: string;
      productionPublicationAllowed: false;
      reason: string;
    }
  | {
      allowed: false;
      companyId: string;
      productionPublicationAllowed: false;
      reason: string;
      blockers: string[];
    };

/**
 * Gate a workflow read for a company workspace.
 *
 * - Without a principal: read of EVALUATION / local workspaces is allowed for
 *   product UI (no IdP), but production publication is always refused.
 * - With a principal: companyId must be in companyScope (cross-tenant refused).
 */
export async function gateWorkspaceAccess(args: {
  companyId: string;
  principal?: unknown;
  /** When true, also require AUTHORIZE_PRODUCTION_CAPACITY (always fail-closed today). */
  requireProductionPublication?: boolean;
}): Promise<WorkspaceAccessDecision> {
  const productionBlocked =
    TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED"
      ? "Trusted identity production activation is BLOCKED — no publishable AVAILABLE remaining."
      : "Production publication requires authorized principal.";

  if (args.principal != null) {
    // Use an existing decision kind — companyScope is enforced inside authorizeDecision.
    const auth = await authorizeDecision({
      principal: args.principal,
      companyId: args.companyId,
      decision: args.requireProductionPublication
        ? "AUTHORIZE_PRODUCTION_CAPACITY"
        : "REVIEW_EVIDENCE",
    });
    if (!auth.granted) {
      return {
        allowed: false,
        companyId: args.companyId,
        productionPublicationAllowed: false,
        reason: "Cross-tenant or unauthorized workspace access refused.",
        blockers: auth.blockers,
      };
    }
  }

  if (args.requireProductionPublication) {
    return {
      allowed: false,
      companyId: args.companyId,
      productionPublicationAllowed: false,
      reason: productionBlocked,
      blockers: [productionBlocked, ...TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.requirements.slice(0, 3)],
    };
  }

  return {
    allowed: true,
    companyId: args.companyId,
    productionPublicationAllowed: false,
    reason: productionBlocked,
  };
}

/** Synchronous cross-tenant check when a scoped company list is already known. */
export function refuseCrossTenantCompanyId(args: {
  requestedCompanyId: string;
  allowedCompanyIds: readonly string[];
}): { ok: true } | { ok: false; blockers: string[] } {
  if (args.allowedCompanyIds.includes(args.requestedCompanyId)) {
    return { ok: true };
  }
  return {
    ok: false,
    blockers: [
      `cross-tenant access refused: company ${args.requestedCompanyId} is outside principal companyScope`,
    ],
  };
}
