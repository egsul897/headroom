/**
 * Product vertical slice: contractual EBITDA + leverage via Phase 4A.
 * Must recompute Matthews 128.313 from components — never read covenantEbitda field.
 */
import { describe, expect, it } from "vitest";
import { computeContractualMetricsPure } from "@/lib/product/contractual-metrics/service";
import { MATTHEWS_EXPECTED_EBITDA_MILLIONS } from "@/lib/product/contractual-metrics/packages/matthews-indenture";
import { COHERENT_CERTIFICATE_EBITDA_MILLIONS } from "@/lib/product/contractual-metrics/packages/coherent-credit";

describe("contractual metrics vertical slice", () => {
  it("Matthews: executes Indenture Consolidated EBITDA from authentic components (= 128.313)", async () => {
    const bundle = await computeContractualMetricsPure("matthews");
    const ebitda = bundle.consolidatedEbitda!;
    expect(ebitda.definitionExecuted).toBe(true);
    expect(ebitda.status).toBe("CALCULATED");
    expect(ebitda.valueMillions).toBeCloseTo(MATTHEWS_EXPECTED_EBITDA_MILLIONS, 3);
    expect(ebitda.unsupportedMechanics.length).toBeGreaterThan(0);
    expect(ebitda.lineItems.some((l) => l.role === "UNSUPPORTED")).toBe(true);
    // Must not be a silent flat-field proxy
    expect(ebitda.formulaSummary).toMatch(/CNI/);
    expect(ebitda.evaluation?.status).toBe("EXECUTABLE");
  });

  it("Matthews: Total Net Leverage = (809.211 − 33.513) / 128.313", async () => {
    const bundle = await computeContractualMetricsPure("matthews");
    const tnl = bundle.totalNetLeverage!;
    expect(tnl.status).toBe("CALCULATED");
    const expected = (809.211 - 33.513) / MATTHEWS_EXPECTED_EBITDA_MILLIONS;
    expect(tnl.valueMillions).toBeCloseTo(expected, 3);
    expect(tnl.definitionExecuted).toBe(true);
  });

  it("Matthews: Secured Net Leverage and Interest Coverage also calculate", async () => {
    const bundle = await computeContractualMetricsPure("matthews");
    expect(bundle.securedNetLeverage?.status).toBe("CALCULATED");
    expect(bundle.securedNetLeverage!.valueMillions).toBeCloseTo((778.882 - 33.513) / MATTHEWS_EXPECTED_EBITDA_MILLIONS, 3);
    expect(bundle.interestCoverage?.status).toBe("CALCULATED");
    expect(bundle.interestCoverage!.valueMillions).toBeCloseTo(MATTHEWS_EXPECTED_EBITDA_MILLIONS / 54.64, 3);
  });

  it("Coherent: different package binds certificate EBITDA via IR (not FinancialSnapshot.ebitda read)", async () => {
    const bundle = await computeContractualMetricsPure("coherent");
    const ebitda = bundle.consolidatedEbitda!;
    expect(ebitda.status).toBe("CALCULATED");
    expect(ebitda.valueMillions).toBeCloseTo(COHERENT_CERTIFICATE_EBITDA_MILLIONS, 3);
    expect(ebitda.formulaSummary).toMatch(/Certificate/);
    expect(ebitda.unsupportedMechanics.some((u) => /add-back/i.test(u))).toBe(true);
    const tnl = bundle.totalNetLeverage!;
    expect(tnl.status).toBe("CALCULATED");
    expect(tnl.valueMillions).toBeCloseTo((3258 - 1162) / COHERENT_CERTIFICATE_EBITDA_MILLIONS, 3);
  });

  it("unknown company: NO_PACKAGE — does not invent EBITDA", async () => {
    const bundle = await computeContractualMetricsPure("unknown-issuer-xyz");
    expect(bundle.consolidatedEbitda?.status).toBe("NO_PACKAGE");
    expect(bundle.consolidatedEbitda?.valueMillions).toBeNull();
  });
});
