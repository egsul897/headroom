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
  "ssr-persisted-execution-gate.v2-diagnostics-only" as const;

/** Explicit: this module never grants executeAndPersist or production publication. */
export const SSR_GATE_SEMANTICS = "STRUCTURAL_DIAGNOSTICS_ONLY" as const;

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
  | "INCOMPLETE_OPERATIVE_AUTHORITY"
  | "CALLER_SUPPLIED_AUTH_NOT_PROOF"
  | "SSR_GATE_DIAGNOSTICS_ONLY";

export interface SsrPersistedExecutionDependencies {
  surface: ProductSurface;
  /**
   * Caller-declared flag — NEVER treated as proof of tenant authorization.
   * When true, CALLER_SUPPLIED_AUTH_NOT_PROOF is listed; MISSING_TENANT_AUTH
   * remains until server-established IdP auth exists.
   */
  tenantAuthenticated: boolean;
  companyId: string | null | undefined;
  /** Server Prisma client bound for durable writes (not optional ambient). */
  prismaClientPresent: boolean;
  /** Partial / placeholder request for gap listing — not a validated contract. */
  request: Partial<UnifiedTransactionExecutionRequest> | null;
}

export interface SsrPersistedExecutionAssessment {
  surface: ProductSurface;
  /**
   * Always false. This module never grants executeAndPersist permission.
   * @deprecated Prefer structuralRequestAssemblyComplete for diagnostics only.
   */
  mayCallExecuteAndPersist: false;
  /**
   * Diagnostics only: declared fields appear non-empty. Does NOT authorize
   * execution, Neon writes as authority, or production publication.
   */
  structuralRequestAssemblyComplete: boolean;
  /** Always false — production publication never granted here. */
  mayPublishProductionAuthority: false;
  blockers: SsrPersistedExecutionBlocker[];
  /** Human-readable contract for the integration owner — not a bypass. */
  implementationContract: readonly string[];
  trustedIdentityProductionActivation: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
  /** Explicit semantic tag — structural diagnostics only. */
  gateSemantics: typeof SSR_GATE_SEMANTICS;
  /** Alias of gateSemantics for consumers. */
  semantics: typeof SSR_GATE_SEMANTICS;
}

const SHARED_CONTRACT = [
  "This gate is STRUCTURAL_DIAGNOSTICS_ONLY — it never grants executeAndPersist.",
  "Caller-supplied tenantAuthenticated boolean is not proof of tenant authorization.",
  "Truthy / partial request objects are not a validated UnifiedTransactionExecutionRequest.",
  "Assemble complete UnifiedTransactionExecutionRequest (never invent VEP / operative / financials).",
  "Authenticate company/tenant scope via server IdP before any Prisma write (URL companyId insufficient).",
  "Pass server PrismaClient into executeAndPersistUnifiedVerifiedTransaction only after validated auth.",
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
  const blockers: SsrPersistedExecutionBlocker[] = ["SSR_GATE_DIAGNOSTICS_ONLY"];
  const req = deps.request;

  // Caller boolean is never proof — always require server-established tenant auth.
  blockers.push("MISSING_TENANT_AUTH");
  if (deps.tenantAuthenticated) {
    blockers.push("CALLER_SUPPLIED_AUTH_NOT_PROOF");
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

  // Diagnostics-only structural completeness ignores auth (always MISSING_TENANT_AUTH above).
  const structuralFieldBlockers = blockers.filter(
    (b) =>
      b !== "TRUSTED_IDENTITY_PRODUCTION_BLOCKED" &&
      b !== "SSR_GATE_DIAGNOSTICS_ONLY" &&
      b !== "MISSING_TENANT_AUTH" &&
      b !== "CALLER_SUPPLIED_AUTH_NOT_PROOF",
  );
  const structuralRequestAssemblyComplete = structuralFieldBlockers.length === 0;

  if (TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status === "BLOCKED") {
    blockers.push("TRUSTED_IDENTITY_PRODUCTION_BLOCKED");
  }

  return {
    surface: deps.surface,
    mayCallExecuteAndPersist: false,
    structuralRequestAssemblyComplete,
    mayPublishProductionAuthority: false,
    blockers,
    implementationContract: [...SHARED_CONTRACT, ...SURFACE_CONTRACT[deps.surface]],
    trustedIdentityProductionActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    gateSemantics: SSR_GATE_SEMANTICS,
    semantics: SSR_GATE_SEMANTICS,
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
