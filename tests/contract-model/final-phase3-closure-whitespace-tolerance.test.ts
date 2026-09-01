/**
 * FINAL PHASE 3 CLOSURE - Unit A Section 6 required generic adversarial
 * matrix (A1-A15). Every fixture is wholly synthetic (Meridian/Solaris/etc,
 * matching the existing pre-unseen-classifier-remediation.test.ts's own
 * convention) - no Superior Industries text, no real party names, no real
 * section numbers. Proves the \s+ whitespace-tolerance fix
 * (document-classifier.ts) generalizes past the one real document
 * (Superior doc-b) that exposed the defect, and does not regress any of
 * the existing position-aware/self-referential/ambiguity-guard/TOC-
 * resistance behavior.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyDocument } from "../../lib/contract-model/compiler/package-graph/document-classifier";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, text: string): PackageDocumentInput {
  return { documentId, label: documentId, text };
}

describe("A1: normal one-line Amended and Restated Credit Agreement", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT", () => {
    const text = `$100,000,000

AMENDED AND RESTATED CREDIT AGREEMENT

Dated as of March 1, 2024,

among

MERIDIAN FABRICATION, INC.,

as the Borrower`;
    const result = classifyDocument(doc("a1", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("A2: newline between RESTATED and CREDIT", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT despite the line-wrap", () => {
    const text = `$100,000,000
AMENDED AND RESTATED
CREDIT AGREEMENT

Dated as of March 1, 2024,

among

MERIDIAN FABRICATION, INC.,

as the Borrower`;
    const result = classifyDocument(doc("a2", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });
});

describe("A3: newline between CREDIT and AGREEMENT", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT despite the line-wrap", () => {
    const text = `AMENDED AND RESTATED CREDIT
AGREEMENT

Dated as of March 1, 2024, among MERIDIAN FABRICATION, INC., as the Borrower`;
    const result = classifyDocument(doc("a3", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });
});

describe("A4: multiple spaces between words", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT despite extra spacing", () => {
    const text = `AMENDED   AND   RESTATED   CREDIT AGREEMENT

Dated as of March 1, 2024, among MERIDIAN FABRICATION, INC., as the Borrower`;
    const result = classifyDocument(doc("a4", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });
});

describe("A5: tab character between words", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT despite a tab", () => {
    const text = `AMENDED AND RESTATED\tCREDIT AGREEMENT

Dated as of March 1, 2024, among MERIDIAN FABRICATION, INC., as the Borrower`;
    const result = classifyDocument(doc("a5", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });
});

describe("A6: CRLF line ending between words", () => {
  it("classifies AMENDED_AND_RESTATED_AGREEMENT despite a CRLF", () => {
    const text = `AMENDED AND RESTATED\r\nCREDIT AGREEMENT\r\n\r\nDated as of March 1, 2024, among MERIDIAN FABRICATION, INC., as the Borrower`;
    const result = classifyDocument(doc("a6", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });
});

describe("A7: line-wrapped Supplemental Indenture", () => {
  it("classifies SUPPLEMENTAL_INDENTURE despite the line-wrap", () => {
    const text = `THIRD SUPPLEMENTAL
INDENTURE

Dated as of March 1, 2024, among MERIDIAN FABRICATION, INC. and SOLARIS TRUST COMPANY, as Trustee`;
    const result = classifyDocument(doc("a7", text));
    expect(result.type).toBe("SUPPLEMENTAL_INDENTURE");
  });
});

describe("A8: line-wrapped Security Agreement", () => {
  it("classifies SECURITY_AGREEMENT despite the line-wrap", () => {
    const text = `SECURITY
AGREEMENT

Dated as of March 1, 2024, made by MERIDIAN FABRICATION, INC. in favor of SOLARIS BANK, N.A., as Collateral Agent`;
    const result = classifyDocument(doc("a8", text));
    expect(result.type).toBe("SECURITY_AGREEMENT");
  });
});

describe("A9: line-wrapped Compliance Certificate", () => {
  it("classifies COMPLIANCE_CERTIFICATE despite the line-wrap", () => {
    const text = `COMPLIANCE
CERTIFICATE

This Compliance Certificate is delivered pursuant to Section 6.02 of that certain Credit Agreement, dated as of January 10, 2024, among MERIDIAN FABRICATION, INC. and SOLARIS BANK, N.A.`;
    const result = classifyDocument(doc("a9", text));
    expect(result.type).toBe("COMPLIANCE_CERTIFICATE");
  });
});

describe("A10: ordinary Amendment referencing a line-wrapped A&R Credit Agreement target remains AMENDMENT", () => {
  it("classifies AMENDMENT, not misled by the referenced target's own line-wrapped type name", () => {
    const text = `FIRST AMENDMENT TO CREDIT AGREEMENT

This First Amendment to Credit Agreement (this "Amendment"), dated as of June 1, 2024, amends that certain Amended and Restated
Credit Agreement, dated as of January 10, 2024, among MERIDIAN FABRICATION, INC. and SOLARIS BANK, N.A.`;
    const result = classifyDocument(doc("a10", text));
    expect(result.type).toBe("AMENDMENT");
  });
});

describe("A11: base Credit Agreement with a later line-wrapped TOC 'Amended and Restated' reference remains base CREDIT_AGREEMENT", () => {
  it("classifies CREDIT_AGREEMENT - the earlier real caption beats a later, line-wrapped TOC/exhibit mention placed well outside the caption zone", () => {
    const text = `CREDIT AGREEMENT

Dated as of January 10, 2024

Between

MERIDIAN FABRICATION, INC.

as Borrower

and

SOLARIS BANK, N.A.

as Administrative Agent

Table of Contents

Article I DEFINITIONS

Article II THE CREDITS

Article III TAXES, YIELD PROTECTION AND ILLEGALITY

Article IV CONDITIONS PRECEDENT

Article V REPRESENTATIONS AND WARRANTIES

Article VI NEGATIVE COVENANTS

Article VII EVENTS OF DEFAULT

Exhibit F - Form of Amended and Restated
Credit Agreement (post-Refinancing)

Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.`;
    const result = classifyDocument(doc("a11", text));
    expect(result.type).toBe("CREDIT_AGREEMENT");
  });
});

describe("A12: fused ambiguous caption still fails safely (UNKNOWN/low-confidence, never a forced guess)", () => {
  it("does not confidently classify when a base-facility type and a genuinely disjoint, comparably-prominent, non-overlapping type conflict within the caption zone - even with line-wrapped evidence", () => {
    const text = `CREDIT AGREEMENT

and

GUARANTEE
AGREEMENT

Dated as of March 1, 2024, among MERIDIAN FABRICATION, INC., as Borrower, and SOLARIS BANK, N.A.`;
    const result = classifyDocument(doc("a12", text));
    expect(result.resolutionMethod).toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
    expect(result.confidence).toBeLessThan(0.9);
  });
});

describe("A13: self-referential-title Tier 1 still dominates later references, even when the self-term itself is line-wrapped", () => {
  it("classifies via the self-referential defined term, not the later-referenced base agreement's own type", () => {
    const text = `AMENDMENT NO. 2

This Amendment No. 2 to Credit Agreement (this "Amendment"), dated as of June 1, 2024, amends that certain Amended and Restated
Credit Agreement, dated as of January 10, 2024, among MERIDIAN FABRICATION, INC. and SOLARIS BANK, N.A.`;
    const result = classifyDocument(doc("a13", text));
    expect(result.type).toBe("AMENDMENT");
    expect(result.resolutionMethod).toMatch(/SELF_REFERENTIAL/);
  });
});

describe("A14: line-wrapping does not alter earliest-evidence ordering (Tier 2 position-aware tiebreak)", () => {
  it("the earlier match still wins even when both candidate matches are individually line-wrapped", () => {
    const textEarlyCreditAgreement = `CREDIT
AGREEMENT

Dated as of January 10, 2024, between MERIDIAN FABRICATION, INC. as Borrower and SOLARIS BANK, N.A. as Administrative Agent.

Exhibit E - Form of Security
Agreement`;
    const result = classifyDocument(doc("a14", textEarlyCreditAgreement));
    expect(result.type).toBe("CREDIT_AGREEMENT");
  });
});

describe("A15: no package-specific strings leaked into production code", () => {
  it("document-classifier.ts contains no Superior/issuer-specific literal text", () => {
    const src = readFileSync("lib/contract-model/compiler/package-graph/document-classifier.ts", "utf-8");
    expect(src).not.toMatch(/superior/i);
    expect(src).not.toMatch(/sup-term-loan/i);
    expect(src).not.toMatch(/final-lightweight-unseen/i);
  });
});
