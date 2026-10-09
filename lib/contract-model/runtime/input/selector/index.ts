/** NS-6 — contractual selector → snapshot identity resolution (public exports). */
export type {
  DeliveryKind,
  DeliveryRecord,
  FiscalCalendar,
  NamedContractualSelector,
  ResolveSelectorRequest,
  SelectorResolutionEvidence,
  SelectorResolutionPolicy,
  SelectorResolutionResult,
  SelectorResolutionState,
} from "./types";
export { DEFAULT_SELECTOR_RESOLUTION_POLICY } from "./types";
export {
  assertIsoDate,
  fiscalYearEnd,
  fourConsecutiveQuartersMostRecentlyEnded,
  isoCompare,
  isoDate,
  mostRecentlyEndedFiscalQuarter,
  mostRecentlyEndedFiscalYear,
  parseIso,
  quarterEndsForFiscalYear,
} from "./fiscal";
export { lookupNamedSelector, normalizeSelectorText } from "./registry";
export { resolveContractualSelector, selectSnapshotForResolvedSelector } from "./resolve";
