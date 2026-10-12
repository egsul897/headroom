/**
 * Workspace / tenant access gate for the CFO product workflow.
 *
 * Uses the existing capacity identity architecture (authorizeDecision /
 * VerifiedServerPrincipal). Does not invent a second authentication system.
 *
 * Rules:
 * - CUSTOMER workspaces require a server-minted principal with companyScope.
 * - EVALUATION anonymous read is allowed only when tenantKind is verified
 *   EVALUATION from persistence AND an explicit anonymous-read grant exists.
 * - Never infer demo/eval status from companyId naming or a missing principal.
 * - Production publication remains refused while trusted identity is BLOCKED.
 */

import type { CompanyTenantKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeDecision } from "@/lib/capacity/identity/authorize-decision";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import { isVerifiedServerPrincipal } from "@/lib/capacity/identity/provider-contract";
import { getEvaluationAnonymousReadGrant } from "./evaluation-anonymous-read-policy";

export type WorkspaceAccessDecision =
  | {
      allowed: true;
      companyId: string;
      tenantKind: CompanyTenantKind;
      productionPublicationAllowed: false;
      accessMode: "AUTHENTICATED_TENANT" | "EVALUATION_ANONYMOUS_POLICY";
      reason: string;
    }
  | {
      allowed: false;
      companyId: string;
      tenantKind: CompanyTenantKind | null;
      productionPublicationAllowed: false;
      reason: string;
      /** Structured blockers for tests/audit — not for untrusted client display. */
      blockers: string[];
    };

export interface WorkspaceCompanyIdentity {
  id: string;
  tenantKind: CompanyTenantKind;
}

/**
 * Minimal company identity lookup for the access gate.
 * Loads only id + tenantKind — not documents, financials, or approvals.
 */
export async function loadWorkspaceCompanyIdentity(
  companyId: string,
): Promise<WorkspaceCompanyIdentity | null> {
  if (!companyId?.trim()) return null;
  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, tenantKind: true },
  });
  return row;
}

export type WorkspaceCompanyIdentityLoader = (
  companyId: string,
) => Promise<WorkspaceCompanyIdentity | null>;

const GENERIC_DENIAL = "Workspace access refused.";

/**
 * Gate a workflow read for a company workspace BEFORE sensitive loaders run.
 */
export async function gateWorkspaceAccess(args: {
  companyId: string;
  principal?: unknown;
  /**
   * Pre-loaded identity (id + tenantKind only). When omitted, loaded here.
   * Callers that already loaded identity may pass it to avoid a second query.
   */
  companyIdentity?: WorkspaceCompanyIdentity | null;
  /** Injectable loader for tests / hosts — defaults to Prisma id+tenantKind select. */
  companyIdentityLoader?: WorkspaceCompanyIdentityLoader;
  requireProductionPublication?: boolean;
}): Promise<WorkspaceAccessDecision> {
  const productionBlocked =
    TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED"
      ? "Trusted identity production activation is BLOCKED — no publishable AVAILABLE remaining."
      : "Production publication requires authorized principal.";

  if (!args.companyId?.trim()) {
    return {
      allowed: false,
      companyId: args.companyId ?? "",
      tenantKind: null,
      productionPublicationAllowed: false,
      reason: GENERIC_DENIAL,
      blockers: ["missing company identity"],
    };
  }

  const loader = args.companyIdentityLoader ?? loadWorkspaceCompanyIdentity;
  const identity =
    args.companyIdentity !== undefined
      ? args.companyIdentity
      : await loader(args.companyId);

  if (!identity) {
    return {
      allowed: false,
      companyId: args.companyId,
      tenantKind: null,
      productionPublicationAllowed: false,
      reason: GENERIC_DENIAL,
      blockers: ["company identity not found"],
    };
  }

  // Authenticated path — companyScope enforced inside authorizeDecision.
  if (args.principal != null) {
    if (!isVerifiedServerPrincipal(args.principal)) {
      return {
        allowed: false,
        companyId: identity.id,
        tenantKind: identity.tenantKind,
        productionPublicationAllowed: false,
        reason: GENERIC_DENIAL,
        blockers: [
          "principal is not a server-minted VerifiedServerPrincipal — forged or client-injected identity refused",
        ],
      };
    }

    const auth = await authorizeDecision({
      principal: args.principal,
      companyId: identity.id,
      decision: args.requireProductionPublication
        ? "AUTHORIZE_PRODUCTION_CAPACITY"
        : "REVIEW_EVIDENCE",
    });
    if (!auth.granted) {
      return {
        allowed: false,
        companyId: identity.id,
        tenantKind: identity.tenantKind,
        productionPublicationAllowed: false,
        reason: GENERIC_DENIAL,
        blockers: auth.blockers,
      };
    }

    if (args.requireProductionPublication) {
      return {
        allowed: false,
        companyId: identity.id,
        tenantKind: identity.tenantKind,
        productionPublicationAllowed: false,
        reason: GENERIC_DENIAL,
        blockers: [productionBlocked, ...TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.requirements.slice(0, 3)],
      };
    }

    return {
      allowed: true,
      companyId: identity.id,
      tenantKind: identity.tenantKind,
      productionPublicationAllowed: false,
      accessMode: "AUTHENTICATED_TENANT",
      reason: productionBlocked,
    };
  }

  // Anonymous path — CUSTOMER always refused.
  if (identity.tenantKind === "CUSTOMER") {
    return {
      allowed: false,
      companyId: identity.id,
      tenantKind: identity.tenantKind,
      productionPublicationAllowed: false,
      reason: GENERIC_DENIAL,
      blockers: [
        "CUSTOMER workspace requires trusted authenticated tenant scope — anonymous access refused",
      ],
    };
  }

  // EVALUATION anonymous only with explicit grant + verified tenantKind.
  const grant = getEvaluationAnonymousReadGrant(identity.id);
  if (!grant || grant.allowAnonymousRead !== true) {
    return {
      allowed: false,
      companyId: identity.id,
      tenantKind: identity.tenantKind,
      productionPublicationAllowed: false,
      reason: GENERIC_DENIAL,
      blockers: [
        "EVALUATION workspace has no explicit anonymous-read policy grant — anonymous access refused",
      ],
    };
  }

  if (args.requireProductionPublication) {
    return {
      allowed: false,
      companyId: identity.id,
      tenantKind: identity.tenantKind,
      productionPublicationAllowed: false,
      reason: GENERIC_DENIAL,
      blockers: [productionBlocked],
    };
  }

  return {
    allowed: true,
    companyId: identity.id,
    tenantKind: identity.tenantKind,
    productionPublicationAllowed: false,
    accessMode: "EVALUATION_ANONYMOUS_POLICY",
    reason: `${productionBlocked} Anonymous EVALUATION read via ${grant.policyBasis}.`,
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
