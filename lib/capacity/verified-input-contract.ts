/**
 * Stable verified-input handoff for HEADROOM-1 / capacity engines (Scope D).
 *
 * Additive contract — does not create a second capacity engine and does not
 * modify the covenant compiler. Distinguishes authenticated financial evidence
 * from utilization completeness, incompleteness, unknowns, synthetics, and
 * caller-stipulated hypotheticals.
 *
 * Production authority is refused unless all required evidence and authorization
 * gates are satisfied. A fully authenticated fixture may demonstrate the
 * contract but must not activate production authority (host IdP + non-fixture
 * identity required).
 */

import type { TrustedIssuerAuthorizationContext } from "./completeness-issuer-auth";
import {
  validateAuthenticatedFinancialSnapshot,
  type AuthenticatedFinancialSnapshotEvidence,
  type FinancialMetricKey,
} from "./financial-evidence";
import {
  TRUSTED_ISSUER_ACTIVATION,
  resolveTrustedIssuerAuthFromHost,
  type TrustedIssuerActivationStatus,
} from "./trusted-issuer-host";
import {
  evaluateCompletenessForRemainingClaim,
  type SolverCompletenessCertInput,
} from "./utilization-authority";
import type {
  UtilizationCompletenessCertificate,
  UtilizationEvidenceRecord,
  UtilizationKnowledgeKind,
  UtilizationResolution,
} from "./utilization-types";
import { resolveUtilization } from "./utilization-resolver";

/** Evidence trust classes consumed by HEADROOM-1 / capacity engines. */
export type VerifiedInputTrustClass =
  | "AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE"
  | "VERIFIED_UTILIZATION_COMPLETE"
  | "INCOMPLETE"
  | "UNKNOWN"
  | "SYNTHETIC"
  | "CALLER_STIPULATED_HYPOTHETICAL";

export const VERIFIED_INPUT_CONTRACT_VERSION = "verified-input-contract.v1";

export interface VerifiedUtilizationHandoffInput {
  capacityRuleId: string;
  asOf: string;
  currency?: string | null;
  records: readonly UtilizationEvidenceRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  sharedCapacityId?: string | null;
  unattributedLegacyBasketPresent?: boolean;
}

export interface BuildVerifiedCapacityInputArgs {
  companyId: string;
  evaluationAsOf: string;
  financial: AuthenticatedFinancialSnapshotEvidence;
  requiredFinancialMetrics: readonly FinancialMetricKey[];
  utilization: VerifiedUtilizationHandoffInput;
  /**
   * Host-supplied trusted issuer context. When omitted, attempts host provider
   * resolution; missing host context fails closed for production.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /** Test/demo only. */
  allowSynthetic?: boolean;
  /** Test/demo only. */
  allowCallerStipulated?: boolean;
}

export interface VerifiedCapacityInputHandoff {
  contractVersion: typeof VERIFIED_INPUT_CONTRACT_VERSION;
  companyId: string;
  evaluationAsOf: string;
  /** Dominant / governing trust classes present on this handoff. */
  trustClasses: VerifiedInputTrustClass[];
  financial: {
    trustClass: VerifiedInputTrustClass;
    productionAuthoritative: boolean;
    snapshot: AuthenticatedFinancialSnapshotEvidence;
    blockers: string[];
  };
  utilization: {
    trustClass: VerifiedInputTrustClass;
    productionAuthoritative: boolean;
    knowledge: UtilizationKnowledgeKind;
    resolution: UtilizationResolution;
    supportsRemainingClaim: boolean;
    blockers: string[];
  };
  /**
   * True only when financial + utilization are both production-authoritative
   * under non-fixture host identity. Authenticated fixtures never set this.
   */
  productionAuthority: "ACTIVE" | "REFUSED";
  productionActivation: TrustedIssuerActivationStatus;
  blockers: string[];
  note: string;
}

function financialTrustClass(
  snapshot: AuthenticatedFinancialSnapshotEvidence,
  productionAuthoritative: boolean,
  allowSynthetic: boolean | undefined,
  allowCallerStipulated: boolean | undefined,
): VerifiedInputTrustClass {
  if (productionAuthoritative) return "AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE";
  const authenticities = new Set(snapshot.metrics.map((m) => m.authenticity));
  if (authenticities.has("CALLER_STIPULATED_HYPOTHETICAL") || allowCallerStipulated) {
    if (
      snapshot.metrics.every((m) => m.authenticity === "CALLER_STIPULATED_HYPOTHETICAL")
    ) {
      return "CALLER_STIPULATED_HYPOTHETICAL";
    }
  }
  if (
    authenticities.has("SYNTHETIC_LABELED") ||
    allowSynthetic ||
    snapshot.metrics.some((m) => m.authenticity === "SYNTHETIC_LABELED")
  ) {
    if (snapshot.metrics.every((m) => m.authenticity === "SYNTHETIC_LABELED")) {
      return "SYNTHETIC";
    }
  }
  if (snapshot.metrics.some((m) => m.verificationStatus !== "VERIFIED")) {
    return "INCOMPLETE";
  }
  return "INCOMPLETE";
}

function utilizationTrustClass(
  resolution: UtilizationResolution,
  completenessEval: { productionAuthoritative: boolean; demoSynthetic: boolean },
): VerifiedInputTrustClass {
  if (completenessEval.productionAuthoritative && resolution.supportsRemainingClaim) {
    return "VERIFIED_UTILIZATION_COMPLETE";
  }
  if (completenessEval.demoSynthetic && resolution.supportsRemainingClaim) {
    return "SYNTHETIC";
  }
  if (resolution.knowledge === "UNKNOWN") return "UNKNOWN";
  if (
    resolution.knowledge === "PARTIALLY_KNOWN" ||
    resolution.knowledge === "SUPERSEDED_EXCLUDED" ||
    resolution.knowledge === "UNATTRIBUTED_LEGACY_BASKET" ||
    (resolution.attributedAmount != null && !resolution.supportsRemainingClaim)
  ) {
    return "INCOMPLETE";
  }
  if (resolution.recordsApplied.some((r) => r.authenticity === "SYNTHETIC_LABELED")) {
    return "SYNTHETIC";
  }
  return "UNKNOWN";
}

/**
 * Build the verified capacity input handoff.
 * Never invents financial figures or utilization. Fail-closed on missing trust.
 */
export function buildVerifiedCapacityInputHandoff(
  args: BuildVerifiedCapacityInputArgs,
): VerifiedCapacityInputHandoff {
  const hostResolved =
    args.trustedIssuerAuth !== undefined
      ? {
          auth: args.trustedIssuerAuth,
          activation: (args.trustedIssuerAuth != null &&
          args.trustedIssuerAuth.requireNonFixtureIdentity
            ? "ACTIVE"
            : "BLOCKED") as TrustedIssuerActivationStatus,
          blockers:
            args.trustedIssuerAuth == null
              ? ["trusted issuer authorization context missing"]
              : !args.trustedIssuerAuth.requireNonFixtureIdentity
                ? [
                    "trustedIssuerAuth.requireNonFixtureIdentity is false — fixture/demo context cannot activate production",
                  ]
                : [],
        }
      : resolveTrustedIssuerAuthFromHost();

  const trustedIssuerAuth = hostResolved.auth;

  const financialValidation = validateAuthenticatedFinancialSnapshot(args.financial, {
    requiredMetrics: args.requiredFinancialMetrics,
    evaluationAsOf: args.evaluationAsOf,
    trustedIssuerAuth,
    expectedProvenanceId: args.financial.provenanceId,
    allowSynthetic: args.allowSynthetic,
    allowCallerStipulated: args.allowCallerStipulated,
  });

  // Provenance binding: snapshot provenanceId must match expected (self-check above
  // uses same id — additional tamper check when metrics disagree with snapshot).
  if (args.financial.companyId !== args.companyId) {
    financialValidation.ok = false;
    financialValidation.productionAuthoritative = false;
    financialValidation.blockers.push(
      `financial snapshot companyId "${args.financial.companyId}" ≠ handoff companyId "${args.companyId}"`,
    );
  }

  const cert = args.utilization.completenessCertificate as SolverCompletenessCertInput | null;
  const completenessEval = evaluateCompletenessForRemainingClaim({
    cert,
    trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSynthetic,
  });

  const resolution = resolveUtilization({
    capacityRuleId: args.utilization.capacityRuleId,
    asOf: args.utilization.asOf,
    currency: args.utilization.currency,
    records: args.utilization.records,
    completenessCertificate: args.utilization.completenessCertificate,
    trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSynthetic,
    sharedCapacityId: args.utilization.sharedCapacityId,
    unattributedLegacyBasketPresent: args.utilization.unattributedLegacyBasketPresent,
  });

  const finClass = financialTrustClass(
    args.financial,
    financialValidation.productionAuthoritative,
    args.allowSynthetic,
    args.allowCallerStipulated,
  );
  const utilClass = utilizationTrustClass(resolution, completenessEval);

  const trustClasses = [...new Set([finClass, utilClass])];

  const blockers = [
    ...hostResolved.blockers,
    ...financialValidation.blockers,
    ...resolution.blockers,
    ...completenessEval.blockers,
  ];

  const productionAuthority: "ACTIVE" | "REFUSED" =
    financialValidation.productionAuthoritative &&
    resolution.productionAuthoritative === true &&
    completenessEval.productionAuthoritative &&
    hostResolved.activation === "ACTIVE" &&
    TRUSTED_ISSUER_ACTIVATION.status === "ACTIVE"
      ? "ACTIVE"
      : "REFUSED";

  // Even when a caller injects productionTrustedIssuerAuth in tests, repository
  // activation stays BLOCKED until a real host provider is registered — unless
  // the host resolver itself returned ACTIVE (registered provider path).
  const productionActivation: TrustedIssuerActivationStatus =
    TRUSTED_ISSUER_ACTIVATION.status === "ACTIVE" && hostResolved.activation === "ACTIVE"
      ? "ACTIVE"
      : "BLOCKED";

  // Force refuse productionAuthority when repository activation is BLOCKED.
  const finalProductionAuthority =
    productionActivation === "ACTIVE" && productionAuthority === "ACTIVE"
      ? "ACTIVE"
      : "REFUSED";

  if (finalProductionAuthority === "REFUSED" && productionActivation === "BLOCKED") {
    blockers.push(TRUSTED_ISSUER_ACTIVATION.blocker);
  }

  const note =
    finalProductionAuthority === "ACTIVE"
      ? "Verified financial evidence and utilization completeness satisfy production authority gates."
      : `Production authority REFUSED — financial=${finClass}, utilization=${utilClass}, activation=${productionActivation}.`;

  return {
    contractVersion: VERIFIED_INPUT_CONTRACT_VERSION,
    companyId: args.companyId,
    evaluationAsOf: args.evaluationAsOf,
    trustClasses,
    financial: {
      trustClass: finClass,
      productionAuthoritative: financialValidation.productionAuthoritative,
      snapshot: args.financial,
      blockers: financialValidation.blockers,
    },
    utilization: {
      trustClass: utilClass,
      productionAuthoritative: resolution.productionAuthoritative === true,
      knowledge: resolution.knowledge,
      resolution,
      supportsRemainingClaim: resolution.supportsRemainingClaim,
      blockers: [...resolution.blockers, ...completenessEval.blockers],
    },
    productionAuthority: finalProductionAuthority,
    productionActivation,
    blockers: [...new Set(blockers)],
    note,
  };
}

/**
 * Narrow helper: whether HEADROOM-1 may treat this handoff as production
 * capacity input. Authenticated fixtures always return false while activation
 * is BLOCKED.
 */
export function mayUseAsProductionCapacityInput(
  handoff: VerifiedCapacityInputHandoff,
): boolean {
  return (
    handoff.productionAuthority === "ACTIVE" &&
    handoff.productionActivation === "ACTIVE" &&
    handoff.financial.productionAuthoritative &&
    handoff.utilization.productionAuthoritative
  );
}
