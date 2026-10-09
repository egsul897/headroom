/**
 * End-to-end financial statement + certificate engine pipeline.
 *
 * 1. Identify documents
 * 2–6. Extract metrics, certificate calcs, definitions, adjustments
 * 7. Link each metric to its source (on ExtractedMetric.source)
 * 8–9. Reconcile and surface discrepancies / stale / missing schedules
 * 10. Produce REVIEW_REQUIRED or APPROVED-eligible proposals via NS-4
 *     (approval remains attributable and separate)
 */

import { extractFromDocumentText } from "./extract";
import { reconcileStatementAgainstCertificate } from "./reconcile";
import {
  positionLeverageInputsFromEngine,
  projectEngineRunToCapacitySnapshotStrict,
} from "./capacity-bridge";
import { deriveContractualMetrics, type DerivedContractualMetric } from "./derived-metrics";
import type { CapacityMetricName, DocumentExtraction, EngineRunResult } from "./types";

export interface PipelineDocumentInput {
  documentId: string;
  text: string;
  declaredType?: string | null;
  filename?: string | null;
  versionHash?: string | null;
}

export interface RunFinancialCertificateEngineParams {
  companyId: string;
  statement?: PipelineDocumentInput | null;
  certificate?: PipelineDocumentInput | null;
  /** Injected clock for staleness checks. */
  now?: Date;
}

function pickCapacityMetrics(
  statement: DocumentExtraction | null,
  certificate: DocumentExtraction | null,
): EngineRunResult["capacityMetrics"] {
  // Prefer certificate (contractual) over statement for capacity-bound names.
  const byName = new Map<CapacityMetricName, EngineRunResult["capacityMetrics"][number]>();

  const consider = (extraction: DocumentExtraction | null) => {
    if (!extraction) return;
    for (const m of extraction.metrics) {
      if (!m.capacityMetricName) continue;
      // Never promote GAAP-labeled rows (capacityMetricName already null for GAAP).
      if (!m.isContractual && m.capacityMetricName === "covenant_ebitda") continue;
      const existing = byName.get(m.capacityMetricName);
      if (existing && existing.isContractual && !m.isContractual) continue;
      // Certificate wins over statement when both contractual.
      if (
        existing &&
        existing.sourceDocumentId !== m.source.documentId &&
        extraction.identity.documentRole === "FINANCIAL_STATEMENT"
      ) {
        continue;
      }
      byName.set(m.capacityMetricName, {
        metricName: m.capacityMetricName,
        value: m.canonicalValue,
        asOfDate: m.asOfDate,
        sourceDocumentId: m.source.documentId,
        isContractual: m.isContractual,
      });
    }
  };

  // Statement first, then certificate overwrites with contractual preference.
  consider(statement);
  consider(certificate);
  return [...byName.values()];
}

export function runFinancialCertificateEngine(params: RunFinancialCertificateEngineParams): EngineRunResult {
  const statement = params.statement
    ? extractFromDocumentText({
        documentId: params.statement.documentId,
        text: params.statement.text,
        declaredType: params.statement.declaredType ?? "FINANCIAL_STATEMENT",
        filename: params.statement.filename,
        versionHash: params.statement.versionHash,
      })
    : null;

  const certificate = params.certificate
    ? extractFromDocumentText({
        documentId: params.certificate.documentId,
        text: params.certificate.text,
        declaredType: params.certificate.declaredType ?? "COMPLIANCE_CERTIFICATE",
        filename: params.certificate.filename,
        versionHash: params.certificate.versionHash,
      })
    : null;

  const reconciliation = reconcileStatementAgainstCertificate({
    companyId: params.companyId,
    statement,
    certificate,
    now: params.now,
  });

  const capacityMetrics = pickCapacityMetrics(statement, certificate);

  const gaap =
    statement?.metrics.find((m) => m.family === "GAAP_EBITDA") ??
    certificate?.metrics.find((m) => m.family === "GAAP_EBITDA");
  const contractual = capacityMetrics.find((m) => m.metricName === "covenant_ebitda");
  let contractualEbitdaDistinctFromGaap: boolean | null = null;
  if (gaap && contractual) {
    contractualEbitdaDistinctFromGaap = Math.abs(gaap.canonicalValue - contractual.value) > 1e-9;
  }

  return {
    statement,
    certificate,
    reconciliation,
    capacityMetrics,
    contractualEbitdaDistinctFromGaap,
  };
}

/** Engine run plus contractual metric derivation (missing → MISSING_INPUT, never invented). */
export function runFinancialCertificateEngineWithDerivedMetrics(
  params: RunFinancialCertificateEngineParams,
): EngineRunResult & { derivedMetrics: DerivedContractualMetric[] } {
  const run = runFinancialCertificateEngine(params);
  return {
    ...run,
    derivedMetrics: deriveContractualMetrics({
      statement: run.statement,
      certificate: run.certificate,
    }),
  };
}

/** Convenience: engine run + capacity/position projections for dashboard consumers. */
export function runEngineWithCapacityProjection(params: RunFinancialCertificateEngineParams) {
  const run = runFinancialCertificateEngine(params);
  return {
    run,
    capacity: projectEngineRunToCapacitySnapshotStrict(run),
    positionLeverage: positionLeverageInputsFromEngine(run),
    derivedMetrics: deriveContractualMetrics({
      statement: run.statement,
      certificate: run.certificate,
    }),
  };
}
