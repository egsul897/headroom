/**
 * Verified executable-rule compilation bridge for the Matthews dashboard slice.
 *
 * Advances beyond Phase 3 fact extraction: for operative clauses that classify
 * as fixed-dollar baskets, compile through the package-agnostic core
 * (`compileVerifiedFixedDollarBridge`) → evaluateFixedDollarCapacity and feed
 * GROSS contractual figures into Position when fidelity PASS.
 *
 * Fail-closed when evidence does not support VE compilation (ratio rooms,
 * non-cap dollar amounts, multi-figure excerpts, fidelity FAIL).
 *
 * Honesty:
 * - sourceBackedGrossCapacityMm is SOURCE_BACKED_COMPILED_GROSS from operative text
 *   (e.g. $1,300M Permitted Debt (1)(a) ceiling) — NOT netted remaining.
 * - Modeled leaf evaluateProvision figures remain separate under MODELED paths.
 * - Production capacity always refused on this path (no trusted-issuer / completeness).
 * - Does NOT flip AUTONOMOUS_COVENANT_COMPILATION_PROVEN — only fixed-dollar
 *   clauses that classify cleanly feed Position; other permissions stay leaf-encoded.
 */

import {
  compileVerifiedFixedDollarBridge,
  type OperativeClauseCandidate,
  type VerifiedExecutableCompileBridgeResult,
  type VerifiedExecutableCompileUnit,
  type VerifiedExecutableValueClass,
} from "./verified-executable-compile-core";
import {
  MATTHEWS_INDENTURE_SOURCE,
  MATTHEWS_CREDIT_AGREEMENT_SOURCE,
} from "./source-excerpts-matthews";

export type {
  OperativeClauseCandidate,
  VerifiedExecutableCompileBridgeResult,
  VerifiedExecutableCompileUnit,
  VerifiedExecutableValueClass,
};

/**
 * Isolate Permitted Debt (1)(a) sole-cap text from the Indenture excerpt.
 * Returns null when the authentic excerpt no longer contains the cap language.
 */
export function extractMatthewsPermittedDebt1aCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_INDENTURE_SOURCE.text;
  const match = text.match(
    /\(1\)\s*\(a\)\s*Debt under Debt Facilities and Qualified Receivables Transactions in an\s*aggregate principal amount outstanding not to exceed \$1,300,000,000/i,
  );
  if (!match) return null;
  return {
    candidateId: "matw-permitted-debt-1a-fixed-dollar",
    documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
    sourceSectionRef: "def:Permitted Debt(1)(a)",
    operativeSourceText: `${match[0]}, plus`,
    relatedLeafCode: "ind_permitted_debt_1a_flat",
  };
}

/**
 * Notes grandfather clause — dollar present but not a "not to exceed" cap role.
 * Included so the bridge demonstrates fail-closed refusal (not silent skip).
 */
export function extractMatthewsNotesGrandfatherCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_INDENTURE_SOURCE.text;
  const match = text.match(
    /\(2\)\s*Debt represented by the Notes issued on the Issue Date in an aggregate principal\s*amount of \$300,000,000/i,
  );
  if (!match) return null;
  return {
    candidateId: "matw-permitted-debt-2-notes",
    documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
    sourceSectionRef: "def:Permitted Debt(2)",
    operativeSourceText: `${match[0]};`,
    relatedLeafCode: "ind_permitted_debt_2_notes",
  };
}

/** CA §6.01(j) — no fixed-dollar cap; refuse VE compile. */
export function extractMatthewsCaLienCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_CREDIT_AGREEMENT_SOURCE.text;
  const match = text.match(/\(j\)\s*Liens securing the 2024 Note Offering[\s\S]*?Sixth Amendment\)\./i);
  if (!match) return null;
  return {
    candidateId: "matw-ca-601j",
    documentId: MATTHEWS_CREDIT_AGREEMENT_SOURCE.documentId,
    sourceSectionRef: "6.01(j)",
    operativeSourceText: match[0],
    relatedLeafCode: "ca_lien_601j_2024notes",
  };
}

export function matthewsVerifiedExecutableCandidates(): OperativeClauseCandidate[] {
  return [
    extractMatthewsPermittedDebt1aCandidate(),
    extractMatthewsNotesGrandfatherCandidate(),
    extractMatthewsCaLienCandidate(),
  ].filter((c): c is OperativeClauseCandidate => c != null);
}

/**
 * Compile Matthews operative candidates through the shared verified fixed-dollar path.
 * Provider-free; no Neon writes; production capacity never published.
 */
export function compileMatthewsVerifiedExecutableBridge(
  asOfDate = "2024-12-31",
): VerifiedExecutableCompileBridgeResult {
  return compileVerifiedFixedDollarBridge({
    companyId: "matthews",
    instrumentKey: "matthews-international-q1-fy2025",
    asOfDate,
    candidates: matthewsVerifiedExecutableCandidates(),
    extraLimitations: [
      "Matthews leaf evaluateProvision modeled room (e.g. $521.118M) remains a separate path.",
      "EDGAR-reconstructed operative excerpts — not package CERTIFIED IR.",
    ],
  });
}
