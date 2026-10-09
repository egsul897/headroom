import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";
import { isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";

const CONMED_VII = readFileSync(
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  "utf8",
);

describe("substantive CONMED covenant intelligence", () => {
  const sourceId = "fixture:conmed-article-vii";
  const structural = extractStructure(sourceId, CONMED_VII);
  const definitions = discoverDefinitions(sourceId, CONMED_VII, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, CONMED_VII);
  const candidates = discoverCovenantCandidates(sourceId, CONMED_VII, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED Eighth A&R Credit Agreement (Article VII curated)",
    issuerName: "CONMED Corporation",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });

  it("produces substantive plain-English that is not a generic category stub", () => {
    expect(summary.items.length).toBeGreaterThan(5);
    const debt = summary.items.find(
      (i) => i.category === "DEBT_INCURRENCE" || /indebtedness/i.test(i.heading + i.plainEnglish),
    );
    expect(debt).toBeTruthy();
    expect(debt!.plainEnglish.toLowerCase()).not.toMatch(/^this provision appears to address/);
    expect(debt!.plainEnglish.toLowerCase()).toMatch(/prohibit|except|basket|indebtedness|permission|maintenance/);
    expect(debt!.posture).toBe("GENERAL_PROHIBITION");
    expect(debt!.restriction?.toLowerCase() ?? "").toMatch(/indebtedness|incur/);
    expect((debt!.permissions?.length ?? 0) + (debt!.materialBasketsThresholds?.length ?? 0)).toBeGreaterThan(0);
    expect(debt!.analysis.plainEnglish).toBe(debt!.plainEnglish);
  });

  it("identifies baskets/thresholds from CONMED indebtedness text when present", () => {
    const withBasket = summary.items.find((i) =>
      (i.materialBasketsThresholds ?? []).some((b) => /\$50,000,000|3\.0%|greater-of/i.test(b)),
    );
    // At least some CONMED VII baskets should surface across candidates
    expect(
      summary.items.some((i) => (i.materialBasketsThresholds?.length ?? 0) > 0) ||
        summary.items.some((i) => /\$50,000,000|greater of/i.test(i.plainEnglish + i.operativeLanguageExcerpt)),
    ).toBe(true);
    void withBasket;
  });

  it("answers secured-debt questions with explanation + citations, not excerpt dump alone", () => {
    const answer = answerFromSummaryItems({
      question: "What restrictions apply to additional secured debt?",
      items: summary.items.map((i) => ({ ...i, sourceId })),
      researchOnly: true,
      limit: 5,
    });
    expect(answer.kind).toBe("answered");
    expect(answer.detail.toLowerCase()).toMatch(/lien|indebtedness|secured|prohibit|except/);
    expect(answer.detail).toMatch(/Contractual restrictions identified:/);
    expect(answer.detail).toMatch(/Available permissions/);
    expect(answer.detail).toMatch(/Unresolved:/);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations[0]!.sectionRef).toBeTruthy();
    // Must not be only a raw excerpt list
    expect(answer.detail).not.toMatch(/^Based only on discovered covenant excerpts/);
  });

  it("answers restricted-payment questions against CONMED analyses", () => {
    const answer = answerFromSummaryItems({
      question: "What restricted-payment baskets are available?",
      items: summary.items.map((i) => ({ ...i, sourceId })),
      limit: 5,
    });
    expect(["answered", "insufficient_evidence"]).toContain(answer.kind);
    if (answer.kind === "answered") {
      expect(answer.detail.toLowerCase()).toMatch(/restricted payment|dividend|basket|prohibit/);
      expect(answer.citations.length).toBeGreaterThan(0);
    }
  });

  it("answers $100M secured-debt amount questions as NOT DETERMINABLE without rulebook/financials", () => {
    const answer = answerFromSummaryItems({
      question: "Can the borrower incur an additional $100 million of secured debt?",
      items: summary.items.map((i) => ({ ...i, sourceId })),
      limit: 8,
    });
    expect(answer.kind).toBe("answered");
    expect(answer.detail).toMatch(/\$100 million/);
    expect(answer.detail).toMatch(/NOT DETERMINABLE/);
    expect(answer.detail.toLowerCase()).toMatch(/lien|indebtedness|secured/);
    expect(answer.detail).toMatch(/executable legal rulebook|financial/);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.permissions?.length ?? answer.detail).toBeTruthy();
  });

  const overnightQuestions: Array<{ q: string; expectDetail: RegExp }> = [
    {
      q: "What additional secured debt can the borrower incur?",
      expectDetail: /indebtedness|lien|secured|prohibit|except/i,
    },
    {
      q: "Which restricted payment baskets are available?",
      expectDetail: /restricted payment|dividend|basket|prohibit/i,
    },
    {
      q: "Can the borrower invest in an unrestricted subsidiary?",
      expectDetail: /investment|unrestricted|restricted payment/i,
    },
    {
      q: "What conditions apply to an incremental facility?",
      expectDetail: /incremental|indebtedness|leverage|pro forma|facility|basket/i,
    },
    {
      q: "What restrictions apply to asset sales?",
      expectDetail: /asset sale|disposition|prohibit|except/i,
    },
    {
      q: "Can debt incurred under one basket be secured under another provision?",
      expectDetail: /cross-covenant|lien|indebtedness|does not automatically/i,
    },
    {
      q: "What financial inputs are required to calculate capacity?",
      expectDetail: /ebitda|financial|NOT DETERMINABLE|capacity/i,
    },
  ];

  for (const { q, expectDetail } of overnightQuestions) {
    it(`answers overnight question: ${q.slice(0, 48)}…`, () => {
      const answer = answerFromSummaryItems({
        question: q,
        items: summary.items.map((i) => ({ ...i, sourceId })),
        limit: 8,
      });
      expect(["answered", "insufficient_evidence"]).toContain(answer.kind);
      if (answer.kind === "answered") {
        expect(answer.detail).toMatch(expectDetail);
        expect(answer.citations.length).toBeGreaterThan(0);
        expect(answer.detail).not.toMatch(/^Based only on discovered covenant excerpts/);
      }
    });
  }
});

describe("corpus quality", () => {
  it("excludes accounting consents and includes credit agreements", () => {
    expect(
      isSubstantiveFinancingPrecedent({
        sourceId: "edgar:x:ex23.htm",
        documentTitle: "Consent of Independent Registered Public Accounting Firm",
        documentClass: "UNKNOWN",
        exhibitFilename: "ex23-1.htm",
        provenance: "sec-edgar",
        byteSize: 12_000,
      }),
    ).toBe(false);
    expect(
      isSubstantiveFinancingPrecedent({
        sourceId: "edgar:y:ex10-1.htm",
        documentTitle: "Eighth Amended and Restated Credit Agreement",
        documentClass: "CREDIT_AGREEMENT",
        exhibitFilename: "ex10-1.htm",
        provenance: "sec-edgar",
        byteSize: 2_000_000,
      }),
    ).toBe(true);
  });
});
