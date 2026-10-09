import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { parseCounselFormulaForTest } from "../../lib/product/customer-intelligence/compile-accepted";

const CONMED_VII = readFileSync(
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  "utf8",
);

describe("compile-accepted formula parsing", () => {
  const sourceId = "fixture:compile-accepted";
  const structural = extractStructure(sourceId, CONMED_VII);
  const definitions = discoverDefinitions(sourceId, CONMED_VII, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, CONMED_VII);
  const candidates = discoverCovenantCandidates(sourceId, CONMED_VII, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED CA",
    issuerName: "CONMED",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });

  it("parses CONMED greater-of / fixed baskets into MODELED formulas without inventing numbers", () => {
    const withBasket = summary.items.find((i) =>
      (i.materialBasketsThresholds ?? []).some((b) => /\$50,000,000|greater-of|greater of/i.test(b)),
    );
    expect(withBasket).toBeTruthy();
    const parsed = parseCounselFormulaForTest(withBasket!);
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBeGreaterThan(0);
    expect([
      "FLAT_AMOUNT",
      "GREATER_OF_FLAT_OR_PCT_EBITDA",
      "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      "BUILDER_BASKET",
    ]).toContain(parsed.formulaType);
    if (/Consolidated Total Assets|Total Assets/i.test((withBasket!.materialBasketsThresholds ?? []).join(" "))) {
      expect(parsed.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS");
      expect(parsed.params?.pctTotalAssets).toBeGreaterThan(0);
      expect(parsed.missingFields).not.toContain("grower_%_total_assets_formula");
    }
  });

  it("evaluates Total-Assets grower via covenant engine when assets are supplied", async () => {
    const { evaluateProvision, computeLeverageMetrics } = await import("../../lib/covenant-engine");
    const fin = {
      ebitda: 420,
      cash: 80,
      interestExpense: 55,
      cumulativeNetIncome: 200,
      equityProceedsSinceIssue: 50,
      assumedNewDebtRatePct: 6.5,
      totalDebt: 1100,
      securedDebt: 750,
      totalAssets: 2800,
    };
    const evaluated = evaluateProvision(
      {
        id: "t",
        documentId: "d",
        code: "grower",
        basketName: "General debt",
        sectionRef: "7.2",
        formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
        thresholdValue: 50,
        params: { pctTotalAssets: 0.03 },
      },
      fin,
      computeLeverageMetrics(fin),
    );
    expect(evaluated.status).toBe("modeled");
    expect(evaluated.capacity).toBe(84); // max(50, 0.03*2800)
  });

  it("refuses MODELED compile when no numeric threshold exists", () => {
    const bare = summary.items.find(
      (i) => !(i.materialBasketsThresholds ?? []).length && !(i.permissions ?? []).some((p) => /\$/.test(p)),
    );
    if (!bare) return;
    const parsed = parseCounselFormulaForTest({
      ...bare,
      materialBasketsThresholds: [],
      permissions: ["subject to the limitations set forth herein"],
      plainEnglish: "General prohibition without enumerated dollar baskets in this excerpt.",
      operativeLanguageExcerpt: "shall not incur Indebtedness except as permitted.",
    });
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields.length).toBeGreaterThan(0);
  });
});
