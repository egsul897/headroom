/**
 * Every extracted basket, adjudicated from its own quote.
 *
 * A computed dollar is the greater of the fixed limb and the percent limb
 * (or the single cap-role dollar) read out of the citation. The pipeline's
 * canonical string is compared with that result. Packages without a bound
 * Total Assets or EBITDA line cannot grow a percent limb.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare, divide, multiply, rationalFromString, toCanonicalString } from "@/lib/contract-model/runtime/decimal";
import {
  basketDisposition,
  matthewsCovenantPackage,
  otherIssuerPackages,
  runCovenantComputation,
  type ComputationPackage,
  type ComputedBasket,
} from "@/lib/contract-model/covenant-computation";
import { citedIn } from "@/lib/contract-model/covenant-computation/text";

const TOTAL_ASSETS = "1791.719"; // statement: "Total Assets: $1,791.719 million"
const EBITDA = "128.313"; // certificate: "Consolidated EBITDA: $128.313 million"

const CREATED_AT = "2026-10-13T00:00:00.000Z";

/** Clauses, then COMPUTED / NO_NUMERIC_CAP_CONDITIONAL / NEEDS_INPUT / UNKNOWN, then amount caps. */
const PACKAGE_COUNTS: Record<string, [number, number, number, number, number, number]> = {
  "matthews-international-q1-fy2025": [245, 69, 145, 31, 0, 30],
  "chwy-2026-credit-agreement": [133, 22, 54, 57, 0, 0],
  "gibraltar-2026-credit-agreement": [155, 14, 101, 40, 0, 3],
  "mtn-2026-tenth-ar": [151, 71, 27, 53, 0, 12],
  "wor-2026-fifth-ar-credit-agreement": [19, 10, 4, 5, 0, 3],
  "mhk-2026-credit-agreement": [43, 9, 17, 17, 0, 2],
};

const NUMERIC = /\$\s*[\d,]|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/;

function greaterOf(fixed: string, percent: string, base: string): string {
  const flat = rationalFromString(fixed);
  const grown = multiply(rationalFromString(base), divide(rationalFromString(percent), rationalFromString("100")));
  return toCanonicalString(compare(grown, flat) > 0 ? grown : flat);
}

/** Cap implied by the citation alone. Throws when the quote is not a closed form. */
function expectedFromQuote(citation: string): string {
  const grower = citation.match(
    /greater of\s+\([a-z0-9]+\)\s+\$\s*([\d,]+(?:\.\d+)?)(?:\s+million)?\s+and\s+\([a-z0-9]+\)\s+(\d+(?:\.\d+)?)%\s+of\s+(?:the\s+)?(Total Assets|Consolidated EBITDA)/i,
  );
  if (grower?.[1] && grower[2] && grower[3]) {
    const base = /ebitda/i.test(grower[3]) ? EBITDA : TOTAL_ASSETS;
    return greaterOf(grower[1].replace(/,/g, ""), grower[2], base);
  }
  const product = citation.match(/(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(Total Assets|Consolidated EBITDA)\b/i);
  if (product?.[1] && product?.[2] && !/\$\s*[\d,]/.test(citation)) {
    const base = /ebitda/i.test(product[2]) ? EBITDA : TOTAL_ASSETS;
    return toCanonicalString(multiply(rationalFromString(base), divide(rationalFromString(product[1]), rationalFromString("100"))));
  }
  const millions = citation.match(/\$\s*([\d,]+(?:\.\d+)?)\s+million\b/i);
  if (millions?.[1] && !/greater of/i.test(citation)) {
    return toCanonicalString(multiply(rationalFromString(millions[1].replace(/,/g, "")), rationalFromString("1000000")));
  }
  const plain = citation.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (plain?.[1]) return toCanonicalString(rationalFromString(plain[1].replace(/,/g, "")));
  throw new Error(`citation has no closed-form cap: ${citation.slice(0, 120)}`);
}

function formatValue(basket: ComputedBasket): string {
  if (basket.capCanonical && basket.capCurrency) return `${basket.capCanonical} ${basket.capCurrency}`;
  if (basket.capStatus === "COMPUTED" && basket.capKind === "RATIO_TEST" && basket.gateOpen === true) return "gate open";
  return "";
}

function typeOf(basket: ComputedBasket): string {
  return `${basket.covenantFamily} / ${basket.category} / ${basket.scope}`;
}

function tally(baskets: ComputedBasket[]): [number, number, number, number, number, number] {
  const counts = { COMPUTED: 0, NO_NUMERIC_CAP_CONDITIONAL: 0, NEEDS_INPUT: 0, UNKNOWN: 0 };
  for (const basket of baskets) counts[basketDisposition(basket)] += 1;
  const amounts = baskets.filter((basket) => basket.capKind === "AMOUNT" && basket.capStatus === "COMPUTED").length;
  return [baskets.length, counts.COMPUTED, counts.NO_NUMERIC_CAP_CONDITIONAL, counts.NEEDS_INPUT, counts.UNKNOWN, amounts];
}

function sectionBody(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function tableRows(body: string): string[][] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.includes("---"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function assertBasket(pkg: ComputationPackage, basket: ComputedBasket, hasFinancials: boolean): void {
  const source = pkg.documents.find((doc) => doc.documentId === basket.sourceDocumentId);
  expect(source, basket.stableKey).toBeTruthy();
  expect(citedIn(source!.text, basket.citationExcerpt), basket.stableKey).toBe(true);
  expect(basket.remainingStatus, basket.stableKey).toBe("NEEDS_INPUT");
  expect(basket.certification, basket.stableKey).toBe("COMPUTED_NOT_CERTIFIED");

  const disposition = basketDisposition(basket);
  if (disposition === "NO_NUMERIC_CAP_CONDITIONAL") {
    expect(basket.citationExcerpt, basket.stableKey).not.toMatch(NUMERIC);
    expect(basket.citationExcerpt, basket.stableKey).not.toMatch(/\bunlimited\b|\bwithout\s+limit\b/i);
    expect(basket.capCanonical, basket.stableKey).toBeNull();
    expect(basket.capKind, basket.stableKey).not.toBe("UNLIMITED");
    expect(basket.category, basket.stableKey).toBe("NO_NUMERIC_CAP_CONDITIONAL");
  }
  if (basket.capKind === "UNLIMITED") {
    expect(basket.category, basket.stableKey).toBe("UNLIMITED");
    expect(basket.citationExcerpt, basket.stableKey).toMatch(/\bunlimited\b|\bwithout\s+limit\b/i);
  }
  if (basket.capStatus === "COMPUTED" && basket.capKind === "AMOUNT") {
    expect(basket.capCanonical, basket.stableKey).toBe(expectedFromQuote(basket.citationExcerpt));
    if (/greater of/i.test(basket.citationExcerpt) && /\$\s*[\d,]+(?:\.\d+)?\s+million/i.test(basket.citationExcerpt)) {
      expect(basket.capCurrency, basket.stableKey).toBe("USD_MILLIONS");
      expect(basket.category, basket.stableKey).toBe("GROWER_GREATER_OF");
    }
  }
  if (!hasFinancials && basket.category === "GROWER_GREATER_OF") {
    expect(basket.capStatus, basket.stableKey).toBe("NEEDS_INPUT");
    expect(basket.capCanonical, basket.stableKey).toBeNull();
  }
}

describe("basket inventory", () => {
  const matthews = matthewsCovenantPackage();
  const others = otherIssuerPackages();
  const packages = [matthews, ...others];
  const books = new Map(packages.map((pkg) => [pkg.packageKey, runCovenantComputation(pkg, { createdAt: CREATED_AT })]));
  const markdown = readFileSync(join(process.cwd(), "docs/ops/basket-inventory.md"), "utf8");

  it("locks a count per package", () => {
    for (const pkg of packages) {
      const book = books.get(pkg.packageKey)!;
      expect(book.mistakes, pkg.packageKey).toEqual([]);
      expect(tally(book.baskets), pkg.packageKey).toEqual(PACKAGE_COUNTS[pkg.packageKey]);
    }
  });

  it("recomputes every Matthews amount from the clause quote", () => {
    const book = books.get(matthews.packageKey)!;
    const amounts = book.baskets.filter((basket) => basket.capKind === "AMOUNT" && basket.capStatus === "COMPUTED");
    expect(amounts.map((basket) => basket.sectionRef).sort()).toEqual(
      [
        "Asset Sale (b)",
        "Permitted Debt (1)(a)",
        "Permitted Debt (13)",
        "Permitted Debt (16)",
        "Permitted Debt (9)",
        "Permitted Investment (14)",
        "Permitted Investment (17)",
        "Permitted Investment (6)",
        "Permitted Liens (23)",
        "§4.06 Reports and Other Information",
        "§4.08 Limitation on Restricted Payments (10)",
        "§4.08 Limitation on Restricted Payments (9)",
        "§4.09 Limitation on Incurrence of Debt (a)",
        "§4.14 Transactions with Affiliates",
        "§4.14 Transactions with Affiliates",
        "§4.16 Limitation on Asset Sales (2)",
        "§4.16 Limitation on Asset Sales (2)",
        "§4.16 Limitation on Asset Sales (a)",
        "§5.15 Subsidiary Guaranty Agreements and Security Agreements",
        "§5.15 Subsidiary Guaranty Agreements and Security Agreements",
        "§6.01 Events of Default",
        "§6.01 Events of Default",
        "§6.06 Partnerships; Mergers or Consolidation; Acquisitions(i)",
        "§6.06 Partnerships; Mergers or Consolidation; Acquisitions(ii)",
        "§6.08 Dividends and Distributions",
        "§7.01 Events of Default",
        "§7.01 Events of Default",
        "§7.01 Events of Default",
        "§7.01(h) clause (h) inserted",
        "§7.06 Application of Proceeds",
      ].sort(),
    );
    const builder = book.baskets.find((basket) => basket.sectionRef === "§4.08 Limitation on Restricted Payments (a)");
    const employee = book.baskets.find((basket) => basket.sectionRef === "§4.08 Limitation on Restricted Payments (4)");
    expect(builder?.category).toBe("BUILDER_AVAILABLE_AMOUNT");
    expect(builder?.capCanonical).toBeNull();
    expect(employee?.category).toBe("BUILDER_AVAILABLE_AMOUNT");
    expect(employee?.capCanonical).toBeNull();
    expect(employee?.citationExcerpt).toMatch(/\$15\.0 million/);
    const consideration = book.baskets.find(
      (basket) => basket.sectionRef === "§4.16 Limitation on Asset Sales (a)" && basket.category === "PCT_OF_METRIC",
    );
    expect(consideration?.capStatus).toBe("NEEDS_INPUT");
    expect(consideration?.citationExcerpt).toMatch(/75% of the consideration/);
    const fairMarket = book.baskets.find((basket) => basket.sectionRef === "§6.04 Disposition of Assets");
    expect(fairMarket?.category).toBe("PCT_OF_METRIC");
    expect(fairMarket?.capStatus).toBe("NEEDS_INPUT");
    expect(fairMarket?.missingInputs.join(" ")).toMatch(/fair market value/i);
    for (const basket of book.baskets) assertBasket(matthews, basket, true);
  });

  it("runs the same extractor on the other packages without copying Matthews inputs", () => {
    for (const pkg of others) {
      expect(pkg.documents.some((doc) => doc.role === "COMPLIANCE_CERTIFICATE" || doc.role === "FINANCIAL_STATEMENT")).toBe(false);
      const book = books.get(pkg.packageKey)!;
      for (const basket of book.baskets) assertBasket(pkg, basket, false);
    }
    const mtn = books.get("mtn-2026-tenth-ar")!;
    expect(mtn.baskets.some((basket) => /1,791\.719|128\.313/.test(basket.citationExcerpt))).toBe(false);
    const chwy = books.get("chwy-2026-credit-agreement")!;
    const grower = chwy.baskets.find((basket) => /greater of \(i\) \$108\.0 million and \(ii\) 15% of Consolidated EBITDA/.test(basket.citationExcerpt));
    expect(grower?.capStatus).toBe("NEEDS_INPUT");
    expect(grower?.missingInputs).toContain("Consolidated EBITDA");
  });

  it("matches the table artifact row for row", () => {
    const countRows = tableRows(sectionBody(markdown, "Counts")).filter((row) => row[0] !== "package");
    expect(countRows.map((row) => row[0])).toEqual(Object.keys(PACKAGE_COUNTS));
    for (const row of countRows) {
      const expected = PACKAGE_COUNTS[row[0]!];
      expect(row.slice(1), row[0]).toEqual(expected!.map(String));
    }
    for (const pkg of packages) {
      const book = books.get(pkg.packageKey)!;
      const rows = tableRows(sectionBody(markdown, pkg.packageKey)).filter((row) => row[0] !== "basket");
      expect(rows, pkg.packageKey).toHaveLength(book.baskets.length);
      const byKey = new Map(book.baskets.map((basket) => [basket.stableKey, basket]));
      for (const row of rows) {
        const basket = byKey.get(row[0] ?? "");
        expect(basket, row[0]).toBeTruthy();
        expect(row[1], basket!.stableKey).toBe(basket!.sectionRef);
        expect(row[2], basket!.stableKey).toBe(typeOf(basket!));
        expect(row[3], basket!.stableKey).toBe(basket!.capFormula ?? "");
        expect(row[4], basket!.stableKey).toBe(formatValue(basket!));
        expect(row[5], basket!.stableKey).toBe(basketDisposition(basket!));
      }
    }
  });

  it("covers every covenant section so a heading cannot disappear", () => {
    const coverage = readFileSync(join(process.cwd(), "docs/ops/covenant-coverage.md"), "utf8");
    const countRows = tableRows(sectionBody(coverage, "Counts")).filter((row) => row[0] !== "package");
    expect(countRows.map((row) => row[0])).toEqual(Object.keys(PACKAGE_COUNTS));
    for (const pkg of packages) {
      const book = books.get(pkg.packageKey)!;
      const rows = tableRows(sectionBody(coverage, pkg.packageKey)).filter((row) => row[0] !== "document");
      expect(rows, pkg.packageKey).toHaveLength(book.coverage.length);
      book.coverage.forEach((section, index) => {
        const row = rows[index]!;
        expect(row[0], section.sectionNumber).toBe(section.documentId);
        expect(row[1], section.documentId).toBe(section.sectionNumber);
        expect(row[3], section.sectionNumber).toBe(section.status);
        expect(section.note.startsWith("Uncovered"), section.sectionNumber).toBe(false);
      });
    }
    const matthewsBook = books.get(matthews.packageKey)!;
    const indenture = matthewsBook.coverage.filter((section) => section.documentId === "matw-indenture-2024-ex4-1");
    for (const number of ["4.01", "4.14", "4.15", "5.01", "6.01", "6.02", "6.14"]) {
      expect(indenture.map((section) => section.sectionNumber), number).toContain(number);
    }
    expect(indenture.find((section) => section.sectionNumber === "6.01")?.status).toBe("COMPUTED");
    const fifth = matthewsBook.coverage.filter((section) => section.documentId === "matw-ca-fifth-amendment");
    for (const number of ["5.01", "5.14", "5.17", "6.03", "6.06", "6.08", "7.01", "2.20"]) {
      expect(fifth.map((section) => section.sectionNumber), number).toContain(number);
    }
    for (const number of ["5.03", "5.12", "5.15", "6.01", "6.02", "6.04", "6.07", "7.03"]) {
      expect(fifth.find((section) => section.sectionNumber === number)?.status, number).toBe("SUPERSEDED");
    }
    const sixth = matthewsBook.coverage.filter((section) => section.documentId === "matw-ca-sixth-amendment");
    for (const number of ["5.03", "5.15", "6.01", "6.04", "7.01(h)", "7.07", "7.08"]) {
      expect(sixth.map((section) => section.sectionNumber), number).toContain(number);
    }
    expect(books.get("chwy-2026-credit-agreement")!.coverage.some((section) => section.sectionNumber === "5.16")).toBe(true);
    expect(books.get("chwy-2026-credit-agreement")!.coverage.some((section) => section.sectionNumber === "7.01")).toBe(true);
    expect(books.get("gibraltar-2026-credit-agreement")!.coverage.some((section) => section.sectionNumber === "6.18")).toBe(true);
    expect(books.get("wor-2026-fifth-ar-credit-agreement")!.coverage.some((section) => section.sectionNumber === "VII")).toBe(true);
    expect(books.get("mhk-2026-credit-agreement")!.coverage.some((section) => section.sectionNumber === "7.01")).toBe(true);
    const mtnCoverage = books.get("mtn-2026-tenth-ar")!.coverage;
    expect(mtnCoverage.some((section) => section.sectionNumber === "10.6")).toBe(true);
    expect(mtnCoverage.some((section) => section.sectionNumber === "11.1")).toBe(true);
    expect(mtnCoverage.some((section) => section.sectionNumber === "12.4")).toBe(true);
    expect(mtnCoverage.some((section) => section.sectionNumber === "13.2")).toBe(false);
  });
});
