/**
 * Product re-export of the Phase 4A definition-execution boundary.
 * Raw `contract-model/runtime/*` imports stay inside contract-model.
 */

export {
  executeContractualExpression,
  numericFromEvaluation,
  type EvaluationResult,
  type MetricInput,
} from "@/lib/contract-model/definition-execution";
