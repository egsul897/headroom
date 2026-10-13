/**
 * Adversarial gates: unresolved gains/impairment/caps, period mismatch,
 * and financial approval without contractual eligibility must stay INDICATIVE.
 */
import { describe, expect, it } from "vitest";
import {
  calculateContractualLeverage,
  calculateEbitdaBuildup,
  coherentTotalNetLeverageRequest,
  matthewsSecuredNetLeverageRequest,
  bindLineItemsToNs4Snapshots,
  COHERENT_CA_DEFINITIONS,
  COHERENT_FY2026_EBITDA_BUILDUP_SUM,
  COHERENT_FY2026_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
  MATTHEWS_INDENTURE_DEFINITIONS,
} from "@/lib/product/contractual-leverage";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import { money, rationalFromNumber } from "@/lib/contract-model/north-star-bridge";

describe("preserve indicative reconstructions", () => {
  it("Coherent public-filing reconstruction remains $1,694.140M INDICATIVE", () => {
    const r = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(r.ebitdaBuildup?.valueMillions).toBeCloseTo(COHERENT_FY2026_EBITDA_BUILDUP_SUM, 2);
    expect(r.computationAuthority).toBe("INDICATIVE");
    expect(r.contractualEligibility).not.toBe("DEFINITION_BOUND");
    expect(r.ebitdaBuildup?.numericalTrace.length).toBeGreaterThan(5);
    expect(r.ebitdaBuildup?.period).toBe("FY2026-2026-06-30");
  });

  it("Matthews $128.313M calculation remains INDICATIVE with trace", () => {
    const r = calculateContractualLeverage(matthewsSecuredNetLeverageRequest());
    expect(r.ebitdaBuildup?.valueMillions).toBeCloseTo(128.313, 3);
    expect(r.computationAuthority).toBe("INDICATIVE");
    expect(r.currentRatio).toBeCloseTo((778.882 - 33.513) / 128.313, 5);
  });
});

describe("adversarial — unresolved contractual adjustments", () => {
  it("unresolved gains keep contractualEligibility UNRESOLVED even with approved financial labels", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "coherent",
      instrumentKey: "coherent-credit-agreement",
      ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS.map((i) => ({
        ...i,
        authority: "APPROVED_PERIOD_MATCHED" as const,
      })),
      expectedPeriod: "FY2026-2026-06-30",
      evidenceSnapshotStatus: "REVIEW_REQUIRED",
      contractualEligibilityBound: true, // financial/legal claim — still blocked by unresolved gains
    });
    expect(buildup.status).toBe("COMPUTED");
    expect(buildup.unresolvedComponents.some((u) => /Gain subtraction/i.test(u))).toBe(true);
    expect(buildup.contractualEligibility).toBe("UNRESOLVED");
  });

  it("unresolved impairment keeps eligibility UNRESOLVED", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "coherent",
      instrumentKey: "ca",
      ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
      expectedPeriod: "FY2026-2026-06-30",
    });
    expect(buildup.unresolvedComponents.some((u) => /impairment/i.test(u))).toBe(true);
    expect(buildup.contractualEligibility).toBe("UNRESOLVED");
  });

  it("restructuring cap remains unresolved contractual eligibility", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "coherent",
      instrumentKey: "ca",
      ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
      expectedPeriod: "FY2026-2026-06-30",
    });
    expect(buildup.unresolvedComponents.some((u) => /15%|cap/i.test(u))).toBe(true);
    expect(buildup.heuristicClassification).toBe(true);
  });

  it("period mismatch fails closed — missing, not zero", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "coherent",
      instrumentKey: "ca",
      ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS.map((i) => ({
        ...i,
        period: "WRONG-PERIOD",
      })),
      expectedPeriod: "FY2026-2026-06-30",
    });
    expect(buildup.status).toBe("MISSING_INPUTS");
    expect(buildup.valueMillions).toBeNull();
    expect(buildup.missingRequirements.some((m) => /Period mismatch/i.test(m))).toBe(true);
    expect(buildup.unresolvedComponents.some((u) => /Period mismatch/i.test(u))).toBe(true);
  });
});

describe("adversarial — approval ≠ contractual eligibility", () => {
  it("approved financial authority alone never yields CONTRACTUAL_EXECUTABLE with unresolved adjustments", () => {
    const result = calculateContractualLeverage({
      ...coherentTotalNetLeverageRequest(),
      financialAuthority: "APPROVED_PERIOD_MATCHED",
      ebitdaLineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS.map((i) => ({
        ...i,
        authority: "APPROVED_PERIOD_MATCHED" as const,
      })),
      contractualEligibilityBound: true,
    });
    expect(result.status).toBe("COMPUTED");
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.contractualEligibility).toBe("UNRESOLVED");
    expect(result.limitations.some((l) => /Financial approval alone never grants/i.test(l))).toBe(true);
  });

  it("heuristic classification stays PROVISIONAL_HEURISTIC when no unresolved and not bound", () => {
    // Matthews clean schedule — no gains/impairment/cap vs definition that names non-cash
    const buildup = calculateEbitdaBuildup({
      companyId: "matthews",
      instrumentKey: "ind",
      ebitdaDefinition: MATTHEWS_INDENTURE_DEFINITIONS[0]!,
      lineItems: MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
      expectedPeriod: "TTM-2024-12-31",
      contractualEligibilityBound: false,
    });
    // Still NOT_APPROVED financially → unresolved; if we only care heuristic flag:
    expect(buildup.heuristicClassification).toBe(true);
    expect(buildup.limitations.some((l) => /HEURISTIC_KEYWORD/i.test(l))).toBe(true);
  });

  it("NS-4 bind leaves missing components missing (not zero)", () => {
    const snap: FinancialSnapshot = {
      snapshotId: "ns4:coherent:test",
      version: "1",
      companyId: "coherent",
      asOf: "2026-06-30",
      reportingPeriod: "FY2026-2026-06-30",
      status: "APPROVED",
      supersedesSnapshotId: null,
      inputs: [
        {
          identity: {
            companyId: "coherent",
            scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
            inputKind: "METRIC",
            key: "cni",
            identityStrength: "CONTRACT_NAME_ONLY",
            period: { kind: "EXACT_PERIOD_ID", periodId: "FY2026-2026-06-30" },
            asOf: { kind: "EXACT_DATE", isoDate: "2026-06-30" },
            valueType: "MONEY",
            currency: "USD",
          },
          value: money(rationalFromNumber(804.998), "USD", { exprId: null, inputKeys: ["cni"] }),
          sourceVersion: "test",
        },
      ],
      provenance: { source: "test", sourceVersion: "1" },
      review: { reviewedBy: "t", reviewedAt: "2026-06-30", approvalRef: "t" },
    };
    const { bound, missingKeys, ns4SnapshotId } = bindLineItemsToNs4Snapshots({
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
      snapshots: [snap],
    });
    expect(ns4SnapshotId).toBe("ns4:coherent:test");
    expect(bound.find((b) => b.key === "cni")?.ns4SnapshotId).toBe("ns4:coherent:test");
    expect(missingKeys.length).toBeGreaterThan(0);
    expect(missingKeys).toContain("interest");
    // Unbound amounts unchanged — not zeroed
    expect(bound.find((b) => b.key === "interest")?.amountMillions).toBe(190.267);
    expect(bound.find((b) => b.key === "interest")?.ns4SnapshotId).toBeNull();
  });
});

describe("product modules do not import runtime/*", () => {
  it("contractual-leverage source files import north-star-bridge instead of runtime", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "lib/product/contractual-leverage");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from ["']@\/lib\/contract-model\/runtime/);
    }
  });
});
