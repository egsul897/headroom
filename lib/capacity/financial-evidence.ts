/**
 * Authenticated financial metric evidence (HEADROOM-2 Scope A).
 *
 * Extracted values are never treated as verified merely because they came from
 * a document. This module does not manufacture figures — callers supply values
 * that already exist; validation only decides whether they may be trusted as
 * production financial inputs.
 */

import {
  authorizeCompletenessIssuer,
  type TrustedIssuerAuthorizationContext,
} from "./completeness-issuer-auth";
import type { CompletenessIssuerRole } from "./utilization-types";

/** Capacity-relevant financial metrics (generalized; additive). */
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

export interface FinancialSourceLocation {
  /** Document / filing identity (HEADROOM-3 supplies durable ids when available). */
  documentId: string;
  /** Exact locator: page, section, table, row, line, or XBRL concept path. */
  exactLocation: string;
  excerpt?: string | null;
}

export interface FinancialEntityIdentity {
  companyId: string;
  /** Legal / reporting entity name when known. */
  entityName: string | null;
  /** Consolidation perimeter description (e.g. "Borrower and Restricted Subsidiaries"). */
  consolidationPerimeter: string;
}

export interface FinancialMetricEvidence {
  metricKey: FinancialMetricKey;
  /** Caller-supplied numeric value — never invented by this module. */
  value: number;
  currency: string;
  /** Unit label (e.g. USD_MILLIONS, USD, PERCENT). */
  units: string;
  entity: FinancialEntityIdentity;
  sourceDocument: FinancialSourceLocation;
  reportingPeriod: string;
  measurementDate: string;
  accountingDefinition: string;
  amendmentRestatementStatus: AmendmentRestatementStatus;
  verificationStatus: FinancialVerificationStatus;
  authenticity: FinancialEvidenceAuthenticity;
  /**
   * Claimed issuer/reviewer on the evidence blob. Never trusted alone —
   * must resolve via TrustedIssuerAuthorizationContext for production.
   */
  issuer?: {
    role: CompletenessIssuerRole;
    actorId: string;
    attestedAt?: string;
  };
  /** Opaque provenance identity (hash / chain id). Tampering breaks equality. */
  provenanceId: string;
  /** Optional freshness window (days) from measurementDate. */
  maxAgeDays?: number | null;
}

export type FinancialEvidenceRefusalReason =
  | "MISSING_REQUIRED_FIELD"
  | "UNVERIFIED_EXTRACTION"
  | "SYNTHETIC_FIXTURE"
  | "CALLER_STIPULATED"
  | "STALE_SNAPSHOT"
  | "WRONG_ENTITY"
  | "WRONG_CURRENCY"
  | "WRONG_ACCOUNTING_PERIOD"
  | "RESTATED_OR_SUPERSEDED"
  | "MISSING_TRUSTED_HOST_CONTEXT"
  | "UNAUTHORIZED_ISSUER"
  | "FORGED_ISSUER"
  | "TAMPERED_PROVENANCE"
  | "PRODUCTION_FIXTURE_REFUSED";

export interface FinancialEvidenceValidationArgs {
  evidence: FinancialMetricEvidence;
  /** Expected company for the capacity evaluation. */
  expectedCompanyId: string;
  /** Expected currency for the capacity path (when set). */
  expectedCurrency?: string | null;
  /** Expected reporting period (when set). */
  expectedReportingPeriod?: string | null;
  /** Evaluation as-of date (ISO) for staleness. */
  evaluationAsOf: string;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /**
   * Expected provenance id when the caller holds a prior binding.
   * Mismatch → TAMPERED_PROVENANCE.
   */
  expectedProvenanceId?: string | null;
  /** Test/demo only — never set by production loaders. */
  allowSynthetic?: boolean;
  /** Test/demo only — never set by production loaders. */
  allowCallerStipulated?: boolean;
}

export interface FinancialEvidenceValidationResult {
  ok: boolean;
  /** True only when AUTHENTIC + VERIFIED + trusted issuer + non-fixture identity. */
  productionAuthoritative: boolean;
  blockers: string[];
  refusalReasons: FinancialEvidenceRefusalReason[];
}

function asOfDay(iso: string): string {
  return iso.slice(0, 10);
}

function missingField(evidence: FinancialMetricEvidence): string | null {
  if (!evidence.metricKey) return "metricKey";
  if (!Number.isFinite(evidence.value)) return "value";
  if (!evidence.currency?.trim()) return "currency";
  if (!evidence.units?.trim()) return "units";
  if (!evidence.entity?.companyId?.trim()) return "entity.companyId";
  if (!evidence.entity?.consolidationPerimeter?.trim()) return "entity.consolidationPerimeter";
  if (!evidence.sourceDocument?.documentId?.trim()) return "sourceDocument.documentId";
  if (!evidence.sourceDocument?.exactLocation?.trim()) return "sourceDocument.exactLocation";
  if (!evidence.reportingPeriod?.trim()) return "reportingPeriod";
  if (!evidence.measurementDate?.trim()) return "measurementDate";
  if (!evidence.accountingDefinition?.trim()) return "accountingDefinition";
  if (!evidence.amendmentRestatementStatus) return "amendmentRestatementStatus";
  if (!evidence.verificationStatus) return "verificationStatus";
  if (!evidence.authenticity) return "authenticity";
  if (!evidence.provenanceId?.trim()) return "provenanceId";
  return null;
}

/**
 * Validate one financial metric as capacity input evidence.
 * Fail-closed: extraction, synthetic, stipulated, stale, wrong identity,
 * restated/superseded, missing host trust, or forged issuer all refuse
 * production authority.
 */
export function validateFinancialMetricEvidence(
  args: FinancialEvidenceValidationArgs,
): FinancialEvidenceValidationResult {
  const blockers: string[] = [];
  const refusalReasons: FinancialEvidenceRefusalReason[] = [];
  const e = args.evidence;

  const missing = missingField(e);
  if (missing) {
    return {
      ok: false,
      productionAuthoritative: false,
      blockers: [`financial evidence missing required field: ${missing}`],
      refusalReasons: ["MISSING_REQUIRED_FIELD"],
    };
  }

  if (e.entity.companyId !== args.expectedCompanyId) {
    blockers.push(
      `wrong entity: evidence companyId "${e.entity.companyId}" ≠ expected "${args.expectedCompanyId}"`,
    );
    refusalReasons.push("WRONG_ENTITY");
  }

  if (args.expectedCurrency && e.currency !== args.expectedCurrency) {
    blockers.push(
      `wrong currency: evidence "${e.currency}" ≠ expected "${args.expectedCurrency}"`,
    );
    refusalReasons.push("WRONG_CURRENCY");
  }

  if (
    args.expectedReportingPeriod &&
    e.reportingPeriod !== args.expectedReportingPeriod
  ) {
    blockers.push(
      `wrong accounting period: evidence "${e.reportingPeriod}" ≠ expected "${args.expectedReportingPeriod}"`,
    );
    refusalReasons.push("WRONG_ACCOUNTING_PERIOD");
  }

  if (
    e.amendmentRestatementStatus === "RESTATED" ||
    e.amendmentRestatementStatus === "SUPERSEDED"
  ) {
    blockers.push(
      `financial evidence is ${e.amendmentRestatementStatus} — cannot establish authoritative capacity inputs`,
    );
    refusalReasons.push("RESTATED_OR_SUPERSEDED");
  }

  if (
    e.verificationStatus === "UNVERIFIED_EXTRACTION" ||
    e.verificationStatus === "REVIEW_REQUIRED" ||
    e.verificationStatus === "REJECTED"
  ) {
    blockers.push(
      `verificationStatus ${e.verificationStatus} — extracted values are not verified merely because they came from a document`,
    );
    refusalReasons.push("UNVERIFIED_EXTRACTION");
  }

  if (e.authenticity === "SYNTHETIC_LABELED") {
    if (!args.allowSynthetic) {
      blockers.push("SYNTHETIC_LABELED financial evidence cannot establish production authority");
      refusalReasons.push("SYNTHETIC_FIXTURE");
    }
  } else if (e.authenticity === "CALLER_STIPULATED_HYPOTHETICAL") {
    if (!args.allowCallerStipulated) {
      blockers.push(
        "CALLER_STIPULATED_HYPOTHETICAL financial values cannot establish production authority",
      );
      refusalReasons.push("CALLER_STIPULATED");
    }
  } else if (e.authenticity !== "AUTHENTIC") {
    blockers.push("financial evidence authenticity is not AUTHENTIC");
    refusalReasons.push("UNVERIFIED_EXTRACTION");
  }

  if (args.expectedProvenanceId != null && args.expectedProvenanceId !== e.provenanceId) {
    blockers.push("provenance identity mismatch — tampered or unbound financial evidence");
    refusalReasons.push("TAMPERED_PROVENANCE");
  }

  if (e.maxAgeDays != null && e.maxAgeDays >= 0) {
    const measured = Date.parse(asOfDay(e.measurementDate));
    const evalAt = Date.parse(asOfDay(args.evaluationAsOf));
    if (Number.isFinite(measured) && Number.isFinite(evalAt)) {
      const ageDays = Math.floor((evalAt - measured) / (24 * 60 * 60 * 1000));
      if (ageDays > e.maxAgeDays) {
        blockers.push(
          `stale financial snapshot: measurementDate ${asOfDay(e.measurementDate)} exceeds maxAgeDays ${e.maxAgeDays} as of ${asOfDay(args.evaluationAsOf)}`,
        );
        refusalReasons.push("STALE_SNAPSHOT");
      }
    }
  }

  // Production authority: AUTHENTIC + VERIFIED + trusted issuer with non-fixture identity.
  let productionAuthoritative = false;
  if (
    e.authenticity === "AUTHENTIC" &&
    e.verificationStatus === "VERIFIED" &&
    refusalReasons.length === 0
  ) {
    if (!e.issuer?.actorId || !e.issuer?.role) {
      blockers.push(
        "production financial authority requires authenticated issuer (actorId + role)",
      );
      refusalReasons.push("MISSING_TRUSTED_HOST_CONTEXT");
    } else if (args.trustedIssuerAuth == null) {
      blockers.push(
        "trusted issuer authorization context missing — cannot establish production financial authority",
      );
      refusalReasons.push("MISSING_TRUSTED_HOST_CONTEXT");
    } else {
      const auth = authorizeCompletenessIssuer(
        { actorId: e.issuer.actorId, role: e.issuer.role },
        args.trustedIssuerAuth,
      );
      if (!auth.ok) {
        const forged = auth.blockers.some((b) => /not found|forged/i.test(b));
        blockers.push(...auth.blockers);
        refusalReasons.push(forged ? "FORGED_ISSUER" : "UNAUTHORIZED_ISSUER");
      } else if (!args.trustedIssuerAuth.requireNonFixtureIdentity) {
        blockers.push(
          "production financial authority requires trustedIssuerAuth.requireNonFixtureIdentity",
        );
        refusalReasons.push("PRODUCTION_FIXTURE_REFUSED");
      } else if (
        auth.matchedPrincipal &&
        auth.matchedPrincipal.identityAssurance !== "SESSION_AUTHENTICATED" &&
        auth.matchedPrincipal.identityAssurance !== "SERVICE_ACCOUNT"
      ) {
        blockers.push(
          "production financial authority requires SESSION_AUTHENTICATED or SERVICE_ACCOUNT issuer identity",
        );
        refusalReasons.push("PRODUCTION_FIXTURE_REFUSED");
      } else {
        productionAuthoritative = true;
      }
    }
  }

  const ok =
    refusalReasons.length === 0 &&
    (productionAuthoritative ||
      (args.allowSynthetic === true && e.authenticity === "SYNTHETIC_LABELED") ||
      (args.allowCallerStipulated === true &&
        e.authenticity === "CALLER_STIPULATED_HYPOTHETICAL"));

  return {
    ok,
    productionAuthoritative,
    blockers: [...new Set(blockers)],
    refusalReasons: [...new Set(refusalReasons)],
  };
}

/** Bundle of metrics for one company as-of (capacity financial snapshot evidence). */
export interface AuthenticatedFinancialSnapshotEvidence {
  companyId: string;
  asOf: string;
  reportingPeriod: string;
  currency: string;
  metrics: readonly FinancialMetricEvidence[];
  provenanceId: string;
}

export interface SnapshotEvidenceValidationResult {
  ok: boolean;
  productionAuthoritative: boolean;
  metricResults: Record<string, FinancialEvidenceValidationResult>;
  blockers: string[];
}

/**
 * Validate a multi-metric financial snapshot. Production authority requires
 * every required metric to be production-authoritative under the same host trust.
 */
export function validateAuthenticatedFinancialSnapshot(
  snapshot: AuthenticatedFinancialSnapshotEvidence,
  args: {
    requiredMetrics: readonly FinancialMetricKey[];
    evaluationAsOf: string;
    trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
    expectedProvenanceId?: string | null;
    allowSynthetic?: boolean;
    allowCallerStipulated?: boolean;
  },
): SnapshotEvidenceValidationResult {
  const metricResults: Record<string, FinancialEvidenceValidationResult> = {};
  const blockers: string[] = [];

  if (args.expectedProvenanceId != null && args.expectedProvenanceId !== snapshot.provenanceId) {
    blockers.push("snapshot provenance identity mismatch — tampered financial snapshot");
  }

  for (const key of args.requiredMetrics) {
    const metric = snapshot.metrics.find((m) => m.metricKey === key);
    if (!metric) {
      const missing: FinancialEvidenceValidationResult = {
        ok: false,
        productionAuthoritative: false,
        blockers: [`required financial metric ${key} missing from snapshot`],
        refusalReasons: ["MISSING_REQUIRED_FIELD"],
      };
      metricResults[key] = missing;
      blockers.push(...missing.blockers);
      continue;
    }
    const result = validateFinancialMetricEvidence({
      evidence: metric,
      expectedCompanyId: snapshot.companyId,
      expectedCurrency: snapshot.currency,
      expectedReportingPeriod: snapshot.reportingPeriod,
      evaluationAsOf: args.evaluationAsOf,
      trustedIssuerAuth: args.trustedIssuerAuth,
      allowSynthetic: args.allowSynthetic,
      allowCallerStipulated: args.allowCallerStipulated,
    });
    // Also bind metric entity to snapshot company.
    if (metric.entity.companyId !== snapshot.companyId) {
      result.ok = false;
      result.productionAuthoritative = false;
      result.blockers.push("metric entity companyId disagrees with snapshot companyId");
      result.refusalReasons.push("WRONG_ENTITY");
    }
    metricResults[key] = result;
    blockers.push(...result.blockers);
  }

  const requiredResults = args.requiredMetrics.map((k) => metricResults[k]!);
  const productionAuthoritative =
    blockers.filter((b) => /provenance identity mismatch/i.test(b)).length === 0 &&
    requiredResults.every((r) => r.productionAuthoritative);
  const ok =
    productionAuthoritative ||
    (Boolean(args.allowSynthetic || args.allowCallerStipulated) &&
      requiredResults.every((r) => r.ok));

  return {
    ok,
    productionAuthoritative,
    metricResults,
    blockers: [...new Set(blockers)],
  };
}
