/**
 * Product boundary for contractual metric / leverage evaluation (§17).
 *
 * Product surfaces must not import `contract-model/runtime/*` directly.
 * This module is the allowed entry for expression evaluation, leverage/coverage
 * denominator policy, financial-dependency fulfillment, and fixture resolvers
 * used by contractual EBITDA / leverage calculation.
 *
 * Does not weaken verified-execution REQUIRE for capacity/transaction paths —
 * those remain exclusively behind verified-execution.ts.
 */

export { evaluateExpression } from "./runtime/evaluate-expression";
export { evaluateLeverageOrCoverageRatio } from "./runtime/leverage-ratio";
export type { LeverageRatioKind } from "./runtime/leverage-ratio";
export {
  buildFinancialInformationRequest,
  fulfillFinancialDependencyManifest,
  proveConditionalClearance,
  selectConditionalPaths,
  evaluateConditionalPathsAuthoritatively,
  resolveLivePathAuthority,
  expressionIdentityFingerprint,
  verifySelectedPathAuthority,
  authorityShowsLeafInactive,
} from "./runtime/input/information-request";
export type {
  FulfillmentState,
  FulfillmentPolicy,
  FulfilledDependency,
  FinancialInformationRequest,
  ConditionalPathDisposition,
  ConditionalPathDispositionKind,
  InformationRequestExecutionMode,
  SelectedPathAuthority,
} from "./runtime/input/information-request";
export type { FinancialSnapshot } from "./runtime/input/types";
export { fixtureInputResolver, metricInput } from "./runtime/input-resolver";
export {
  rational,
  rationalFromNumber,
  toApproximateNumber,
} from "./runtime/decimal";
export type { Rational } from "./runtime/decimal";
export { money } from "./runtime/values";
export type { InputProvenance } from "./runtime/types";
