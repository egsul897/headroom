/**
 * Shared financing-document filter used by pilot measurement, inventory,
 * export, and replay so count methodology stays identical.
 */

import type { KnowledgeSourceRecord } from "../types";

export const NON_DEBT_TITLE =
  /\b(?:consent of independent|independent registered public accounting|pwc consent|ex-23|employment agreement|bylaws?|certificate of incorporation)\b/i;

export function isDebtSource(s: Pick<KnowledgeSourceRecord, "provenance" | "sourceId">): boolean {
  return s.provenance === "sec-edgar" || s.provenance.startsWith("ehb") || s.sourceId.startsWith("ehb:");
}

export function isFinancingDoc(s: KnowledgeSourceRecord): boolean {
  if (!isDebtSource(s)) return false;
  if (NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`)) return false;
  return true;
}

export function isFixtureDoc(s: KnowledgeSourceRecord): boolean {
  return s.provenance.startsWith("fixture");
}

export function isFalsePositiveDebtExhibit(s: KnowledgeSourceRecord): boolean {
  return isDebtSource(s) && NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`);
}
