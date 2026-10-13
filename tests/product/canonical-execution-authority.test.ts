/**
 * Canonical execution architecture — authority classes + spine adapter.
 *
 * Cross-domain gross must never become VERIFIED_TRANSACTION_PERMITTED.
 * Debt-clear + other-domain-fail ⇒ overall not PERMITTED.
 */
import { describe, expect, it } from "vitest";
import type { CompanyCovenantData } from "@/lib/covenant-engine";
import {
  assertNotPromotedFromCrossDomainGross,
  classifyCrossDomainEvaluation,
  classifyVerifiedSimulate,
  composeAuthoritativePermissibility,
  executionAuthorityToCustomerStatus,
} from "@/lib/product/canonical-execution-authority";
import {
  presentCrossDomainModeling,
  presentCrossDomainWithVerifiedSpine,
} from "@/lib/product/cross-domain-spine-adapter";
import {
  coherentAssetSale,
  coherentDebtFundedAcquisition,
  coherentDividend,
  coherentPackageData,
  evaluateCoherentScenario,
} from "@/lib/product/cross-domain-scenarios";
import { evaluateCrossDomainTransaction } from "@/lib/product/cross-domain-transaction";
import { resolveContractualEbitdaDerivation, COHERENT_EBITDA_EVIDENCE } from "@/lib/financial-certificate-engine";
import type { VerifiedSimulateResult } from "@/lib/product/unified-position/certified-simulate-bridge";
import { buildSimulateView } from "@/lib/customer-workflow/simulate-view";
import { mapEngineLabelToCustomerStatus } from "@/lib/customer-workflow/status-contract";

function refusedVerifiedSimulate(): VerifiedSimulateResult {
  return {
    certified: {
      verifiedPackagePresent: false,
      blockers: ["NO_VERIFIED_EXECUTION_PACKAGE"],
      capacity: null,
      simulation: null,
      authorityNote: "no VEP",
    },
    pathEnumeration: {
      authority: "NOT_CERTIFIED_4E",
      transactionKind: "ACQUISITION",
      secured: true,
      paths: [],
      stackingAssumed: false,
      incompleteReasons: ["NO_VERIFIED_EXECUTION_PACKAGE"],
      unsupportedReasons: [],
      note: "no package",
    },
    selectedPathId: null,
    selectedPath: null,
    transaction: null,
    executable: false,
    refusalSummary: ["NO_VERIFIED_EXECUTION_PACKAGE", "NO_CANDIDATE_PATHS"],
    pathAutoSelected: false,
  } as unknown as VerifiedSimulateResult;
}

describe("cross-domain claimClass never promotes to permitted", () => {
  it("Coherent acquisition clear ⇒ MODELED_GROSS + transactionPermissibility=false", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    expect(result.overallStatus).toBe("clear");
    expect(result.claimClass).toBe("MODELED_GROSS");
    expect(result.transactionPermissibility).toBe(false);
    expect(result.layerRole).toMatch(/SUPPORTING/);
    expect(result.domains.every((d) => d.verifiedRemainingMillions === null)).toBe(true);

    const cls = assertNotPromotedFromCrossDomainGross(result);
    expect(cls).toBe("MODELED_GROSS");

    const verdict = classifyCrossDomainEvaluation(result, { companyId: "coherent" });
    expect(verdict.permitted).toBe(false);
    expect(verdict.authorityClass).toBe("MODELED_GROSS");
    expect(verdict.source).toBe("CROSS_DOMAIN_SUPPORTING");
  });

  it("MODELED_GROSS maps to GROSS_CONTRACTUAL customer status — not VERIFIED_EXECUTABLE", () => {
    expect(executionAuthorityToCustomerStatus("MODELED_GROSS")).toBe("GROSS_CONTRACTUAL");
    expect(mapEngineLabelToCustomerStatus("MODELED_GROSS")).toBe("GROSS_CONTRACTUAL");
    expect(mapEngineLabelToCustomerStatus("VERIFIED_TRANSACTION_PERMITTED")).toBe(
      "VERIFIED_EXECUTABLE",
    );
    expect(mapEngineLabelToCustomerStatus("CLEAR")).toBe("HYPOTHETICAL");
  });
});

describe("debt capacity clear but another applicable covenant fails ⇒ not PERMITTED", () => {
  it("acquisition with investment leg blocked while debt remains clear", () => {
    const data = coherentPackageData();
    // Force RP/investment waterfall to be absent → investment domain UNSUPPORTED/not_tested
    // while debt formulas remain.
    const stripped: CompanyCovenantData = {
      ...data,
      documents: data.documents.map((d) => ({
        ...d,
        rpWaterfall: undefined,
      })),
    };

    const tx = coherentDebtFundedAcquisition(150);
    const modeled = evaluateCrossDomainTransaction({
      data: stripped,
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });

    const debt = modeled.domains.find((d) => d.domain === "DEBT_INCURRENCE_REFINANCING");
    const invest = modeled.domains.find((d) => d.domain === "INVESTMENTS_ACQUISITIONS");
    expect(debt?.status).toBe("clear");
    expect(invest?.status).toBe("not_tested");
    // Incomplete investment coverage must worsen overall — never leave debt-only "clear".
    expect(modeled.overallStatus).not.toBe("clear");
    expect(modeled.claimClass).not.toBe("MODELED_GROSS");
    expect(modeled.transactionPermissibility).toBe(false);

    const presentation = presentCrossDomainWithVerifiedSpine({
      data: stripped,
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedSimulate: refusedVerifiedSimulate(),
    });

    expect(presentation.authoritative.permitted).toBe(false);
    expect(presentation.displayAuthorityLabel).not.toBe("VERIFIED_TRANSACTION_PERMITTED");
    expect(presentation.authoritative.blockingDomains.length).toBeGreaterThan(0);
    expect(
      presentation.authoritative.blockingDomains.some((d) =>
        /INVESTMENTS|RESTRICTED_PAYMENTS/i.test(d),
      ),
    ).toBe(true);
  });

  it("composeAuthoritativePermissibility refuses when model blocks even if spine hypothetically permitted", () => {
    const spinePermitted = classifyVerifiedSimulate({
      ...refusedVerifiedSimulate(),
      executable: true,
      certified: {
        ...refusedVerifiedSimulate().certified,
        verifiedPackagePresent: true,
        blockers: [],
      },
      refusalSummary: [],
    } as VerifiedSimulateResult);

    // Force spine to look permitted for defense-in-depth test.
    expect(spinePermitted.permitted).toBe(true);

    const xdBlocked = classifyCrossDomainEvaluation(
      evaluateCrossDomainTransaction({
        data: {
          ...coherentPackageData(),
          documents: coherentPackageData().documents.map((d) => ({
            ...d,
            rpWaterfall: undefined,
          })),
        },
        transaction: coherentDebtFundedAcquisition(150),
        ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      }),
      { companyId: "coherent" },
    );

    const composed = composeAuthoritativePermissibility({
      verified: spinePermitted,
      crossDomain: xdBlocked,
    });
    expect(composed.permitted).toBe(false);
    expect(composed.authorityClass).not.toBe("VERIFIED_TRANSACTION_PERMITTED");
  });
});

describe("shared capacity / amendment / unknown utilization / incomplete package", () => {
  it("unknown utilization: cross-domain never publishes verified remaining", () => {
    const result = evaluateCoherentScenario(coherentDividend(50));
    const utilDomain = result.domains.find(
      (d) => d.domain === "LEDGER_UTILIZATION_RECLASSIFICATION",
    );
    expect(utilDomain?.verifiedRemainingMillions ?? null).toBeNull();
    expect(result.domains.every((d) => d.verifiedRemainingMillions === null)).toBe(true);
    const verdict = classifyCrossDomainEvaluation(result);
    expect(verdict.authorityClass).not.toBe("VERIFIED_REMAINING");
  });

  it("incomplete package coverage: intercompany unsupported ⇒ not permitted", () => {
    const { supportingVerdict, modeled } = presentCrossDomainModeling({
      data: coherentPackageData(),
      transaction: {
        kind: "INTERCOMPANY_TRANSFER",
        label: "IC transfer",
        amountMillions: 25,
        secured: false,
        assumptions: {
          statements: ["Loan to non-guarantor"],
          entityScope: ["BORROWER"],
          evaluationDate: "2026-06-30",
          utilizationAttributed: false,
          utilizationCompletenessCertified: false,
        },
      },
    });
    expect(modeled.overallStatus).toBe("not_tested");
    expect(supportingVerdict.permitted).toBe(false);
    expect(["UNSUPPORTED", "NEEDS_INPUT", "REVIEW_REQUIRED"]).toContain(
      supportingVerdict.authorityClass,
    );
  });

  it("shared-capacity domain slice stays PARTIAL and cannot alone permit", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(100));
    const shared = result.domains.find((d) => d.domain === "CROSS_DOCUMENT_SHARED_CAPACITY");
    expect(shared).toBeTruthy();
    expect(shared!.support).toBe("PARTIAL");
    expect(result.transactionPermissibility).toBe(false);
  });

  it("amendment domain is not silently treated as verified operative tip", () => {
    const result = evaluateCoherentScenario(coherentAssetSale(200));
    const amend = result.domains.find((d) => d.domain === "AMENDMENT_VERSION_EFFECTIVE_DATE");
    expect(amend).toBeTruthy();
    expect(amend!.support).toBe("PARTIAL");
    // Classification must not upgrade amendment slice to VERIFIED_*
    const verdict = classifyCrossDomainEvaluation(result);
    expect(
      verdict.domainSlices.find((s) => s.domain === "AMENDMENT_VERSION_EFFECTIVE_DATE")
        ?.authorityClass,
    ).not.toMatch(/^VERIFIED_/);
  });
});

describe("Simulate view authority class", () => {
  it("refused verified path keeps HYPOTHETICAL chip but authorityClass is not PERMITTED", () => {
    const view = buildSimulateView({
      companyId: "coherent",
      amountMillions: 150,
      verified: refusedVerifiedSimulate(),
      preCapacity: null,
    });
    expect(view.authorityClass).toBe("NEEDS_INPUT");
    expect(view.authorityClass).not.toBe("VERIFIED_TRANSACTION_PERMITTED");
    expect(view.overallStatus).toBe("HYPOTHETICAL");
    expect(view.executable).toBe(false);
    expect(view.traceAndProvenance.some((t) => t.includes("authorityClass="))).toBe(true);
  });
});

describe("spine adapter composition with refused VEP", () => {
  it("modeled gross clear + refused spine ⇒ MODELED context, not permitted", () => {
    const presentation = presentCrossDomainWithVerifiedSpine({
      data: coherentPackageData(),
      transaction: coherentDebtFundedAcquisition(150),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedSimulate: refusedVerifiedSimulate(),
    });
    expect(presentation.modeled.overallStatus).toBe("clear");
    expect(presentation.modeledAuthorityClass).toBe("MODELED_GROSS");
    expect(presentation.authoritative.permitted).toBe(false);
    expect(presentation.displayAuthorityLabel).not.toBe("VERIFIED_TRANSACTION_PERMITTED");
    expect(presentation.authoritative.limitations.some((l) => /NOT promoted/i.test(l))).toBe(
      true,
    );
  });
});
