/**
 * Financial-evidence contract adapter for unified transaction execution.
 *
 * #273 (`lib/capacity/financial-evidence.ts`) is not yet on main. This adapter
 * implements the fail-closed validation surface required by orchestration
 * without importing unmerged branches or duplicating capacity arithmetic.
 *
 * When #273 merges, replace the body of `validateFinancialEvidenceBundle` with
 * a re-export/thin wrap of `validateAuthenticatedFinancialSnapshot` — do not
 * keep two production validators.
 */

export type FinancialMetricKey =
  | "TOTAL_ASSETS"
  | "CONSOLIDATED_EBITDA"
  | "TOTAL_DEBT"
  | "SECURED_DEBT"
  | "INTEREST_EXPENSE"
  | "CASH_BALANCES"
  | "OTHER";

export type FinancialVerificationStatus =
  | "UNVERIFIED_EXTRACTION"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "REJECTED";

export type AmendmentRestatementStatus =
  | "ORIGINAL"
  | "AMENDED"
  | "RESTATED"
  | "SUPERSEDED";

export type FinancialEvidenceAuthenticity =
  | "AUTHENTIC"
  | "SYNTHETIC_LABELED"
  | "CALLER_STIPULATED_HYPOTHETICAL";

export interface FinancialMetricEvidence {
  metricKey: FinancialMetricKey;
  value: number;
  currency: string;
  units: string;
  entity: {
    companyId: string;
    entityName: string | null;
    consolidationPerimeter: string;
  };
  sourceDocument: {
    documentId: string;
    exactLocation: string;
    excerpt?: string | null;
  };
  reportingPeriod: string;
  measurementDate: string;
  accountingDefinition: string;
  amendmentRestatementStatus: AmendmentRestatementStatus;
  verificationStatus: FinancialVerificationStatus;
  authenticity: FinancialEvidenceAuthenticity;
  issuer?: {
    role: "COUNSEL_REVIEWER" | "LEDGER_CUSTODIAN" | "SYSTEM_FIXTURE";
    actorId: string;
    attestedAt?: string;
  };
  provenanceId: string;
  maxAgeDays?: number | null;
}

export interface FinancialEvidenceBundle {
  metrics: readonly FinancialMetricEvidence[];
  /** Required metrics for the selected path (empty = no financial dependency). */
  requiredMetricKeys: readonly FinancialMetricKey[];
}

export type FinancialEvidenceRefusalReason =
  | "MISSING_REQUIRED_FIELD"
  | "MISSING_REQUIRED_METRIC"
  | "UNVERIFIED_EXTRACTION"
  | "SYNTHETIC_FIXTURE"
  | "CALLER_STIPULATED"
  | "STALE_SNAPSHOT"
  | "WRONG_ENTITY"
  | "WRONG_CURRENCY"
  | "WRONG_ACCOUNTING_PERIOD"
  | "RESTATED_OR_SUPERSEDED"
  | "UNAUTHORIZED_ISSUER"
  | "TAMPERED_PROVENANCE"
  | "EMPTY_BUNDLE";

export interface FinancialEvidenceValidationResult {
  ok: boolean;
  /** AUTHENTIC + VERIFIED + non-stale + matching identity — never synthetic. */
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
  allowHypotheticalFinancials?: boolean;
}

function missingField(e: FinancialMetricEvidence): string | null {
  if (!e.metricKey) return "metricKey";
  if (!Number.isFinite(e.value)) return "value";
  if (!e.currency?.trim()) return "currency";
  if (!e.units?.trim()) return "units";
  if (!e.entity?.companyId?.trim()) return "entity.companyId";
  if (!e.entity?.consolidationPerimeter?.trim()) return "entity.consolidationPerimeter";
  if (!e.sourceDocument?.documentId?.trim()) return "sourceDocument.documentId";
  if (!e.sourceDocument?.exactLocation?.trim()) return "sourceDocument.exactLocation";
  if (!e.reportingPeriod?.trim()) return "reportingPeriod";
  if (!e.measurementDate?.trim()) return "measurementDate";
  if (!e.accountingDefinition?.trim()) return "accountingDefinition";
  if (!e.amendmentRestatementStatus) return "amendmentRestatementStatus";
  if (!e.verificationStatus) return "verificationStatus";
  if (!e.authenticity) return "authenticity";
  if (!e.provenanceId?.trim()) return "provenanceId";
  return null;
}

/**
 * Fail-closed financial evidence validation for orchestration.
 * Does not invent figures. Extraction ≠ verification.
 */
export function validateFinancialEvidenceBundle(
  args: ValidateFinancialEvidenceArgs,
): FinancialEvidenceValidationResult {
  const blockers: string[] = [];
  const refusalReasons: FinancialEvidenceRefusalReason[] = [];
  const metrics = args.evidence.metrics;

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

  let anySynthetic = false;
  let anyStipulated = false;
  let allAuthenticVerified = metrics.length > 0;

  for (const e of metrics) {
    const missing = missingField(e);
    if (missing) {
      blockers.push(`financial evidence missing required field: ${missing}`);
      refusalReasons.push("MISSING_REQUIRED_FIELD");
      allAuthenticVerified = false;
      continue;
    }

    if (e.entity.companyId !== args.expectedCompanyId) {
      blockers.push(
        `wrong entity: evidence companyId "${e.entity.companyId}" ≠ expected "${args.expectedCompanyId}"`,
      );
      refusalReasons.push("WRONG_ENTITY");
      allAuthenticVerified = false;
    }

    if (e.currency !== args.expectedCurrency) {
      blockers.push(
        `wrong currency: evidence "${e.currency}" ≠ expected "${args.expectedCurrency}"`,
      );
      refusalReasons.push("WRONG_CURRENCY");
      allAuthenticVerified = false;
    }

    if (
      args.expectedReportingPeriod &&
      e.reportingPeriod !== args.expectedReportingPeriod
    ) {
      blockers.push(
        `wrong accounting period: evidence "${e.reportingPeriod}" ≠ expected "${args.expectedReportingPeriod}"`,
      );
      refusalReasons.push("WRONG_ACCOUNTING_PERIOD");
      allAuthenticVerified = false;
    }

    if (
      e.amendmentRestatementStatus === "RESTATED" ||
      e.amendmentRestatementStatus === "SUPERSEDED"
    ) {
      blockers.push(
        `financial evidence is ${e.amendmentRestatementStatus} — cannot establish authoritative capacity inputs`,
      );
      refusalReasons.push("RESTATED_OR_SUPERSEDED");
      allAuthenticVerified = false;
    }

    if (e.verificationStatus !== "VERIFIED") {
      blockers.push(
        `verificationStatus ${e.verificationStatus} — extracted values are not verified merely because they came from a document`,
      );
      refusalReasons.push("UNVERIFIED_EXTRACTION");
      allAuthenticVerified = false;
    }

    if (e.authenticity === "SYNTHETIC_LABELED") {
      anySynthetic = true;
      allAuthenticVerified = false;
      if (!args.allowHypotheticalFinancials) {
        blockers.push(
          "SYNTHETIC_LABELED financial evidence cannot establish production authority",
        );
        refusalReasons.push("SYNTHETIC_FIXTURE");
      }
    } else if (e.authenticity === "CALLER_STIPULATED_HYPOTHETICAL") {
      anyStipulated = true;
      allAuthenticVerified = false;
      if (!args.allowHypotheticalFinancials) {
        blockers.push(
          "CALLER_STIPULATED_HYPOTHETICAL financial values cannot establish production authority",
        );
        refusalReasons.push("CALLER_STIPULATED");
      }
    } else if (e.authenticity !== "AUTHENTIC") {
      blockers.push("financial evidence authenticity is not AUTHENTIC");
      refusalReasons.push("UNVERIFIED_EXTRACTION");
      allAuthenticVerified = false;
    }

    if (e.maxAgeDays != null && e.maxAgeDays >= 0) {
      const measured = Date.parse(e.measurementDate.slice(0, 10));
      const evalAt = Date.parse(args.evaluationAsOf.slice(0, 10));
      if (Number.isFinite(measured) && Number.isFinite(evalAt)) {
        const ageDays = (evalAt - measured) / (24 * 60 * 60 * 1000);
        if (ageDays > e.maxAgeDays) {
          blockers.push(
            `financial evidence stale: age ${Math.floor(ageDays)}d > maxAgeDays ${e.maxAgeDays}`,
          );
          refusalReasons.push("STALE_SNAPSHOT");
          allAuthenticVerified = false;
        }
      }
    }
  }

  const uniqueReasons = [...new Set(refusalReasons)];
  const uniqueBlockers = [...new Set(blockers)];

  const productionAuthoritative =
    allAuthenticVerified &&
    !anySynthetic &&
    !anyStipulated &&
    uniqueBlockers.length === 0 &&
    args.evidence.requiredMetricKeys.every((k) => byKey.has(k));

  // Hypothetical hatch clears only SYNTHETIC / CALLER_STIPULATED — hard identity
  // and verification failures still refuse.
  let hypotheticalOk = productionAuthoritative;
  if (!productionAuthoritative && args.allowHypotheticalFinancials) {
    const hard = uniqueReasons.filter(
      (r) => r !== "SYNTHETIC_FIXTURE" && r !== "CALLER_STIPULATED",
    );
    hypotheticalOk =
      hard.length === 0 &&
      args.evidence.requiredMetricKeys.every((k) => byKey.has(k)) &&
      metrics.every((m) => {
        const missing = missingField(m);
        return (
          missing == null &&
          m.entity.companyId === args.expectedCompanyId &&
          m.currency === args.expectedCurrency &&
          m.verificationStatus === "VERIFIED" &&
          m.amendmentRestatementStatus !== "RESTATED" &&
          m.amendmentRestatementStatus !== "SUPERSEDED"
        );
      });
  }

  return {
    ok: productionAuthoritative || hypotheticalOk,
    productionAuthoritative,
    hypotheticalOk,
    blockers: uniqueBlockers,
    refusalReasons: uniqueReasons,
  };
}
