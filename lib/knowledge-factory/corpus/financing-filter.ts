/**
 * Shared financing-document filter used by pilot measurement, inventory,
 * export, and replay so count methodology stays identical.
 */

import type { KnowledgeSourceRecord } from "../types";

export const NON_DEBT_TITLE =
  /\b(?:consent of independent|independent registered public accounting|pwc consent|ex-?23|employment agreement|bylaws?|certificate of (?:incorporation|amendment)|offer letter|equity incentive|stock option|registration rights|underwriting)\b/i;

const SUBSTANTIVE_FINANCING_CLASSES = new Set([
  "CREDIT_AGREEMENT",
  "REVOLVING_CREDIT_AGREEMENT",
  "TERM_LOAN_AGREEMENT",
  "ABL_AGREEMENT",
  "INDENTURE",
  "SUPPLEMENTAL_INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "INTERCREDITOR_AGREEMENT",
  "SECURITY_AGREEMENT",
  "GUARANTEE_AGREEMENT",
  "WAIVER",
  "SIDE_LETTER",
  "OTHER_DEBT_RELATED",
]);

export function isDebtSource(s: Pick<KnowledgeSourceRecord, "provenance" | "sourceId">): boolean {
  return (
    s.provenance === "sec-edgar" ||
    s.provenance.startsWith("ehb") ||
    s.provenance.startsWith("local-edgar") ||
    s.provenance.startsWith("committed") ||
    s.provenance.startsWith("unseen-package") ||
    s.sourceId.startsWith("ehb:") ||
    s.sourceId.startsWith("edgar:") ||
    s.sourceId.startsWith("local-edgar:") ||
    s.sourceId.startsWith("fixture-unseen:")
  );
}

export function isFinancingDoc(s: KnowledgeSourceRecord): boolean {
  if (!isDebtSource(s)) return false;
  if (NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`)) return false;
  if (SUBSTANTIVE_FINANCING_CLASSES.has(s.documentClass)) return true;
  // Unknown class: require financing title cues
  return /\b(?:credit agreement|indenture|intercreditor|term loan|abl|guarantee and collateral)\b/i.test(
    `${s.documentTitle} ${s.exhibitFilename}`,
  );
}

export function isFixtureDoc(s: KnowledgeSourceRecord): boolean {
  return s.provenance.startsWith("fixture");
}

export function isFalsePositiveDebtExhibit(s: KnowledgeSourceRecord): boolean {
  return isDebtSource(s) && NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`);
}
