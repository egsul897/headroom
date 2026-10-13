/**
 * Product contractual-metric calculation results (vertical slice).
 * Status vocabulary is fail-closed: never invent a number when evidence is incomplete.
 */

import type { EvaluationResult } from "@/lib/contract-model/runtime/types";
import type { IRDefinition } from "@/lib/contract-model/ir/types";
import type { FinancialInputReadiness } from "@/lib/contract-model/financial-definitions/types";

export type ContractualMetricStatus =
  | "CALCULATED"
  | "NEEDS_INPUT"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED"
  | "NO_PACKAGE";

export interface ContractualMetricLineItem {
  key: string;
  label: string;
  amountMillions: number | null;
  role: "BASE" | "ADDBACK" | "DEDUCTION" | "UNSUPPORTED" | "RESULT";
  readiness: FinancialInputReadiness;
  sourceCitation: string;
  notes?: string;
}

export interface ContractualMetricResult {
  metricKey: string;
  displayName: string;
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  sectionRef: string;
  measurementPeriod: string;
  asOf: string;
  status: ContractualMetricStatus;
  /** Present only when status === CALCULATED. Unit: USD millions. */
  valueMillions: number | null;
  unit: "USD_MILLIONS" | "RATIO";
  formulaSummary: string;
  lineItems: ContractualMetricLineItem[];
  unsupportedMechanics: string[];
  missingInputs: string[];
  evaluation: EvaluationResult | null;
  definition: IRDefinition | null;
  /** Whether this is a definition-executed result (true) vs a flat-field proxy (false). */
  definitionExecuted: boolean;
  authorityLabel:
    | "DEFINITION_EXECUTED_PROVISIONAL"
    | "DEFINITION_EXECUTED_VERIFIED_INPUTS"
    | "NOT_CALCULATED";
  persisted: boolean;
  persistNote: string;
}

export interface ContractualMetricsBundle {
  companyId: string;
  asOf: string;
  instrumentKey: string | null;
  metrics: ContractualMetricResult[];
  /** Convenience pointers */
  consolidatedEbitda: ContractualMetricResult | null;
  totalNetLeverage: ContractualMetricResult | null;
  securedNetLeverage: ContractualMetricResult | null;
  interestCoverage: ContractualMetricResult | null;
}
