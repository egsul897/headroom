/**
 * Authentic multi-family covenant units (CONMED Article VII fixture).
 * Fidelity-gated fixed-dollar / greater-of compiles as non-certified candidates.
 * No fabricated Phase-3 verification. Verified remaining stays null.
 */

export {
  CONMED_AUTHENTIC_PACKAGE_KEY,
  CONMED_AUTHENTICITY,
  CONMED_COMPANY_ID,
  CONMED_DOCUMENT_ID,
  CONMED_INSTRUMENT_KEY,
  conmedSourceManifest,
  extractConmedMultiFamilyCandidates,
  loadConmedArticleViiText,
  type ConmedSourceUnitCandidate,
} from "./conmed-source-units";

export {
  HYPOTHETICAL_CTA_USD,
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  type AuthenticTxnEvaluation,
  type AuthenticTxnKind,
  type CompiledAuthenticUnit,
  type CompiledUnitCapability,
  type ConmedMultiFamilyCompileResult,
  type OperativeStateStatus,
  type ProductionRemainingStatus,
  type SemanticCertificationStatus,
} from "./compile-conmed-vep";
