/**
 * SSR → executeAndPersist structural preflight gate.
 *
 * This module enumerates exact structural blockers for Position / Ask / Simulate.
 * It is NOT an authorization grant:
 *   - structuralRequestAssemblyComplete=true means only that declared fields are
 *     present enough to call executeAndPersist without inventing VEP/identity.
 *   - It does NOT authorize production publication, Neon writes as authority,
 *     or trusted-identity activation.
 *
 * Production activation remains BLOCKED in TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.
 * Live SSR routes must not call executeAndPersist until tenant auth and full
 * validated request assembly are server-established — see assessCurrentSsrEntrypointShape.
 */
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import type { UnifiedTransactionExecutionRequest } from "./types";

export const SSR_PERSISTED_EXECUTION_GATE_VERSION =
  "ssr-persisted-execution-gate.v2" as const;

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
  | "PROVISIONAL_IDENTITY_NOT_CONFIRMED"
  | "EMPTY_EVIDENCE_OBJECT"
  | "INCOMPLETE_OPERATIVE_AUTHORITY";

export interface SsrPersistedExecutionDependencies {
  surface: ProductSurface;
  /**
   * Server-established tenant authentication (session/IdP). URL companyId alone
   * is never sufficient — pass false unless the host verified company scope.
   */
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
   * Structural preflight only: declared dependencies appear present.
   * NOT production authorization. NOT permission to publish AVAILABLE capacity.
   * NOT permission to treat persistence as current authority.
   *
   * @deprecated Alias retained for one release — prefer structuralRequestAssemblyComplete.
   */
  mayCallExecuteAndPersist: boolean;
  /** Canonical name for the structural preflight bit (see mayCallExecuteAndPersist). */
  structuralRequestAssemblyComplete: boolean;
  /**
   * True only when structural assembly is complete AND trusted-identity production
   * activation is ACTIVE AND provisional identity is not present. Still subject to
   * downstream legal/financial authorization inside executeUnifiedVerifiedTransaction.
   */
  mayPublishProductionAuthority: boolean;
  blockers: SsrPersistedExecutionBlocker[];
  /** Human-readable contract for the integration owner — not a bypass. */
  implementationContract: readonly string[];
  trustedIdentityProductionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  /**
   * Explicit semantic tag so consumers cannot mistake this gate for an
   * authorization decision.
   */
  gateSemantics: "STRUCTURAL_PREFLIGHT_ONLY";
}

const SHARED_CONTRACT = [
  "This gate is STRUCTURAL_PREFLIGHT_ONLY — not an authorization grant.",
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

function isEmptyObject(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  );
}

/**
 * Assess structural readiness for invoke executeAndPersist.
 * Fail-closed: any missing dependency yields structuralRequestAssemblyComplete=false.
 * Does not authorize production publication.
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
  } else if (isEmptyObject(req.verifiedPackage)) {
    blockers.push("EMPTY_EVIDENCE_OBJECT");
  }
  if (!req?.operativeSourceAuthority) {
    blockers.push("MISSING_OPERATIVE_SOURCE_AUTHORITY");
  } else if (isEmptyObject(req.operativeSourceAuthority)) {
    blockers.push("EMPTY_EVIDENCE_OBJECT");
  } else if (req.operativeSourceAuthority.provisionalIdentity === true) {
    blockers.push("PROVISIONAL_IDENTITY_NOT_CONFIRMED");
  } else if (
    req.operativeSourceAuthority.authorityClassification === "REVIEW_REQUIRED" ||
    req.operativeSourceAuthority.authorityClassification === "AMBIGUOUS" ||
    req.operativeSourceAuthority.authorityClassification === "UNSUPPORTED" ||
    req.operativeSourceAuthority.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED"
  ) {
    blockers.push("INCOMPLETE_OPERATIVE_AUTHORITY");
  }
  if (!req?.financialEvidence) {
    blockers.push("MISSING_FINANCIAL_EVIDENCE");
  } else if (isEmptyObject(req.financialEvidence)) {
    blockers.push("EMPTY_EVIDENCE_OBJECT");
  }
  if (!req?.utilization) {
    blockers.push("MISSING_UTILIZATION_COMPLETENESS");
  } else if (isEmptyObject(req.utilization)) {
    blockers.push("EMPTY_EVIDENCE_OBJECT");
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
  const structuralRequestAssemblyComplete = structuralBlockers.length === 0;

  if (TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED") {
    blockers.push("TRUSTED_IDENTITY_PRODUCTION_BLOCKED");
  }

  return {
    surface: deps.surface,
    mayCallExecuteAndPersist: structuralRequestAssemblyComplete,
    structuralRequestAssemblyComplete,
    mayPublishProductionAuthority:
      structuralRequestAssemblyComplete &&
      TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "ACTIVE" &&
      !blockers.includes("PROVISIONAL_IDENTITY_NOT_CONFIRMED") &&
      !blockers.includes("INCOMPLETE_OPERATIVE_AUTHORITY"),
    blockers,
    implementationContract: [...SHARED_CONTRACT, ...SURFACE_CONTRACT[deps.surface]],
    trustedIdentityProductionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    gateSemantics: "STRUCTURAL_PREFLIGHT_ONLY",
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
