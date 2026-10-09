export type {
  CustomerOutcomeKind,
  ControllingCitation,
  StructuredTransaction,
  StructuredTransactionKind,
  OutcomeClassification,
  EngineAuthorityLabel,
} from "./types";

export { classifyCustomerOutcome, outcomeTone, type ConstraintSignal } from "./outcome";
export {
  fingerprintVerifiedState,
  fingerprintSimulationRequest,
  newHandoffId,
} from "./fingerprint";
export {
  loadVerifiedCustomerState,
  capacitySidesFromState,
  type VerifiedCustomerState,
} from "./state";
export { buildPositionView, loadPositionView, type PositionView, type PositionBasketRow, type PositionRatioRow } from "./position";
export {
  runUnifiedSimulation,
  simulateHrefFromStructured,
  type SimulateRequest,
  type UnifiedSimulateResult,
} from "./simulate";
export {
  analyzeAskForSimulate,
  structuredTransactionFromDraft,
  structuredTransactionFromSearchParams,
  refineKindFromQuestion,
  type UnifiedAskResult,
} from "./ask-bridge";
