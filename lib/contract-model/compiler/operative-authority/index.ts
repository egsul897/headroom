/**
 * HEADROOM Agent #7 — operative restatement / amendment authority.
 *
 * Public surface for Agent #6 retrieval and Agent #10 execution consumers.
 */

export {
  AGENT7_STARTING_MAIN_SHA,
  OPERATIVE_AUTHORITY_MODULE_VERSION,
  buildOperativeAuthorityHandoffBundle,
  type BuildOperativeAuthorityBundleInput,
} from "./bundle";

export {
  resolveGoverningProvision,
  type AmendmentLikeAuthority,
  type ResolveGoverningProvisionInput,
} from "./governing-provision";

export {
  authorityAsOf,
  parseAsOfDate,
  resolvePackageRestatementAuthorities,
  type ResolvePackageRestatementAuthorityInput,
} from "./restatement-authority";

export {
  extractRestatementAuthorityEvidence,
  resolvePriorAgreementTargetDocumentId,
  type ExtractRestatementEvidenceInput,
} from "./restatement-evidence";

export {
  confirmedIdentityFromInstrumentGrouping,
  evaluateProductionAuthorityPromotion,
  summarizeBundleProductionAuthority,
  type BundleProductionAuthoritySummary,
  type ProductionAuthorityDisposition,
  type ProductionAuthorityEvaluation,
} from "./production-authority-gate";

export {
  bindCandidateToOperativeRetrievalSource,
  type OperativeRetrievalSourceBinding,
} from "./retrieval-source";

export type {
  ConditionsPrecedentSatisfaction,
  ConfirmedInstrumentIdentityView,
  EffectivenessInference,
  GoverningAuthorityClassification,
  GoverningInstrumentLink,
  GoverningProvisionResolution,
  InstrumentRole,
  OperativeAuthorityHandoffBundle,
  OperativeAuthorityStatus,
  OperativeRestatementLanguageEvidence,
  PriorAgreementRecitalEvidence,
  RestatementAuthorityEvidence,
  RestatementAuthorityResolution,
  RestatementScope,
  TextEvidenceHit,
} from "./types";
