/**
 * P0: later / undated unresolved competing restatement must not leave an
 * earlier confirmed restatement CONFIRMED_OPERATIVE / production-active.
 *
 * Scenario (as-of 2025):
 * - Confirmed 2022 full restatement
 * - Competing 2024 successor REVIEW_REQUIRED or UNSUPPORTED
 * - Repeat with undated competing successor
 *
 * Preserves: future-effective unresolved successors; historical REVIEW_REQUIRED
 * priors behind a later confirmed restatement; unrelated-document filtering.
 */
import { describe, expect, it } from "vitest";
import {
  resolveGoverningProvision,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import type {
  OperativeAuthorityHandoffBundle,
  RestatementAuthorityResolution,
} from "@/lib/contract-model/compiler/operative-authority";

function confirmedAuthority(
  successorDocumentId: string,
  predecessorDocumentId: string | null,
  effectiveDateIso: string,
): RestatementAuthorityResolution {
  return {
    successorDocumentId,
    predecessorDocumentId,
    status: "OPERATIVE_AUTHORITY_CONFIRMED",
    effectiveDateIso,
    effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
    conditionsPrecedentSatisfaction: "NOT_STATED",
    caveats: [],
    reasons: [`Confirmed full restatement ${successorDocumentId} effective ${effectiveDateIso}`],
    doesNotMutatePackageGraphRelationship: true,
    evidence: {
      successorDocumentId,
      predecessorDocumentId,
      captionRestatement: {
        present: true,
        excerpt: "AMENDED AND RESTATED",
        charStart: 0,
        ordinalLabel: "Second",
      },
      executionDate: { value: effectiveDateIso, isoDate: effectiveDateIso, excerpt: effectiveDateIso },
      priorAgreementRecital: {
        present: true,
        excerpt: "Existing Credit Agreement",
        charStart: 1,
        namedAgreementLabel: "Prior Credit Agreement",
        namedExecutionDate: "2020-01-15",
        definedTerm: "Existing Credit Agreement",
      },
      operativeRestatementLanguage: {
        present: true,
        excerpt: "amended and restated in its entirety",
        charStart: 2,
        location: "NOW_THEREFORE",
        supersedesEntirety: true,
        novationDisclaimed: true,
      },
      conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
      signatureEvidence: { present: true, excerpt: "signature page", charStart: 3 },
      facilityIdentity: {
        administrativeAgentMatch: true,
        revolvingFacilityContinuity: true,
        borrowerContinuitySignals: ["Borrower"],
        mismatchReasons: [],
      },
      restatementScope: "FULL_AGREEMENT",
      partialProvisionRefs: [],
      packageGraphRelationshipStatus: "RESOLVED",
      packageGraphEvidenceClass: "STRONG_TARGET_EVIDENCE",
      packageGraphUnresolvedReason: null,
    },
  };
}

function unresolvedCompetitor(
  successorDocumentId: string,
  status: "REVIEW_REQUIRED" | "UNSUPPORTED",
  effectiveDateIso: string | null,
): RestatementAuthorityResolution {
  const template = confirmedAuthority(successorDocumentId, null, effectiveDateIso ?? "2024-09-01");
  return {
    ...template,
    status,
    effectiveDateIso,
    predecessorDocumentId: null,
    reasons:
      status === "UNSUPPORTED"
        ? ["Competing successor restatement authority is UNSUPPORTED"]
        : ["Competing successor prior agreement / RESTATES identity not independently established"],
    evidence: {
      ...template.evidence,
      predecessorDocumentId: null,
      executionDate: {
        value: effectiveDateIso,
        isoDate: effectiveDateIso,
        excerpt: effectiveDateIso,
      },
      packageGraphRelationshipStatus: "UNRESOLVED",
      packageGraphEvidenceClass: null,
      packageGraphUnresolvedReason: "prior not in package / unresolved RESTATES",
      facilityIdentity: {
        administrativeAgentMatch: null,
        revolvingFacilityContinuity: null,
        borrowerContinuitySignals: [],
        mismatchReasons: [],
      },
    },
  };
}

const FAMILY = ["original-2020", "restated-2022", "restated-2024"] as const;
const AS_OF = "2025-06-15";
const CONFIRMED_2022 = confirmedAuthority("restated-2022", "original-2020", "2022-03-15");

function resolve(authorities: RestatementAuthorityResolution[]) {
  return resolveGoverningProvision({
    asOfDate: AS_OF,
    sectionRef: "7.01",
    instrumentDocumentIds: [...FAMILY],
    baseDocumentId: "original-2020",
    restatementAuthorities: authorities,
  });
}

function summarize(authorities: RestatementAuthorityResolution[], provision = resolve(authorities)) {
  const bundle: OperativeAuthorityHandoffBundle = {
    companyId: "fixture-later-unresolved",
    packageKey: "later-unresolved-successor",
    asOfDate: AS_OF,
    startingMainSha: "440dd65d42c2e9f6b92978fa4f04a92658de190c",
    packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274",
    worHoldoutPr: "https://github.com/egsul897/headroom/pull/276",
    restatementAuthorities: authorities,
    provisions: [provision],
    unsupportedCases: [],
    verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL",
    verdictReasons: [],
  };
  return summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
}

describe("P0 later/undated unresolved competing successor guard", () => {
  it("PROVEN regression: confirmed 2022 + REVIEW_REQUIRED 2024 (as-of 2025) refuses CONFIRMED_OPERATIVE / ACTIVE", () => {
    const authorities = [
      CONFIRMED_2022,
      unresolvedCompetitor("restated-2024", "REVIEW_REQUIRED", "2024-09-01"),
    ];
    const gov = resolve(authorities);
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/REVIEW_REQUIRED/);
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/restated-2024/);
    expect(gov.caveats).toEqual(
      expect.arrayContaining([
        "PACKAGE_RESTATEMENT_SUCCESSION_UNRESOLVED",
        "EARLIER_CONFIRMED_RESTATEMENT_NOT_PACKAGE_OPERATIVE:restated-2022",
      ]),
    );

    const summary = summarize(authorities, gov);
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.disposition).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
  });

  it("confirmed 2022 + UNSUPPORTED 2024 also refuses earlier CONFIRMED_OPERATIVE / ACTIVE", () => {
    const authorities = [
      CONFIRMED_2022,
      unresolvedCompetitor("restated-2024", "UNSUPPORTED", "2024-09-01"),
    ];
    const gov = resolve(authorities);
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/UNSUPPORTED/);
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/restated-2024/);

    // Belt-and-suspenders: even a stale CONFIRMED_OPERATIVE row is refused at package gate
    // when UNSUPPORTED later competitor is present.
    const staleConfirmed = resolveGoverningProvision({
      asOfDate: AS_OF,
      sectionRef: "7.01",
      instrumentDocumentIds: ["original-2020", "restated-2022"],
      baseDocumentId: "original-2020",
      restatementAuthorities: [CONFIRMED_2022],
    });
    expect(staleConfirmed.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    const summary = summarize(authorities, staleConfirmed);
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.refusalReasons.join(" ")).toMatch(
      /UNSUPPORTED|REVIEW_REQUIRED|AMBIGUOUS/i,
    );
  });

  it("undated competing REVIEW_REQUIRED successor also refuses earlier CONFIRMED_OPERATIVE", () => {
    const authorities = [
      CONFIRMED_2022,
      unresolvedCompetitor("restated-2024", "REVIEW_REQUIRED", null),
    ];
    const gov = resolve(authorities);
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.unresolvedConflicts.join(" ")).toMatch(/restated-2024/);
    expect(summarize(authorities, gov).allProvisionsProductionActive).toBe(false);
  });

  it("future-effective REVIEW_REQUIRED successor does not demote confirmed 2022", () => {
    const authorities = [
      CONFIRMED_2022,
      unresolvedCompetitor("restated-2026", "REVIEW_REQUIRED", "2026-01-01"),
    ];
    const gov = resolve(authorities);
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    expect(gov.governingDocumentId).toBe("restated-2022");
    expect(gov.unresolvedConflicts.join(" ")).not.toMatch(/restated-2026/);
    expect(summarize(authorities, gov).byProvision[0]!.evaluation.productionAuthorityActive).toBe(
      true,
    );
  });

  it("historical earlier REVIEW_REQUIRED prior behind confirmed successor stays non-blocking", () => {
    // WOR-shaped: earlier Fourth REVIEW_REQUIRED + later Fifth confirmed.
    const authorities = [
      unresolvedCompetitor("restated-2021", "REVIEW_REQUIRED", "2021-06-01"),
      confirmedAuthority("restated-2022", "restated-2021", "2022-03-15"),
    ];
    const gov = resolveGoverningProvision({
      asOfDate: AS_OF,
      sectionRef: "7.01",
      instrumentDocumentIds: ["restated-2021", "restated-2022"],
      baseDocumentId: "restated-2021",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    expect(gov.governingDocumentId).toBe("restated-2022");
    expect(gov.caveats).toEqual(expect.arrayContaining(["NON_BLOCKING_REVIEW_ITEM:restated-2021"]));
    expect(gov.unresolvedConflicts.join(" ")).not.toMatch(/restated-2021/);

    const summary = summarizeBundleProductionAuthority(
      {
        companyId: "fixture-historical",
        packageKey: "historical-prior",
        asOfDate: AS_OF,
        startingMainSha: "440dd65d42c2e9f6b92978fa4f04a92658de190c",
        packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274",
        worHoldoutPr: "https://github.com/egsul897/headroom/pull/276",
        restatementAuthorities: authorities,
        provisions: [gov],
        unsupportedCases: [],
        verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL",
        verdictReasons: [],
      },
      { attemptPromotionToProduction: true },
    );
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(true);
  });

  it("unrelated-document unresolved successor outside instrument family does not demote", () => {
    const authorities = [
      CONFIRMED_2022,
      unresolvedCompetitor("other-facility-2024", "REVIEW_REQUIRED", "2024-09-01"),
    ];
    const gov = resolveGoverningProvision({
      asOfDate: AS_OF,
      sectionRef: "7.01",
      instrumentDocumentIds: ["original-2020", "restated-2022"],
      baseDocumentId: "original-2020",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    expect(gov.governingDocumentId).toBe("restated-2022");
    expect(gov.unresolvedConflicts.join(" ")).not.toMatch(/other-facility-2024/);
  });
});
