/**
 * Wrong-document production promotion guard.
 *
 * AutoNation-shaped: package has Third (doc-a) + Fifth (doc-b); Fifth names an
 * out-of-package Fourth AR as Existing Credit Agreement → both restatement
 * authorities REVIEW_REQUIRED with null predecessor. Must NOT mark doc-a
 * provisions CONFIRMED_OPERATIVE / allProvisionsProductionActive=true.
 *
 * Does not invent predecessor identity, RESTATES edges, or CP satisfaction.
 */
import { describe, expect, it } from "vitest";
import {
  buildOperativeAuthorityHandoffBundle,
  resolveGoverningProvision,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import type { RestatementAuthorityResolution } from "@/lib/contract-model/compiler/operative-authority";
import type { PackageGraphResult } from "@/lib/contract-model/compiler/package-graph/types";

function reviewRequiredAuthority(
  successorDocumentId: string,
  effectiveDateIso: string,
): RestatementAuthorityResolution {
  return {
    successorDocumentId,
    predecessorDocumentId: null,
    status: "REVIEW_REQUIRED",
    effectiveDateIso,
    effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
    conditionsPrecedentSatisfaction: "NOT_STATED",
    caveats: [],
    reasons: [
      "Prior agreement recital names an out-of-package agreement; no unique in-package predecessor match.",
    ],
    doesNotMutatePackageGraphRelationship: true,
    evidence: {
      successorDocumentId,
      predecessorDocumentId: null,
      captionRestatement: {
        present: true,
        excerpt: "FIFTH AMENDED AND RESTATED",
        charStart: 0,
        ordinalLabel: "Fifth",
      },
      executionDate: { value: effectiveDateIso, isoDate: effectiveDateIso, excerpt: effectiveDateIso },
      priorAgreementRecital: {
        present: true,
        excerpt: "Existing Credit Agreement dated July 18, 2023",
        charStart: 10,
        namedAgreementLabel: "Fourth Amended and Restated Credit Agreement",
        namedExecutionDate: "July 18, 2023",
        definedTerm: "Existing Credit Agreement",
      },
      operativeRestatementLanguage: {
        present: true,
        excerpt: "amended and restated",
        charStart: 20,
        location: "NOW_THEREFORE",
        supersedesEntirety: true,
        novationDisclaimed: true,
      },
      conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
      signatureEvidence: { present: true, excerpt: "signature", charStart: 30 },
      facilityIdentity: {
        administrativeAgentMatch: null,
        revolvingFacilityContinuity: null,
        borrowerContinuitySignals: [],
        mismatchReasons: [],
      },
      restatementScope: "FULL_AGREEMENT",
      partialProvisionRefs: [],
      packageGraphRelationshipStatus: "UNRESOLVED",
      packageGraphEvidenceClass: null,
      packageGraphUnresolvedReason: "no explicit in-package prior match",
    },
  };
}

function emptyGraph(documentIds: string[]): PackageGraphResult {
  return {
    companyId: "fixture-an-shape",
    packageKey: "an-shape",
    classifications: documentIds.map((documentId) => ({
      documentId,
      type: "AMENDED_AND_RESTATED_AGREEMENT" as const,
      confidence: 0.9,
      evidence: [],
    })),
    identities: documentIds.map((documentId) => ({
      documentId,
      borrowerOrIssuerNames: ["FIXTURE BORROWER"],
      administrativeAgentOrTrustee: "FIXTURE BANK",
      executionDate: null,
      datedAsOfDate: null,
      facilityLabels: [],
      confidence: 0.5,
    })),
    relationshipCandidates: documentIds.map((documentId) => ({
      sourceDocumentId: documentId,
      targetDocumentId: null,
      targetHint: null,
      relationshipType: "RESTATES" as const,
      sourceCitation: documentId,
      confidence: 0,
      status: "UNRESOLVED" as const,
      unresolvedReason: "no explicit reference to another agreement (by name + execution date) was found",
      resolutionMethod: "DETERMINISTIC_NO_SIGNAL" as const,
      evidenceClass: null,
    })),
    instruments: [
      {
        instrumentKey: "instrument:doc-a",
        baseDocumentId: "doc-a",
        documentIds: ["doc-a"],
        provisionalDocumentIds: ["doc-b"],
        associationKind: "PROVISIONAL",
        reviewStatus: "NEEDS_REVIEW",
        provisionalBridgeBlockers: [
          {
            sourceDocumentId: "doc-b",
            targetDocumentId: "doc-a",
            reason: "RESTATES unresolved — prior Fourth AR not in package",
          },
        ],
      },
    ],
    modificationCandidates: [],
  } as unknown as PackageGraphResult;
}

describe("wrong-document production promotion guard", () => {
  it("AutoNation-shaped REVIEW_REQUIRED competitors refuse doc-a CONFIRMED_OPERATIVE / ACTIVE", () => {
    const authorities = [
      reviewRequiredAuthority("doc-a", "2020-03-26"),
      reviewRequiredAuthority("doc-b", "2026-09-14"),
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });

    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/doc-b/);
    expect(gov.caveats).toEqual(
      expect.arrayContaining([
        "PACKAGE_RESTATEMENT_SUCCESSION_UNRESOLVED",
        "LOCAL_BASE_CANDIDATE_NOT_PACKAGE_OPERATIVE:doc-a",
      ]),
    );

    const graph = emptyGraph(["doc-a", "doc-b"]);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "fixture-an-shape",
      packageKey: "an-shape",
      asOfDate: "2026-09-15",
      documents: [
        { documentId: "doc-a", label: "Third AR", text: "THIRD AMENDED AND RESTATED CREDIT AGREEMENT" },
        { documentId: "doc-b", label: "Fifth AR", text: "FIFTH AMENDED AND RESTATED CREDIT AGREEMENT" },
      ],
      packageGraph: graph,
      provisions: [{ sectionRef: "8.1" }, { sectionRef: "8.2" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      // Inject the same REVIEW_REQUIRED authorities the AutoNation evidence path produces
      // by stubbing through resolveGoverningProvision inputs — bundle rebuilds from graph
      // text; for this unit we assert via summarize on a synthetic provision set.
    });

    // Bundle built from minimal text may not reproduce AutoNation evidence; assert the
    // provision resolver + summary gate on the hand-built AutoNation-shaped authorities.
    const syntheticBundle = {
      ...bundle,
      restatementAuthorities: authorities,
      provisions: [
        resolveGoverningProvision({
          asOfDate: "2026-09-15",
          sectionRef: "8.1",
          instrumentDocumentIds: ["doc-a", "doc-b"],
          baseDocumentId: "doc-a",
          restatementAuthorities: authorities,
        }),
        resolveGoverningProvision({
          asOfDate: "2026-09-15",
          sectionRef: "8.2",
          instrumentDocumentIds: ["doc-a", "doc-b"],
          baseDocumentId: "doc-a",
          restatementAuthorities: authorities,
        }),
      ],
    };

    const summary = summarizeBundleProductionAuthority(syntheticBundle, {
      attemptPromotionToProduction: true,
    });
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.anyProductionRefused).toBe(true);
    expect(
      syntheticBundle.provisions.every(
        (p) => p.authorityClassification === "REVIEW_REQUIRED" && p.governingDocumentId == null,
      ),
    ).toBe(true);
    for (const row of summary.byProvision) {
      expect(row.evaluation.productionAuthorityActive).toBe(false);
      expect(row.evaluation.disposition).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    }

    // Agent #11 wrong-document diagnostic predicate must be false.
    const wrongDocumentProductionPromotion =
      syntheticBundle.provisions.some(
        (p) =>
          p.governingDocumentId === "doc-a" &&
          (p.authorityClassification === "CONFIRMED_OPERATIVE" ||
            p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS"),
      ) && summary.allProvisionsProductionActive === true;
    expect(wrongDocumentProductionPromotion).toBe(false);
  });

  it("undated REVIEW_REQUIRED competitor (null effectiveDateIso) also refuses base CONFIRMED_OPERATIVE", () => {
    // Absorbed from #296 fail-closed: uncertain dating must not leave doc-a confirmed.
    const undatedB = reviewRequiredAuthority("doc-b", "2026-09-14");
    const authorities: RestatementAuthorityResolution[] = [
      reviewRequiredAuthority("doc-a", "2020-03-26"),
      {
        ...undatedB,
        effectiveDateIso: null,
        evidence: {
          ...undatedB.evidence,
          executionDate: { value: null, isoDate: null, excerpt: null },
        },
      },
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/doc-b/);
  });

  it("package-level summary refuses ACTIVE when provisions mis-label CONFIRMED_OPERATIVE under unresolved restatements", () => {
    const authorities = [
      reviewRequiredAuthority("doc-a", "2020-03-26"),
      reviewRequiredAuthority("doc-b", "2026-09-14"),
    ];
    // Simulate a stale provision row that still says CONFIRMED_OPERATIVE on doc-a.
    const staleProvision = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a"],
      baseDocumentId: "doc-a",
      restatementAuthorities: [], // no competitors → would be CONFIRMED_OPERATIVE
    });
    expect(staleProvision.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    expect(staleProvision.governingDocumentId).toBe("doc-a");

    const summary = summarizeBundleProductionAuthority(
      {
        companyId: "x",
        packageKey: "x",
        asOfDate: "2026-09-15",
        startingMainSha: "test",
        packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274",
        worHoldoutPr: "https://github.com/egsul897/headroom/pull/276",
        restatementAuthorities: authorities,
        provisions: [staleProvision],
        unsupportedCases: [],
        verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL",
        verdictReasons: [],
      },
      { attemptPromotionToProduction: true },
    );
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.refusalReasons.join(" ")).toMatch(
      /Package-wide restatement succession/i,
    );
  });
});
