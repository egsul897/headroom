/**
 * The computation engine has no issuer section map. CONMED is a precedent-atlas
 * credit agreement that the Matthews package and the other tuned packages never load.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grantsUnlimitedCapacity } from "@/lib/contract-model/covenant-computation/baskets";
import { readCovenantSource } from "@/lib/contract-model/covenant-computation/extract-baskets";
import { otherIssuerPackages, runCovenantComputation } from "@/lib/contract-model/covenant-computation";

const CONMED = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";

describe("issuer-agnostic computation", () => {
  it("keeps Matthews cap literals and section aliases out of the package loader", () => {
    const src = readFileSync(join(process.cwd(), "lib/contract-model/covenant-computation/packages/matthews.ts"), "utf8");
    expect(src).not.toMatch(/\$1,300\.0 million/);
    expect(src).not.toMatch(/3\.50 to 1\.00/);
    expect(src).not.toMatch(/aliasMatthews|const ALIASES/);
  });

  it("does not pick a grower dollar with a size cutoff or an issuer section pair", () => {
    const src = readFileSync(join(process.cwd(), "lib/contract-model/covenant-computation/baskets.ts"), "utf8");
    expect(src).not.toMatch(/100_000_000/);
    expect(src).not.toMatch(/7\.01\(u\)|7\.03\(g\)/);
  });

  it("computes CONMED Article VII from the document text alone", () => {
    const tuned = new Set(["matthews-international-q1-fy2025", ...otherIssuerPackages().map((pkg) => pkg.packageKey)]);
    expect(tuned.has("conmed-2025-credit-facility")).toBe(false);

    const text = readFileSync(join(process.cwd(), CONMED), "utf8");
    const source = readCovenantSource({ documentId: "conmed-2025-article-vii", text });
    const book = runCovenantComputation(
      {
        packageKey: "conmed-2025-credit-facility",
        companyId: "conmed",
        instrumentKey: "conmed-2025-eighth-ar",
        asOf: "2025-06-10",
        documents: [{ documentId: "conmed-2025-article-vii", role: "CREDIT_AGREEMENT", text }],
        baskets: source.clauses,
        sections: source.sections,
      },
      { createdAt: "2026-10-13T00:00:00.000Z" },
    );

    expect(book.mistakes).toEqual([]);
    expect(source.sections.map((section) => section.sectionNumber)).toEqual(
      expect.arrayContaining(["7.1", "7.2", "7.6", "7.8", "7.10"]),
    );
    const amounts = book.baskets
      .filter((basket) => basket.capKind === "AMOUNT" && basket.capStatus === "COMPUTED")
      .map((basket) => basket.capCanonical);
    expect(amounts.sort()).toEqual(["200000000", "2500000", "25000000", "40000000", "5000000"]);
    for (const basket of book.baskets) {
      expect(grantsUnlimitedCapacity(basket)).toBe(false);
      if (basket.capCanonical) {
        const digits = basket.capCanonical.replace(/\D/g, "");
        expect(basket.citationExcerpt.replace(/[$,\s]/g, "")).toContain(digits.slice(0, Math.min(digits.length, 6)));
      }
    }
    const assets = book.baskets.filter((basket) => /3\.0% of Consolidated Total Assets/.test(basket.citationExcerpt));
    expect(assets.length).toBeGreaterThan(0);
    for (const basket of assets) {
      expect(basket.capStatus).toBe("NEEDS_INPUT");
      expect(basket.capCanonical).toBeNull();
      expect(basket.capKind).not.toBe("UNLIMITED");
      expect(basket.missingInputs.join(" ")).toMatch(/Consolidated Total Assets/);
    }
    const tangible = book.baskets.find((basket) => /Consolidated Total Tangible Assets/.test(basket.citationExcerpt));
    expect(tangible?.capCanonical).toBeNull();
    expect(tangible?.missingInputs.join(" ")).toMatch(/Consolidated Total Tangible Assets/);
    const senior = book.baskets.find((basket) => /3\.75 to 1\.00/.test(basket.citationExcerpt));
    expect(senior?.capCanonical).toBeNull();
  });
});
