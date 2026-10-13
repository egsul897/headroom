/**
 * Adversarial locks: Position GROSS selection must be provision-identity-aware.
 * Never first-match when two valid but different amounts compete.
 */

import { describe, expect, it } from "vitest";
import {
  grossCandidatesFromVerifiedExecutableCompile,
  selectSourceBackedGrossMm,
  type SourceBackedGrossCandidate,
} from "@/lib/customer-workflow/select-source-backed-gross";
import { compileVerifiedFixedDollarBridge } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";
import type { VerifiedExecutableCompileBridgeResult } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

const INSTRUMENT = "demo-credit-facility";
const GOVERNING = "amended-restated-credit-agreement-2022";
const PREDECESSOR = "credit-agreement-2020";
const OTHER_DOC = "unrelated-indenture-2019";

function candidate(
  overrides: Partial<SourceBackedGrossCandidate> &
    Pick<SourceBackedGrossCandidate, "candidateId" | "amountMillions" | "covenantFamily">,
): SourceBackedGrossCandidate {
  return {
    instrumentKey: INSTRUMENT,
    entityScope: "COMPANY_AND_RESTRICTED_SUBSIDIARIES",
    governingDocumentId: GOVERNING,
    operativeSourceDocumentId: GOVERNING,
    sourceSectionRef: "7.03(f)",
    ...overrides,
  };
}

describe("selectSourceBackedGrossMm — provision identity", () => {
  it("RESOLVED: single matching INDEBTEDNESS gross on governing instrument", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "debt-1300",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "def:Permitted Debt(1)(a)",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.amountMillions).toBe(1300);
  });

  it("AMBIGUOUS: two valid but different gross amounts in the same package", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "debt-a",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "7.03(a)",
        }),
        candidate({
          candidateId: "debt-b",
          amountMillions: 700,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "7.03(f)",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.amountMillions).toBeNull();
    expect(result.eligible).toHaveLength(2);
    expect(result.reason).toMatch(/AMBIGUOUS/);
    // Must not silently pick 1300 (first) or 700.
    expect(result.selected).toBeNull();
  });

  it("same amount twice resolves (not ambiguous)", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "debt-a",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "7.03(a)",
        }),
        candidate({
          candidateId: "debt-a-dup",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "7.03(a)",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.amountMillions).toBe(1300);
  });

  it("wrong-family: LIENS gross excluded when selecting INDEBTEDNESS", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "lien-50",
          amountMillions: 50,
          covenantFamily: "LIENS",
          sourceSectionRef: "7.01(b)",
        }),
        candidate({
          candidateId: "debt-1300",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          sourceSectionRef: "7.03(f)",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.amountMillions).toBe(1300);
    expect(result.eligible.map((e) => e.candidateId)).toEqual(["debt-1300"]);
  });

  it("wrong-family alone yields NONE (never publishes lien as indebtedness)", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "lien-50",
          amountMillions: 50,
          covenantFamily: "LIENS",
          sourceSectionRef: "7.01(b)",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("NONE");
    expect(result.amountMillions).toBeNull();
  });

  it("wrong-document: predecessor / unrelated governing source excluded", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "pred-50",
          amountMillions: 50,
          covenantFamily: "INDEBTEDNESS",
          governingDocumentId: PREDECESSOR,
          operativeSourceDocumentId: PREDECESSOR,
          sourceSectionRef: "7.03(f)",
        }),
        candidate({
          candidateId: "other-200",
          amountMillions: 200,
          covenantFamily: "INDEBTEDNESS",
          governingDocumentId: OTHER_DOC,
          operativeSourceDocumentId: OTHER_DOC,
          sourceSectionRef: "4.09",
        }),
        candidate({
          candidateId: "gov-1300",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          governingDocumentId: GOVERNING,
          operativeSourceDocumentId: GOVERNING,
          sourceSectionRef: "7.03(f)",
        }),
      ],
      {
        instrumentKey: INSTRUMENT,
        covenantFamily: "INDEBTEDNESS",
        governingDocumentId: GOVERNING,
      },
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.amountMillions).toBe(1300);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]!.candidateId).toBe("gov-1300");
  });

  it("predecessor operative source under successor governing REFUSES (binding)", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "cross-50",
          amountMillions: 50,
          covenantFamily: "INDEBTEDNESS",
          governingDocumentId: GOVERNING,
          operativeSourceDocumentId: PREDECESSOR,
          sourceSectionRef: "7.03(f)",
        }),
      ],
      {
        instrumentKey: INSTRUMENT,
        covenantFamily: "INDEBTEDNESS",
        requireOperativeSourceOnGoverning: true,
      },
    );
    expect(result.status).toBe("NONE");
    expect(result.amountMillions).toBeNull();
  });

  it("wrong instrument excluded", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "other-inst",
          amountMillions: 999,
          covenantFamily: "INDEBTEDNESS",
          instrumentKey: "other-facility",
        }),
      ],
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(result.status).toBe("NONE");
  });

  it("entity-scope mismatch excluded when scope requires specific entity", () => {
    const result = selectSourceBackedGrossMm(
      [
        candidate({
          candidateId: "company-only",
          amountMillions: 100,
          covenantFamily: "INDEBTEDNESS",
          entityScope: "COMPANY_ONLY",
        }),
        candidate({
          candidateId: "restricted",
          amountMillions: 1300,
          covenantFamily: "INDEBTEDNESS",
          entityScope: "COMPANY_AND_RESTRICTED_SUBSIDIARIES",
        }),
      ],
      {
        instrumentKey: INSTRUMENT,
        covenantFamily: "INDEBTEDNESS",
        entityScope: "COMPANY_AND_RESTRICTED_SUBSIDIARIES",
      },
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.amountMillions).toBe(1300);
  });
});

describe("grossCandidatesFromVerifiedExecutableCompile + compile bridge", () => {
  it("two different VE GROSS amounts in one compile → AMBIGUOUS via identity selection", () => {
    const compile = compileVerifiedFixedDollarBridge({
      companyId: "co",
      instrumentKey: INSTRUMENT,
      asOfDate: "2024-12-31",
      candidates: [
        {
          candidateId: "debt-1300",
          documentId: GOVERNING,
          sourceSectionRef: "7.03(a)",
          operativeSourceText:
            "Indebtedness of the Company and its Restricted Subsidiaries not to exceed $1,300,000,000.",
          relatedLeafCode: null,
        },
        {
          candidateId: "debt-700",
          documentId: GOVERNING,
          sourceSectionRef: "7.03(f)",
          operativeSourceText:
            "Indebtedness of the Company and its Restricted Subsidiaries not to exceed $700,000,000.",
          relatedLeafCode: null,
        },
        {
          candidateId: "lien-50",
          documentId: GOVERNING,
          sourceSectionRef: "7.01(b)",
          operativeSourceText:
            "Liens on property of the Company and its Restricted Subsidiaries not to exceed $50,000,000.",
          relatedLeafCode: null,
        },
      ],
    });

    const feeding = compile.verifiedExecutableUnits.filter((u) => u.feedsPosition);
    expect(feeding.length).toBeGreaterThanOrEqual(2);

    const candidates = grossCandidatesFromVerifiedExecutableCompile(compile);
    const indebtedness = candidates.filter((c) => c.covenantFamily === "INDEBTEDNESS");
    expect(indebtedness.length).toBeGreaterThanOrEqual(2);

    const selected = selectSourceBackedGrossMm(candidates, {
      instrumentKey: INSTRUMENT,
      covenantFamily: "INDEBTEDNESS",
    });
    expect(selected.status).toBe("AMBIGUOUS");
    expect(selected.amountMillions).toBeNull();

    // Wrong-family alone must not resolve indebtedness from lien.
    const lienOnly = selectSourceBackedGrossMm(
      candidates.filter((c) => c.covenantFamily === "LIENS"),
      { instrumentKey: INSTRUMENT, covenantFamily: "INDEBTEDNESS" },
    );
    expect(lienOnly.status).toBe("NONE");
  });

  it("wrong-document candidate dropped from compile-bridge candidate list when scoped", () => {
    const compile: VerifiedExecutableCompileBridgeResult = {
      companyId: "co",
      instrumentKey: INSTRUMENT,
      asOfDate: "2024-12-31",
      candidatesAttempted: 2,
      verifiedExecutableUnits: [
        {
          candidateId: "wrong-doc",
          documentId: OTHER_DOC,
          operativeSourceDocumentId: OTHER_DOC,
          instrumentKey: INSTRUMENT,
          covenantFamily: "INDEBTEDNESS",
          entityScope: "COMPANY_AND_RESTRICTED_SUBSIDIARIES",
          sourceSectionRef: "4.09",
          relatedLeafCode: null,
          compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
          classificationClass: "FIXED_DOLLAR_SOLE_CAP",
          fidelityVerdict: "PASS",
          hypotheticalOutcome: "VERIFIED_EXECUTABLE",
          productionOutcome: "PRODUCTION_CAPACITY_REFUSED",
          sourceBackedGrossCapacityMm: 200,
          valueClass: "SOURCE_BACKED_COMPILED_GROSS",
          feedsPosition: true,
          displayedOnDashboard: true,
          limitations: [],
          missingLegalStructure: null,
        },
        {
          candidateId: "gov",
          documentId: GOVERNING,
          operativeSourceDocumentId: GOVERNING,
          instrumentKey: INSTRUMENT,
          covenantFamily: "INDEBTEDNESS",
          entityScope: "COMPANY_AND_RESTRICTED_SUBSIDIARIES",
          sourceSectionRef: "7.03(f)",
          relatedLeafCode: null,
          compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
          classificationClass: "FIXED_DOLLAR_SOLE_CAP",
          fidelityVerdict: "PASS",
          hypotheticalOutcome: "VERIFIED_EXECUTABLE",
          productionOutcome: "PRODUCTION_CAPACITY_REFUSED",
          sourceBackedGrossCapacityMm: 1300,
          valueClass: "SOURCE_BACKED_COMPILED_GROSS",
          feedsPosition: true,
          displayedOnDashboard: true,
          limitations: [],
          missingLegalStructure: null,
        },
      ],
      verifiedExecutableUnitsFeedingPosition: 2,
      productionCapacityPublished: false,
      trustedIdentityActivation: "BLOCKED",
      path: ["test"],
      limitations: [],
    };

    const selected = selectSourceBackedGrossMm(
      grossCandidatesFromVerifiedExecutableCompile(compile),
      {
        instrumentKey: INSTRUMENT,
        covenantFamily: "INDEBTEDNESS",
        governingDocumentId: GOVERNING,
      },
    );
    expect(selected.status).toBe("RESOLVED");
    expect(selected.amountMillions).toBe(1300);
  });
});
