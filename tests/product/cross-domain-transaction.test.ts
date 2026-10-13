/**
 * Cross-domain package evaluation — Coherent multi-family scenarios + Matthews
 * ratio-room refinancing on the same evaluator (no company-id engine branches).
 */

import { describe, expect, it } from "vitest";
import {
  covenantDomainCoverage,
  evaluateCrossDomainTransaction,
} from "@/lib/product/cross-domain-transaction";
import {
  coherentAssetSale,
  coherentDebtFundedAcquisition,
  coherentDividend,
  coherentIntercompanyTransfer,
  coherentPackageData,
  coherentRefinancing,
  evaluateCoherentScenario,
  evaluateMatthewsScenario,
  matthewsRefinancing,
} from "@/lib/product/cross-domain-scenarios";
import { resolveContractualEbitdaDerivation, COHERENT_EBITDA_EVIDENCE } from "@/lib/financial-certificate-engine";

describe("covenant domain coverage inventory", () => {
  it("covers mandate domains honestly without false EXECUTABLE claims", () => {
    const rows = covenantDomainCoverage();
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows.every((r) => r.executableToday.length > 0)).toBe(true);
    // Package-wide audit: no domain is fully EXECUTABLE today.
    expect(rows.every((r) => r.support !== "EXECUTABLE")).toBe(true);
    expect(rows.some((r) => r.support === "PARTIAL" || r.support === "UNSUPPORTED")).toBe(true);
    expect(rows.some((r) => r.domain === "AFFILIATE_TRANSACTIONS")).toBe(true);
    expect(rows.some((r) => r.domain === "GUARANTEES")).toBe(true);
    expect(rows.some((r) => r.domain === "SUBSIDIARY_DESIGNATION_STRUCTURAL")).toBe(true);
  });
});

describe("assumption gates", () => {
  it("refuses evaluation without explicit assumptions / entity scope", () => {
    const tx = coherentDebtFundedAcquisition();
    tx.assumptions.statements = [];
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    expect(result.overallStatus).toBe("review_required");
    expect(result.packageLimitations.some((l) => /assumptions are required/i.test(l))).toBe(true);
  });

  it("caller-supplied utilization completeness booleans cannot manufacture verified remaining", () => {
    const tx = coherentDebtFundedAcquisition(100);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true;
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    for (const d of result.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
    expect(
      result.packageLimitations.some(
        (l) =>
          /Caller-supplied.*ignored/i.test(l) ||
          /never authorize verified remaining/i.test(l) ||
          /Caller set utilizationAttributed/i.test(l),
      ),
    ).toBe(true);
  });
});

describe("Coherent cross-domain scenarios", () => {
  it("debt-funded acquisition exercises debt + investment + ratios + liens", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    expect(result.contractualComputation.contractualEbitda).toBe(1700);
    expect(result.contractualComputation.ebitdaDerivation?.kind).toBe("SUPPORTING_RECONSTRUCTION");
    expect(result.debtSimulation).not.toBeNull();
    expect(result.rpSimulation).not.toBeNull();
    expect(result.rpSimulation!.kind).toBe("investment");
    const domains = new Set(result.domains.map((d) => d.domain));
    expect(domains.has("DEBT_INCURRENCE_REFINANCING")).toBe(true);
    expect(domains.has("INVESTMENTS_ACQUISITIONS")).toBe(true);
    expect(domains.has("FINANCIAL_COVENANTS_RATIO_CAPACITY")).toBe(true);
    expect(domains.has("LIENS_SECURED_CAPACITY")).toBe(true);
    // Gross / modeled never published as verified remaining without authority
    for (const d of result.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
      expect(d.verifiedRemainingRefusalReason).toBeTruthy();
    }
    expect(result.authorityNote).toMatch(/Gross/);
    expect(result.version).toBe("cross-domain-transaction.v2");
  });

  it("dividend uses RP waterfall (builder / general / ratio gate)", () => {
    const result = evaluateCoherentScenario(coherentDividend(50));
    expect(result.rpSimulation).not.toBeNull();
    expect(result.rpSimulation!.kind).toBe("dividend");
    expect(["clear", "blocked", "review_required"]).toContain(result.rpSimulation!.status);
    expect(result.domains.some((d) => d.domain === "RESTRICTED_PAYMENTS_BUILDER")).toBe(true);
  });

  it("asset sale evaluates excess-proceeds / offer trigger when configured", () => {
    const result = evaluateCoherentScenario(coherentAssetSale(200));
    expect(result.assetSaleSimulation).not.toBeNull();
    expect(result.assetSaleSimulation!.status).not.toBe("not_tested");
    expect(result.domains.some((d) => d.domain === "ASSET_SALES_PROCEEDS")).toBe(true);
  });

  it("refinancing runs secured debt incurrence + ratio tests", () => {
    const result = evaluateCoherentScenario(coherentRefinancing(500));
    expect(result.debtSimulation).not.toBeNull();
    expect(result.debtSimulation!.secured).toBe(true);
    expect(result.debtSimulation!.ratioTests.length).toBeGreaterThan(0);
    expect(result.packageLimitations.some((l) => /maturity/i.test(l))).toBe(true);
  });

  it("intercompany transfer fails closed as unsupported", () => {
    const result = evaluateCoherentScenario(coherentIntercompanyTransfer(25));
    expect(result.overallStatus).toBe("not_tested");
    const inv = result.domains.find((d) => d.domain === "INVESTMENTS_ACQUISITIONS");
    expect(inv?.support).toBe("UNSUPPORTED");
    expect(inv?.status).not.toBe("clear");
    expect(inv?.missingInputs.length).toBeGreaterThan(0);
  });

  it("PARTIAL lien / investment domains never report clear", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    const liens = result.domains.find((d) => d.domain === "LIENS_SECURED_CAPACITY");
    expect(liens?.support).toBe("PARTIAL");
    expect(liens?.status).not.toBe("clear");
    const inv = result.domains.find((d) => d.domain === "INVESTMENTS_ACQUISITIONS");
    expect(inv?.support).toBe("PARTIAL");
    expect(inv?.status).not.toBe("clear");
  });
});

describe("Matthews same evaluator", () => {
  it("refinancing against SSNL≤3.50x is blocked with $0 ratio room (above threshold)", () => {
    const result = evaluateMatthewsScenario(matthewsRefinancing(50));
    expect(result.contractualComputation.ebitdaDerivation?.kind).toBe("INDEPENDENTLY_DERIVED");
    expect(result.contractualComputation.contractualEbitda).toBeCloseTo(128.313, 3);
    expect(result.debtSimulation).not.toBeNull();
    const ratioRoom = result.contractualComputation.ratioTests.find(
      (r) => r.provisionCode === "ind_ratio_debt_secured",
    );
    expect(ratioRoom?.ratioDebtCapacityMillions).toBe(0);
    expect(result.overallStatus).toBe("blocked");
  });
});
