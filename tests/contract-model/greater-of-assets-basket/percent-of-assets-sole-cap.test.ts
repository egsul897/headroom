import { describe, expect, it } from "vitest";
import {
  classifyGreaterOfAssetsBasket,
  compileGreaterOfAssetsBasket,
  evaluateGreaterOfCapacity,
  verifyGreaterOfLegalFidelity,
} from "../../../lib/contract-model/compiler/greater-of-assets-basket";

/** Authentic MTN Permitted Debt (k) — sole 5% of Total Assets (no fixed limb). */
const MTN_PERMITTED_DEBT_K =
  "Debt of the Restricted Companies in a maximum aggregate amount not to exceed 5% of Total Assets at any time for (i) Capital Lease obligations (excluding, for the avoidance of doubt, Capital Lease obligations permitted under clause (m) below), (ii) obligations to pay the deferred purchase price of property or services, and (iii) obligations under surety bonds or similar instruments;";

const FACILITY_DIFF =
  "Secured Debt in a maximum aggregate amount not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred;";

const GREATER_OF =
  "Indebtedness not to exceed the greater of (x) five percent (5%) of the Total Assets of the Borrower and (y) $75,000,000 at any time outstanding.";

const EBITDA_PCT =
  "Indebtedness in an aggregate amount not to exceed 5% of Consolidated EBITDA at any time outstanding.";

const NO_CAP_ROLE = "Investments equal to 5% of Total Assets of the Borrower.";

describe("percent-of-assets sole-cap (bounded generalization)", () => {
  it("FAILING-BEFORE shape: without sole-cap support this text is not a greater-of basket", () => {
    // Document the pre-improvement failure mode: greater-of requires "greater of" + fixed limb.
    // Sole percent must not be misclassified as greater-of with a fabricated fixed dollar.
    const c = classifyGreaterOfAssetsBasket(MTN_PERMITTED_DEBT_K);
    expect(c.class).not.toMatch(/^GREATER_OF_/);
    expect(c.fixedAmountUsd).toBeNull();
  });

  it("classifies authentic MTN Permitted Debt (k) as PERCENT_OF_ASSETS_SOLE_CAP with object gate", () => {
    const c = classifyGreaterOfAssetsBasket(MTN_PERMITTED_DEBT_K);
    expect(c.class).toBe("PERCENT_OF_ASSETS_SOLE_CAP_WITH_QUALITATIVE_GATES");
    expect(c.percentFraction).toBe(0.05);
    expect(c.metricName).toBe("Total Assets");
    expect(c.fixedAmountUsd).toBeNull();
    expect(c.residuals.some((r) => r.kind === "OBJECT_RESTRICTION")).toBe(true);
  });

  it("compiles + fidelity PASS; capacity needs Total Assets metric", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "clf-mtn",
      instrumentKey: "instrument:mtn",
      sourceDocumentId: "mtn-doc-a",
      candidateRef: "cand:permitted-debt-k",
      sourceSectionRef: "def:Permitted Debt(k)",
      operativeSourceText: MTN_PERMITTED_DEBT_K,
      action: "INCUR_DEBT",
      covenantFamily: "INDEBTEDNESS",
    });
    expect(compiled.executableClass).toBe("VERIFIED_EXECUTABLE_CANDIDATE");
    expect(compiled.rule).toBeTruthy();
    const fidelity = verifyGreaterOfLegalFidelity({
      operativeSourceText: MTN_PERMITTED_DEBT_K,
      rule: compiled.rule!,
    });
    expect(fidelity.verdict).toBe("PASS");

    const missing = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MTN_PERMITTED_DEBT_K,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: null,
    });
    expect(missing.outcomeLabel).toBe("NEEDS_METRIC_INPUT");

    const hypo = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MTN_PERMITTED_DEBT_K,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 10_000_000_000,
      qualitativeGates: { "qualitative_gate:object_restriction_satisfied": true },
    });
    expect(hypo.fidelity.verdict).toBe("PASS");
    expect(hypo.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(hypo.availableAmountUsd).toBe(500_000_000);

    const prod = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MTN_PERMITTED_DEBT_K,
      authorityMode: "PRODUCTION",
      totalAssetsUsd: 10_000_000_000,
    });
    expect(prod.outcomeLabel).toBe("PRODUCTION_CAPACITY_REFUSED");
  });

  it("adversarial negatives: facility-diff, EBITDA%, no cap-role, greater-of unchanged", () => {
    expect(classifyGreaterOfAssetsBasket(FACILITY_DIFF).class).toBe("NOT_GREATER_OF_ASSETS");
    expect(classifyGreaterOfAssetsBasket(EBITDA_PCT).class).toBe("NOT_GREATER_OF_ASSETS");
    expect(classifyGreaterOfAssetsBasket(NO_CAP_ROLE).class).toBe("NOT_GREATER_OF_ASSETS");
    const go = classifyGreaterOfAssetsBasket(GREATER_OF);
    expect(go.class).toMatch(/^GREATER_OF_/);
    expect(go.fixedAmountUsd).toBe(75_000_000);
    expect(go.percentFraction).toBe(0.05);
  });

  it("refuses sole-cap when a dollar amount is present (no silent hybrid)", () => {
    const hybrid =
      "Debt not to exceed 5% of Total Assets and in any event not more than $50,000,000 at any time outstanding.";
    const c = classifyGreaterOfAssetsBasket(hybrid);
    expect(c.class).toBe("NOT_GREATER_OF_ASSETS");
  });
});
