/**
 * Approved FCE inputs → authentic provision capacity.
 * Gross reported separately; remaining refused without attributed utilization.
 */

import { describe, expect, it } from "vitest";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "@/lib/covenant-engine";
import {
  toAuthenticCapacityRow,
  buildSharedFinancialViewFromEngineRun,
  runFinancialCertificateEngine,
  SHARED_FINANCIAL_SURFACES,
  financialStateForSurfaces,
} from "@/lib/financial-certificate-engine";
import {
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
} from "@/lib/financial-certificate-engine/fixtures";

function provision(over: Partial<CovenantProvisionInput> & Pick<CovenantProvisionInput, "code" | "formulaType" | "thresholdValue">): CovenantProvisionInput {
  return {
    id: over.id ?? `id-${over.code}`,
    documentId: over.documentId ?? "doc-1",
    code: over.code,
    basketName: over.basketName ?? over.code,
    sectionRef: over.sectionRef ?? "§Test",
    formulaType: over.formulaType,
    thresholdValue: over.thresholdValue,
    params: over.params ?? null,
  };
}

describe("authentic capacity bridge (gross vs remaining)", () => {
  const fin: FinancialSnapshotInput = {
    ebitda: 1700,
    cash: 1162,
    interestExpense: 190,
    cumulativeNetIncome: 520,
    equityProceedsSinceIssue: 2150,
    assumedNewDebtRatePct: 6.5,
    totalDebt: 3258,
    securedDebt: 2221,
  };
  const metrics = computeLeverageMetrics(fin);

  it("reports gross capacity and refuses remaining without attributed utilization", () => {
    const p = provision({
      code: "general_debt",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 530,
      params: { pctEbitda: 0.4 },
    });
    const evaluated = evaluateProvision(p, fin, metrics);
    expect(evaluated.status).toBe("modeled");
    expect(evaluated.capacity).toBe(Math.max(530, 0.4 * 1700));

    const row = toAuthenticCapacityRow(p, evaluated, false, null);
    expect(row.grossCapacityMillions).toBe(Math.max(530, 680));
    expect(row.remainingCapacityMillions).toBeNull();
    expect(row.utilizationAttributed).toBe(false);
    expect(row.utilizationNote).toMatch(
      /remaining not supported|completeness certificate|never defaulted to zero|UNKNOWN/i,
    );
  });

  it("applies remaining only when utilization is attributed AND completeness-certified", () => {
    const p = provision({
      code: "flat_basket",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 100,
    });
    const evaluated = evaluateProvision(p, fin, metrics);
    const withUtilNoCert = toAuthenticCapacityRow(p, evaluated, true, 25);
    expect(withUtilNoCert.grossCapacityMillions).toBe(100);
    expect(withUtilNoCert.remainingCapacityMillions).toBeNull();

    const withCert = toAuthenticCapacityRow(p, evaluated, true, 25, {
      asOf: "2026-06-30",
      completenessCertificate: {
        capacityRuleId: "flat_basket",
        asOf: "2026-06-30",
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        sourceLabel: "test completeness",
      },
    });
    expect(withCert.remainingCapacityMillions).toBe(75);

    const without = toAuthenticCapacityRow(p, evaluated, false, 25);
    expect(without.remainingCapacityMillions).toBeNull();
  });

  it("does not treat unattributed remaining=gross as a favorable claim", () => {
    const p = provision({ code: "x", formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const evaluated = evaluateProvision(p, fin, metrics);
    const row = toAuthenticCapacityRow(p, evaluated, false, null);
    // Incorrect favorable outcome would set remaining === gross here.
    expect(row.remainingCapacityMillions).not.toBe(row.grossCapacityMillions);
  });

  it("leverage-ratio room uses approved contractual EBITDA (not GAAP)", () => {
    const p = provision({
      code: "ratio_debt",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4.25,
      params: { debtBasis: "total" },
    });
    const evaluated = evaluateProvision(p, fin, metrics);
    const expected = Math.max(0, 4.25 * 1700 - (3258 - 1162));
    expect(evaluated.capacity).toBeCloseTo(expected, 6);
    const row = toAuthenticCapacityRow(p, evaluated, false, null);
    expect(row.grossCapacityMillions).toBeCloseTo(expected, 6);
    expect(row.remainingCapacityMillions).toBeNull();
  });
});

describe("Position / Simulate / Ask shared financial view", () => {
  it("exposes as-of, source period, approval status, assumptions, missing inputs on all three surfaces", () => {
    const run = runFinancialCertificateEngine({
      companyId: "view-co",
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
    const view = buildSharedFinancialViewFromEngineRun(run);
    expect(view.surfaces).toEqual(["position", "simulate", "ask"]);
    expect(view.surfaces).toEqual([...SHARED_FINANCIAL_SURFACES]);
    expect(view.asOfDate).toBe("2026-06-30");
    expect(view.sourcePeriod).toBeTruthy();
    expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(view.approvalStatus);
    expect(view.authoritative).toBe(false);
    expect(view.contractualEbitda).toBe(1700);
    expect(Array.isArray(view.assumptions)).toBe(true);
    expect(Array.isArray(view.missingInputs)).toBe(true);
    expect(view.derivedMetrics.length).toBeGreaterThan(0);

    const forSurfaces = financialStateForSurfaces({
      verified: null,
      engineRun: run,
      stateId: "view-state",
      companyId: "view-co",
    });
    expect(forSurfaces.status).toBe("NOT_AUTHORITATIVE");
    expect(forSurfaces.view.surfaces).toEqual(["position", "simulate", "ask"]);
  });
});
