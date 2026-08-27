/**
 * Phase 2F.3 §18 - the 28 required synthetic package-matrix scenarios,
 * grouped exactly as the task's own numbering (Basic types 1-5, Amendments
 * 6-10, Relationships 11-15, Isolation 16-20, Evidence conflict 21-24,
 * Safety 25-28). All fixture text is invented for this file - no
 * CONMED-specific content (task §21's own anti-overfitting discipline,
 * matching the pattern established for phase-2b/2f2's own synthetic test
 * files). Several scenarios deliberately use the real-world "(this
 * "Amendment")" self-referential drafting convention this task's own root-
 * cause fix (document-classifier.ts's DETERMINISTIC_SELF_REFERENTIAL_TITLE
 * tier) targets - proving the fix generalizes past the one real document
 * that exposed it, not merely reproducing CONMED's own wording.
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput, RelationshipCandidate } from "../../lib/contract-model/compiler/package-graph/types";
import { computePackageSafety } from "../../lib/contract-model/compiler/package-safety";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

function healthyCoverageInput(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return { documentId, documentText: text, coverage: computeStructuralCoverage(documentId, text, nodes), discoveryCandidateCount: 0 };
}

function relEdge(overrides: Partial<RelationshipCandidate> & Pick<RelationshipCandidate, "sourceDocumentId" | "status">): RelationshipCandidate {
  return { targetDocumentId: null, targetHint: null, relationshipType: "AMENDS", sourceCitation: "test", confidence: 0.5, unresolvedReason: null, resolutionMethod: "test", ...overrides };
}

describe("Phase 2F.3 §18 Basic types (1-5)", () => {
  it("1. an ordinary Credit Agreement classifies as CREDIT_AGREEMENT", () => {
    const d = doc("t1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Alpha Corp., as Borrower, and Fictional Bank, N.A., as Administrative Agent.`);
    const result = buildPackageGraph("co-t1", "pkg-t1", [d]);
    expect(result.classifications[0]!.type).toBe("CREDIT_AGREEMENT");
  });

  it("2. an ordinary Indenture classifies as INDENTURE", () => {
    const d = doc("t2-ind", "Ind", `INDENTURE dated as of January 1, 2024, among Alpha Issuer Inc., as Issuer, and Fictional Trust Co., as Trustee.`);
    const result = buildPackageGraph("co-t2", "pkg-t2", [d]);
    expect(result.classifications[0]!.type).toBe("INDENTURE");
  });

  it("3. a Guarantee Agreement classifies as GUARANTEE (not the composite type)", () => {
    const d = doc("t3-guar", "Guar", `GUARANTEE AGREEMENT dated as of January 1, 2024, among Alpha Guarantor LLC and Fictional Bank, N.A.`);
    const result = buildPackageGraph("co-t3", "pkg-t3", [d]);
    expect(result.classifications[0]!.type).toBe("GUARANTEE");
  });

  it("4. a Security Agreement classifies as SECURITY_AGREEMENT (not the composite type)", () => {
    const d = doc("t4-sec", "Sec", `SECURITY AGREEMENT dated as of January 1, 2024, among Alpha Grantor LLC and Fictional Bank, N.A.`);
    const result = buildPackageGraph("co-t4", "pkg-t4", [d]);
    expect(result.classifications[0]!.type).toBe("SECURITY_AGREEMENT");
  });

  it("5. a combined Guarantee and Security Agreement classifies as the composite GUARANTEE_AND_SECURITY_AGREEMENT type and produces BOTH a GUARANTEES and a SECURES edge to its named facility", () => {
    const ca = doc("t5-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Alpha Corp., as Borrower.`);
    const composite = doc(
      "t5-gsa",
      "GSA",
      `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2024, among Alpha Corp. and its Subsidiaries.\n\nThe Guarantors hereby guarantee all obligations under the Credit Agreement dated as of January 1, 2024 and grant a security interest in the Collateral to secure such obligations.`
    );
    const result = buildPackageGraph("co-t5", "pkg-t5", [ca, composite]);
    expect(result.classifications.find((c) => c.documentId === "t5-gsa")?.type).toBe("GUARANTEE_AND_SECURITY_AGREEMENT");
    const edges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "t5-gsa" && r.targetDocumentId === "t5-ca");
    expect(edges.map((e) => e.relationshipType).sort()).toEqual(["GUARANTEES", "SECURES"]);
    expect(edges.every((e) => e.status === "RESOLVED")).toBe(true);
  });
});

describe("Phase 2F.3 §18 Amendments (6-10)", () => {
  it("6. 'Amendment No. 1' using the real-world self-referential drafting convention ((this \"Amendment\")) classifies via DETERMINISTIC_SELF_REFERENTIAL_TITLE and resolves AMENDS to the base Credit Agreement", () => {
    const ca = doc("t6-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Beta Corp., as Borrower.`);
    const amend = doc(
      "t6-amend",
      "Amendment",
      `AMENDMENT NO. 1 AMENDMENT NO. 1, dated as of June 1, 2024 (this " Amendment "), to the Credit Agreement, dated as of January 1, 2024 (the " Credit Agreement "), among Beta Corp., as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.`
    );
    const result = buildPackageGraph("co-t6", "pkg-t6", [ca, amend]);
    const amendClass = result.classifications.find((c) => c.documentId === "t6-amend")!;
    expect(amendClass.type).toBe("AMENDMENT");
    expect(amendClass.resolutionMethod).toBe("DETERMINISTIC_SELF_REFERENTIAL_TITLE");
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t6-amend");
    expect(edge).toMatchObject({ targetDocumentId: "t6-ca", relationshipType: "AMENDS", status: "RESOLVED" });
  });

  it("7. an amendment modifying two documents (multi-target, real CONMED Document D shape) produces two distinct AMENDS edges, not one forced choice", () => {
    const ca = doc("t7-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Gamma Corp., as Borrower.`);
    const gsa = doc("t7-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2024, among Gamma Corp. and its Subsidiaries.`);
    const amend = doc(
      "t7-amend",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2024 (this " Amendment "), to (a) the Credit Agreement, dated as of January 1, 2024 (the " Credit Agreement "), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2024 (the " Guarantee and Collateral Agreement "), among Gamma Corp. and its Subsidiaries.`
    );
    const result = buildPackageGraph("co-t7", "pkg-t7", [ca, gsa, amend]);
    const edges = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "t7-amend");
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.targetDocumentId === "t7-ca")).toMatchObject({ relationshipType: "AMENDS", status: "RESOLVED" });
    expect(edges.find((e) => e.targetDocumentId === "t7-gsa")).toMatchObject({ relationshipType: "AMENDS", status: "RESOLVED" });
  });

  it("8. an amendment changing a single definition resolves its modification candidate to the correct base document", () => {
    const ca = doc("t8-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Delta Corp., as Borrower.`);
    const amend = doc(
      "t8-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Delta Corp., as Borrower.\n\nThe definition of "Consolidated EBITDA" is hereby amended to add a new addback.`
    );
    const result = buildPackageGraph("co-t8", "pkg-t8", [ca, amend]);
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "t8-amend");
    expect(mc).toMatchObject({ operation: "MODIFY", targetDocumentId: "t8-ca", status: "RESOLVED" });
  });

  it("9. an amendment-and-restatement using the self-referential convention classifies AMENDED_AND_RESTATED_AGREEMENT and RESTATES the original", () => {
    const original = doc("t9-orig", "Original CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Epsilon Corp., as Borrower.`);
    const restated = doc(
      "t9-restated",
      "A&R CA",
      `AMENDED AND RESTATED CREDIT AGREEMENT, dated as of June 1, 2024 (this " Amended and Restated Credit Agreement "), amending and restating the Credit Agreement, dated as of January 1, 2020 (the " Original Credit Agreement "), among Epsilon Corp., as Borrower.`
    );
    const result = buildPackageGraph("co-t9", "pkg-t9", [original, restated]);
    expect(result.classifications.find((c) => c.documentId === "t9-restated")?.type).toBe("AMENDED_AND_RESTATED_AGREEMENT");
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t9-restated");
    expect(edge).toMatchObject({ targetDocumentId: "t9-orig", relationshipType: "RESTATES", status: "RESOLVED" });
  });

  it("10. an amendment with an ambiguous target (two same-type, same-date candidates), even using the self-referential convention, stays UNRESOLVED - the new classifier tier does not weaken ambiguity safety", () => {
    const caX = doc("t10-caX", "CA X", `CREDIT AGREEMENT dated as of January 1, 2024, among Zeta Corp., as Borrower.`);
    const caY = doc("t10-caY", "CA Y", `CREDIT AGREEMENT dated as of January 1, 2024, among Eta Corp., as Borrower.`);
    const amend = doc("t10-amend", "Amendment", `AMENDMENT NO. 1, dated as of June 1, 2024 (this " Amendment "), to the Credit Agreement, dated as of January 1, 2024 (the " Credit Agreement ").`);
    const result = buildPackageGraph("co-t10", "pkg-t10", [caX, caY, amend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t10-amend");
    expect(edge?.targetDocumentId).toBeNull();
    expect(edge?.status).toBe("UNRESOLVED");
  });
});

describe("Phase 2F.3 §18 Relationships (11-15)", () => {
  it("11. a Joinder to a Credit Agreement resolves a JOINS edge", () => {
    const ca = doc("t11-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Theta Corp., as Borrower.`);
    const joinder = doc("t11-join", "Joinder", `JOINDER AGREEMENT dated as of March 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Theta Corp., as Borrower.\n\nThe undersigned hereby joins as a Guarantor.`);
    const result = buildPackageGraph("co-t11", "pkg-t11", [ca, joinder]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t11-join")).toMatchObject({ targetDocumentId: "t11-ca", relationshipType: "JOINS", status: "RESOLVED" });
  });

  it("12. a Joinder to an Intercreditor Agreement resolves a JOINS edge to the intercreditor document, not a Credit Agreement", () => {
    const ic = doc("t12-ic", "IC", `INTERCREDITOR AGREEMENT dated as of January 1, 2024, among Fictional Bank, N.A. and Fictional Trust Co.`);
    const joinder = doc("t12-join", "Joinder", `JOINDER AGREEMENT dated as of March 1, 2024 to the Intercreditor Agreement dated as of January 1, 2024.\n\nThe undersigned new secured party hereby joins the Intercreditor Agreement.`);
    const result = buildPackageGraph("co-t12", "pkg-t12", [ic, joinder]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t12-join")).toMatchObject({ targetDocumentId: "t12-ic", relationshipType: "JOINS", status: "RESOLVED" });
  });

  it("13. a Supplemental Indenture resolves a SUPPLEMENTS edge to the base Indenture", () => {
    const ind = doc("t13-ind", "Ind", `INDENTURE dated as of January 1, 2024, among Iota Issuer Inc., as Issuer, and Fictional Trust Co., as Trustee.`);
    const supp = doc("t13-supp", "Supp", `FIRST SUPPLEMENTAL INDENTURE dated as of March 1, 2024 to the Indenture dated as of January 1, 2024, among Iota Issuer Inc., as Issuer.`);
    const result = buildPackageGraph("co-t13", "pkg-t13", [ind, supp]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t13-supp")).toMatchObject({ targetDocumentId: "t13-ind", relationshipType: "SUPPLEMENTS", status: "RESOLVED" });
  });

  it("14. a Guarantee referring to facility obligations resolves a GUARANTEES edge to the named facility", () => {
    const ca = doc("t14-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Kappa Corp., as Borrower.`);
    const guar = doc("t14-guar", "Guar", `GUARANTEE AGREEMENT dated as of January 1, 2024.\n\nThe Guarantor hereby unconditionally guarantees all obligations under the Credit Agreement dated as of January 1, 2024.`);
    const result = buildPackageGraph("co-t14", "pkg-t14", [ca, guar]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t14-guar")).toMatchObject({ targetDocumentId: "t14-ca", relationshipType: "GUARANTEES", status: "RESOLVED" });
  });

  it("15. a Security document securing obligations under a named agreement resolves a SECURES edge", () => {
    const ca = doc("t15-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Lambda Corp., as Borrower.`);
    const sec = doc("t15-sec", "Sec", `SECURITY AGREEMENT dated as of January 1, 2024.\n\nThe Grantor grants a security interest in the Collateral to secure all obligations under the Credit Agreement dated as of January 1, 2024.`);
    const result = buildPackageGraph("co-t15", "pkg-t15", [ca, sec]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t15-sec")).toMatchObject({ targetDocumentId: "t15-ca", relationshipType: "SECURES", status: "RESOLVED" });
  });
});

describe("Phase 2F.3 §18 Isolation (16-20)", () => {
  it("16. two facilities for the same borrower stay isolated instruments, and an amendment to one never attaches to the other", () => {
    const ca1 = doc("t16-ca1", "CA1", `CREDIT AGREEMENT dated as of January 1, 2022, among Mu Corp., as Borrower, and Fictional Bank, N.A., as Administrative Agent.`);
    const ca2 = doc("t16-ca2", "CA2", `CREDIT AGREEMENT dated as of January 1, 2024, among Mu Corp., as Borrower, and Fictional Bank, N.A., as Administrative Agent.`);
    const amend = doc("t16-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Mu Corp., as Borrower.`);
    const result = buildPackageGraph("co-t16", "pkg-t16", [ca1, ca2, amend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t16-amend");
    expect(edge?.targetDocumentId).toBe("t16-ca2");
    expect(result.instruments.some((i) => i.documentIds.includes("t16-ca1") && i.documentIds.includes("t16-ca2"))).toBe(false);
  });

  it("17. two agreements of DIFFERENT types sharing the identical execution date never get confused with each other - type is the primary signal, date only disambiguates within a type", () => {
    const ca = doc("t17-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Nu Corp., as Borrower.`);
    const ind = doc("t17-ind", "Ind", `INDENTURE dated as of January 1, 2024, among Nu Issuer Inc., as Issuer.`);
    const amend = doc("t17-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Nu Corp., as Borrower.`);
    const result = buildPackageGraph("co-t17", "pkg-t17", [ca, ind, amend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t17-amend");
    expect(edge?.targetDocumentId).toBe("t17-ca");
  });

  it("18. two instruments sharing the same administrative agent, but different borrowers/dates, remain isolated instruments - agent identity alone never merges them", () => {
    const ca1 = doc("t18-ca1", "CA1", `CREDIT AGREEMENT dated as of January 1, 2022, among Xi Corp., as Borrower, and Fictional Bank, N.A., as Administrative Agent.`);
    const ca2 = doc("t18-ca2", "CA2", `CREDIT AGREEMENT dated as of June 1, 2023, among Omicron Corp., as Borrower, and Fictional Bank, N.A., as Administrative Agent.`);
    const result = buildPackageGraph("co-t18", "pkg-t18", [ca1, ca2]);
    expect(result.instruments).toHaveLength(2);
    expect(result.instruments.some((i) => i.documentIds.includes("t18-ca1") && i.documentIds.includes("t18-ca2"))).toBe(false);
  });

  it("19. two documents with overlapping section numbers (Section 6.01 in both) never cross-contaminate their modification-candidate targets", () => {
    const ca1 = doc("t19-ca1", "CA1", `CREDIT AGREEMENT dated as of January 1, 2019, among Pi Corp., as Borrower.\n\nSection 6.01 Indebtedness. Limited to $10,000,000.`);
    const ca2 = doc("t19-ca2", "CA2", `CREDIT AGREEMENT dated as of February 1, 2019, among Rho Corp., as Borrower.\n\nSection 6.01 Indebtedness. Limited to $20,000,000.`);
    const amend = doc("t19-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2020 to the Credit Agreement dated as of January 1, 2019, among Pi Corp., as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.`);
    const result = buildPackageGraph("co-t19", "pkg-t19", [ca1, ca2, amend]);
    const mc = result.modificationCandidates.find((m) => m.sourceDocumentId === "t19-amend");
    expect(mc?.targetDocumentId).toBe("t19-ca1");
  });

  it("20. an unrelated, non-debt document uploaded in the same package classifies UNKNOWN and generates zero relationship edges to the real debt documents", () => {
    const ca = doc("t20-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Sigma Corp., as Borrower.`);
    const letter = doc("t20-letter", "Random letter", `Dear Team, please find attached the schedule for next week's offsite. Best, Facilities.`);
    const result = buildPackageGraph("co-t20", "pkg-t20", [ca, letter]);
    expect(result.classifications.find((c) => c.documentId === "t20-letter")?.type).toBe("UNKNOWN");
    expect(result.relationshipCandidates.some((r) => r.sourceDocumentId === "t20-letter" || r.targetDocumentId === "t20-letter")).toBe(false);
  });
});

describe("Phase 2F.3 §18 Evidence conflict (21-24)", () => {
  it("21. a misleading filename/label never overrides real body-text evidence - classification reads doc.text only, never doc.label", () => {
    const d = doc("t21-doc", "totally-unrelated-filename.pdf", `CREDIT AGREEMENT dated as of January 1, 2024, among Tau Corp., as Borrower.`);
    const result = buildPackageGraph("co-t21", "pkg-t21", [d]);
    expect(result.classifications[0]!.type).toBe("CREDIT_AGREEMENT");
  });

  it("22. party overlap alone never resolves a reference to the wrong-typed document with the same party", () => {
    const ca = doc("t22-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Upsilon Corp., as Borrower.`);
    const ind = doc("t22-ind", "Ind", `INDENTURE dated as of March 1, 2024, among Upsilon Corp., as Issuer.`);
    const amend = doc("t22-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Upsilon Corp., as Borrower.`);
    const result = buildPackageGraph("co-t22", "pkg-t22", [ca, ind, amend]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t22-amend")?.targetDocumentId).toBe("t22-ca");
  });

  it("23. approximate title similarity with a mismatched execution date loses to the exact-dated candidate, never guessed from similarity alone", () => {
    const caOld = doc("t23-caOld", "CA old", `CREDIT AGREEMENT dated as of January 1, 2018, among Phi Corp., as Borrower.`);
    const caNew = doc("t23-caNew", "CA new", `CREDIT AGREEMENT dated as of January 1, 2024, among Phi Corp., as Borrower.`);
    const amend = doc("t23-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Phi Corp., as Borrower.`);
    const result = buildPackageGraph("co-t23", "pkg-t23", [caOld, caNew, amend]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t23-amend")?.targetDocumentId).toBe("t23-caNew");
  });

  it("24. one strong exact (type+date) target among several weak (type-only, wrong-date) candidates resolves cleanly to the strong match", () => {
    const decoy1 = doc("t24-decoy1", "Decoy1", `CREDIT AGREEMENT dated as of January 1, 2019, among Chi Corp., as Borrower.`);
    const decoy2 = doc("t24-decoy2", "Decoy2", `CREDIT AGREEMENT dated as of January 1, 2020, among Chi Corp., as Borrower.`);
    const exact = doc("t24-exact", "Exact", `CREDIT AGREEMENT dated as of January 1, 2024, among Chi Corp., as Borrower.`);
    const amend = doc("t24-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024, among Chi Corp., as Borrower.`);
    const result = buildPackageGraph("co-t24", "pkg-t24", [decoy1, decoy2, exact, amend]);
    expect(result.relationshipCandidates.find((r) => r.sourceDocumentId === "t24-amend")).toMatchObject({ targetDocumentId: "t24-exact", status: "RESOLVED" });
  });
});

describe("Phase 2F.3 §18 Safety (25-28)", () => {
  it("25. an ambiguous target stays UNRESOLVED, preserving the ambiguity reason and candidate hint rather than guessing", () => {
    const caX = doc("t25-caX", "CA X", `CREDIT AGREEMENT dated as of January 1, 2024, among Psi Corp., as Borrower.`);
    const caY = doc("t25-caY", "CA Y", `CREDIT AGREEMENT dated as of January 1, 2024, among Omega Corp., as Borrower.`);
    const amend = doc("t25-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2024.`);
    const result = buildPackageGraph("co-t25", "pkg-t25", [caX, caY, amend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t25-amend");
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.targetHint).toContain("Credit Agreement");
    expect(edge?.unresolvedReason).toBeTruthy();
  });

  it("26. an amendment referencing a base agreement genuinely absent from the package stays UNRESOLVED, not fabricated against an unrelated candidate", () => {
    const unrelated = doc("t26-unrelated", "Unrelated", `INDENTURE dated as of January 1, 2024, among Unrelated Issuer Inc., as Issuer.`);
    const amend = doc("t26-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2024 to the Credit Agreement dated as of January 1, 2020, among Missing Corp., as Borrower.`);
    const result = buildPackageGraph("co-t26", "pkg-t26", [unrelated, amend]);
    const edge = result.relationshipCandidates.find((r) => r.sourceDocumentId === "t26-amend");
    expect(edge?.targetDocumentId).toBeNull();
    expect(edge?.status).toBe("UNRESOLVED");
    expect(edge?.unresolvedReason).toMatch(/no document in this package is classified as/);
  });

  it("27. no fabricated relationship is ever created between two genuinely unrelated documents merely because they were uploaded in the same package", () => {
    const ca1 = doc("t27-ca1", "CA1", `CREDIT AGREEMENT dated as of January 1, 2022, among Alpha One Corp., as Borrower.`);
    const ca2 = doc("t27-ca2", "CA2", `CREDIT AGREEMENT dated as of March 1, 2023, among Beta Two Corp., as Borrower.`);
    const result = buildPackageGraph("co-t27", "pkg-t27", [ca1, ca2]);
    expect(result.relationshipCandidates.some((r) => (r.sourceDocumentId === "t27-ca1" && r.targetDocumentId === "t27-ca2") || (r.sourceDocumentId === "t27-ca2" && r.targetDocumentId === "t27-ca1"))).toBe(false);
    expect(result.instruments).toHaveLength(2);
  });

  it("28. a multi-target amendment produces multiple genuinely supported relationships, not one forced single choice (positive confirmation of §11)", () => {
    const ca = doc("t28-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2024, among Gamma Two Corp., as Borrower.`);
    const gsa = doc("t28-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2024, among Gamma Two Corp. and its Subsidiaries.`);
    const amend = doc(
      "t28-amend",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2024 (this " Amendment "), to (a) the Credit Agreement, dated as of January 1, 2024 (the " Credit Agreement "), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2024 (the " Guarantee and Collateral Agreement "), among Gamma Two Corp. and its Subsidiaries.`
    );
    const result = buildPackageGraph("co-t28", "pkg-t28", [ca, gsa, amend]);
    const resolved = result.relationshipCandidates.filter((r) => r.sourceDocumentId === "t28-amend" && r.status === "RESOLVED");
    expect(new Set(resolved.map((r) => r.targetDocumentId))).toEqual(new Set(["t28-ca", "t28-gsa"]));
    expect(result.instruments.find((i) => i.documentIds.includes("t28-ca"))?.documentIds).toContain("t28-amend");
  });
});

describe("Phase 2F.3 §21 - package safety reflects unresolved material relationships without forcing all-or-nothing failure", () => {
  const text = "CREDIT AGREEMENT dated as of January 1, 2024, among Test Corp., as Borrower.\n\nSection 6.01 Indebtedness.";

  it("an UNRESOLVED relationship candidate downgrades the package to PACKAGE_REVIEW_REQUIRED, not PACKAGE_UNSAFE - unresolved is safe-by-construction, never a confidently false edge", () => {
    const safety = computePackageSafety("p", [healthyCoverageInput("ca", text), healthyCoverageInput("amend", text)], [relEdge({ sourceDocumentId: "amend", status: "UNRESOLVED", unresolvedReason: "ambiguous" })]);
    expect(safety.state).toBe("PACKAGE_REVIEW_REQUIRED");
    expect(safety.unresolvedMaterialRelationshipCount).toBe(1);
    expect(safety.reasons.some((r) => r.includes("UNRESOLVED"))).toBe(true);
  });

  it("zero unresolved and zero review-required relationships keep the package PACKAGE_SAFE with both counts at zero", () => {
    const safety = computePackageSafety("p", [healthyCoverageInput("ca", text), healthyCoverageInput("amend", text)], [relEdge({ sourceDocumentId: "amend", targetDocumentId: "ca", status: "RESOLVED" })]);
    expect(safety.state).toBe("PACKAGE_SAFE");
    expect(safety.unresolvedMaterialRelationshipCount).toBe(0);
    expect(safety.reviewRequiredRelationshipCount).toBe(0);
  });

  it("a REVIEW_REQUIRED-only relationship candidate does not by itself force PACKAGE_REVIEW_REQUIRED - a real candidate exists, it just needs confirmation, which is reported but not treated as dangerous", () => {
    const safety = computePackageSafety("p", [healthyCoverageInput("ca", text), healthyCoverageInput("amend", text)], [relEdge({ sourceDocumentId: "amend", targetDocumentId: "ca", status: "REVIEW_REQUIRED" })]);
    expect(safety.state).toBe("PACKAGE_SAFE");
    expect(safety.reviewRequiredRelationshipCount).toBe(1);
  });

  it("omitting relationshipCandidates entirely (a Phase 2F.1/2F.2-only caller) keeps working unchanged - zero counts, no relationship-driven downgrade", () => {
    const safety = computePackageSafety("p", [healthyCoverageInput("ca", text)]);
    expect(safety.unresolvedMaterialRelationshipCount).toBe(0);
    expect(safety.reviewRequiredRelationshipCount).toBe(0);
    expect(safety.state).toBe("PACKAGE_SAFE");
  });
});
