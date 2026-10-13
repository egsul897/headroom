/**
 * Contractual EBITDA derivation — Coherent (reported $1,700M) and Matthews
 * (definition-first $128.313M) on the same resolver, no company-id branches.
 */

import { describe, expect, it } from "vitest";
import {
  deriveContractualEbitdaFromEngineRun,
  mergeEbitdaDerivationWithEvidence,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  runFinancialCertificateEngine,
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
  MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP,
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
} from "@/lib/financial-certificate-engine";
import { computeContractualCovenantMetrics } from "@/lib/product/contractual-computation";
import { COHERENT_DATA } from "../../prisma/seed-data";
import type { CovenantProvisionInput, FinancialSnapshotInput } from "@/lib/covenant-engine";

describe("Coherent contractual EBITDA — reported $1,700M with supporting reconstruction", () => {
  it("does not claim independent derivation of the binding $1,700M", () => {
    const d = resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE);
    expect(d.kind).toBe("SUPPORTING_RECONSTRUCTION");
    expect(d.bindingContractualEbitdaMillions).toBe(1700);
    expect(d.componentSumMillions).toBeCloseTo(1694.14, 2);
    expect(COHERENT_EBITDA_EVIDENCE.methodologyIndependent).toBe(false);
    expect(d.methodologyDisclosure).toMatch(/NOT derived independently|not independently/i);
    expect(d.unresolvedAdjustments.some((u) => /1,700|1700/i.test(u))).toBe(true);
    expect(d.components).toHaveLength(10);
    // Each component has citation, period, approval
    for (const c of d.components) {
      expect(c.documentCitation.length).toBeGreaterThan(10);
      expect(c.measurementPeriod).toBeTruthy();
      expect(c.approvalStatus).toBe("VERIFIED_LINE_ITEM");
      expect(c.amountMissing).toBe(false);
    }
  });

  it("certificate engine alone yields REPORTED_ONLY (amount-less addbacks)", () => {
    const run = runFinancialCertificateEngine({
      companyId: "coherent",
      statement: {
        documentId: "s",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "c",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });
    const fromEngine = deriveContractualEbitdaFromEngineRun(run);
    expect(fromEngine.bindingContractualEbitdaMillions).toBe(1700);
    expect(fromEngine.kind).toBe("REPORTED_ONLY");
    expect(fromEngine.unresolvedAdjustments.some((u) => /without amount/i.test(u))).toBe(true);

    const merged = mergeEbitdaDerivationWithEvidence(fromEngine, COHERENT_EBITDA_EVIDENCE);
    expect(merged.kind).toBe("SUPPORTING_RECONSTRUCTION");
    expect(merged.bindingContractualEbitdaMillions).toBe(1700);
  });

  it("preserves Coherent ratio debt capacity when derivation is attached", () => {
    const derivation = resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE);
    const result = computeContractualCovenantMetrics({
      financials: COHERENT_DATA.financials as FinancialSnapshotInput,
      provisions: COHERENT_DATA.provisions as CovenantProvisionInput[],
      ebitdaDerivation: derivation,
    });
    expect(result.contractualEbitda).toBe(1700);
    expect(result.ebitdaDerivation?.kind).toBe("SUPPORTING_RECONSTRUCTION");
    expect(result.ratioCapacityIsGrossOnly).toBe(true);
    const tnl = result.ratioTests.find((r) => r.provisionCode === "ca_leverage_cap");
    expect(tnl?.ratioDebtCapacityMillions).toBeCloseTo(5129, 6);
  });
});

describe("Matthews contractual EBITDA — definition-first Indenture build-up", () => {
  it("independently derives $128.313M from Indenture components", () => {
    const d = resolveContractualEbitdaDerivation(MATTHEWS_EBITDA_EVIDENCE);
    expect(d.kind).toBe("INDEPENDENTLY_DERIVED");
    expect(d.bindingContractualEbitdaMillions).toBeCloseTo(128.313, 3);
    expect(d.componentSumMillions).toBeCloseTo(128.313, 3);
    expect(d.components).toHaveLength(7);
    expect(d.methodologyDisclosure).toMatch(/definition-first|defined-term text first/i);
    expect(d.bindingContractualEbitdaMillions).not.toBeCloseTo(
      MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.gaapEbitdaMillions,
      1,
    );
  });

  it("uses the same computeContractualCovenantMetrics path as Coherent", () => {
    const fin: FinancialSnapshotInput = {
      ebitda: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.consolidatedEbitdaMillions,
      cash: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.cashMillions,
      interestExpense: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.interestExpenseMillions,
      cumulativeNetIncome: -3.472,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 8.625,
      totalDebt: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.totalDebtMillions,
      securedDebt: MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.securedDebtMillions,
    };
    const derivation = resolveContractualEbitdaDerivation(MATTHEWS_EBITDA_EVIDENCE);
    const result = computeContractualCovenantMetrics({
      financials: fin,
      provisions: [
        {
          id: "1",
          documentId: "ind",
          code: "ind_ratio_debt_secured",
          basketName: "SSNL room",
          sectionRef: "Permitted Debt cl. (1)(b)(x)",
          formulaType: "LEVERAGE_RATIO_ROOM",
          thresholdValue: 3.5,
          params: { debtBasis: "secured" },
        },
      ],
      ebitdaDerivation: derivation,
    });
    expect(result.ebitdaDerivation?.kind).toBe("INDEPENDENTLY_DERIVED");
    expect(result.leverage.totalNetLeverage).toBeCloseTo(
      (fin.totalDebt - fin.cash) / fin.ebitda,
      6,
    );
    expect(result.ratioTests[0]?.ratioDebtCapacityMillions).toBe(0);
    expect(result.ratioCapacityIsGrossOnly).toBe(true);
  });

  it("certificate extraction still binds contractual not GAAP", () => {
    const run = runFinancialCertificateEngine({
      companyId: "matthews",
      statement: {
        documentId: "s",
        text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "c",
        text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2025-02-15T00:00:00Z"),
    });
    const fromEngine = deriveContractualEbitdaFromEngineRun(run);
    expect(fromEngine.bindingContractualEbitdaMillions).toBeCloseTo(128.313, 3);
    const merged = mergeEbitdaDerivationWithEvidence(fromEngine, MATTHEWS_EBITDA_EVIDENCE);
    expect(merged.kind).toBe("INDEPENDENTLY_DERIVED");
  });
});
