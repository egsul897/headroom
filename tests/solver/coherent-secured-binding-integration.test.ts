/**
 * Coherent package binding + certified-execution boundary (fixture-based).
 * MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.
 *
 * Uses prisma/seed-data COHERENT_DATA so expectations are independent of Neon
 * connectivity. Live DB coverage remains in other suites when available.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  type CompanyCovenantData,
} from "../../lib/covenant-engine";
import { COHERENT_DATA, COHERENT_INDENTURE_ID } from "../../prisma/seed-data";
import { VERIFIED_EXECUTION_POLICY } from "../../lib/contract-model/verified-execution";

function coherentFixture(): CompanyCovenantData {
  const fin = COHERENT_DATA.financials;
  return {
    companyId: COHERENT_DATA.companyId,
    documents: COHERENT_DATA.documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      capacityFormulas: d.capacityFormulas ?? null,
      rpWaterfall: "rpWaterfall" in d ? (d as { rpWaterfall?: unknown }).rpWaterfall ?? null : null,
      assetSale: "assetSale" in d ? (d as { assetSale?: unknown }).assetSale ?? null : null,
    })),
    provisions: COHERENT_DATA.provisions.map((p) => ({
      id: p.id,
      documentId: p.documentId,
      code: p.code,
      basketName: p.basketName,
      sectionRef: p.sectionRef,
      formulaType: p.formulaType,
      thresholdValue: p.thresholdValue,
      params: p.params ?? null,
      notes: null,
    })),
    financials: {
      ebitda: fin.ebitda,
      cash: fin.cash,
      interestExpense: fin.interestExpense,
      cumulativeNetIncome: fin.cumulativeNetIncome,
      equityProceedsSinceIssue: fin.equityProceedsSinceIssue,
      assumedNewDebtRatePct: fin.assumedNewDebtRatePct,
      totalDebt: fin.totalDebt,
      securedDebt: fin.securedDebt,
    },
    ledger: COHERENT_DATA.ledger.map((e) => ({
      basket: e.basket,
      amount: e.amount,
      direction: e.direction,
    })),
  } as CompanyCovenantData;
}

describe("Coherent secured binding integration (post-#237 + election remediation)", () => {
  it("1–2. MODELED package secured $4,041 / unsecured $5,129; authority layers labeled", () => {
    const data = coherentFixture();
    const pos = computeCovenantPosition(data);
    // No solver context → legacy/cross-document path (still proves package binding).
    const sec = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, true);
    const uns = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, false);

    expect(pos.crossDocumentSecured.capacity).toBeCloseTo(4041, 0);
    expect(pos.crossDocumentSecured.bindingDocumentId).toBe(COHERENT_INDENTURE_ID);
    expect(pos.crossDocumentSecured.bindingProvision?.code).toBe("mila_secured");
    expect(pos.crossDocumentUnsecured.capacity).toBeCloseTo(5129, 0);

    expect(sec.remainingCapacity).toBeCloseTo(4041, 0);
    expect(uns.remainingCapacity).toBeCloseTo(5129, 0);
    expect(sec.authorityLayers?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(sec.authorityLayers?.modeledCrossDocument).toBeCloseTo(4041, 0);
    expect(sec.authorityLayers?.publishedRemaining).toBeCloseTo(4041, 0);
    expect(sec.binding?.documentId).toBe(COHERENT_INDENTURE_ID);
  });

  it("19–20. Solver vs legacy discrepancy layers are separable (no cert masquerade)", () => {
    const data = coherentFixture();
    const pos = computeCovenantPosition(data);
    const sec = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, true);
    expect(sec.authorityLayers?.note).toMatch(/Phase-4 REQUIRE certified capacity/i);
    expect(sec.authorityLayers?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    // Without solver context, solverNativePackageMin is from legacy path mins.
    expect(sec.authorityLayers?.modeledCrossDocument).toBeCloseTo(4041, 0);
  });

  it("23. Immediately spent vs retained proceeds (hand-calc independent of engine helpers)", () => {
    const ebitda = 1700;
    const cash = 1162;
    const totalDebt = 3258;
    const securedDebt = 2221;
    const amount = 50;
    expect(4.25 * ebitda - (totalDebt + amount - cash)).toBe(5079);
    expect(3.0 * ebitda - (securedDebt + amount - cash)).toBe(3991);
    expect(4.25 * ebitda - (totalDebt + amount - (cash + amount))).toBe(5129);
    expect(3.0 * ebitda - (securedDebt + amount - (cash + amount))).toBe(4041);
  });

  it("certified boundary preserved: REQUIRE policy + sequential uses verified-execution only", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
    const seqSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/contract-model/sequential-execution.ts"),
      "utf8",
    );
    expect(seqSrc).toMatch(/evaluateVerifiedCapacity/);
    expect(seqSrc).toMatch(/simulateVerifiedTransaction/);
    expect(seqSrc).not.toMatch(/computeRemainingCapacityAfterDebtIncurrence/);
  });
});
