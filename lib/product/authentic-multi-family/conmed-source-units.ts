/**
 * Authentic CONMED Article VII source units for RP / Investments / Asset Sales.
 *
 * Text is read from the curated unseen-package fixture (EDGAR-backed CONMED
 * credit agreement Article VII). No invented baskets. Thresholds are taken
 * only from operative language present in that fixture.
 *
 * Authenticity label: AUTHENTIC_FIXTURE_SOURCE (curated excerpt of real CA).
 * Not package CERTIFIED IR until Phase-3 certifyPackage says so — VE units
 * here are fidelity-gated fixed-dollar / greater-of compiles only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OperativeClauseCandidate } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

export const CONMED_AUTHENTIC_PACKAGE_KEY = "conmed-2025-credit-facility-article-vii";
export const CONMED_COMPANY_ID = "conmed";
export const CONMED_INSTRUMENT_KEY = "conmed-eighth-ar-credit-agreement";
export const CONMED_DOCUMENT_ID = "conmed-doc-a-eighth-ar-credit-agreement";
export const CONMED_AUTHENTICITY = "AUTHENTIC_FIXTURE_SOURCE" as const;

const ARTICLE_VII_PATH = join(
  process.cwd(),
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
);

let cachedText: string | null = null;

export function loadConmedArticleViiText(): string {
  if (cachedText) return cachedText;
  cachedText = readFileSync(ARTICLE_VII_PATH, "utf8");
  return cachedText;
}

export type ConmedSourceUnitCandidate = OperativeClauseCandidate & {
  family: "RESTRICTED_PAYMENTS" | "INVESTMENTS" | "ASSET_SALES";
  formulation: "FIXED_DOLLAR" | "GREATER_OF_ASSETS";
  sourceCitation: string;
  entityScopeNote: string;
};

function mustMatch(text: string, re: RegExp, label: string): string {
  const m = text.match(re);
  if (!m?.[0]) {
    throw new Error(`CONMED authentic extract failed for ${label} — refuse inventing text`);
  }
  return m[0].replace(/\s+/g, " ").trim();
}

/**
 * Extract source-backed candidates. Throws if fixture language moves — never
 * invents substitute baskets.
 */
export function extractConmedMultiFamilyCandidates(): ConmedSourceUnitCandidate[] {
  const text = loadConmedArticleViiText();

  const rp40 = mustMatch(
    text,
    /the Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed \$40,000,000/i,
    "§7.6(d) $40M RP",
  );

  const inv75 = mustMatch(
    text,
    /Investments by the Parent Borrower or any of its Subsidiaries in an aggregate amount \(valued at cost\) not to exceed\s*the greater of \(x\) \$75,000,000 and \(y\) 3\.5% of Consolidated Total Assets \(measured on the date of the making of such Investment\) at any\s*time outstanding/i,
    "§7.8(l) greater-of Investments",
  );

  const as25 = mustMatch(
    text,
    /any Disposition of Property or business or series of related Dispositions of Property or businesses which yields net proceeds to\s*the Parent Borrower or any of its Subsidiaries[\s\S]{0,400}?of less than the greater of\s*\(x\) \$25,000,000 and \(y\) 1\.5% of Consolidated Total Assets \(measured on the date of such Disposition\)/i,
    "§7.5(j) greater-of Asset Sale de minimis",
  );

  return [
    {
      candidateId: "conmed-7.6d-rp-40m",
      documentId: CONMED_DOCUMENT_ID,
      sourceSectionRef: "7.6(d)",
      operativeSourceText: rp40,
      relatedLeafCode: "rp_7_6d_flat_40m",
      family: "RESTRICTED_PAYMENTS",
      formulation: "FIXED_DOLLAR",
      sourceCitation: `${CONMED_DOCUMENT_ID} §7.6(d) — Restricted Payments ≤ $40,000,000 per fiscal year`,
      entityScopeNote: "Parent Borrower (chapeau §7.6); Loan Party scope per CA",
    },
    {
      candidateId: "conmed-7.8l-investments-greater-of",
      documentId: CONMED_DOCUMENT_ID,
      sourceSectionRef: "7.8(l)",
      operativeSourceText: inv75,
      relatedLeafCode: "inv_7_8l_greater_of_75m_or_3_5pct_cta",
      family: "INVESTMENTS",
      formulation: "GREATER_OF_ASSETS",
      sourceCitation: `${CONMED_DOCUMENT_ID} §7.8(l) — Investments ≤ greater of $75,000,000 and 3.5% Consolidated Total Assets`,
      entityScopeNote: "Parent Borrower or any of its Subsidiaries; Default/Event of Default gate in source",
    },
    {
      candidateId: "conmed-7.5j-asset-sale-greater-of",
      documentId: CONMED_DOCUMENT_ID,
      sourceSectionRef: "7.5(j)",
      operativeSourceText: as25,
      relatedLeafCode: "as_7_5j_greater_of_25m_or_1_5pct_cta",
      family: "ASSET_SALES",
      formulation: "GREATER_OF_ASSETS",
      sourceCitation: `${CONMED_DOCUMENT_ID} §7.5(j) — Disposition net proceeds < greater of $25,000,000 and 1.5% Consolidated Total Assets`,
      entityScopeNote: "Parent Borrower or any of its Subsidiaries",
    },
  ];
}

export function conmedSourceManifest() {
  return {
    packageKey: CONMED_AUTHENTIC_PACKAGE_KEY,
    companyId: CONMED_COMPANY_ID,
    instrumentKey: CONMED_INSTRUMENT_KEY,
    documentId: CONMED_DOCUMENT_ID,
    authenticity: CONMED_AUTHENTICITY,
    fixturePath: ARTICLE_VII_PATH,
    limitations: [
      "Curated Article VII excerpt — not full credit agreement / not package CERTIFIED.",
      "Fixed-dollar / greater-of fidelity compile only; ratio RP unlimited basket (§7.6(e)) not claimed executable here.",
      "No utilization completeness certificate — verified remaining stays null.",
    ],
  };
}
