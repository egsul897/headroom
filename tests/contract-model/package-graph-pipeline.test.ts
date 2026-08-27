/**
 * Phase 2C §16 - the five required synthetic multi-document test packages
 * (A-E), plus §18's own family-recall-style coverage of classification,
 * grouping, relationship creation, target resolution, modification-
 * candidate detection, document/instrument isolation, and ambiguity
 * handling. All fixture text is invented for this test file - no
 * FWRG/LSB-specific content (task §20's own anti-overfitting discipline,
 * applied here to package-graph the same way Phase 2B's own test file
 * applied it to discovery).
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

describe("Package A - base credit agreement + Amendment 1 (covenant) + Amendment 2 (definition) + joinder", () => {
  const base = doc(
    "pkgA-ca",
    "Credit Agreement",
    `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower, and Fictional Bank, N.A., as Administrative Agent.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`
  );
  const amendment1 = doc(
    "pkgA-amend1",
    "Amendment No. 1",
    `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to increase the general debt basket to $75,000,000.`
  );
  const amendment2 = doc(
    "pkgA-amend2",
    "Amendment No. 2",
    `AMENDMENT NO. 2 dated as of March 1, 2023 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nThe definition of "Consolidated EBITDA" is hereby amended to add a new addback category for restructuring charges.`
  );
  const joinder = doc(
    "pkgA-joinder",
    "Joinder Agreement",
    `JOINDER AGREEMENT dated as of July 1, 2023 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nThe undersigned New Guarantor LLC hereby joins as a Guarantor under the Credit Agreement.`
  );
  const documents = [base, amendment1, amendment2, joinder];
  const result = buildPackageGraph("co-a", "package-a", documents);

  it("classifies every document correctly", () => {
    const byId = new Map(result.classifications.map((c) => [c.documentId, c.type] as const));
    expect(byId.get("pkgA-ca")).toBe("CREDIT_AGREEMENT");
    expect(byId.get("pkgA-amend1")).toBe("AMENDMENT");
    expect(byId.get("pkgA-amend2")).toBe("AMENDMENT");
    expect(byId.get("pkgA-joinder")).toBe("JOINDER");
  });

  it("resolves both amendments' and the joinder's AMENDS/JOINS target to the base Credit Agreement", () => {
    const amend1Edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgA-amend1");
    const amend2Edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgA-amend2");
    const joinderEdge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgA-joinder");
    expect(amend1Edge).toMatchObject({ targetDocumentId: "pkgA-ca", relationshipType: "AMENDS", status: "RESOLVED" });
    expect(amend2Edge).toMatchObject({ targetDocumentId: "pkgA-ca", relationshipType: "AMENDS", status: "RESOLVED" });
    expect(joinderEdge).toMatchObject({ targetDocumentId: "pkgA-ca", relationshipType: "JOINS", status: "RESOLVED" });
  });

  it("detects the covenant-modification candidate in Amendment 1 as a RESTATE targeting Section 6.01", () => {
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "pkgA-amend1");
    expect(mc).toBeDefined();
    expect(mc?.operation).toBe("RESTATE");
    expect(mc?.targetSectionRef).toBe("6.01");
    expect(mc?.targetDocumentId).toBe("pkgA-ca");
  });

  it("detects the definition-modification candidate in Amendment 2 targeting Consolidated EBITDA", () => {
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "pkgA-amend2");
    expect(mc).toBeDefined();
    expect(mc?.operation).toBe("MODIFY");
    expect(mc?.targetDefinedTermRef).toContain("Consolidated EBITDA");
    expect(mc?.targetDocumentId).toBe("pkgA-ca");
  });

  it("groups all four documents into ONE instrument, based at the Credit Agreement", () => {
    expect(result.instruments).toHaveLength(1);
    expect(result.instruments[0]!.baseDocumentId).toBe("pkgA-ca");
    expect(new Set(result.instruments[0]!.documentIds)).toEqual(new Set(["pkgA-ca", "pkgA-amend1", "pkgA-amend2", "pkgA-joinder"]));
  });
});

describe("Package B - base indenture + supplemental indenture + guarantee + intercreditor agreement", () => {
  const indenture = doc("pkgB-ind", "Indenture", `INDENTURE dated as of May 1, 2020, among Beta Issuer Inc., as Issuer, and Fictional Trust Co., as Trustee.\n\nSection 4.09 Limitation on Indebtedness.`);
  const supplemental = doc(
    "pkgB-supp",
    "First Supplemental Indenture",
    `FIRST SUPPLEMENTAL INDENTURE dated as of August 1, 2021 to the Indenture dated as of May 1, 2020, among Beta Issuer Inc., as Issuer.\n\nSection 4.09 of the Indenture is hereby amended by adding a new exception for Permitted Refinancing Indebtedness.`
  );
  const guarantee = doc(
    "pkgB-guar",
    "Guaranty Agreement",
    `GUARANTY AGREEMENT dated as of May 1, 2020, among Beta Guarantor LLC and Fictional Trust Co.\n\nThe Guarantor hereby unconditionally guarantees all obligations under the Indenture dated as of May 1, 2020.`
  );
  const intercreditor = doc(
    "pkgB-ic",
    "Intercreditor Agreement",
    `INTERCREDITOR AGREEMENT dated as of May 1, 2020, among Fictional Trust Co. and Fictional Bank, N.A.\n\nThis Agreement governs the relative priority of Liens securing obligations under the Indenture dated as of May 1, 2020.`
  );
  const documents = [indenture, supplemental, guarantee, intercreditor];
  const result = buildPackageGraph("co-b", "package-b", documents);

  it("classifies the supplemental indenture, guarantee, and intercreditor agreement distinctly from the base indenture", () => {
    const byId = new Map(result.classifications.map((c) => [c.documentId, c.type] as const));
    expect(byId.get("pkgB-ind")).toBe("INDENTURE");
    expect(byId.get("pkgB-supp")).toBe("SUPPLEMENTAL_INDENTURE");
    expect(byId.get("pkgB-guar")).toBe("GUARANTEE");
    expect(byId.get("pkgB-ic")).toBe("INTERCREDITOR_AGREEMENT");
  });

  it("resolves the supplemental indenture's SUPPLEMENTS edge, the guarantee's GUARANTEES edge, and the intercreditor's INTERCREDITOR_WITH edge, all to the base indenture", () => {
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgB-supp")).toMatchObject({ targetDocumentId: "pkgB-ind", relationshipType: "SUPPLEMENTS", status: "RESOLVED" });
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgB-guar")).toMatchObject({ targetDocumentId: "pkgB-ind", relationshipType: "GUARANTEES", status: "RESOLVED" });
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgB-ic")).toMatchObject({ targetDocumentId: "pkgB-ind", relationshipType: "INTERCREDITOR_WITH", status: "RESOLVED" });
  });

  it("groups the indenture and its supplemental into one instrument, while the guarantee/intercreditor stay unGROUPED (cross-cutting, associated via edges instead)", () => {
    expect(result.instruments).toHaveLength(1);
    expect(new Set(result.instruments[0]!.documentIds)).toEqual(new Set(["pkgB-ind", "pkgB-supp"]));
  });

  it("detects the supplemental indenture's own modification candidate (ADD, targeting Section 4.09)", () => {
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "pkgB-supp");
    expect(mc).toMatchObject({ operation: "ADD", targetSectionRef: "4.09", targetDocumentId: "pkgB-ind" });
  });
});

describe("Package C - two unrelated debt instruments with overlapping section numbers", () => {
  const ca1 = doc("pkgC-ca1", "Gamma Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2019, among Gamma Corp., as Borrower.\n\nSection 6.01 Indebtedness. Limited to $10,000,000.`);
  const ca2 = doc("pkgC-ca2", "Delta Credit Agreement", `CREDIT AGREEMENT dated as of February 1, 2019, among Delta Corp., as Borrower.\n\nSection 6.01 Indebtedness. Limited to $20,000,000.`);
  const amend1 = doc(
    "pkgC-amend1",
    "Gamma Amendment No. 1",
    `AMENDMENT NO. 1 dated as of June 1, 2020 to the Credit Agreement dated as of January 1, 2019, among Gamma Corp., as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.`
  );
  const documents = [ca1, ca2, amend1];
  const result = buildPackageGraph("co-c", "package-c", documents);

  it("resolves Gamma's amendment to Gamma's own Credit Agreement, never to Delta's, despite both sharing an identical Section 6.01 reference and agreement type", () => {
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgC-amend1");
    expect(edge).toMatchObject({ targetDocumentId: "pkgC-ca1", status: "RESOLVED" });
  });

  it("keeps the two instruments completely isolated from each other - Gamma+its amendment form one grouped instrument, Delta stands alone as its own singleton instrument", () => {
    expect(result.instruments).toHaveLength(2);
    const gammaInstrument = result.instruments.find((i) => i.documentIds.includes("pkgC-ca1"));
    const deltaInstrument = result.instruments.find((i) => i.documentIds.includes("pkgC-ca2"));
    expect(gammaInstrument?.documentIds).not.toContain("pkgC-ca2");
    expect(deltaInstrument?.documentIds).toEqual(["pkgC-ca2"]);
  });

  it("the modification candidate's own targetSectionRef (6.01) never gets confused between the two documents that both have a Section 6.01", () => {
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "pkgC-amend1");
    expect(mc?.targetDocumentId).toBe("pkgC-ca1");
  });
});

describe("Package D - ambiguous amendment reference that must remain unresolved", () => {
  // Two Credit Agreements sharing the EXACT SAME execution date - a real,
  // deliberately ambiguous case (task §14/§16) - the amendment's reference
  // to "the Credit Agreement dated as of January 1, 2019" cannot be
  // deterministically disambiguated between them.
  const caX = doc("pkgD-caX", "Epsilon Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2019, among Epsilon Corp., as Borrower.`);
  const caY = doc("pkgD-caY", "Zeta Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2019, among Zeta Corp., as Borrower.`);
  const ambiguousAmendment = doc("pkgD-amend", "Ambiguous Amendment", `AMENDMENT NO. 1 dated as of June 1, 2020 to the Credit Agreement dated as of January 1, 2019.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.`);
  const documents = [caX, caY, ambiguousAmendment];
  const result = buildPackageGraph("co-d", "package-d", documents);

  it("does NOT attach the ambiguous amendment's relationship edge to either candidate document", () => {
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgD-amend");
    expect(edge?.targetDocumentId).toBeNull();
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.unresolvedReason).toMatch(/candidate target documents share the same type and execution date/);
  });

  it("does NOT attach the modification candidate's target either - a missing edge, not a wrong one", () => {
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "pkgD-amend");
    expect(mc?.targetDocumentId).toBeNull();
    expect(mc?.status).toBe("UNRESOLVED");
  });

  it("does not fabricate an instrument grouping across the ambiguity", () => {
    expect(result.instruments.some((i) => i.documentIds.includes("pkgD-caX") && i.documentIds.includes("pkgD-caY"))).toBe(false);
  });
});

describe("Package E - amendment-and-restatement replacing an earlier agreement", () => {
  const original = doc("pkgE-orig", "Original Credit Agreement", `CREDIT AGREEMENT dated as of March 1, 2018, among Eta Corp., as Borrower.\n\nSection 6.01 Indebtedness.`);
  const restated = doc(
    "pkgE-restated",
    "Amended and Restated Credit Agreement",
    `AMENDED AND RESTATED CREDIT AGREEMENT dated as of April 1, 2022, amending and restating the Credit Agreement dated as of March 1, 2018, among Eta Corp., as Borrower.\n\nSection 6.01 Indebtedness, as amended and restated.`
  );
  const documents = [original, restated];
  const result = buildPackageGraph("co-e", "package-e", documents);

  it("classifies the new document as AMENDED_AND_RESTATED_AGREEMENT, not a fresh CREDIT_AGREEMENT", () => {
    expect(result.classifications.find((c) => c.documentId === "pkgE-restated")?.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
  });

  it("resolves a RESTATES relationship from the new agreement to the original one", () => {
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "pkgE-restated");
    expect(edge).toMatchObject({ targetDocumentId: "pkgE-orig", relationshipType: "RESTATES", status: "RESOLVED" });
  });

  it("groups both documents into one instrument, with the ORIGINAL agreement as the base", () => {
    expect(result.instruments).toHaveLength(1);
    expect(result.instruments[0]!.baseDocumentId).toBe("pkgE-orig");
  });
});

describe("Cross-document reference leads (task §12)", () => {
  it("detects a named-agreement mention and resolves it by unique type match, flagged REVIEW_REQUIRED (no date attached to disambiguate further)", () => {
    const ca = doc("xref-ca", "Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2021, among Theta Corp., as Borrower.`);
    const sideLetter = doc("xref-side", "Side Letter", `SIDE LETTER dated as of February 1, 2021.\n\nThis letter supplements certain provisions of the Credit Agreement and is subject to the Credit Agreement in all respects.`);
    const result = buildPackageGraph("co-xref", "package-xref", [ca, sideLetter]);
    const lead = result.crossDocumentReferenceLeads.find((l) => l.sourceDocumentId === "xref-side");
    expect(lead).toBeDefined();
    expect(lead?.targetDocumentId).toBe("xref-ca");
    expect(lead?.status).toBe("REVIEW_REQUIRED");
  });

  it("leaves a named-agreement mention unresolved when no document of the referenced type exists in the package", () => {
    const sideLetter = doc("xref2-side", "Side Letter", `SIDE LETTER dated as of February 1, 2021.\n\nThis letter is subject to the Indenture in all respects.`);
    const result = buildPackageGraph("co-xref2", "package-xref2", [sideLetter]);
    const lead = result.crossDocumentReferenceLeads.find((l) => l.sourceDocumentId === "xref2-side");
    expect(lead?.targetDocumentId).toBeNull();
    expect(lead?.status).toBe("UNRESOLVED");
  });
});

describe("Document isolation and performance metrics", () => {
  it("never fabricates a classification for a document with no recognizable signal at all - UNKNOWN with zero evidence, not a forced guess", () => {
    const mystery = doc("mystery-doc", "Mystery Document", `This is a short letter about scheduling a call next week. It does not describe any legal agreement.`);
    const result = buildPackageGraph("co-mystery", "package-mystery", [mystery]);
    const classification = result.classifications.find((c) => c.documentId === "mystery-doc");
    expect(classification?.type).toBe("UNKNOWN");
    expect(classification?.evidence).toHaveLength(0);
  });

  it("reports real, non-fabricated performance metrics and makes zero semantic/model calls in this V1", () => {
    const ca = doc("perf-ca", "Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2021, among Iota Corp., as Borrower.\n\nSection 6.01 Indebtedness.`);
    const result = buildPackageGraph("co-perf", "package-perf", [ca]);
    expect(result.performance.documentCount).toBe(1);
    expect(result.performance.totalCharsScanned).toBe(ca.text.length);
    expect(result.performance.semanticCallsUsed).toBe(0);
    expect(result.performance.wallClockMs).toBeGreaterThanOrEqual(0);
  });
});
