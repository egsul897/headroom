/**
 * Canonical multi-covenant package workflow — Coherent + Matthews on one path.
 * packagePermitted requires every applicable domain EXECUTABLE+clear (fail-closed).
 */

import { describe, expect, it } from "vitest";
import {
  executePackageTransaction,
  PACKAGE_TRANSACTION_EXECUTION_VERSION,
} from "@/lib/product/package-transaction-execution";
import {
  coherentDebtFundedAcquisition,
  coherentDividend,
  coherentIntercompanyTransfer,
  coherentPackageData,
  coherentRefinancing,
  matthewsMinimalPackageData,
  matthewsRefinancing,
} from "@/lib/product/cross-domain-scenarios";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";
import { covenantDomainCoverage } from "@/lib/product/cross-domain-transaction";

describe("covenant domain coverage — mandate inventory", () => {
  it("covers twelve mandate domains + composition without false EXECUTABLE", () => {
    const rows = covenantDomainCoverage();
    const mandate = new Set([
      "DEBT_INCURRENCE_REFINANCING",
      "LIENS_SECURED_CAPACITY",
      "RESTRICTED_PAYMENTS_BUILDER",
      "INVESTMENTS_ACQUISITIONS",
      "ASSET_SALES_PROCEEDS",
      "AFFILIATE_TRANSACTIONS",
      "GUARANTEES",
      "FINANCIAL_COVENANTS_RATIO_CAPACITY",
      "SUBSIDIARY_DESIGNATION_STRUCTURAL",
      "CROSS_DOCUMENT_SHARED_CAPACITY",
      "AMENDMENT_VERSION_EFFECTIVE_DATE",
      "LEDGER_UTILIZATION_RECLASSIFICATION",
    ]);
    for (const d of mandate) {
      expect(rows.some((r) => r.domain === d)).toBe(true);
    }
    // Honest audit: no EXECUTABLE without package-wide authentic clearance.
    expect(rows.every((r) => r.support !== "EXECUTABLE")).toBe(true);
    expect(rows.some((r) => r.support === "UNSUPPORTED")).toBe(true);
    expect(rows.some((r) => r.domain === "MULTI_CONDITION_SIMULATION")).toBe(true);
  });
});

describe("executePackageTransaction — 10-step workflow", () => {
  it("debt-funded acquisition returns all ten steps and never packagePermitted today", () => {
    const data = coherentPackageData();
    const result = executePackageTransaction({
      packageIdentity: {
        companyId: data.companyId,
        evaluationDate: "2026-06-30",
        documentIds: data.documents.map((d) => d.id),
      },
      data,
      transaction: coherentDebtFundedAcquisition(150),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      utilizationAuthority: null,
    });

    expect(result.version).toBe(PACKAGE_TRANSACTION_EXECUTION_VERSION);
    expect(result.steps).toHaveLength(10);
    expect(result.steps.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.applicableDomains).toContain("DEBT_INCURRENCE_REFINANCING");
    expect(result.applicableDomains).toContain("INVESTMENTS_ACQUISITIONS");
    expect(result.applicableDomains).toContain("GUARANTEES");
    expect(result.irrelevantDomains).toContain("AFFILIATE_TRANSACTIONS");
    expect(result.packagePermitted).toBe(false);
    expect(result.hypotheticalPostState.postsToLedger).toBe(false);
    expect(result.hypotheticalPostState.authority).toBe("HYPOTHETICAL");
    expect(result.evaluation.debtSimulation).not.toBeNull();
    expect(result.evaluation.rpSimulation?.kind).toBe("investment");
    for (const d of result.evaluation.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
    expect(result.unresolvedBlockers.length).toBeGreaterThan(0);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.trace.some((t) => /package-transaction-execution/.test(t))).toBe(true);
  });

  it("one clear domain never yields packagePermitted", () => {
    const data = coherentPackageData();
    const result = executePackageTransaction({
      packageIdentity: { companyId: data.companyId, evaluationDate: "2026-06-30" },
      data,
      transaction: coherentDividend(10),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    // RP may clear mathematically while affiliate/ledger remain PARTIAL/UNSUPPORTED.
    expect(result.packagePermitted).toBe(false);
    expect(result.overallStatus).not.toBe("clear");
  });

  it("intercompany transfer fails closed with unsupported applicable domains", () => {
    const data = coherentPackageData();
    const result = executePackageTransaction({
      packageIdentity: { companyId: data.companyId, evaluationDate: "2026-06-30" },
      data,
      transaction: coherentIntercompanyTransfer(25),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    expect(result.overallStatus).toBe("not_tested");
    expect(result.packagePermitted).toBe(false);
    expect(result.applicableDomains).toContain("AFFILIATE_TRANSACTIONS");
    expect(result.applicableDomains).toContain("SUBSIDIARY_DESIGNATION_STRUCTURAL");
    expect(
      result.unresolvedBlockers.some((b) => /AFFILIATE_TRANSACTIONS|SUBSIDIARY/i.test(b)),
    ).toBe(true);
  });

  it("Matthews refinancing uses same workflow and blocks above ratio room", () => {
    const data = matthewsMinimalPackageData();
    const result = executePackageTransaction({
      packageIdentity: { companyId: data.companyId, evaluationDate: "2025-03-31" },
      data,
      transaction: matthewsRefinancing(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(MATTHEWS_EBITDA_EVIDENCE),
    });
    expect(result.evaluation.overallStatus).toBe("blocked");
    expect(result.packagePermitted).toBe(false);
    expect(result.steps[0]!.status).toBe("OK");
  });

  it("refuses company identity mismatch", () => {
    const data = coherentPackageData();
    const result = executePackageTransaction({
      packageIdentity: { companyId: "wrong-company", evaluationDate: "2026-06-30" },
      data,
      transaction: coherentRefinancing(100),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    expect(result.steps[0]!.status).toBe("REFUSED");
    expect(result.overallStatus).toBe("review_required");
    expect(result.packagePermitted).toBe(false);
  });
});
