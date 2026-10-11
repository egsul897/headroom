/**
 * Agent #7 adversarial validation — synthetic fixtures only.
 * Covers pre-effective, post-effective, partial restatement, conflicting
 * amendment, wrong facility, missing conditions, and deterministic replay.
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "@/lib/contract-model/compiler/package-graph/types";
import {
  authorityAsOf,
  buildOperativeAuthorityHandoffBundle,
  resolveGoverningProvision,
  resolvePackageRestatementAuthorities,
} from "@/lib/contract-model/compiler/operative-authority";

function syntheticPair(opts?: {
  successorAgent?: string;
  includeOperative?: boolean;
  includeSignatures?: boolean;
  includeCp?: boolean;
  priorDate?: string;
  successorDate?: string;
}): PackageDocumentInput[] {
  const priorDate = opts?.priorDate ?? "January 15, 2020";
  const successorDate = opts?.successorDate ?? "June 1, 2024";
  const agent = opts?.successorAgent ?? "PNC BANK, NATIONAL ASSOCIATION";
  const operative =
    opts?.includeOperative === false
      ? ""
      : `NOW THEREFORE, the parties agree that the Existing Credit Agreement is hereby amended and restated as follows:
ARTICLE XI
Section 11.01. Amendment and Restatement of Existing Credit Agreement. Upon (i) the execution and delivery of this Agreement and (ii) satisfaction (or waiver) of the conditions precedent set forth in Section 4.01, the terms and provisions of the Existing Credit Agreement shall be and hereby are amended, superseded and restated in their entirety by the terms and provisions of this Agreement. This Agreement is not intended to and shall not constitute a novation of the Existing Credit Agreement.`;
  const cp = opts?.includeCp === false ? "" : operative.includes("4.01") ? "" : `Effective Date means the date on which the conditions specified in Section 4.01 are satisfied.`;
  const sig =
    opts?.includeSignatures === false
      ? ""
      : `IN WITNESS WHEREOF, the parties hereto have caused this Agreement to be duly executed.
Signature Page to Fifth Amended and Restated Credit Agreement`;

  const docA = `
FIRST AMENDED AND RESTATED CREDIT AGREEMENT
dated as of
${priorDate}
among
ACME MATERIALS, INC.
and
PNC BANK, NATIONAL ASSOCIATION
as Administrative Agent

WHEREAS, the parties wish to amend and restate a prior agreement.

“Aggregate Commitment” means $100,000,000. As of the Effective Date, the Aggregate Commitment is $100,000,000.
Revolving Loans may be made under this Agreement.

Section 6.01. Limitation on Indebtedness. The Company will not permit Indebtedness except as set forth herein.

IN WITNESS WHEREOF, the parties have executed this Agreement.
Signature Page to First Amended and Restated Credit Agreement
`;

  const docB = `
FIFTH AMENDED AND RESTATED CREDIT AGREEMENT
dated as of
${successorDate}
among
ACME MATERIALS, INC.
and
${agent}
as Administrative Agent

Preliminary Statement
WHEREAS, Acme Materials, Inc. and the Administrative Agent are parties to that certain First Amended and Restated Credit Agreement, dated as of ${priorDate} (as amended, restated, supplemented or otherwise modified prior to the effectiveness hereof, the “Existing Credit Agreement”); and
WHEREAS, the parties have agreed to amend and restate the Existing Credit Agreement in its entirety.

${operative}
${cp}

“Aggregate Commitment” means $100,000,000. As of the Effective Date, the Aggregate Commitment is $100,000,000.
Revolving Loans may be made under this Agreement.

Section 6.01. Limitation on Indebtedness. The Company will not permit Indebtedness except four baskets.

${sig}
`;

  return [
    { documentId: "doc-a", label: "First AR", text: docA },
    { documentId: "doc-b", label: "Fifth AR", text: docB },
  ];
}

describe("Agent #7 adversarial operative restatement authority", () => {
  it("post-effective: successor governs with CP caveat; package-graph edge not mutated", () => {
    const docs = syntheticPair();
    const graph = buildPackageGraph("fixture-a7", "adv-post", docs);
    const before = JSON.stringify(graph.relationshipCandidates);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const after = JSON.stringify(graph.relationshipCandidates);
    expect(before).toBe(after);

    const fifth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(fifth?.status).toBe("OPERATIVE_AUTHORITY_CONFIRMED");
    expect(fifth?.predecessorDocumentId).toBe("doc-a");
    expect(fifth?.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
    expect(fifth?.doesNotMutatePackageGraphRelationship).toBe(true);

    const gov = resolveGoverningProvision({
      asOfDate: "2024-06-01",
      sectionRef: "6.01",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.governingDocumentId).toBe("doc-b");
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
    expect(gov.supersededDocumentIds).toContain("doc-a");
  });

  it("pre-effective: predecessor remains governing", () => {
    const docs = syntheticPair();
    const graph = buildPackageGraph("fixture-a7", "adv-pre", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const asOf = authorityAsOf(authorities.find((a) => a.successorDocumentId === "doc-b")!, "2024-05-31");
    expect(asOf.status).toBe("NOT_YET_EFFECTIVE");

    const gov = resolveGoverningProvision({
      asOfDate: "2024-05-31",
      sectionRef: "6.01",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.governingDocumentId).toBe("doc-a");
    expect(gov.authorityClassification).toBe("NOT_YET_EFFECTIVE");
  });

  it("partial restatement: only listed provisions move to successor", () => {
    const docs: PackageDocumentInput[] = [
      {
        documentId: "base",
        label: "CA",
        text: `CREDIT AGREEMENT dated as of January 1, 2020 among ACME and AGENT BANK as Administrative Agent.
“Aggregate Commitment” means $50,000,000. Revolving Loans.
Section 6.01. Debt basket A.
Section 7.01. Liens basket B.
IN WITNESS WHEREOF. Signature Page to Credit Agreement`,
      },
      {
        documentId: "amd",
        label: "Partial Restate",
        text: `FIRST AMENDMENT AND PARTIAL RESTATEMENT dated as of March 1, 2021 among ACME and AGENT BANK as Administrative Agent.
WHEREAS, parties are to that certain Credit Agreement, dated as of January 1, 2020 (the “Existing Credit Agreement”).
Section 6.01 of the Existing Credit Agreement is hereby amended and restated to read as follows: new debt basket.
IN WITNESS WHEREOF. Signature Page to First Amendment`,
      },
    ];
    // Force classification via declared types is not available on PackageDocumentInput beyond declaredType —
    // build graph and inject a synthetic restatement authority via resolveGoverningProvision's amendment-like path.
    const graph = buildPackageGraph("fixture-a7", "adv-partial", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    // May or may not classify amd as A&R; exercise governing logic with an explicit partial authority.
    const partialAuthority = {
      status: "OPERATIVE_AUTHORITY_CONFIRMED" as const,
      successorDocumentId: "amd",
      predecessorDocumentId: "base",
      effectiveDateIso: "2021-03-01",
      effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" as const,
      conditionsPrecedentSatisfaction: "NOT_STATED" as const,
      evidence: {
        successorDocumentId: "amd",
        predecessorDocumentId: "base",
        captionRestatement: { present: true, excerpt: "partial", charStart: 0, ordinalLabel: "First" },
        executionDate: { value: "March 1, 2021", isoDate: "2021-03-01", excerpt: "dated as of March 1, 2021" },
        priorAgreementRecital: {
          present: true,
          excerpt: "Credit Agreement, dated as of January 1, 2020",
          charStart: 0,
          namedAgreementLabel: "Credit Agreement",
          namedExecutionDate: "January 1, 2020",
          definedTerm: "Existing Credit Agreement",
        },
        operativeRestatementLanguage: {
          present: true,
          excerpt: "Section 6.01 is hereby amended and restated",
          charStart: 0,
          location: "ARTICLE_RESTATEMENT_SECTION" as const,
          supersedesEntirety: false,
          novationDisclaimed: false,
        },
        conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
        signatureEvidence: { present: true, excerpt: "IN WITNESS WHEREOF", charStart: 0 },
        facilityIdentity: {
          administrativeAgentMatch: true,
          revolvingFacilityContinuity: true,
          borrowerContinuitySignals: [],
          mismatchReasons: [],
        },
        restatementScope: "PARTIAL_PROVISIONS" as const,
        partialProvisionRefs: ["6.01"],
        packageGraphRelationshipStatus: null,
        packageGraphEvidenceClass: null,
        packageGraphUnresolvedReason: null,
      },
      reasons: ["partial"],
      caveats: [],
      doesNotMutatePackageGraphRelationship: true as const,
    };

    const gov601 = resolveGoverningProvision({
      asOfDate: "2021-03-02",
      sectionRef: "6.01",
      instrumentDocumentIds: ["base", "amd"],
      baseDocumentId: "base",
      restatementAuthorities: [partialAuthority, ...authorities],
    });
    expect(gov601.governingDocumentId).toBe("amd");

    const gov701 = resolveGoverningProvision({
      asOfDate: "2021-03-02",
      sectionRef: "7.01",
      instrumentDocumentIds: ["base", "amd"],
      baseDocumentId: "base",
      restatementAuthorities: [partialAuthority, ...authorities],
    });
    expect(gov701.governingDocumentId).toBe("base");
    expect(graph.classifications.length).toBeGreaterThan(0);
  });

  it("conflicting same-date amendments → AMBIGUOUS", () => {
    const gov = resolveGoverningProvision({
      asOfDate: "2023-06-01",
      sectionRef: "6.01",
      instrumentDocumentIds: ["ca", "am1", "am2"],
      baseDocumentId: "ca",
      restatementAuthorities: [],
      amendmentLikeAuthorities: [
        {
          documentId: "am1",
          role: "AMENDMENT",
          effectiveDateIso: "2023-06-01",
          targetSectionRefs: ["6.01"],
          targetDefinedTermRefs: null,
          targetDocumentId: "ca",
          status: "RESOLVED",
        },
        {
          documentId: "am2",
          role: "AMENDMENT",
          effectiveDateIso: "2023-06-01",
          targetSectionRefs: ["6.01"],
          targetDefinedTermRefs: null,
          targetDocumentId: "ca",
          status: "RESOLVED",
        },
      ],
    });
    expect(gov.authorityClassification).toBe("AMBIGUOUS");
    expect(gov.governingDocumentId).toBeNull();
  });

  it("wrong facility (different admin agent) → UNSUPPORTED", () => {
    const docs = syntheticPair({ successorAgent: "OTHER BANK, N.A." });
    const graph = buildPackageGraph("fixture-a7", "adv-wrong-fac", docs);
    // Pin identity agents so the facility check is deterministic even if caption extraction varies.
    for (const id of graph.identities) {
      if (id.documentId === "doc-a") id.administrativeAgentOrTrustee = "PNC BANK, NATIONAL ASSOCIATION";
      if (id.documentId === "doc-b") id.administrativeAgentOrTrustee = "OTHER BANK, N.A.";
    }
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const fifth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(fifth?.evidence.facilityIdentity.administrativeAgentMatch).toBe(false);
    expect(fifth?.status).toBe("UNSUPPORTED");
  });

  it("missing signatures → REVIEW_REQUIRED (no manufactured effectiveness)", () => {
    const docs = syntheticPair({ includeSignatures: false });
    const graph = buildPackageGraph("fixture-a7", "adv-nosig", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const fifth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(fifth?.status).toBe("REVIEW_REQUIRED");
    expect(fifth?.reasons.join(" ")).toMatch(/signature/i);
  });

  it("provisional identity from #274 contract blocks consolidation", () => {
    const docs = syntheticPair();
    const graph = buildPackageGraph("fixture-a7", "adv-prov", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const gov = resolveGoverningProvision({
      asOfDate: "2024-06-01",
      sectionRef: "6.01",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
      confirmedInstrumentIdentity: {
        instrumentKey: "instrument:provisional",
        confirmedDocumentIds: ["doc-a"],
        provisionalDocumentIds: ["doc-b"],
        mayConsolidateOperative: false,
      },
    });
    expect(gov.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(gov.governingDocumentId).toBeNull();
  });

  it("deterministic replay: identical JSON across two runs", () => {
    const docs = syntheticPair();
    const graph = buildPackageGraph("fixture-a7", "adv-replay", docs);
    const a = buildOperativeAuthorityHandoffBundle({
      companyId: "fixture-a7",
      packageKey: "adv-replay",
      asOfDate: "2024-06-01",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    const b = buildOperativeAuthorityHandoffBundle({
      companyId: "fixture-a7",
      packageKey: "adv-replay",
      asOfDate: "2024-06-01",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("WHEREAS-only (no operative restatement language) stays REVIEW_REQUIRED", () => {
    const docs = syntheticPair({ includeOperative: false, includeCp: false });
    const graph = buildPackageGraph("fixture-a7", "adv-whereas", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const fifth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(fifth?.status).toBe("REVIEW_REQUIRED");
    expect(fifth?.evidence.operativeRestatementLanguage.present).toBe(false);
  });
});
