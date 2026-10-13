/** Plain JSON props for dashboard — no EvaluationResult / BigInt. */

import type { ContractualMetricResult, ContractualMetricsBundle } from "./types";

export interface ContractualMetricView {
  metricKey: string;
  displayName: string;
  status: ContractualMetricResult["status"];
  valueMillions: number | null;
  unit: "USD_MILLIONS" | "RATIO";
  formulaSummary: string;
  measurementPeriod: string;
  asOf: string;
  instrumentKey: string;
  sourceDocumentId: string;
  sectionRef: string;
  lineItems: ContractualMetricResult["lineItems"];
  unsupportedMechanics: string[];
  missingInputs: string[];
  definitionExecuted: boolean;
  authorityLabel: ContractualMetricResult["authorityLabel"];
  /** True when authority is provisional / not approved snapshot. */
  isProvisional: boolean;
  persistNote: string;
  evaluationStatus: string | null;
  sourceCitations: string[];
  inputsUsed: string[];
}

export function isProvisionalContractualAuthority(
  authorityLabel: ContractualMetricResult["authorityLabel"] | string | null | undefined,
): boolean {
  const label = String(authorityLabel ?? "");
  return (
    label.includes("PROVISIONAL") ||
    label === "DEFINITION_EXECUTED_PROVISIONAL" ||
    label === "NOT_CALCULATED"
  );
}

export interface ContractualMetricsView {
  companyId: string;
  asOf: string;
  instrumentKey: string | null;
  metrics: ContractualMetricView[];
}

export function toContractualMetricsView(bundle: ContractualMetricsBundle): ContractualMetricsView {
  return {
    companyId: bundle.companyId,
    asOf: bundle.asOf,
    instrumentKey: bundle.instrumentKey,
    metrics: bundle.metrics.map((m) => ({
      metricKey: m.metricKey,
      displayName: m.displayName,
      status: m.status,
      valueMillions: m.valueMillions,
      unit: m.unit,
      formulaSummary: m.formulaSummary,
      measurementPeriod: m.measurementPeriod,
      asOf: m.asOf,
      instrumentKey: m.instrumentKey,
      sourceDocumentId: m.sourceDocumentId,
      sectionRef: m.sectionRef,
      lineItems: m.lineItems,
      unsupportedMechanics: m.unsupportedMechanics,
      missingInputs: m.missingInputs,
      definitionExecuted: m.definitionExecuted,
      authorityLabel: m.authorityLabel,
      isProvisional: isProvisionalContractualAuthority(m.authorityLabel),
      persistNote: m.persistNote,
      evaluationStatus: m.evaluation?.status ?? null,
      sourceCitations: m.evaluation?.provenance.sourceCitations ?? [],
      inputsUsed: (m.evaluation?.provenance.inputsUsed ?? []).map((i) => i.key),
    })),
  };
}
