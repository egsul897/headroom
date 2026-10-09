/**
 * Precedent corpus quality: count only substantive financing documents.
 * Consent letters, bylaws, accounting exhibits, etc. are excluded.
 */

import {
  isFalsePositiveDebtExhibit,
  NON_DEBT_TITLE,
} from "../../knowledge-factory/corpus/financing-filter";

const SUBSTANTIVE_CLASSES = new Set([
  "CREDIT_AGREEMENT",
  "REVOLVING_CREDIT_AGREEMENT",
  "TERM_LOAN_AGREEMENT",
  "ABL_AGREEMENT",
  "INDENTURE",
  "SUPPLEMENTAL_INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "WAIVER",
  "CONSENT",
  "SIDE_LETTER",
  "INTERCREDITOR_AGREEMENT",
  "SECURITY_AGREEMENT",
  "GUARANTEE_AGREEMENT",
  "OTHER_DEBT_RELATED",
]);

const IRRELEVANT_EXHIBIT =
  /\b(?:ex-?23|consent of independent|independent registered public accounting|pwc consent|bylaws?|certificate of (?:incorporation|amendment)|employment agreement|offer letter|equity incentive|stock option|registration rights|underwriting|indenture trustee fee|legal opinion)\b/i;

const FINANCING_TITLE =
  /\b(?:credit agreement|loan agreement|indenture|intercreditor|security agreement|guarantee(?: and collateral)? agreement|abl|term loan|revolving credit|supplemental indenture|amendment (?:no\.?|number)?\s*\d*|amended and restated)\b/i;

export interface CorpusQualityRow {
  sourceId: string;
  documentTitle: string;
  documentClass: string;
  exhibitFilename: string;
  provenance: string;
  issuerName?: string | null;
  byteSize?: number | null;
}

export function isSubstantiveFinancingPrecedent(row: CorpusQualityRow): boolean {
  const hay = `${row.documentTitle} ${row.exhibitFilename} ${row.issuerName ?? ""}`;
  if (IRRELEVANT_EXHIBIT.test(hay) || NON_DEBT_TITLE.test(hay)) return false;
  if (
    isFalsePositiveDebtExhibit({
      provenance: row.provenance,
      sourceId: row.sourceId,
      documentTitle: row.documentTitle,
      exhibitFilename: row.exhibitFilename,
    } as never)
  ) {
    return false;
  }
  if (SUBSTANTIVE_CLASSES.has(row.documentClass) && row.documentClass !== "UNKNOWN") {
    // CONSENT alone is only substantive when financing-related title
    if (row.documentClass === "CONSENT" && !FINANCING_TITLE.test(hay)) return false;
    return true;
  }
  // UNKNOWN / OTHER: require financing title signals and adequate size
  if (FINANCING_TITLE.test(hay) && (row.byteSize ?? 0) >= 8_000) return true;
  return false;
}

export function classifyCorpusRole(row: CorpusQualityRow): "SUBSTANTIVE_FINANCING" | "NON_FINANCING_EXHIBIT" {
  return isSubstantiveFinancingPrecedent(row) ? "SUBSTANTIVE_FINANCING" : "NON_FINANCING_EXHIBIT";
}
