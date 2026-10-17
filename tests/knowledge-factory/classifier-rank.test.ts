import { describe, expect, it } from "vitest";
import { classifyDebtDocument, stripIdentityTokens } from "../../lib/knowledge-factory/classify/debt-document";
import { scoreDiscoveryPotential } from "../../lib/knowledge-factory/rank/discovery-score";
import { classifyFamiliesFromText, stripCatchAllFallback } from "../../lib/knowledge-factory/taxonomy/families";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";
import { detectPatternsInText } from "../../lib/knowledge-factory/patterns/library";
import {
  assertKnowledgeFactoryCannotWriteCapacity,
  patternSimilarityIsNotRuleApproval,
  taxonomyLabelIsNotOperativeAuthority,
} from "../../lib/knowledge-factory/legal-safety/promotion-guards";
import { canTransition } from "../../lib/knowledge-factory/representation/levels";

describe("debt-document classifier", () => {
  it("classifies revolving credit agreements", () => {
    const r = classifyDebtDocument({ title: "Amended and Restated Revolving Credit Agreement", description: "EX-10.1" });
    expect(r.documentClass).toBe("RESTATEMENT");
  });

  it("classifies indentures and supplemental indentures", () => {
    expect(classifyDebtDocument({ title: "Indenture dated as of May 1, 2024" }).documentClass).toBe("INDENTURE");
    expect(classifyDebtDocument({ title: "First Supplemental Indenture" }).documentClass).toBe("SUPPLEMENTAL_INDENTURE");
  });

  it("does not assume Exhibit 10 is a credit agreement", () => {
    const r = classifyDebtDocument({ title: "Employment Agreement", description: "Employment Agreement", exhibitType: "EX-10.2" });
    expect(r.documentClass).toBe("UNKNOWN");
    expect(r.signals).toContain("exhibit_10_without_debt_title");
  });

  it("preserves UNKNOWN for non-debt amendment false positives", () => {
    const r = classifyDebtDocument({ title: "Tax Benefit Preservation Plan Amendment", description: "Amendment No. 5 to Tax Benefit Preservation Plan" });
    expect(r.documentClass).toBe("UNKNOWN");
  });

  it("classifies an amendment by its own title line when metadata is a bare filename (rule 181)", () => {
    // Real failure: a customer upload named "EX-10.1.htm" whose
    // document titles itself "AMENDMENT NO. 1" classified as
    // CREDIT_AGREEMENT (its body quotes the base agreement), so a
    // base+amendment package saw two bases and zero amendments.
    const r = classifyDebtDocument({
      title: "expand-ex10-1.htm",
      description: "expand-ex10-1.htm",
      filename: "expand-ex10-1.htm",
      exhibitType: "EX-10.1",
      textSample:
        "EXHIBIT 10.1\n\nExecution Version\n\nAMENDMENT NO. 1\n\nThis AMENDMENT NO. 1 (this \"Agreement\") dated as of October 6, 2026, is among EXPAND ENERGY CORPORATION, as Borrower, and JPMORGAN CHASE BANK, N.A., as Administrative Agent.\n\nRecitals\n\nA. WHEREAS, the Borrower, the Lenders and the Administrative Agent are parties to that certain Amended and Restated Credit Agreement dated as of September 30, 2025.\n\nSection 1.01 of the Existing Credit Agreement is hereby amended as follows.",
    });
    expect(r.documentClass).toBe("AMENDMENT");
  });

  it("does not treat a base agreement's opening-sentence mention of a prior amendment as an amendment (rule 181)", () => {
    const r = classifyDebtDocument({
      title: "Credit Agreement",
      description: "Credit Agreement",
      filename: "credit-agreement.htm",
      textSample:
        "CREDIT AGREEMENT dated as of January 1, 2024, among ACME CORP, as Borrower, as amended by Amendment No. 1 dated as of June 1, 2024, and the Lenders party hereto.\n\nARTICLE I\n\nSection 1.01 Defined Terms.",
    });
    expect(r.documentClass).toBe("CREDIT_AGREEMENT");
  });

  it("classifies numbered omnibus amendments as AMENDMENT", () => {
    const r = classifyDebtDocument({ title: "First Omnibus Amendment", description: "First Omnibus Amendment to the Credit Agreement" });
    expect(r.documentClass).toBe("AMENDMENT");
  });

  it("is identity-agnostic (anti-overfitting)", () => {
    const a = classifyDebtDocument({ title: "Credit Agreement among Acme Corp and Lenders" });
    const b = classifyDebtDocument({ title: stripIdentityTokens("Credit Agreement among Acme Corp and Lenders") });
    expect(a.documentClass).toBe("CREDIT_AGREEMENT");
    expect(b.documentClass).toBe("CREDIT_AGREEMENT");
  });
});

describe("discovery ranking + taxonomy + patterns", () => {
  const sample = `
    ARTICLE VII NEGATIVE COVENANTS
    Section 7.01 Indebtedness. The Borrower shall not incur Indebtedness except Permitted Indebtedness, including the greater of $50,000,000 and 10% of Consolidated EBITDA.
    Section 7.02 Liens. ...
    Section 7.06 Restricted Payments. ... Available Amount ... no Default ... pro forma compliance ...
    Section 7.07 Investments. shared basket with Restricted Payments.
    "Consolidated EBITDA" means ...
    Incremental Equivalent Debt ...
  `;

  it("scores covenant-rich text highly", () => {
    const r = scoreDiscoveryPotential(sample);
    expect(r.score).toBeGreaterThan(10);
    expect(r.families).toContain("INDEBTEDNESS");
    expect(r.families).toContain("RESTRICTED_PAYMENTS");
  });

  it("classifies families without forcing UNKNOWN-only", () => {
    const families = classifyFamiliesFromText(sample, "Section 7.01 Indebtedness");
    expect(families).toContain("INDEBTEDNESS");
    expect(families).not.toEqual(["UNKNOWN"]);
  });

  it("detects drafting patterns", () => {
    const patterns = detectPatternsInText(sample);
    expect(patterns).toContain("greater-of-basket");
    expect(patterns).toContain("builder-basket");
    expect(patterns).toContain("no-default-condition");
  });
});

describe("rule 155: catch-all family is a fallback, never a co-label", () => {
  it("drops the catch-all when a specific family matched via the heading", () => {
    // "Conditions to Borrowing" trips the catch-all heading pattern
    // /\bConditions?\b/i, but the body is Indebtedness language.
    const families = classifyFamiliesFromText(
      "The Borrower shall not incur Indebtedness except Permitted Indebtedness.",
      "Section 4.01 Conditions to Borrowing",
    );
    expect(families).toContain("INDEBTEDNESS");
    expect(families).not.toContain("GENERAL_CONDITIONS_AND_EXCEPTIONS");
  });

  it("keeps the catch-all when nothing specific matched", () => {
    const families = classifyFamiliesFromText(
      "The obligations are subject to the following conditions precedent: delivery of certificates.",
      "Section 3.01 Conditions Precedent",
    );
    expect(families).toEqual(["GENERAL_CONDITIONS_AND_EXCEPTIONS"]);
  });

  it("stripCatchAllFallback keeps UNKNOWN-only lists untouched", () => {
    expect(stripCatchAllFallback(["UNKNOWN"])).toEqual(["UNKNOWN"]);
    expect(stripCatchAllFallback(["GENERAL_CONDITIONS_AND_EXCEPTIONS", "UNKNOWN"])).toEqual([
      "GENERAL_CONDITIONS_AND_EXCEPTIONS",
      "UNKNOWN",
    ]);
  });

  it("candidate merge drops the ranker re-injected catch-all", () => {
    // The ranker's amendments_cross_refs signal matches any bare
    // "Section X.Y", so without the rule this candidate would carry
    // GENERAL_CONDITIONS_AND_EXCEPTIONS alongside INDEBTEDNESS.
    const text =
      "Section 7.01 Indebtedness. The Borrower shall not incur Indebtedness except Permitted Indebtedness, including the greater of $50,000,000 and 10% of Consolidated EBITDA. See Section 7.02.";
    const nodes: StructuralNodeRecord[] = [
      {
        nodeId: "n1",
        sourceId: "src-1",
        nodeType: "SECTION",
        sectionRef: "7.01",
        heading: "Section 7.01 Indebtedness",
        charStart: 0,
        charEnd: text.length,
      },
    ];
    const candidates = discoverCovenantCandidates("src-1", text, nodes);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.families).toContain("INDEBTEDNESS");
    expect(candidates[0]!.families).not.toContain("GENERAL_CONDITIONS_AND_EXCEPTIONS");
  });
});

describe("legal safety + representation levels", () => {
  it("blocks capacity-table writes", () => {
    expect(() => assertKnowledgeFactoryCannotWriteCapacity("Permission")).toThrow(/legal-safety/);
  });

  it("pattern similarity never approves rules", () => {
    expect(patternSimilarityIsNotRuleApproval(0.99).approved).toBe(false);
  });

  it("taxonomy labels are not operative authority", () => {
    expect(taxonomyLabelIsNotOperativeAuthority("INDEBTEDNESS").operative).toBe(false);
  });

  it("cannot transition into CERTIFIED/REVIEWER_VERIFIED automatically", () => {
    expect(canTransition("DISCOVERED_CANDIDATE", "CERTIFIED")).toBe(false);
    expect(canTransition("DISCOVERED_CANDIDATE", "REVIEWER_VERIFIED")).toBe(false);
    expect(canTransition("SOURCE_ONLY", "STRUCTURALLY_INDEXED")).toBe(true);
  });
});
