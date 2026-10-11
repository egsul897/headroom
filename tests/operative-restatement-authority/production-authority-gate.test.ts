/**
 * Check #5 / #9 — CONFIRMED_OPERATIVE_WITH_CAVEATS cannot become
 * PRODUCTION_AUTHORITY_ACTIVE. Downstream promotion attempts are refused.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import {
  buildOperativeAuthorityHandoffBundle,
  evaluateProductionAuthorityPromotion,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import { compileFrozenDebtPackage } from "@/lib/contract-model/analysis/offline-package-compile";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility",
);

function loadWorDocs() {
  return [
    {
      documentId: "doc-a",
      label: "WOR Fourth AR",
      text: readFileSync(
        path.join(FIXTURE_DIR, "extracted-text", "doc-a-2023-09-27-fourth-ar-credit-agreement.txt"),
        "utf8",
      ),
    },
    {
      documentId: "doc-b",
      label: "WOR Fifth AR",
      text: readFileSync(
        path.join(FIXTURE_DIR, "extracted-text", "doc-b-2026-08-31-fifth-ar-credit-agreement.txt"),
        "utf8",
      ),
    },
  ];
}

describe("production authority gate for caveated restatement authority", () => {
  it("refuses PRODUCTION_AUTHORITY_ACTIVE for CONFIRMED_OPERATIVE_WITH_CAVEATS", () => {
    const eval_ = evaluateProductionAuthorityPromotion({
      authorityClassification: "CONFIRMED_OPERATIVE_WITH_CAVEATS",
      conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
      caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
      attemptPromotionToProduction: true,
    });
    expect(eval_.productionAuthorityActive).toBe(false);
    expect(eval_.disposition).toBe("HYPOTHETICAL_OR_DISCLOSED_ONLY");
    expect(eval_.refusalReasons.join(" ")).toMatch(/cannot become unconditional PRODUCTION_AUTHORITY_ACTIVE/i);
    expect(eval_.refusalReasons.join(" ")).toMatch(/Downstream promotion attempt/i);
  });

  it("refuses provisional / ambiguous / review-required / not-yet-effective", () => {
    for (const classification of [
      "PROVISIONAL_IDENTITY_BLOCKED",
      "AMBIGUOUS",
      "REVIEW_REQUIRED",
      "UNSUPPORTED",
      "NOT_YET_EFFECTIVE",
    ] as const) {
      const eval_ = evaluateProductionAuthorityPromotion({
        authorityClassification: classification,
        attemptPromotionToProduction: true,
      });
      expect(eval_.productionAuthorityActive).toBe(false);
      expect(eval_.disposition).toBe("PRODUCTION_AUTHORITY_REFUSED");
    }
  });

  it("allows PRODUCTION_AUTHORITY_ACTIVE only for unconditional CONFIRMED_OPERATIVE", () => {
    const eval_ = evaluateProductionAuthorityPromotion({
      authorityClassification: "CONFIRMED_OPERATIVE",
      conditionsPrecedentSatisfaction: "NOT_APPLICABLE",
      caveats: [],
      attemptPromotionToProduction: true,
    });
    expect(eval_.productionAuthorityActive).toBe(true);
    expect(eval_.disposition).toBe("PRODUCTION_AUTHORITY_ACTIVE");
  });

  it("WOR as-of 2026-08-31: caveated governing doc; promotion to PRODUCTION_AUTHORITY_ACTIVE refused", () => {
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const before = JSON.stringify(graph.relationshipCandidates);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(JSON.stringify(graph.relationshipCandidates)).toBe(before);

    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
    expect(summary.anyCaveatedDisclosedOnly).toBe(true);
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
    expect(bundle.provisions[0]!.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
    expect(bundle.provisions[0]!.governingDocumentId).toBe("doc-b");
    expect(bundle.provisions[0]!.provenance.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
    expect(bundle.provisions[0]!.provenance.effectivenessInference).toBe(
      "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
    );
  });

  it("WOR as-of 2026-08-30: predecessor governs; not yet effective; production refused", () => {
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-30",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(bundle.provisions[0]!.governingDocumentId).toBe("doc-a");
    expect(bundle.provisions[0]!.authorityClassification).toBe("NOT_YET_EFFECTIVE");
    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
  });

  it("offline compile consumes Agent #7 handoff and refuses PRODUCTION_AUTHORITY_ACTIVE on WOR", async () => {
    const docs = loadWorDocs();
    const result = await compileFrozenDebtPackage({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      documents: docs,
      asOfDate: "2026-08-31",
      authorizePaidInference: false,
      discoveryCaller: {
        providerName: "never",
        model: "never",
        isSynthetic: true,
        async call(): Promise<never> {
          throw new Error("no paid inference");
        },
        lastTelemetry: () => null,
      },
      amendmentCaller: {
        providerName: "never",
        model: "never",
        isSynthetic: true,
        async call(): Promise<never> {
          throw new Error("no paid inference");
        },
        lastTelemetry: () => null,
      },
    });

    expect(result.operativeAuthorityHandoff).toBeTruthy();
    expect(result.stages.operativeRestatementAuthority.packageGraphRelationshipsUnchanged).toBe(true);
    expect(result.stages.operativeRestatementAuthority.productionAuthorityActive).toBe(false);

    // #274 reconciliation: package-graph RESTATES is only SUPPORTING/REVIEW_REQUIRED, so
    // Fifth AR is a provisional association on the Fourth AR instrument — mayConsolidateOperative
    // is false and governing provisions fail closed as PROVISIONAL_IDENTITY_BLOCKED.
    // Restatement *evidence* still surfaces (Agent #6) with unproven CP caveat.
    expect(result.stages.operativeHandoff.authorityGate).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(
      result.operativeAuthorityHandoff!.provisions.every(
        (p) => p.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED",
      ),
    ).toBe(true);

    const fifth = result.operativeAuthorityHandoff!.restatementAuthorities.find(
      (a) => a.successorDocumentId === "doc-b",
    );
    expect(fifth?.status).toBe("OPERATIVE_AUTHORITY_CONFIRMED");
    expect(fifth?.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
    expect(fifth?.effectivenessInference).toBe("INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION");
    expect(fifth?.evidence.packageGraphRelationshipStatus).toBe("REVIEW_REQUIRED");
    expect(fifth?.doesNotMutatePackageGraphRelationship).toBe(true);
    expect(result.stages.operativeRestatementAuthority.conditionsPrecedentSatisfaction).toBe(
      "NOT_INDEPENDENTLY_PROVEN",
    );

    // Downstream promotion attempt: every provision evaluation refuses ACTIVE.
    for (const row of result.productionAuthorityFromRestatement?.byProvision ?? []) {
      expect(row.evaluation.productionAuthorityActive).toBe(false);
      expect(row.evaluation.disposition).toBe("PRODUCTION_AUTHORITY_REFUSED");
    }
  }, 120_000);

  it("when #274 identity may consolidate, caveated restatement still refuses PRODUCTION_AUTHORITY_ACTIVE", () => {
    // Simulate a confirmed instrument family that includes both WOR docs (as if
    // RESTATES were trusted). Additive authority still caveats CP satisfaction.
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      confirmedInstrumentIdentity: {
        instrumentKey: "instrument:wor-facility",
        confirmedDocumentIds: ["doc-a", "doc-b"],
        provisionalDocumentIds: [],
        mayConsolidateOperative: true,
        associationKind: "CONFIRMED",
      },
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(bundle.provisions[0]!.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
    expect(bundle.provisions[0]!.governingDocumentId).toBe("doc-b");
    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
    expect(summary.anyCaveatedDisclosedOnly).toBe(true);
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.productionAuthorityActive).toBe(false);
    expect(summary.byProvision[0]!.evaluation.disposition).toBe("HYPOTHETICAL_OR_DISCLOSED_ONLY");
  });
});
