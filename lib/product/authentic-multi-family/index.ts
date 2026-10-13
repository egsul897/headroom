/**
 * Authentic multi-family covenant units (CONMED Article VII fixture).
 * Fidelity-gated fixed-dollar / greater-of compiles → VerifiedExecutionPackage.
 * Verified remaining stays null without utilization completeness.
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
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  type AuthenticTxnEvaluation,
  type AuthenticTxnKind,
  type CompiledAuthenticUnit,
  type CompiledUnitStatus,
  type ConmedMultiFamilyCompileResult,
} from "./compile-conmed-vep";
