/**
 * Reconcile financial-statement figures against certificate calculations.
 *
 * - Never invent missing counterparts.
 * - GAAP vs contractual EBITDA is an explicit finding, not a silent substitute.
 * - Extracted certificate figures alone never yield APPROVED disposition.
 */

import type {
  DocumentExtraction,
  ExtractedMetric,
  MetricFamily,
  ReconciliationReport,
  ReconcileFinding,
  SnapshotDisposition,
} from "./types";

export const DEFAULT_RECONCILE_TOLERANCE = 0.01;

const COMPARABLE_FAMILIES: MetricFamily[] = [
  "CONTRACTUAL_EBITDA",
  "TOTAL_DEBT",
  "SECURED_DEBT",
  "FIRST_LIEN_DEBT",
  "CASH",
  "TOTAL_ASSETS",
  "INTEREST_EXPENSE",
  "FIXED_CHARGES",
  "CUMULATIVE_NET_INCOME",
  "EQUITY_PROCEEDS",
  "LEVERAGE_RATIO",
  "INTEREST_COVERAGE",
];

function relativeDifference(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

function metricByFamily(extraction: DocumentExtraction | null, family: MetricFamily): ExtractedMetric | null {
  if (!extraction) return null;
  return extraction.metrics.find((m) => m.family === family) ?? null;
}

function staleDays(asOf: string, now: Date): number {
  return (now.getTime() - new Date(asOf).getTime()) / (1000 * 60 * 60 * 24);
}

export interface ReconcileParams {
  companyId: string;
  statement: DocumentExtraction | null;
  certificate: DocumentExtraction | null;
  /** Injected clock for staleness — never Date.now() inside. */
  now?: Date;
  toleranceRelative?: number;
  /** Max age in days before STALE_PERIOD (default 120). */
  staleAfterDays?: number;
}

export function reconcileStatementAgainstCertificate(params: ReconcileParams): ReconciliationReport {
  const { companyId, statement, certificate } = params;
  const now = params.now ?? new Date();
  const tolerance = params.toleranceRelative ?? DEFAULT_RECONCILE_TOLERANCE;
  const staleAfterDays = params.staleAfterDays ?? 120;
  const findings: ReconcileFinding[] = [];
  const missingInputKeys: string[] = [];

  const asOfDate = certificate?.identity.fiscalDate ?? statement?.identity.fiscalDate ?? null;
  const reportingPeriod =
    certificate?.identity.reportingPeriod ?? statement?.identity.reportingPeriod ?? null;

  if (!statement && !certificate) {
    return {
      companyId,
      statementDocumentId: null,
      certificateDocumentId: null,
      asOfDate,
      reportingPeriod,
      findings: [
        {
          code: "MISSING_COUNTERPART",
          metricFamily: "PROCESS",
          message: "Neither financial statement nor certificate was supplied.",
          statementValue: null,
          certificateValue: null,
          relativeDifference: null,
          statementSource: null,
          certificateSource: null,
        },
      ],
      matchedMetricCount: 0,
      discrepancyCount: 1,
      missingInputKeys: ["financial_statement", "compliance_certificate"],
      disposition: "BLOCKED",
      dispositionReason: "No source documents to reconcile.",
    };
  }

  if (!statement) missingInputKeys.push("financial_statement");
  if (!certificate) missingInputKeys.push("compliance_certificate");

  if (statement && !statement.identity.currency) {
    findings.push({
      code: "MISSING_CURRENCY",
      metricFamily: "PROCESS",
      message: "Financial statement currency could not be identified.",
      statementValue: null,
      certificateValue: null,
      relativeDifference: null,
      statementSource: null,
      certificateSource: null,
    });
    missingInputKeys.push("statement_currency");
  }
  if (certificate && !certificate.identity.currency) {
    findings.push({
      code: "MISSING_CURRENCY",
      metricFamily: "PROCESS",
      message: "Certificate currency could not be identified.",
      statementValue: null,
      certificateValue: null,
      relativeDifference: null,
      statementSource: null,
      certificateSource: null,
    });
    missingInputKeys.push("certificate_currency");
  }

  if (
    statement?.identity.fiscalDate &&
    certificate?.identity.fiscalDate &&
    statement.identity.fiscalDate !== certificate.identity.fiscalDate
  ) {
    findings.push({
      code: "PERIOD_MISMATCH",
      metricFamily: "PERIOD",
      message: `Statement fiscal date ${statement.identity.fiscalDate} ≠ certificate fiscal date ${certificate.identity.fiscalDate}.`,
      statementValue: null,
      certificateValue: null,
      relativeDifference: null,
      statementSource: null,
      certificateSource: null,
    });
  }

  if (asOfDate && staleDays(asOfDate, now) > staleAfterDays) {
    findings.push({
      code: "STALE_PERIOD",
      metricFamily: "PERIOD",
      message: `Reporting as-of ${asOfDate} is older than ${staleAfterDays} days relative to evaluation time.`,
      statementValue: null,
      certificateValue: null,
      relativeDifference: null,
      statementSource: null,
      certificateSource: null,
    });
  }

  for (const schedule of certificate?.missingSchedules ?? []) {
    findings.push({
      code: "MISSING_SCHEDULE",
      metricFamily: "SCHEDULE",
      message: `Certificate references baskets but ${schedule} is not present.`,
      statementValue: null,
      certificateValue: null,
      relativeDifference: null,
      statementSource: null,
      certificateSource: null,
    });
    missingInputKeys.push(schedule);
  }

  // GAAP vs contractual EBITDA — always surface when both exist.
  const gaap = metricByFamily(statement, "GAAP_EBITDA") ?? metricByFamily(certificate, "GAAP_EBITDA");
  const contractual =
    metricByFamily(certificate, "CONTRACTUAL_EBITDA") ?? metricByFamily(statement, "CONTRACTUAL_EBITDA");
  if (gaap && contractual) {
    const rel = relativeDifference(gaap.canonicalValue, contractual.canonicalValue);
    findings.push({
      code: "GAAP_VS_CONTRACTUAL_EBITDA",
      metricFamily: "CONTRACTUAL_EBITDA",
      message:
        rel > tolerance
          ? `Contractual EBITDA (${contractual.canonicalValue}) differs from GAAP/reported EBITDA (${gaap.canonicalValue}) by ${(rel * 100).toFixed(2)}%. Capacity must use contractual; GAAP is not substituted.`
          : `GAAP and contractual EBITDA are within tolerance but remain distinct identities; capacity still binds to contractual only.`,
      statementValue: gaap.canonicalValue,
      certificateValue: contractual.canonicalValue,
      relativeDifference: rel,
      statementSource: gaap.source,
      certificateSource: contractual.source,
    });
  } else if (gaap && !contractual) {
    missingInputKeys.push("contractual_ebitda");
    findings.push({
      code: "MISSING_COUNTERPART",
      metricFamily: "CONTRACTUAL_EBITDA",
      message:
        "GAAP/reported EBITDA is present but contractual/covenant EBITDA is missing. Refusing to use GAAP as capacity EBITDA.",
      statementValue: gaap.canonicalValue,
      certificateValue: null,
      relativeDifference: null,
      statementSource: gaap.source,
      certificateSource: null,
    });
  }

  // Definition consistency: certificate calc name vs definition terms.
  if (certificate) {
    const defTerms = new Set(certificate.definitions.map((d) => d.term.toLowerCase()));
    for (const calc of certificate.certificateCalculations) {
      if (calc.family === "CONTRACTUAL_EBITDA" && defTerms.size > 0) {
        const hasEbitdaDef = [...defTerms].some((t) => t.includes("ebitda"));
        if (!hasEbitdaDef && certificate.definitions.length > 0) {
          findings.push({
            code: "INCONSISTENT_DEFINITION",
            metricFamily: "DEFINITION",
            message: `Certificate reports ${calc.name} but no matching EBITDA definition excerpt was preserved on this document.`,
            statementValue: null,
            certificateValue: calc.reportedValue,
            relativeDifference: null,
            statementSource: null,
            certificateSource: calc.source,
          });
        }
      }
    }
    // Cross-doc definition check when statement carries a conflicting term label.
    if (statement && statement.definitions.length > 0 && certificate.definitions.length > 0) {
      for (const cDef of certificate.definitions) {
        const sDef = statement.definitions.find((d) => d.family === cDef.family);
        if (sDef && sDef.term !== cDef.term) {
          findings.push({
            code: "INCONSISTENT_DEFINITION",
            metricFamily: "DEFINITION",
            message: `Definition term mismatch for ${cDef.family}: statement "${sDef.term}" vs certificate "${cDef.term}".`,
            statementValue: null,
            certificateValue: null,
            relativeDifference: null,
            statementSource: sDef.source,
            certificateSource: cDef.source,
          });
        }
      }
    }
  }

  let matchedMetricCount = 0;
  for (const family of COMPARABLE_FAMILIES) {
    const s = metricByFamily(statement, family);
    const c = metricByFamily(certificate, family);
    if (!s && !c) continue;
    if (s && !c) {
      findings.push({
        code: "MISSING_COUNTERPART",
        metricFamily: family,
        message: `Statement has ${family} but certificate does not.`,
        statementValue: s.canonicalValue,
        certificateValue: null,
        relativeDifference: null,
        statementSource: s.source,
        certificateSource: null,
      });
      continue;
    }
    if (!s && c) {
      findings.push({
        code: "MISSING_COUNTERPART",
        metricFamily: family,
        message: `Certificate has ${family} but statement does not.`,
        statementValue: null,
        certificateValue: c.canonicalValue,
        relativeDifference: null,
        statementSource: null,
        certificateSource: c.source,
      });
      continue;
    }
    if (!s || !c) continue;
    const rel = relativeDifference(s.canonicalValue, c.canonicalValue);
    if (rel <= tolerance) {
      matchedMetricCount += 1;
      findings.push({
        code: "MATCH",
        metricFamily: family,
        message: `${family} matches within ${(tolerance * 100).toFixed(1)}% tolerance.`,
        statementValue: s.canonicalValue,
        certificateValue: c.canonicalValue,
        relativeDifference: rel,
        statementSource: s.source,
        certificateSource: c.source,
      });
    } else {
      findings.push({
        code: "MATERIAL_DIFFERENCE",
        metricFamily: family,
        message: `${family} differs: statement ${s.canonicalValue} vs certificate ${c.canonicalValue} (rel ${(rel * 100).toFixed(2)}%).`,
        statementValue: s.canonicalValue,
        certificateValue: c.canonicalValue,
        relativeDifference: rel,
        statementSource: s.source,
        certificateSource: c.source,
      });
    }
  }

  // Extracted ≠ approved.
  findings.push({
    code: "UNAPPROVED_EXTRACTION",
    metricFamily: "PROCESS",
    message:
      "Extracted certificate and statement figures remain unapproved until an attributable approval transition (NS-4 approve / FINANCIAL_FACT promotion).",
    statementValue: null,
    certificateValue: null,
    relativeDifference: null,
    statementSource: null,
    certificateSource: null,
  });

  const discrepancyCount = findings.filter(
    (f) =>
      f.code === "MATERIAL_DIFFERENCE" ||
      f.code === "PERIOD_MISMATCH" ||
      f.code === "INCONSISTENT_DEFINITION" ||
      f.code === "MISSING_SCHEDULE",
  ).length;

  let disposition: SnapshotDisposition;
  let dispositionReason: string;
  if (!certificate && !statement) {
    disposition = "BLOCKED";
    dispositionReason = "No documents.";
  } else if (discrepancyCount > 0 || missingInputKeys.includes("contractual_ebitda")) {
    disposition = "REVIEW_REQUIRED";
    dispositionReason = "Discrepancies, missing contractual EBITDA, or inconsistent definitions require human review before approval.";
  } else if (!certificate || !statement) {
    disposition = "REVIEW_REQUIRED";
    dispositionReason = "Only one side of the statement/certificate pair is present; review required before approval.";
  } else {
    disposition = "APPROVED_ELIGIBLE";
    dispositionReason =
      "No material discrepancies; snapshot may be approved only via attributable NS-4 / promotion approval — not auto-approved by extraction.";
  }

  return {
    companyId,
    statementDocumentId: statement?.identity.documentId ?? null,
    certificateDocumentId: certificate?.identity.documentId ?? null,
    asOfDate,
    reportingPeriod,
    findings,
    matchedMetricCount,
    discrepancyCount,
    missingInputKeys: [...new Set(missingInputKeys)],
    disposition,
    dispositionReason,
  };
}
