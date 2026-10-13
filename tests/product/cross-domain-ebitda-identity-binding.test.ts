/**
 * Contractual EBITDA evidence must bind by authenticated identity — never by
 * numeric EBITDA equality. Two unrelated companies with identical EBITDA values
 * must not inherit each other's evidence packages.
 */

import { describe, expect, it } from "vitest";
import type { CompanyCovenantData } from "@/lib/covenant-engine";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
} from "@/lib/financial-certificate-engine";
import {
  bindContractualEbitdaEvidenceByIdentity,
  evaluateSimulateCrossDomainAcquisition,
} from "@/lib/product/cross-domain-simulate";
import { coherentPackageData, matthewsMinimalPackageData } from "@/lib/product/cross-domain-scenarios";

const SAME_EBITDA = 1700; // Coherent's binding figure

function unrelatedCloneWithCoherentEbitda(): CompanyCovenantData {
  return {
    companyId: "unrelated-acme",
    documents: [
      {
        id: "acme-credit-facility",
        name: "Acme Credit Facility",
        type: "CREDIT_AGREEMENT",
        governs: "Unrelated revolver",
        capacityFormulas: {
          secured: { op: "REF", code: "acme_flat" },
          unsecured: { op: "REF", code: "acme_flat" },
        },
      },
    ],
    provisions: [
      {
        id: "prov-acme-flat",
        documentId: "acme-credit-facility",
        code: "acme_flat",
        basketName: "General debt basket",
        sectionRef: "§1",
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 100,
      },
    ],
    financials: {
      // Identical numeric EBITDA to Coherent — must NOT select Coherent evidence.
      ebitda: SAME_EBITDA,
      cash: 50,
      interestExpense: 10,
      cumulativeNetIncome: 0,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 5,
      totalDebt: 200,
      securedDebt: 150,
    },
    ledger: [],
  };
}

describe("bindContractualEbitdaEvidenceByIdentity", () => {
  it("binds Coherent evidence only when company/document/as-of identity matches", () => {
    const data = coherentPackageData();
    const bound = bindContractualEbitdaEvidenceByIdentity({
      companyId: data.companyId,
      documentIds: data.documents.map((d) => d.id),
      evaluationDate: "2026-06-30",
    });
    expect(bound.refusalReason).toBeNull();
    expect(bound.matched).toBe(COHERENT_EBITDA_EVIDENCE);
    expect(bound.derivation?.bindingContractualEbitdaMillions).toBe(1700);
    expect(bound.derivation?.kind).toBe("SUPPORTING_RECONSTRUCTION");
  });

  it("binds Matthews evidence by identity, not by numeric EBITDA", () => {
    const data = matthewsMinimalPackageData();
    const bound = bindContractualEbitdaEvidenceByIdentity({
      companyId: data.companyId,
      documentIds: data.documents.map((d) => d.id),
      evaluationDate: "2024-12-31",
    });
    expect(bound.refusalReason).toBeNull();
    expect(bound.matched).toBe(MATTHEWS_EBITDA_EVIDENCE);
    expect(bound.derivation?.kind).toBe("INDEPENDENTLY_DERIVED");
  });

  it("two unrelated companies with identical EBITDA never inherit each other's evidence", () => {
    const coherent = coherentPackageData();
    expect(coherent.financials.ebitda).toBe(SAME_EBITDA);

    const coherentBound = bindContractualEbitdaEvidenceByIdentity({
      companyId: coherent.companyId,
      documentIds: coherent.documents.map((d) => d.id),
      evaluationDate: "2026-06-30",
    });
    expect(coherentBound.matched?.bindingIdentity?.companyId).toBe("coherent");

    const unrelated = unrelatedCloneWithCoherentEbitda();
    expect(unrelated.financials.ebitda).toBe(SAME_EBITDA);

    const unrelatedBound = bindContractualEbitdaEvidenceByIdentity({
      companyId: unrelated.companyId,
      documentIds: unrelated.documents.map((d) => d.id),
      evaluationDate: "2026-06-30", // same as-of as Coherent package
    });
    expect(unrelatedBound.matched).toBeNull();
    expect(unrelatedBound.derivation).toBeNull();
    expect(unrelatedBound.refusalReason).toMatch(/no package matches authenticated/i);

    // Simulate path: unrelated must not surface Coherent derivation kind/notes
    const sim = evaluateSimulateCrossDomainAcquisition({
      data: unrelated,
      amountMillions: 50,
      evaluationDate: "2026-06-30",
    });
    expect(sim.contractualComputation.ebitdaDerivation).toBeNull();
    expect(sim.packageLimitations.some((l) => /numeric EBITDA alone never binds/i.test(l))).toBe(
      true,
    );

    // Control: coherent still binds on Simulate
    const coherentSim = evaluateSimulateCrossDomainAcquisition({
      data: coherent,
      amountMillions: 50,
      evaluationDate: "2026-06-30",
    });
    expect(coherentSim.contractualComputation.ebitdaDerivation?.kind).toBe(
      "SUPPORTING_RECONSTRUCTION",
    );
  });

  it("fail closed when company or document identity is missing", () => {
    expect(
      bindContractualEbitdaEvidenceByIdentity({
        companyId: "",
        documentIds: ["coherent-credit-agreement-2022"],
        evaluationDate: "2026-06-30",
      }).refusalReason,
    ).toMatch(/company identity missing/);
    expect(
      bindContractualEbitdaEvidenceByIdentity({
        companyId: "coherent",
        documentIds: [],
        evaluationDate: "2026-06-30",
      }).refusalReason,
    ).toMatch(/document\/package identity missing/);
  });

  it("never selects a package by numeric EBITDA when company mismatches", () => {
    const bound = bindContractualEbitdaEvidenceByIdentity({
      companyId: "not-coherent",
      documentIds: ["coherent-credit-agreement-2022", "coherent-2029-notes-indenture"],
      evaluationDate: "2026-06-30",
    });
    expect(bound.matched).toBeNull();
    expect(bound.derivation).toBeNull();
  });

  it("packages without bindingIdentity cannot be selected even if catalogued", () => {
    const orphan: typeof COHERENT_EBITDA_EVIDENCE = {
      ...COHERENT_EBITDA_EVIDENCE,
      bindingIdentity: undefined,
    };
    const bound = bindContractualEbitdaEvidenceByIdentity({
      companyId: "coherent",
      documentIds: ["coherent-credit-agreement-2022"],
      evaluationDate: "2026-06-30",
      catalog: [orphan],
    });
    expect(bound.matched).toBeNull();
    expect(bound.refusalReason).toMatch(/no package matches/);
  });
});

describe("Simulate PRODUCTION surface — TEST_DEMO unreachable", () => {
  it("evaluateSimulateCrossDomainAcquisition always uses PRODUCTION (no TEST_DEMO param)", () => {
    const sim = evaluateSimulateCrossDomainAcquisition({
      data: coherentPackageData(),
      amountMillions: 10,
      evaluationDate: "2026-06-30",
      // Even if a caller smuggles synthetic util authority, PRODUCTION strips it.
      utilizationAuthority: {
        capacityRuleId: "x",
        asOf: "2026-06-30",
        companyId: "coherent",
        records: [],
        allowSyntheticRemaining: true,
      },
    });
    expect(sim.packageLimitations.some((l) => /Authority surface: PRODUCTION/i.test(l))).toBe(true);
    expect(sim.packageLimitations.some((l) => /TEST_DEMO/i.test(l))).toBe(false);
    expect(sim.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
  });
});
