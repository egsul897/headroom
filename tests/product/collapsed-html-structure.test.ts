/**
 * Collapsed SEC HTML exhibits bury "N.N Title." headings mid-paragraph.
 * KF structure normalization must restore line breaks so candidates appear.
 */
import { describe, expect, it } from "vitest";
import {
  extractStructure,
  normalizeStructureScanText,
} from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";

describe("collapsed HTML structure normalization", () => {
  const collapsed = [
    "AMENDED AND RESTATED CREDIT AGREEMENT dated as of August 20, 2026.",
    "Representations. The Borrower represents as follows. Affirmative covenants follow.",
    // Pathological wrapping: no newlines before operative headings (Suja-style).
    "Administrative Agent, Issuing Lender and the Lenders that: 6.1 Indebtedness. No Obligor shall, nor shall it permit any of its Restricted Subsidiaries to, create, incur, assume, or permit to exist any Indebtedness, except: (a) Indebtedness under this Agreement; (b) Indebtedness not exceeding the greater of (A) $15,000,000 and (B) fifteen percent (15%) of Consolidated EBITDA. 6.2 Liens. No Obligor shall create, incur, assume or permit to exist any Lien on any property except Permitted Liens. 6.6 Restricted Payments. No Obligor shall declare or make any Restricted Payment except from the Available Amount that is Not Otherwise Applied. 6.5 Investments. Make Investments not to exceed amounts taken together with all other Investments under this clause.",
  ].join(" ");

  it("inserts line breaks before bare N.N Title. headings when avg line is pathological", () => {
    const normalized = normalizeStructureScanText(collapsed);
    expect(normalized).toMatch(/\n6\.1 Indebtedness\./);
    expect(normalized).toMatch(/\n6\.2 Liens\./);
    expect(normalized).toMatch(/\n6\.6 Restricted Payments\./);
    // Does not break TOC-style leader dots
    const tocish = "CONTENTS 155 6.1 Indebtedness ................................ 156 6.2 Liens ....";
    expect(normalizeStructureScanText(tocish + " ".repeat(500) + tocish)).not.toMatch(/\n6\.1 Indebtedness/);
  });

  it("recovers Suja-style debt/lien candidates and dual-regime Ask", () => {
    const sourceId = "fixture:collapsed-html-suja-shape";
    const structural = extractStructure(sourceId, collapsed);
    // Collapsed HTML often yields ambiguous-but-usable section nodes; KF candidates keep them.
    const usable = structural.nodes.filter((n) => /^[\d.]+$/.test(n.sectionRef));
    expect(usable.length).toBeGreaterThanOrEqual(2);
    expect(usable.some((n) => n.sectionRef === "6.1")).toBe(true);
    expect(usable.some((n) => n.sectionRef === "6.2")).toBe(true);
    const definitions = discoverDefinitions(sourceId, structural.normalizedText, structural.nodes);
    const xrefs = discoverCrossReferences(sourceId, structural.normalizedText);
    const candidates = discoverCovenantCandidates(sourceId, structural.normalizedText, structural.nodes);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.some((c) => /Indebtedness/i.test(c.excerpt))).toBe(true);
    expect(candidates.some((c) => /\bLiens?\b/i.test(c.excerpt))).toBe(true);

    const summary = buildDocumentCovenantSummary({
      sourceId,
      documentTitle: "Collapsed HTML fixture",
      issuerName: "Test",
      issuerCik: "0000000000",
      documentClass: "CREDIT_AGREEMENT",
      candidates,
      definitions,
      structuralNodes: structural.nodes,
      crossReferences: xrefs,
    });
    const answer = answerFromSummaryItems({
      question: "What restrictions apply to additional secured debt?",
      items: summary.items.map((i) => ({ ...i, sourceId })),
      researchOnly: true,
      limit: 5,
    });
    expect(answer.kind).toBe("answered");
    expect(answer.detail).toMatch(/\[LIENS REGIME\]/);
    expect(answer.detail).toMatch(/\[INDEBTEDNESS REGIME\]/);
  });
});
