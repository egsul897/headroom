import { describe, expect, it } from "vitest";
import { classifyDebtDocument, stripIdentityTokens } from "../../lib/knowledge-factory/classify/debt-document";
import { scoreDiscoveryPotential } from "../../lib/knowledge-factory/rank/discovery-score";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";
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
