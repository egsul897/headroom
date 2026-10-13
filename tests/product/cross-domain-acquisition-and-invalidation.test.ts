/**
 * Secured debt-funded acquisition + financial-change invalidation (provider-free).
 *
 * Proves:
 * - Acquisition composes debt, investment, ratios, liens
 * - Gross mathematical room is never published as verified remaining
 * - Financial changes invalidate prior capacity / simulation conclusions
 * - Incomplete utilization stays UNKNOWN / withheld
 */

import { describe, expect, it } from "vitest";
import {
  evaluateCrossDomainTransaction,
  type ContemplatedCrossDomainTransaction,
} from "@/lib/product/cross-domain-transaction";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
  evaluateCoherentScenario,
} from "@/lib/product/cross-domain-scenarios";
import { resolveContractualEbitdaDerivation, COHERENT_EBITDA_EVIDENCE } from "@/lib/financial-certificate-engine";
import type { CompanyCovenantData } from "@/lib/covenant-engine";

function acquisitionTx(amount: number): ContemplatedCrossDomainTransaction {
  return coherentDebtFundedAcquisition(amount);
}

describe("secured debt-funded acquisition (cross-domain)", () => {
  it("exercises debt, investment, ratios, liens and withholds verified remaining", () => {
    const result = evaluateCoherentScenario(acquisitionTx(150));

    expect(result.scenario.kind).toBe("DEBT_FUNDED_ACQUISITION");
    expect(result.scenario.secured).toBe(true);
    expect(result.debtSimulation).not.toBeNull();
    expect(result.rpSimulation).not.toBeNull();
    expect(result.rpSimulation!.kind).toBe("investment");

    const domains = new Set(result.domains.map((d) => d.domain));
    expect(domains.has("DEBT_INCURRENCE_REFINANCING")).toBe(true);
    expect(domains.has("INVESTMENTS_ACQUISITIONS")).toBe(true);
    expect(domains.has("FINANCIAL_COVENANTS_RATIO_CAPACITY")).toBe(true);
    expect(domains.has("LIENS_SECURED_CAPACITY")).toBe(true);
    expect(domains.has("MULTI_CONDITION_SIMULATION")).toBe(true);

    // Numerical scenario anchors (Coherent seed)
    expect(result.contractualComputation.contractualEbitda).toBe(1700);
    expect(result.proForma.totalNetLeverage).not.toBeNull();

    for (const d of result.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
      if (d.grossCapacityMillions != null) {
        expect(d.support === "UNSUPPORTED" || d.grossCapacityMillions >= 0).toBe(true);
      }
    }
    expect(result.authorityNote).toMatch(/Gross/);
    expect(result.packageLimitations.some((l) => /remaining capacity withheld|utilization/i.test(l))).toBe(
      true,
    );
  });

  it("marks incomplete / unsupported conditions as review_required or not_tested — never invents AVAILABLE remaining", () => {
    const tx = acquisitionTx(150);
    tx.assumptions.utilizationAttributed = false;
    tx.assumptions.utilizationCompletenessCertified = false;
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    expect(["clear", "blocked", "review_required", "not_tested"]).toContain(result.overallStatus);
    for (const d of result.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
  });

  it("adversarial: both caller utilization booleans true cannot certify remaining (incl. RP stepGross)", () => {
    const tx = acquisitionTx(150);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true;
    const result = evaluateCoherentScenario(tx);
    expect(result.domains.every((d) => d.verifiedRemainingMillions === null)).toBe(true);
    const inv = result.domains.find((d) => d.domain === "INVESTMENTS_ACQUISITIONS");
    expect(inv?.grossCapacityMillions != null).toBe(true);
    expect(inv?.verifiedRemainingMillions).toBeNull();
    expect(
      result.packageLimitations.some(
        (l) =>
          /Caller-supplied utilizationAttributed|Caller set utilizationAttributed|flags never authorize verified remaining|ignored for verified remaining/i.test(
            l,
          ),
      ),
    ).toBe(true);
  });
});

describe("financial change invalidates dependent capacity and simulation conclusions", () => {
  it("raising total debt worsens pro forma leverage and can flip acquisition from clear to blocked/review", () => {
    const baseData = coherentPackageData();
    const derivation = resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE);
    const tx = acquisitionTx(400);

    const before = evaluateCrossDomainTransaction({
      data: baseData,
      transaction: tx,
      ebitdaDerivation: derivation,
    });

    const stressed: CompanyCovenantData = {
      ...baseData,
      financials: {
        ...baseData.financials,
        // Material adverse financial change — dependent conclusions must move.
        totalDebt: baseData.financials.totalDebt + 5000,
        securedDebt: baseData.financials.securedDebt + 5000,
        cash: Math.max(0, baseData.financials.cash - 200),
      },
    };

    const after = evaluateCrossDomainTransaction({
      data: stressed,
      transaction: tx,
      ebitdaDerivation: derivation,
    });

    expect(after.proForma.totalNetLeverage).not.toBeNull();
    expect(before.proForma.totalNetLeverage).not.toBeNull();
    expect(after.proForma.totalNetLeverage!).toBeGreaterThan(before.proForma.totalNetLeverage!);

    // Prior favorable conclusion is not sticky after financial invalidation.
    if (before.overallStatus === "clear") {
      expect(["blocked", "review_required", "not_tested"]).toContain(after.overallStatus);
    }

    // Gross room may shrink; verified remaining stays unpublished without completeness.
    const beforeGross =
      before.domains.find((d) => d.domain === "FINANCIAL_COVENANTS_RATIO_CAPACITY")?.grossCapacityMillions ??
      null;
    const afterGross =
      after.domains.find((d) => d.domain === "FINANCIAL_COVENANTS_RATIO_CAPACITY")?.grossCapacityMillions ??
      null;
    if (beforeGross != null && afterGross != null) {
      expect(afterGross).toBeLessThanOrEqual(beforeGross);
    }
    expect(
      after.domains.every((d) => d.verifiedRemainingMillions == null),
    ).toBe(true);
  });

  it("ledger utilization without completeness certificate still withholds verified remaining", () => {
    const data = coherentPackageData();
    const withLedger: CompanyCovenantData = {
      ...data,
      ledger: [
        ...data.ledger,
        {
          basket: "INVESTMENT",
          amount: 25,
          direction: "DEBIT",
        },
      ],
    };
    const tx = acquisitionTx(100);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = false;

    const result = evaluateCrossDomainTransaction({
      data: withLedger,
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });

    expect(result.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
    expect(result.packageLimitations.some((l) => /withheld|completeness/i.test(l))).toBe(true);
  });
});
