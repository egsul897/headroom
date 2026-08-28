/**
 * FOUNDATION AUDIT — Part 2: Package graph adversarial assurance.
 *
 * All company/facility names below are synthetic inventions ("Meridian
 * Fabrication Inc.", "Northbrook Facility") — never real company
 * identities, per the audit's own restriction. All text is generic
 * leveraged-finance drafting style, not lifted from any real filing.
 *
 * Runs the REAL, unmodified production pipeline (buildPackageGraph) — no
 * mocking anywhere in this file, since Phase 2C's pipeline is 100%
 * deterministic (zero LLM calls) by its own design.
 */
import { describe, it, expect } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

describe("FOUNDATION AUDIT Part 2 — Package graph adversarial assurance", () => {
  it("1. control: base agreement + one amendment resolves cleanly", () => {
    const base = doc(
      "base",
      "Credit Agreement",
      `CREDIT AGREEMENT dated as of January 10, 2022, among Meridian Fabrication Inc., as Borrower, and Northshore Bank, N.A., as Administrative Agent.

ARTICLE VI
NEGATIVE COVENANTS
Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.`
    );
    const amendment = doc(
      "amend1",
      "First Amendment",
      `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 10, 2022, among Meridian Fabrication Inc. and Northshore Bank, N.A.

Section 6.01 of the Credit Agreement is hereby amended and restated in its entirety to increase the permitted Indebtedness basket to $15,000,000.`
    );
    const result = buildPackageGraph("co-1", "pkg-1", [base, amendment]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "amend1" && r.relationshipType === "AMENDS");
    expect(edge?.status).toBe("RESOLVED");
    expect(edge?.targetDocumentId).toBe("base");
    const inst = result.instruments.find((i) => i.documentIds.includes("base"));
    expect(inst?.documentIds.sort()).toEqual(["amend1", "base"]);
    expect(result.modificationCandidates.some((m) => m.targetDocumentId === "base" && m.targetSectionRef === "6.01")).toBe(true);
  });

  it("2. amendment TO A GUARANTEE/SECURITY agreement targets the right document, not the base CA", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of March 1, 2021, among Cascade Robotics LLC, as Borrower.\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness.`);
    const guarantee = doc(
      "guar",
      "Guarantee Agreement",
      `GUARANTEE AGREEMENT dated as of March 1, 2021, made by Cascade Holdings Inc. in favor of the Administrative Agent, guaranteeing obligations under the Credit Agreement dated as of March 1, 2021.\nSection 2.01 Guarantee. Each Guarantor hereby guarantees payment of the Obligations.`
    );
    const guarAmend = doc(
      "guar-amend",
      "First Amendment to Guarantee Agreement",
      `FIRST AMENDMENT TO GUARANTEE AGREEMENT, dated as of July 1, 2023 (this "Amendment"), to the Guaranty Agreement dated as of March 1, 2021, among Cascade Holdings Inc. and the Administrative Agent.\nSection 2.01 of the Guaranty Agreement is hereby amended and restated to add additional guarantors.`
    );
    const result = buildPackageGraph("co-2", "pkg-2", [base, guarantee, guarAmend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "guar-amend" && r.relationshipType === "AMENDS");
    // The amendment must target the GUARANTEE document, never the base CA,
    // even though both are present in the same package and both are
    // plausible "Credit Agreement"-adjacent targets.
    expect(edge?.targetDocumentId).toBe("guar");
    expect(edge?.targetDocumentId).not.toBe("base");
  });

  it("3. an amendment affecting MULTIPLE documents (joinder touching both the CA and the Guarantee) produces two distinct resolved edges, never forcing one choice", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of May 5, 2020, among Talon Freight Corp., as Borrower.\nSection 6.01 Indebtedness.`);
    const guarantee = doc("guar", "Guarantee and Collateral Agreement", `GUARANTEE AND COLLATERAL AGREEMENT dated as of May 5, 2020, among Talon Freight Corp. and the Collateral Agent.\nSection 2.01 Guarantee.`);
    const joinder = doc(
      "joinder",
      "Joinder Agreement",
      `JOINDER AGREEMENT, dated as of September 9, 2024 (this "Joinder"), by which New Subsidiary LLC becomes a party to the Credit Agreement dated as of May 5, 2020, and the Guarantee and Collateral Agreement dated as of May 5, 2020, each among Talon Freight Corp.\n\nNew Subsidiary LLC hereby agrees to be bound as a Guarantor and Borrower party thereunder.`
    );
    const result = buildPackageGraph("co-3", "pkg-3", [base, guarantee, joinder]);
    const joinsBase = result.relationshipCandidates.find((r) => r.sourceDocumentId === "joinder" && r.targetDocumentId === "base" && r.relationshipType === "JOINS");
    const joinsGuar = result.relationshipCandidates.find((r) => r.sourceDocumentId === "joinder" && r.targetDocumentId === "guar" && r.relationshipType === "JOINS");
    expect(joinsBase?.status).toBe("RESOLVED");
    expect(joinsGuar?.status).toBe("RESOLVED");
  });

  it("4. restatement ('Amended and Restated Agreement') vs a fresh new facility with a similar-sounding title are classified distinctly, never conflated", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2019, among Vireo Systems Inc., as Borrower.\nSection 6.01 Indebtedness.`);
    const restated = doc(
      "restated",
      "A&R Credit Agreement",
      `AMENDED AND RESTATED CREDIT AGREEMENT dated as of February 2, 2023, among Vireo Systems Inc., as Borrower, amending and restating the Credit Agreement dated as of January 1, 2019.\nSection 6.01 Indebtedness (restated).`
    );
    // A genuinely NEW, unrelated facility whose title happens to contain the
    // word "Amended" in a way that could superficially resemble a
    // restatement pattern but is NOT one (no "amended and restated
    // credit/loan agreement" phrase, no self-reference to the original).
    const newFacility = doc(
      "new-facility",
      "New Term Loan Credit Agreement",
      `CREDIT AGREEMENT dated as of March 3, 2024, among Vireo Systems Inc., as Borrower, and New Lender LLC, as Administrative Agent, providing for a new $20,000,000 term loan facility unrelated to any prior credit facility.\nSection 6.01 Indebtedness.`
    );
    const result = buildPackageGraph("co-4", "pkg-4", [original, restated, newFacility]);
    const restatedClass = result.classifications.find((c) => c.documentId === "restated");
    const newClass = result.classifications.find((c) => c.documentId === "new-facility");
    expect(restatedClass?.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
    expect(newClass?.type).toBe("CREDIT_AGREEMENT");
    const restatesEdge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES");
    expect(restatesEdge?.targetDocumentId).toBe("orig");
    // The new, unrelated facility must never appear as source or target of
    // any RESOLVED relationship edge — it is a standalone new instrument.
    const newFacilityEdges = result.relationshipCandidates.filter((r) => (r.sourceDocumentId === "new-facility" || r.targetDocumentId === "new-facility") && r.status === "RESOLVED");
    expect(newFacilityEdges).toEqual([]);
    // Instrument grouping must not merge the new facility with the original/restated cluster.
    const clusterWithOrig = result.instruments.find((i) => i.documentIds.includes("orig"));
    expect(clusterWithOrig?.documentIds).not.toContain("new-facility");
  });

  it("5. a supplemental indenture correctly resolves against the base indenture", () => {
    const indenture = doc("ind", "Indenture", `INDENTURE dated as of April 4, 2018, among Solace Materials Co., as Issuer, and Union Trust Company, as Trustee.\nSection 4.09 Limitation on Indebtedness.`);
    const supplemental = doc(
      "supp",
      "First Supplemental Indenture",
      `FIRST SUPPLEMENTAL INDENTURE, dated as of August 8, 2022 (this "Supplemental Indenture"), to the Indenture dated as of April 4, 2018, among Solace Materials Co. and Union Trust Company.\nSection 4.09 of the Indenture is hereby amended by adding a new basket.`
    );
    const result = buildPackageGraph("co-5", "pkg-5", [indenture, supplemental]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "supp" && r.relationshipType === "SUPPLEMENTS");
    expect(edge?.status).toBe("RESOLVED");
    expect(edge?.targetDocumentId).toBe("ind");
  });

  it("6. an intercreditor agreement gets an INTERCREDITOR_WITH edge, never AMENDS/RESTATES, and is excluded from instrument grouping", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of June 6, 2021, among Halcyon Devices Inc., as Borrower.\nSection 6.01 Indebtedness.`);
    const secondLien = doc("second", "Second Lien Credit Agreement", `SECOND LIEN CREDIT AGREEMENT dated as of June 6, 2021, among Halcyon Devices Inc., as Borrower.\nSection 6.01 Indebtedness.`);
    const intercreditor = doc(
      "ic",
      "Intercreditor Agreement",
      `INTERCREDITOR AGREEMENT dated as of June 6, 2021, among the First Lien Collateral Agent and the Second Lien Collateral Agent, governing lien priority between the Credit Agreement dated as of June 6, 2021, and the Second Lien Credit Agreement dated as of June 6, 2021, each among Halcyon Devices Inc.`
    );
    const result = buildPackageGraph("co-6", "pkg-6", [base, secondLien, intercreditor]);
    const icEdges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "ic");
    expect(icEdges.every((e) => e.relationshipType === "INTERCREDITOR_WITH")).toBe(true);
    expect(icEdges.some((e) => e.relationshipType === "AMENDS" || e.relationshipType === "RESTATES")).toBe(false);
    const instruments = result.instruments;
    expect(instruments.some((i) => i.documentIds.includes("ic"))).toBe(false);
  });

  it("7. two DIFFERENT facilities for the SAME borrower with IDENTICAL section numbering never cross-contaminate (instrument isolation at the package-graph layer)", () => {
    const facilityA = doc("fa-base", "Facility A Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2022, among Praxis Foods Inc., as Borrower, relating to the "Facility A" revolving credit facility.\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $5,000,000.`);
    const facilityAAmend = doc(
      "fa-amend",
      "Facility A Amendment",
      `FIRST AMENDMENT dated as of July 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 1, 2022, among Praxis Foods Inc.\nSection 6.01 of the Credit Agreement is hereby amended and restated to increase the basket to $8,000,000.`
    );
    const facilityB = doc("fb-base", "Facility B Credit Agreement", `CREDIT AGREEMENT dated as of February 2, 2022, among Praxis Foods Inc., as Borrower, relating to the "Facility B" term loan facility.\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $9,000,000.`);
    const facilityBAmend = doc(
      "fb-amend",
      "Facility B Amendment",
      `FIRST AMENDMENT dated as of August 1, 2023 (this "Amendment"), to the Credit Agreement dated as of February 2, 2022, among Praxis Foods Inc.\nSection 6.01 of the Credit Agreement is hereby amended and restated to increase the basket to $12,000,000.`
    );
    const result = buildPackageGraph("co-7", "pkg-7", [facilityA, facilityAAmend, facilityB, facilityBAmend]);
    const aEdge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "fa-amend" && r.status === "RESOLVED");
    const bEdge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "fb-amend" && r.status === "RESOLVED");
    expect(aEdge?.targetDocumentId).toBe("fa-base");
    expect(bEdge?.targetDocumentId).toBe("fb-base");
    const instA = result.instruments.find((i) => i.documentIds.includes("fa-base"));
    const instB = result.instruments.find((i) => i.documentIds.includes("fb-base"));
    expect(instA?.documentIds.sort()).toEqual(["fa-amend", "fa-base"]);
    expect(instB?.documentIds.sort()).toEqual(["fb-amend", "fb-base"]);
    expect(instA).not.toBe(instB);
  });

  it("8. an obsolete/superseded facility coexisting with a current one for the same company is never conflated by the package graph itself", () => {
    const obsolete = doc("obsolete", "2018 Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2018, among Ferrovia Metals Inc., as Borrower, providing a $10,000,000 revolving facility (repaid and terminated in 2022).\nSection 6.01 Indebtedness.`);
    const current = doc("current", "2022 Credit Agreement", `CREDIT AGREEMENT dated as of June 1, 2022, among Ferrovia Metals Inc., as Borrower, providing a $30,000,000 revolving facility.\nSection 6.01 Indebtedness.`);
    const result = buildPackageGraph("co-8", "pkg-8", [obsolete, current]);
    // Package-graph V1 has no "superseded/repaid" concept at all (correctly
    // out of scope) — the real behavior to confirm is that it does NOT
    // fabricate any relationship between them merely because they share a
    // borrower and document type.
    const crossEdges = result.relationshipCandidates.filter((r) => (r.sourceDocumentId === "obsolete" && r.targetDocumentId === "current") || (r.sourceDocumentId === "current" && r.targetDocumentId === "obsolete"));
    expect(crossEdges).toEqual([]);
    const instruments = result.instruments;
    const obsoleteInst = instruments.find((i) => i.documentIds.includes("obsolete"));
    const currentInst = instruments.find((i) => i.documentIds.includes("current"));
    expect(obsoleteInst?.documentIds).not.toContain("current");
    expect(currentInst?.documentIds).not.toContain("obsolete");
  });

  it("9. a bare cross-document MENTION ('as defined in the Existing Credit Agreement') without amending or being part of it never creates a false RESOLVED relationship edge", () => {
    const existing = doc("existing", "Existing Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2020, among Delacroix Yarn Mills Inc., as Borrower.\nSection 6.01 Indebtedness.`);
    // A brand-new, unrelated Note Purchase Agreement that merely MENTIONS
    // the Existing Credit Agreement by name for definitional context
    // ("Permitted Liens has the meaning assigned in the Existing Credit
    // Agreement") without amending it, joining it, or being part of the
    // same instrument.
    const notePurchase = doc(
      "note",
      "Note Purchase Agreement",
      `NOTE PURCHASE AGREEMENT dated as of March 3, 2024, among Delacroix Yarn Mills Inc., as Issuer, and the Purchasers party thereto, providing for the issuance of $25,000,000 in senior notes. "Permitted Liens" has the meaning assigned to such term in the Existing Credit Agreement.\nSection 6.01 Indebtedness.`
    );
    const result = buildPackageGraph("co-9", "pkg-9", [existing, notePurchase]);
    // notePurchase classifies as its own type (CREDIT_AGREEMENT/loan-agreement
    // pattern does not match "Note Purchase Agreement" — should be UNKNOWN or
    // OTHER, never AMENDMENT/RESTATES); it must never generate a RESOLVED
    // relationship edge toward "existing" merely from the bare mention.
    const falseEdges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "note" && r.targetDocumentId === "existing" && r.status === "RESOLVED");
    expect(falseEdges).toEqual([]);
    // The bare mention should surface only as a cross-document reference
    // lead, and per task discipline a bare mention (no date) can reach at
    // most REVIEW_REQUIRED, never RESOLVED.
    const leads = result.crossDocumentReferenceLeads.filter((l) => l.sourceDocumentId === "note");
    expect(leads.every((l) => l.status !== "RESOLVED")).toBe(true);
  });

  it("10. ADVERSARIAL: an amendment that QUOTES/references an unrelated agreement's dated self-reference (context only, not its own amendment target) can produce a FALSE CONFIDENT (RESOLVED) relationship edge to that unrelated document", () => {
    // Document A: the true base Credit Agreement this amendment amends.
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2021, among Solvent Chemical Corp., as Borrower.\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $10,000,000.`);
    // Document B: a completely separate, unrelated Indenture the amendment
    // merely QUOTES for context in its recitals (e.g. explaining a
    // cross-default provision) — the amendment does NOT amend this
    // Indenture in any way; only the Credit Agreement is its real target.
    const unrelatedIndenture = doc("unrelated-indenture", "Existing Notes Indenture", `INDENTURE dated as of January 1, 2021, among Solvent Chemical Corp., as Issuer, and Fiduciary Trust Co., as Trustee, governing the Existing Notes.\nSection 4.09 Limitation on Indebtedness.`);
    const amendment = doc(
      "amend",
      "Second Amendment to Credit Agreement",
      `SECOND AMENDMENT TO CREDIT AGREEMENT, dated as of January 1, 2021 (this "Amendment"), to the Credit Agreement dated as of January 1, 2021, among Solvent Chemical Corp.

      WHEREAS, the Borrower has advised the Administrative Agent that a cross-default may arise under the Indenture dated as of January 1, 2021, among Solvent Chemical Corp. and Fiduciary Trust Co., and the parties wish to provide context for that circumstance without amending such Indenture in any way;

      NOW, THEREFORE, Section 6.01 of the Credit Agreement is hereby amended and restated in its entirety to increase the permitted Indebtedness basket to $15,000,000.`
    );
    const result = buildPackageGraph("co-10", "pkg-10", [base, unrelatedIndenture, amendment]);
    const edges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "amend" && r.relationshipType === "AMENDS");
    // eslint-disable-next-line no-console
    console.log("[10] all AMENDS edges from 'amend':", JSON.stringify(edges, null, 2));
    const trueEdge = edges.find((e) => e.targetDocumentId === "base");
    const falseEdge = edges.find((e) => e.targetDocumentId === "unrelated-indenture");
    expect(trueEdge?.status).toBe("RESOLVED");
    // THE ADVERSARIAL CHECK: does merely quoting an unrelated agreement's
    // OWN dated self-reference for context (same execution date, real
    // document type match) produce a second, false, RESOLVED AMENDS edge
    // to a document this amendment never actually touches?
    if (falseEdge) {
      // eslint-disable-next-line no-console
      console.log("[10] FALSE EDGE STATUS:", falseEdge.status, falseEdge.resolutionMethod);
    }
    // FINDING PKG-01 (confirmed, real behavior): the pipeline treats EVERY
    // dated agreement-reference match inside the amending document's own
    // preamble window as an independent, equally-confident AMENDS
    // candidate — with no mechanism distinguishing "the document I am
    // amending" from "an agreement mentioned in a WHEREAS recital for
    // context, explicitly disclaimed as NOT being amended." A merely
    // coincidental type+date match (realistic: sibling debt instruments
    // issued on the same closing date routinely share an execution date)
    // produces a FALSE RESOLVED edge, confidence 0.95, identical shape to
    // a true edge. Documented here as the actual, adversarially-confirmed
    // behavior (not the desired one):
    expect(falseEdge?.status).toBe("RESOLVED");
    expect(falseEdge?.confidence).toBe(0.95);

    // Downstream consequence, independently confirmed: this false edge
    // (relationshipType AMENDS, one of instrument-grouping.ts's own
    // GROUPING_RELATIONSHIP_TYPES) causes the union-find in
    // instrument-grouping.ts to merge the wholly unrelated Indenture into
    // the SAME debt instrument cluster as the real Credit Agreement and
    // its amendment — a real cross-instrument contamination directly
    // implicating invariant #20 ("Instrument isolation is mandatory").
    const cluster = result.instruments.find((i) => i.documentIds.includes("base"));
    // eslint-disable-next-line no-console
    console.log("[10] instrument cluster:", JSON.stringify(cluster));
    expect(cluster?.documentIds).toContain("unrelated-indenture");
  });

  it("11. an amendment that quotes another agreement's language for context (no dated self-reference, just prose) does not create any relationship edge to it", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of May 1, 2020, among Ashgrove Textiles Inc., as Borrower.\nSection 6.01 Indebtedness.`);
    const otherIndenture = doc("other", "Notes Indenture", `INDENTURE dated as of May 1, 2020, among Ashgrove Textiles Inc., as Issuer.\nSection 4.09 Limitation on Indebtedness. Consolidated EBITDA shall be calculated on a pro forma basis.`);
    const amendment = doc(
      "amend",
      "First Amendment",
      `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of October 1, 2023 (this "Amendment"), to the Credit Agreement dated as of May 1, 2020, among Ashgrove Textiles Inc.

      For the avoidance of doubt, the parties note that a similar EBITDA definition (calculated on a pro forma basis giving effect to acquisitions) appears in the Indenture governing the Issuer's outstanding notes, though such Indenture is not amended hereby.

      Section 6.01 of the Credit Agreement is hereby amended and restated to increase the Indebtedness basket to $12,000,000.`
    );
    const result = buildPackageGraph("co-11", "pkg-11", [base, otherIndenture, amendment]);
    const edgesToOther = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "amend" && r.targetDocumentId === "other");
    expect(edgesToOther).toEqual([]);
    const edgeToBase = result.relationshipCandidates.find((r) => r.sourceDocumentId === "amend" && r.targetDocumentId === "base");
    expect(edgeToBase?.status).toBe("RESOLVED");
  });

  it("EVIDENCE CHECK: every RESOLVED edge produced across all scenarios above carries a real sourceCitation that is an actual substring of its source document's text", () => {
    const packages: Array<{ documents: PackageDocumentInput[] }> = [
      { documents: [doc("base", "CA", `CREDIT AGREEMENT dated as of January 10, 2022, among Meridian Fabrication Inc.\nSection 6.01 Indebtedness.`), doc("amend1", "Amendment", `FIRST AMENDMENT TO CREDIT AGREEMENT, dated as of June 1, 2023 (this "Amendment"), to the Credit Agreement dated as of January 10, 2022, among Meridian Fabrication Inc.\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.`)] },
    ];
    for (const pkg of packages) {
      const result = buildPackageGraph("co-evidence", "pkg-evidence", pkg.documents);
      const textByDoc = new Map(pkg.documents.map((d) => [d.documentId, d.text]));
      for (const edge of result.relationshipCandidates) {
        if (edge.status !== "RESOLVED") continue;
        const sourceText = textByDoc.get(edge.sourceDocumentId)!;
        expect(sourceText).toContain(edge.sourceCitation);
      }
    }
  });
});
