/**
 * COVERAGE_GAP is a self-check miss: an exception / proviso excerpt whose first
 * 30 normalized characters are not inside any extracted basket citation.
 * Phrase rules cannot invent the missing span. These tests pin structural
 * extractor fixes on two or more packages each.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/contract-model/covenant-computation/baskets";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import { dollarAmountIsMillions } from "@/lib/contract-model/covenant-computation/text";
import type { BasketClause } from "@/lib/contract-model/covenant-computation/types";

function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Exception/proviso scan aligned with the self-check: the first 30 characters
 * of an exception excerpt must appear in some basket. `from` skips definition
 * boilerplate (SOFR, benchmark) that sits before the negative-covenant article.
 */
function exceptionCoverageGaps(
  raw: string,
  from = 0,
): { gaps: number; conditions: number; clauses: BasketClause[] } {
  const text = norm(raw);
  const clauses = extractBasketClauses({ documentId: "fixture", text: raw });
  const condRe = /(?:provided\s*,\s*however\s*,\s*that|except\s*:|; provided that)([^.]{40,180})/gi;
  const conditions: string[] = [];
  for (const match of text.matchAll(condRe)) {
    if ((match.index ?? 0) < from) continue;
    if (conditions.length >= 40) break;
    const excerpt = norm(match[0]).slice(0, 140);
    if (excerpt.length < 40) continue;
    conditions.push(excerpt);
  }
  let gaps = 0;
  for (const excerpt of conditions) {
    const snippet = norm(excerpt).slice(0, 30).toLowerCase();
    const hit = clauses.some((clause) => norm(clause.operativeText).toLowerCase().includes(snippet));
    if (!hit) gaps += 1;
  }
  return { gaps, conditions: conditions.length, clauses };
}

function load(path: string): string {
  return readFileSync(path, "utf8");
}

/** Operative negative-covenant article: the heading that is followed by a prohibition, not the table of contents. */
function covenantArticleAt(raw: string): number {
  const text = norm(raw);
  let best = -1;
  for (const match of text.matchAll(/negative covenants/gi)) {
    const at = match.index ?? 0;
    const window = text.slice(at, at + 900);
    if (/\b(?:shall not|will not|create,\s+incur)\b/i.test(window)) best = at;
  }
  if (best >= 0) return best;
  const section = text.search(/section\s+\d{1,2}\.\d{1,2}\.?\s+(?:limitation|restriction|indebtedness|liens)\b/i);
  return section < 0 ? 0 : section;
}

const FWRG = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";
const CONMED =
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
const MTN_INDENTURE =
  "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-b-indenture-2024.txt";
const MTN_INDENTURE_2025 =
  "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-c-indenture-2025.txt";
const CHWY =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const WOR =
  "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/extracted-text/doc-b-2026-08-31-fifth-ar-credit-agreement.txt";
const LSB = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt";
const MHK = "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt";

describe("coverage gaps from section-number and heading shape", () => {
  it("closes gaps on a period-after-number indenture style and a one-digit credit-agreement style", () => {
    // Measured before the heading fix: FWRG 40/40, CONMED 21/21, MTN indenture 38/38, all with zero covenant sections.
    const fwrg = exceptionCoverageGaps(load(FWRG));
    const conmed = exceptionCoverageGaps(load(CONMED));
    const mtn = exceptionCoverageGaps(load(MTN_INDENTURE));

    expect(fwrg.clauses.some((c) => /6\.01/.test(c.sectionRef) && /indebtedness/i.test(c.sectionRef))).toBe(true);
    expect(fwrg.clauses.some((c) => /6\.02/.test(c.sectionRef) && /lien/i.test(c.sectionRef))).toBe(true);
    expect(conmed.clauses.some((c) => /7\.2/.test(c.sectionRef) && /indebtedness/i.test(c.sectionRef))).toBe(true);
    expect(conmed.clauses.some((c) => /7\.3/.test(c.sectionRef) && /lien/i.test(c.sectionRef))).toBe(true);
    expect(mtn.clauses.some((c) => /4\.11/.test(c.sectionRef) && /lien/i.test(c.sectionRef))).toBe(true);
    expect(mtn.clauses.some((c) => /4\.12/.test(c.sectionRef) && /lease/i.test(c.sectionRef))).toBe(true);

    expect(fwrg.gaps).toBeLessThan(40);
    expect(conmed.gaps).toBeLessThan(21);
    expect(mtn.gaps).toBeLessThan(38);
  });

  it("closes gaps on Limitation-on titles outside Article 4, on two credit agreements", () => {
    // Provisos inside the operative negative-covenant article.
    // Before this fix (same window, cap 40): CHWY 35/40, WOR 28/29.
    const chwy = exceptionCoverageGaps(load(CHWY), covenantArticleAt(load(CHWY)));
    const wor = exceptionCoverageGaps(load(WOR), covenantArticleAt(load(WOR)));

    expect(chwy.clauses.some((c) => /6\.01/.test(c.sectionRef) && /indebtedness/i.test(c.sectionRef))).toBe(true);
    expect(chwy.clauses.some((c) => /6\.0[28]/.test(c.sectionRef))).toBe(true);
    expect(wor.clauses.some((c) => /6\.01/.test(c.sectionRef) && /indebtedness/i.test(c.sectionRef))).toBe(true);
    expect(wor.clauses.some((c) => /6\.02/.test(c.sectionRef) && /lien/i.test(c.sectionRef))).toBe(true);

    expect(chwy.gaps).toBeLessThan(35);
    expect(wor.gaps).toBeLessThan(28);
  });
});

describe("coverage gaps from nested markers and cap-span residuals", () => {
  const INDENTURE = `
Section 4.09. Limitation on Asset Disposition. The Issuer shall not dispose of assets except that dispositions not to exceed $10,000,000 and other dispositions not to exceed $20,000,000 are permitted. The Issuer shall not apply any remaining proceeds so long as no Default has occurred and is continuing under this Indenture.
`;

  const CREDIT = `
Section 6.01. Indebtedness. The Borrower shall not Incur any Indebtedness, except: (a) Indebtedness not to exceed $15,000,000; provided that (A) no Event of Default has occurred and is continuing and (B) the proceeds are applied to working capital in the ordinary course of business.
Section 7.02. Liens. The Borrower will not create any Lien, except: (a) the following Liens: (i) Liens not to exceed the greater of (A) $5,000,000 and (B) 2.0% of Total Assets and (ii) Liens existing on the Closing Date.
`;

  it("keeps the trailing proviso and the (A)/(B) limb on two different drafting styles", () => {
    const indenture = extractBasketClauses({ documentId: "indenture-style", text: INDENTURE });
    const credit = extractBasketClauses({ documentId: "credit-style", text: CREDIT });

    expect(indenture.some((c) => /so long as no Default has occurred/i.test(c.operativeText))).toBe(true);
    expect(indenture.some((c) => /\$10,000,000/.test(c.operativeText))).toBe(true);
    expect(indenture.some((c) => /\$20,000,000/.test(c.operativeText))).toBe(true);

    expect(credit.some((c) => /\(a\)\(A\)/.test(c.sectionRef) || /no Event of Default has occurred/i.test(c.operativeText))).toBe(
      true,
    );
    expect(credit.some((c) => /\(A\)/.test(c.sectionRef) && /\$5,000,000/.test(c.operativeText))).toBe(true);
    expect(credit.some((c) => /\(B\)/.test(c.sectionRef) && /2\.0%/.test(c.operativeText))).toBe(true);

    for (const [doc, text] of [
      [indenture, INDENTURE],
      [credit, CREDIT],
    ] as const) {
      const needle = "no Default has occurred";
      const needs = text.includes(needle);
      if (!needs) continue;
      expect(doc.some((c) => c.operativeText.includes("no Default has occurred"))).toBe(true);
    }
  });
});

describe("extraction coverage does not regress packages the old headings already read", () => {
  it("still extracts LSB 6.01/6.02 and MHK 7.01/7.03, and still misses a heading-less builder sentence", () => {
    const lsb = exceptionCoverageGaps(load(LSB));
    const mhk = extractBasketClauses({ documentId: "mhk", text: load(MHK) });
    expect(lsb.gaps).toBe(0);
    expect(lsb.clauses.some((c) => /6\.01/.test(c.sectionRef))).toBe(true);
    expect(lsb.clauses.some((c) => /6\.02/.test(c.sectionRef))).toBe(true);
    expect(mhk.some((c) => /7\.01/.test(c.sectionRef) && /lien/i.test(c.sectionRef))).toBe(true);
    expect(mhk.some((c) => /7\.03/.test(c.sectionRef) && /indebtedness/i.test(c.sectionRef))).toBe(true);

    const missed = `
Article IX Miscellaneous.
The Borrower may make distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000 in any fiscal year when no Event of Default exists.
`;
    expect(extractBasketClauses({ documentId: "missed", text: missed })).toHaveLength(0);

    const sample = `
"Permitted Debt" means Indebtedness of the Issuer consisting of:
(1) Indebtedness of the Issuer in an aggregate principal amount not to exceed the greater of $50,000,000 and 5.0% of Total Assets;
(2) Indebtedness under the Available Amount;
(3) Indebtedness so long as the Consolidated Total Leverage Ratio is no greater than 4.00 to 1.00;
Section 4.09 Limitation on Indebtedness. The Issuer shall not Incur any Indebtedness except Permitted Debt.
`;
    const clauses = extractBasketClauses({ documentId: "sample", text: sample });
    expect(clauses.some((c) => /greater of \$50,000,000/.test(c.operativeText))).toBe(true);
    const mhkGaps = exceptionCoverageGaps(load(MHK), covenantArticleAt(load(MHK)));
    expect(mhkGaps.gaps).toBe(0);
  });
});

describe("proviso boundaries, page furniture, and non-capacity numbers", () => {
  it("closes the remaining operative-window gaps on a credit agreement and an indenture", () => {
    // Same window after the heading fix, before this round: WOR 22/29, FWRG 12/40, MTN indenture 16/38.
    const wor = exceptionCoverageGaps(load(WOR), covenantArticleAt(load(WOR)));
    const fwrg = exceptionCoverageGaps(load(FWRG));
    const mtn = exceptionCoverageGaps(load(MTN_INDENTURE), covenantArticleAt(load(MTN_INDENTURE)));
    expect(wor.gaps).toBe(0);
    expect(fwrg.gaps).toBe(0);
    expect(mtn.gaps).toBe(0);
    expect(
      wor.clauses.some((c) => /; provided that the aggregate face amount of all such letters of credit/i.test(norm(c.operativeText))),
    ).toBe(true);
    expect(
      fwrg.clauses.some((c) => /; provided that: \(i\) with respect to any such Disposition/i.test(norm(c.operativeText))),
    ).toBe(true);
  });

  it("reads a page-split million and a page-split proviso on two indentures", () => {
    for (const path of [MTN_INDENTURE, MTN_INDENTURE_2025]) {
      const clauses = extractBasketClauses({ documentId: path, text: load(path) });
      const million = clauses.find((c) => /\$175\.0\s+-46-\s+million/.test(norm(c.operativeText)));
      expect(million).toBeTruthy();
      expect(dollarAmountIsMillions(million!.operativeText, "175.0")).toBe(true);
      expect(clauses.some((c) => /provided that -16- such period/.test(norm(c.operativeText)))).toBe(true);
    }
    expect(dollarAmountIsMillions("greater of $40.0 -8- million and 3.0% of Consolidated Total Assets", "40.0")).toBe(true);
  });

  it("cites EBITDA and leverage definitions that no covenant sentence quotes, on two credit agreements", () => {
    const chwy = extractBasketClauses({ documentId: "chwy", text: load(CHWY) });
    const wor = extractBasketClauses({ documentId: "wor", text: load(WOR) });
    expect(chwy.some((c) => /Acquired EBITDA/.test(c.operativeText))).toBe(true);
    expect(chwy.some((c) => /Permitted Holder/.test(c.operativeText))).toBe(true);
    expect(wor.some((c) => /Consolidated EBITDA/.test(c.operativeText))).toBe(true);
    expect(wor.some((c) => /Total Leverage Ratio/.test(c.operativeText))).toBe(true);
  });

  it("does not classify grower prongs, holder votes, or schedule floors as UNKNOWN", () => {
    const chwy = extractBasketClauses({ documentId: "chwy", text: load(CHWY) });
    const conmed = extractBasketClauses({ documentId: "conmed", text: load(CONMED) });
    const prong = (clauses: BasketClause[], amount: RegExp) =>
      clauses.find((c) => amount.test(norm(c.operativeText)) && /^\([^)]+\)\s+\$/.test(norm(c.operativeText)));
    expect(categorize(prong(chwy, /\$800\.0 million and/)!.operativeText)).toBe("FIXED_DOLLAR");
    expect(categorize(prong(conmed, /\$150,000,000 and/)!.operativeText)).toBe("FIXED_DOLLAR");

    for (const path of [MTN_INDENTURE, MTN_INDENTURE_2025]) {
      const clauses = extractBasketClauses({ documentId: path, text: load(path) });
      const holder = clauses.find((c) => /Holders of at least 30%/.test(c.operativeText));
      expect(holder).toBeTruthy();
      expect(categorize(holder!.operativeText)).not.toBe("UNKNOWN");
    }

    const fwrg = extractBasketClauses({ documentId: "fwrg", text: load(FWRG) });
    const gibraltar = extractBasketClauses({
      documentId: "gibraltar",
      text: load("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt"),
    });
    const schedule = (clauses: BasketClause[]) =>
      clauses.find((c) => /in excess of \$\s*[\d,]+(?:\.\d+)?[^.]{0,120}(?:described|listed|set forth) on Schedule/i.test(norm(c.operativeText)));
    expect(categorize(schedule(fwrg)!.operativeText)).toBe("CONDITIONS_LIMITED");
    expect(categorize(schedule(gibraltar)!.operativeText)).toBe("CONDITIONS_LIMITED");
  });
});
