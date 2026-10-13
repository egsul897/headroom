/**
 * Authentic MHK (Mohawk) fixed-dollar candidate discovery for the shared VE compile core.
 *
 * Candidate extraction is package-specific (locate §7.03(f) in the authentic CA text).
 * Compilation must go through compileVerifiedFixedDollarBridge with zero MHK branches
 * in the compile/evaluate path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OperativeClauseCandidate } from "./verified-executable-compile-core";
import { compileVerifiedFixedDollarBridge } from "./verified-executable-compile-core";

export const MHK_VE_COMPANY_ID = "mhk";
export const MHK_VE_INSTRUMENT_KEY = "mhk-2026-credit-agreement";
export const MHK_VE_DOCUMENT_ID = "mhk-doc-a-credit-agreement";

const MHK_CA_RELATIVE =
  "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt";

export function loadMhkCreditAgreementText(): string {
  return readFileSync(join(process.cwd(), MHK_CA_RELATIVE), "utf8");
}

/**
 * Extract authentic §7.03(f) Permitted Receivables Financings fixed-dollar basket.
 * Returns null when the authentic holdout text no longer contains the cap language.
 *
 * EDGAR text uses NBSP / odd spacing — normalize for match, then rebuild a
 * compile-ready operative string that preserves legal dollars and conditions.
 */
export function extractMhk703fReceivablesCandidate(): OperativeClauseCandidate | null {
  const text = loadMhkCreditAgreementText();
  const normalized = text.replace(/[\u00a0\u202f]/g, " ");
  const match = normalized.match(
    /Indebtedness\s+in\s+respect\s+of\s+Permitted\s+Receivables\s+Financings\s+of\s+the\s+Company\s+and\/or\s+its\s+Restricted\s+Subsidiaries\s+so\s+long\s+as\s+\(i\)\s+the\s+aggregate\s+outstanding\s+amount\s+of\s+all\s+Permitted\s+Receivables\s+Financings\s+of\s+the\s+Company\s+and\/or\s+its\s+Restricted\s+Subsidiaries\s+shall\s+not\s+exceed\s+\$700,000,000\s+at\s+any\s+time,\s+and\s+\(ii\)\s+no\s+such\s+Indebtedness\s+is\s+in\s+the\s+form\s+of\s+a\s+term\s+loan\s+facility;/i,
  );
  if (!match) return null;
  // Collapse whitespace for the fixed-dollar classifier (identical legal content).
  const operativeSourceText = match[0].replace(/\s+/g, " ").trim();
  return {
    candidateId: "mhk-7-03f-receivables-fixed-dollar",
    documentId: MHK_VE_DOCUMENT_ID,
    sourceSectionRef: "7.03(f)",
    operativeSourceText,
    relatedLeafCode: null,
  };
}

export function mhkVerifiedExecutableCandidates(): OperativeClauseCandidate[] {
  return [extractMhk703fReceivablesCandidate()].filter(
    (c): c is OperativeClauseCandidate => c != null,
  );
}

/**
 * Compile authentic MHK fixed-dollar candidates through the same core as Matthews.
 */
export function compileMhkVerifiedExecutableBridge(asOfDate = "2025-06-30") {
  return compileVerifiedFixedDollarBridge({
    companyId: MHK_VE_COMPANY_ID,
    instrumentKey: MHK_VE_INSTRUMENT_KEY,
    asOfDate,
    candidates: mhkVerifiedExecutableCandidates(),
    extraLimitations: [
      "MHK VE-only bridge — full leaf covenant dashboard / financial fixture not claimed.",
      "Authentic product-proof/002 holdout CA text.",
    ],
  });
}
