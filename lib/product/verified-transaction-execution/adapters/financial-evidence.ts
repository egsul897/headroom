/**
 * Financial-evidence orchestration adapter.
 *
 * Reconciled to merged #279 (`lib/capacity/financial-evidence.ts`).
 * Does not duplicate metric validation — wraps
 * `validateFinancialMetricEvidence` / capacity types and projects the
 * orchestration-facing bundle result (including hypotheticalOk).
 */

import {
  validateFinancialMetricEvidence,
  type AmendmentRestatementStatus,
  type FinancialEvidenceAuthenticity,
  type FinancialEvidenceRefusalReason as CapacityRefusalReason,
  type FinancialMetricEvidence,
  type FinancialMetricKey,
  type FinancialVerificationStatus,
  type TrustedIssuerAuthorizationContext,
} from "@/lib/capacity";

export type {
  FinancialMetricKey,
  FinancialMetricEvidence,
  FinancialVerificationStatus,
  AmendmentRestatementStatus,
  FinancialEvidenceAuthenticity,
};

export type FinancialEvidenceRefusalReason =
  | CapacityRefusalReason
  | "MISSING_REQUIRED_METRIC"
  | "EMPTY_BUNDLE";

export interface FinancialEvidenceBundle {
  metrics: readonly FinancialMetricEvidence[];
  /** Required metrics for the selected path (empty = no financial dependency). */
  requiredMetricKeys: readonly FinancialMetricKey[];
}

export interface FinancialEvidenceValidationResult {
  ok: boolean;
  /** AUTHENTIC + VERIFIED + trusted issuer — never synthetic/stipulated. */
  productionAuthoritative: boolean;
  /** Ok for HYPOTHETICAL simulation when allowHypotheticalFinancials is set. */
  hypotheticalOk: boolean;
  blockers: string[];
  refusalReasons: FinancialEvidenceRefusalReason[];
}

export interface ValidateFinancialEvidenceArgs {
  evidence: FinancialEvidenceBundle;
  expectedCompanyId: string;
  expectedCurrency: string;
  evaluationAsOf: string;
  expectedReportingPeriod?: string | null;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  allowHypotheticalFinancials?: boolean;
}

/**
 * Fail-closed financial evidence validation for orchestration.
 * Delegates per-metric rules to merged #279; never invents figures.
 */
export function validateFinancialEvidenceBundle(
  args: ValidateFinancialEvidenceArgs,
): FinancialEvidenceValidationResult {
  const blockers: string[] = [];
  const refusalReasons: FinancialEvidenceRefusalReason[] = [];
  const metrics = args.evidence.metrics;
  const allowHypo = Boolean(args.allowHypotheticalFinancials);

  if (metrics.length === 0 && args.evidence.requiredMetricKeys.length > 0) {
    return {
      ok: false,
      productionAuthoritative: false,
      hypotheticalOk: false,
      blockers: ["financial evidence bundle empty — required metrics missing"],
      refusalReasons: ["EMPTY_BUNDLE", "MISSING_REQUIRED_METRIC"],
    };
  }

  const byKey = new Map(metrics.map((m) => [m.metricKey, m]));
  for (const key of args.evidence.requiredMetricKeys) {
    if (!byKey.has(key)) {
      blockers.push(`missing required financial metric: ${key}`);
      refusalReasons.push("MISSING_REQUIRED_METRIC");
    }
  }

  let allProduction = metrics.length > 0 || args.evidence.requiredMetricKeys.length === 0;
  let hardFailure = refusalReasons.includes("MISSING_REQUIRED_METRIC");

  for (const e of metrics) {
    const result = validateFinancialMetricEvidence({
      evidence: e,
      expectedCompanyId: args.expectedCompanyId,
      expectedCurrency: args.expectedCurrency,
      expectedReportingPeriod: args.expectedReportingPeriod,
      evaluationAsOf: args.evaluationAsOf,
      trustedIssuerAuth: args.trustedIssuerAuth,
      // Hatch only for orchestration hypothetical mode — never production.
      allowSynthetic: allowHypo,
      allowCallerStipulated: allowHypo,
    });

    blockers.push(...result.blockers);
    refusalReasons.push(...result.refusalReasons);

    if (!result.productionAuthoritative) {
      allProduction = false;
    }

    // Hard failures even under hypothetical hatch.
    const hard = result.refusalReasons.filter(
      (r) =>
        r !== "SYNTHETIC_FIXTURE" &&
        r !== "CALLER_STIPULATED" &&
        // When hatch is on, capacity marks synthetic/stipulated ok without these
        // reasons — but missing issuer context on AUTHENTIC paths is still hard
        // for production; for hypo we only treat identity/verification failures
        // as hard if the metric itself is not synthetic/stipulated.
        !(
          allowHypo &&
          (e.authenticity === "SYNTHETIC_LABELED" ||
            e.authenticity === "CALLER_STIPULATED_HYPOTHETICAL") &&
          (r === "MISSING_TRUSTED_HOST_CONTEXT" ||
            r === "UNAUTHORIZED_ISSUER" ||
            r === "FORGED_ISSUER" ||
            r === "PRODUCTION_FIXTURE_REFUSED")
        ),
    );
    // If capacity returned ok under hatch, no hard failure for that metric.
    if (!result.ok) {
      // Distinguish hatch-cleared authenticity refusals from hard identity failures.
      const remainingHard = hard.filter(
        (r) =>
          !(
            allowHypo &&
            (r === "SYNTHETIC_FIXTURE" || r === "CALLER_STIPULATED")
          ),
      );
      if (remainingHard.length > 0 || !allowHypo) {
        hardFailure = true;
      }
    }
  }

  const uniqueReasons = [...new Set(refusalReasons)];
  const uniqueBlockers = [...new Set(blockers)];

  const productionAuthoritative =
    allProduction &&
    !hardFailure &&
    uniqueReasons.length === 0 &&
    args.evidence.requiredMetricKeys.every((k) => byKey.has(k)) &&
    (metrics.length === 0 ||
      metrics.every((m) => m.authenticity === "AUTHENTIC" && m.verificationStatus === "VERIFIED"));

  // When no metrics required and none supplied, financial gate is vacuously ok
  // for hypothetical execution (fixed-dollar paths).
  const vacuousOk =
    metrics.length === 0 && args.evidence.requiredMetricKeys.length === 0;

  let hypotheticalOk = productionAuthoritative || vacuousOk;
  if (!hypotheticalOk && allowHypo && !hardFailure) {
    hypotheticalOk =
      args.evidence.requiredMetricKeys.every((k) => byKey.has(k)) &&
      metrics.every((m) => {
        const r = validateFinancialMetricEvidence({
          evidence: m,
          expectedCompanyId: args.expectedCompanyId,
          expectedCurrency: args.expectedCurrency,
          expectedReportingPeriod: args.expectedReportingPeriod,
          evaluationAsOf: args.evaluationAsOf,
          trustedIssuerAuth: args.trustedIssuerAuth,
          allowSynthetic: true,
          allowCallerStipulated: true,
        });
        return r.ok;
      });
  }

  // Strip hatch-only refusal noise from blockers when hypo succeeded.
  const surfaceBlockers =
    hypotheticalOk && !productionAuthoritative
      ? uniqueBlockers.filter(
          (b) =>
            !/SYNTHETIC_LABELED|CALLER_STIPULATED_HYPOTHETICAL|cannot establish production/i.test(
              b,
            ),
        )
      : uniqueBlockers;

  return {
    ok: productionAuthoritative || hypotheticalOk,
    productionAuthoritative,
    hypotheticalOk,
    blockers: surfaceBlockers,
    refusalReasons: uniqueReasons,
  };
}
