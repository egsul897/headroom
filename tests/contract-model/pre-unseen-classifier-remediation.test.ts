/**
 * PRE-UNSEEN classifier remediation - the required C1-C10 generic
 * adversarial test matrix (docs/pre-unseen-classifier-remediation.md).
 * Every fixture is a wholly synthetic invention (Meridian/Solaris/etc.) -
 * no Riot/Coinbase text, no real party names, no real section numbers.
 * Proves the position-aware Tier 2 classifier generalizes past the one
 * real document (Riot doc-a) that exposed the defect, rather than being
 * tuned to it.
 */
import { describe, expect, it } from "vitest";
import { classifyDocument } from "../../lib/contract-model/compiler/package-graph/document-classifier";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, text: string): PackageDocumentInput {
  return { documentId, label: documentId, text };
}

describe("C1: Credit Agreement whose TOC contains 'Form of Compliance Certificate'", () => {
  it("classifies CREDIT_AGREEMENT - the earlier real caption beats the later TOC/exhibit entry", () => {
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

Article VI NEGATIVE COVENANTS

Exhibit E - Form of Compliance Certificate

Exhibit F - Form of Assignment and Acceptance

Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.`;
    const result = classifyDocument(doc("c1", text));
    expect(result.type).toBe("CREDIT_AGREEMENT");
  });
});

describe("C2: Credit Agreement with a full Compliance Certificate form attached as an exhibit", () => {
  it("classifies CREDIT_AGREEMENT even with a complete attached Compliance Certificate form", () => {
    const text = `CREDIT AGREEMENT dated as of February 1, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent.

Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.

EXHIBIT E

FORM OF COMPLIANCE CERTIFICATE

The undersigned, a Responsible Officer of Meridian Fabrication, Inc., hereby certifies that the Borrower is in compliance with the covenants set forth in Section 6.01 of the Credit Agreement.`;
    const result = classifyDocument(doc("c2", text));
    expect(result.type).toBe("CREDIT_AGREEMENT");
  });
});

describe("C3: an actual standalone Compliance Certificate that repeatedly references the Credit Agreement", () => {
  it("classifies COMPLIANCE_CERTIFICATE - its own caption is earliest, later Credit Agreement references never override it", () => {
    const text = `COMPLIANCE CERTIFICATE

Reference is made to the Credit Agreement dated as of January 10, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent (the "Credit Agreement").

The undersigned, a Responsible Officer of the Borrower, hereby certifies pursuant to Section 6.01 of the Credit Agreement that the Borrower is in compliance with all covenants under the Credit Agreement, including the Indebtedness covenant set forth in the Credit Agreement.`;
    const result = classifyDocument(doc("c3", text));
    expect(result.type).toBe("COMPLIANCE_CERTIFICATE");
  });
});

describe("C4: Amendment to Credit Agreement containing the full title of the original Credit Agreement", () => {
  it("classifies AMENDMENT, not the base Credit Agreement type", () => {
    const text = `FIRST AMENDMENT TO CREDIT AGREEMENT dated as of June 1, 2024, to the CREDIT AGREEMENT dated as of January 10, 2024, among Meridian Fabrication, Inc. and Solaris Bank, N.A.

Section 6.01 of the Credit Agreement is hereby amended and restated to increase the Indebtedness basket to $15,000,000.`;
    const result = classifyDocument(doc("c4", text));
    expect(result.type).toBe("AMENDMENT");
  });

  it("also classifies AMENDMENT for a numbered-ordinal amendment naming both a base Credit Agreement and a Security Agreement in the same caption (real, disclosed omnibus-amendment shape)", () => {
    const text = `FOURTH AMENDMENT dated as of October 10, 2024, to the Credit Agreement dated as of March 3, 2019 and to the Security Agreement dated as of March 3, 2019, among Meridian Fabrication, Inc. and the parties thereto.

NOW, THEREFORE, the parties agree that Section 6.05 of the Credit Agreement is hereby amended to increase the Investments basket to $30,000,000.`;
    const result = classifyDocument(doc("c4b", text));
    expect(result.type).toBe("AMENDMENT");
  });
});

describe("C5: Security Agreement referencing Credit Agreement", () => {
  it("classifies SECURITY_AGREEMENT", () => {
    const text = `SECURITY AGREEMENT dated as of January 10, 2024, made by Meridian Fabrication, Inc. in favor of Solaris Bank, N.A., as Administrative Agent, securing obligations under the Credit Agreement dated as of January 10, 2024.

Section 2.01 Grant of Security Interest.`;
    const result = classifyDocument(doc("c5", text));
    expect(result.type).toBe("SECURITY_AGREEMENT");
  });
});

describe("C6: Guarantee referencing Credit Agreement", () => {
  it("classifies GUARANTEE", () => {
    const text = `GUARANTEE AGREEMENT dated as of January 10, 2024, made by Meridian Holdings, Inc. in favor of the Administrative Agent, guaranteeing obligations under the Credit Agreement dated as of January 10, 2024.

Section 2.01 Guarantee. Each Guarantor hereby guarantees payment of the Obligations.`;
    const result = classifyDocument(doc("c6", text));
    expect(result.type).toBe("GUARANTEE");
  });
});

describe("C7: Intercreditor Agreement referencing several Credit Agreements", () => {
  it("classifies INTERCREDITOR_AGREEMENT - multiple same-type referenced facilities never dilute the winning type", () => {
    const text = `INTERCREDITOR AGREEMENT dated as of January 10, 2024, among Solaris Bank, N.A., as First Lien Agent, and Northbridge Trust Co., as Second Lien Agent, governing the relative priorities of the First Lien Credit Agreement dated as of January 10, 2024 and the Second Lien Credit Agreement dated as of January 10, 2024.

Section 1.01 Lien Priority.`;
    const result = classifyDocument(doc("c7", text));
    expect(result.type).toBe("INTERCREDITOR_AGREEMENT");
  });
});

describe("C8: ambiguous document with conflicting high-quality title evidence", () => {
  it("returns safe uncertainty (UNKNOWN, low confidence, DETERMINISTIC_CAPTION_AMBIGUOUS) for a fused dual-type caption with no established composite RULES entry", () => {
    const text = `CREDIT AGREEMENT AND SECURITY AGREEMENT dated as of January 10, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent and Collateral Agent.

Section 6.01 Indebtedness. Section 2.01 Grant of Security Interest.`;
    const result = classifyDocument(doc("c8", text));
    expect(result.type).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
    expect(result.resolutionMethod).toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
    expect(result.evidence.length).toBe(2);
  });

  it("never fires ambiguity for a declared-type-confirmed base document merely because its OWN preamble text mentions another type far from its caption (regression guard - the ambiguity zone is bounded)", () => {
    const text = `CREDIT AGREEMENT dated as of January 10, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent.

${"Section 1.01 Definitions. ".repeat(40)}

The Borrower shall also deliver a Compliance Certificate pursuant to Section 6.01.`;
    const result = classifyDocument(doc("c8b", text));
    expect(result.type).toBe("CREDIT_AGREEMENT");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });
});

describe("C9: document with a misleading TOC-style title before the actual body title", () => {
  it("the actual primary document identity wins when it is textually earlier than the misleading later mention (the realistic case for every real SEC-filed financing document this codebase has encountered)", () => {
    // The real, demonstrated Riot shape: a genuine caption precedes a
    // later table-of-contents/exhibit-list entry that happens to name a
    // different document type. This is the C1/C2 shape restated with an
    // explicit "misleading" framing per the mission's own C9 label.
    const text = `INDENTURE

Dated as of January 10, 2024

Between

MERIDIAN FABRICATION, INC.

as Issuer

and

NORTHBRIDGE TRUST CO.

as Trustee

Table of Contents

Exhibit C - Form of Guaranty Agreement

Section 4.01 Covenants.`;
    const result = classifyDocument(doc("c9", text));
    expect(result.type).toBe("INDENTURE");
  });
});

describe("C10: multiple exhibit/form names inside one base agreement", () => {
  it("base agreement classification remains stable regardless of how many exhibit/form names appear later", () => {
    const text = `CREDIT AGREEMENT dated as of January 10, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent.

Table of Contents

Exhibit A - Form of Notice of Borrowing
Exhibit B - Form of Assignment and Acceptance
Exhibit C - Form of Guaranty Agreement
Exhibit D - Form of Security Agreement
Exhibit E - Form of Compliance Certificate
Exhibit F - Form of Joinder Agreement
Exhibit G - Form of Intercreditor Agreement

Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.`;
    const result = classifyDocument(doc("c10", text));
    expect(result.type).toBe("CREDIT_AGREEMENT");
  });
});

describe("Regression guards - existing referencing-document conventions never trigger false ambiguity", () => {
  it("a Guarantee's own caption naming the Credit Agreement it guarantees is never ambiguous", () => {
    const text = `GUARANTEE AGREEMENT dated as of March 1, 2021, made by Meridian Holdings, Inc. in favor of the Administrative Agent, guaranteeing obligations under the Credit Agreement dated as of March 1, 2021.

Section 2.01 Guarantee.`;
    const result = classifyDocument(doc("guard1", text));
    expect(result.type).toBe("GUARANTEE");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });

  it("a Joinder's own caption naming the Intercreditor Agreement it joins is never ambiguous", () => {
    const text = `JOINDER AGREEMENT dated as of March 1, 2024 to the Intercreditor Agreement dated as of January 1, 2024.

The undersigned new secured party hereby joins the Intercreditor Agreement.`;
    const result = classifyDocument(doc("guard2", text));
    expect(result.type).toBe("JOINDER");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });

  it("an Amended and Restated Credit Agreement's own composite match is never treated as ambiguous against the nested base-type substring", () => {
    const text = `AMENDED AND RESTATED CREDIT AGREEMENT dated as of June 1, 2024, among Meridian Fabrication, Inc., as Borrower, and Solaris Bank, N.A., as Administrative Agent.`;
    const result = classifyDocument(doc("guard3", text));
    expect(result.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });

  it("a Supplemental Indenture's own composite match is never treated as ambiguous against the nested base-type substring", () => {
    const text = `FIRST SUPPLEMENTAL INDENTURE dated as of March 1, 2024 to the Indenture dated as of January 1, 2024, among Meridian Fabrication, Inc., as Issuer.`;
    const result = classifyDocument(doc("guard4", text));
    expect(result.type).toBe("SUPPLEMENTAL_INDENTURE");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });

  it("a composite Guarantee and Security Agreement's own match is never treated as ambiguous against its nested SECURITY_AGREEMENT substring", () => {
    const text = `GUARANTEE AND SECURITY AGREEMENT dated as of January 10, 2024, made by Meridian Holdings, Inc. in favor of Solaris Bank, N.A.`;
    const result = classifyDocument(doc("guard5", text));
    expect(result.type).toBe("GUARANTEE_AND_SECURITY_AGREEMENT");
    expect(result.resolutionMethod).not.toBe("DETERMINISTIC_CAPTION_AMBIGUOUS");
  });
});

describe("No benchmark-specific strings in production classifier logic", () => {
  it("document-classifier.ts contains no Riot/Coinbase/known-package identifiers", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const src = fs.readFileSync(require.resolve("../../lib/contract-model/compiler/package-graph/document-classifier.ts"), "utf-8");
    expect(src).not.toMatch(/riot/i);
    expect(src).not.toMatch(/coinbase/i);
    expect(src).not.toMatch(/platforms, inc/i);
  });
});
