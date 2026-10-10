export { CVF_VERSION, CVF_GROUND_TRUTH_CONTRACT_VERSION, CVF_METRICS_VERSION, CVF_HOLDOUT_SEAL_VERSION } from "./version";
export type * from "./types";
export {
  validateGroundTruthProvenance,
  caseHasIndependentGroundTruth,
  assertExpectationsFrozen,
} from "./provenance";
export {
  holdoutUnlockEnabled,
  makeHoldoutSeal,
  openHoldoutSeal,
  publicHoldoutView,
  computePayloadSha256,
  type HoldoutSealEnvelope,
  type SealedHoldoutPayload,
} from "./holdout";
export { aggregateMetrics, formatMetricsReport } from "./metrics";
export { runHarness, executeCase, CI_TIER_PLAN } from "./harness";
export {
  listPublicRegistryCases,
  listExecutableRegistryCases,
  diversityReport,
  EXAMPLE_HOLDOUT_SEAL_META,
} from "./corpus/registry";
export { MATRIX_AXES, FIRST_1000_FAMILIES, summarizeFirst1000Plan } from "./generate/first-1000-plan";
export { auditAdapterProductionBinding, PRODUCTION_IMPORT_REQUIREMENTS } from "./adapters/production-binding";
export { computeCoverageDenominators, type CoverageDenominators } from "./coverage";
export {
  listGroundedExpansionCases,
  groundedExpansionCounts,
  BOUNDARY_ADAPTER_REMAP,
} from "./corpus/grounded-expansion";
export {
  KNOWN_STANDING_INCORRECT_FAVORABLES,
  isKnownStandingIncorrectFavorable,
} from "./known-standing-defects";
