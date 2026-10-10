/**
 * SSR → executeAndPersist integration gate.
 *
 * Position / Ask / Simulate must not call executeAndPersistUnifiedVerifiedTransaction
 * until every dependency below is present. This module enumerates exact blockers and
 * refuses — it never fabricates VerifiedExecutionPackage, trusted identity, or tenant auth.
 *
 * Production activation remains BLOCKED in TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.
 */

import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import type { UnifiedTransactionExecutionRequest } from "./types";

export const SSR_PERSISTED_EXECUTION_GATE_VERSION =
  "ssr-persisted-execution-gate.v1" as const;

export type ProductSurface = "POSITION" | "ASK" | "SIMULATE";

export type SsrPersistedExecutionBlocker =
  | "MISSING_TENANT_AUTH"
  | "MISSING_VERIFIED_EXECUTION_PACKAGE"
  | "MISSING_OPERATIVE_SOURCE_AUTHORITY"
  | "MISSING_FINANCIAL_EVIDENCE"
  | "MISSING_UTILIZATION_COMPLETENESS"
  | "MISSING_SELECTED_LEGAL_PATH"
  | "MISSING_VERIFIED_EXECUTABLE_RULE"
  | "MISSING_REVIEWER_TRUSTED_ISSUER"
  | "MISSING_INPUT_RESOLVER"
  | "MISSING_PRISMA_CLIENT"
  | "TRUSTED_IDENTITY_PRODUCTION_BLOCKED"
  | "PROVISIONAL_IDENTITY_NOT_CONFIRMED";

export interface SsrPersistedExecutionDependencies {
  surface: ProductSurface;
  /** Authenticated principal with companyScope containing companyId. */
  tenantAuthenticated: boolean;
  companyId: string | null | undefined;
  /** Server Prisma client bound for durable writes (not optional ambient). */
  prismaClientPresent: boolean;
  /** Full request fields — pass null/undefined when the surface has not assembled them. */
  request: Partial<UnifiedTransactionExecutionRequest> | null;
}

export interface SsrPersistedExecutionAssessment {
  surface: ProductSurface;
  /**
   * True only when tenant auth + full request assembly + Prisma are present.
   * Does NOT authorize production-authority publication.
   */
  mayCallExecuteAndPersist: boolean;
  /** True only when mayCallExecuteAndPersist and trusted-identity production is ACTIVE. */
  mayPublishProductionAuthority: boolean;
  blockers: SsrPersistedExecutionBlocker[];
  /** Human-readable contract for the integration owner — not a bypass. */
  implementationContract: readonly string[];
  trustedIdentityProductionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
}

const SHARED_CONTRACT = [
  "Assemble complete UnifiedTransactionExecutionRequest (never invent VEP / operative / financials).",
  "Authenticate company/tenant scope before any Prisma write (companyId from URL alone is insufficient).",
  "Pass server PrismaClient into executeAndPersistUnifiedVerifiedTransaction.",
  "Persist governing sourceDocumentId actually used for retrieval; provisionalIdentity must stay provisional.",
  "On source change, invalidate dependent CapacityCalculationRecord / OperativeAuthoritySnapshot rows.",
  "Replay must be idempotent on calculationId/inputHash; do not fork authoritative ACTIVE rows.",
  "PRODUCTION_AUTHORITY mode must refuse while TRUSTED_IDENTITY_PRODUCTION_ACTIVATION is BLOCKED.",
  "Never treat loadPersistedUnifiedExecution as current authority without re-running evidence + auth gates.",
  "Do not introduce a second solver, capacity engine, ledger, or source-of-truth pathway.",
] as const;

const SURFACE_CONTRACT: Record<ProductSurface, readonly string[]> = {
  POSITION: [
    "Replace getCompanyDashboard / buildPositionView capacity publication with VTE handoff only when gates pass.",
    "Share traceId with Ask/Simulate via toAllProductExecutionHandoffs.",
  ],
  ASK: [
    "Replace attemptCertifiedTransaction({ verifiedPackage: null }) in lib/ask/shell-runner.ts when gates pass.",
    "app/api/ask/route.ts must authenticate tenant before durable write.",
  ],
  SIMULATE: [
    "Replace attemptVerifiedSimulate({ verifiedPackage: null }) in app/[companyId]/simulate/page.tsx when gates pass.",
    "Keep mutatesActualLedger=false for hypothetical simulation records.",
  ],
};

/**
 * Assess whether a surface may safely invoke executeAndPersist.
 * Fail-closed: any missing dependency yields mayCallExecuteAndPersist=false.
 */
export function assessSsrPersistedExecutionReadiness(
  deps: SsrPersistedExecutionDependencies,
): SsrPersistedExecutionAssessment {
  const blockers: SsrPersistedExecutionBlocker[] = [];
  const req = deps.request;

  if (!deps.tenantAuthenticated || !deps.companyId?.trim()) {
    blockers.push("MISSING_TENANT_AUTH");
  }
  if (!deps.prismaClientPresent) {
    blockers.push("MISSING_PRISMA_CLIENT");
  }
  if (!req?.verifiedPackage) {
    blockers.push("MISSING_VERIFIED_EXECUTION_PACKAGE");
  }
  if (!req?.operativeSourceAuthority) {
    blockers.push("MISSING_OPERATIVE_SOURCE_AUTHORITY");
  } else if (req.operativeSourceAuthority.provisionalIdentity === true) {
    blockers.push("PROVISIONAL_IDENTITY_NOT_CONFIRMED");
  }
  if (!req?.financialEvidence) {
    blockers.push("MISSING_FINANCIAL_EVIDENCE");
  }
  if (!req?.utilization) {
    blockers.push("MISSING_UTILIZATION_COMPLETENESS");
  }
  if (!req?.selectedLegalPath) {
    blockers.push("MISSING_SELECTED_LEGAL_PATH");
  }
  if (!req?.verifiedExecutableRule) {
    blockers.push("MISSING_VERIFIED_EXECUTABLE_RULE");
  }
  if (!req?.reviewerAuthorization?.trustedIssuerAuth) {
    blockers.push("MISSING_REVIEWER_TRUSTED_ISSUER");
  }
  if (!req?.inputs) {
    blockers.push("MISSING_INPUT_RESOLVER");
  }

  const structuralBlockers = blockers.filter(
    (b) => b !== "TRUSTED_IDENTITY_PRODUCTION_BLOCKED",
  );
  const mayCallExecuteAndPersist = structuralBlockers.length === 0;

  if (TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED") {
    blockers.push("TRUSTED_IDENTITY_PRODUCTION_BLOCKED");
  }

  return {
    surface: deps.surface,
    mayCallExecuteAndPersist,
    mayPublishProductionAuthority:
      mayCallExecuteAndPersist &&
      TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "ACTIVE" &&
      !blockers.includes("PROVISIONAL_IDENTITY_NOT_CONFIRMED"),
    blockers,
    implementationContract: [...SHARED_CONTRACT, ...SURFACE_CONTRACT[deps.surface]],
    trustedIdentityProductionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
  };
}

/**
 * Current live SSR call shapes (as of #294 tip): URL companyId, no tenant auth,
 * verifiedPackage null, no UnifiedTransactionExecutionRequest assembly.
 */
export function assessCurrentSsrEntrypointShape(surface: ProductSurface): SsrPersistedExecutionAssessment {
  return assessSsrPersistedExecutionReadiness({
    surface,
    tenantAuthenticated: false,
    companyId: "url-segment-only",
    prismaClientPresent: true, // Ask/Simulate paths already import lib/prisma for NS helpers
    request: null,
  });
}
