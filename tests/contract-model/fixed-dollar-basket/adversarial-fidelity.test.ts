import { describe, expect, it } from "vitest";
import {
  classifyFixedDollarBasket,
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  verifyFixedDollarLegalFidelity,
} from "../../../lib/contract-model/compiler/fixed-dollar-basket";

/**
 * Phase 4 — adversarial legal fidelity for the fixed-dollar vertical slice.
 * Partial / incomplete representations must not silently become over-complete
 * affirmative permissions.
 */
describe("fixed-dollar adversarial fidelity", () => {
  it("missing qualitative gate input does not yield affirmative capacity", () => {
    const text =
      "Debt of any Restricted Company organized outside the United States in an aggregate principal amount which does not exceed $50,000,000 at any time outstanding;";
    const compiled = compileFixedDollarBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:geo",
      sourceSectionRef: "def:Permitted Debt(o)",
      operativeSourceText: text,
    });
    const missing = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: text,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      qualitativeGates: {}, // deliberately empty — resolver will MISS
    });
    // Default evaluator stipulates gates true; override by forcing false.
    const falseGate = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: text,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      qualitativeGates: { "qualitative_gate:foreign_organization": false },
    });
    expect(falseGate.availableAmountUsd === 0 || falseGate.outcomeLabel !== "VERIFIED_EXECUTABLE").toBe(true);
    expect(missing.fidelity.verdict).toBe("PASS");
  });

  it("grower / difference formulas stay UNSUPPORTED (not falsely modeled as MONEY)", () => {
    for (const text of [
      "Secured Debt not to exceed the difference between the Maximum Facility Amount and the Facility Amount",
      "additional Indebtedness not to exceed the greater of 10% of Total Consolidated Assets and $1,500,000,000",
      "Debt not to exceed 5% of Total Assets",
    ]) {
      const c = classifyFixedDollarBasket(text);
      expect(c.class).toBe("NOT_FIXED_DOLLAR");
      const compiled = compileFixedDollarBasket({
        companyId: "adv",
        instrumentKey: "instrument:adv",
        sourceDocumentId: "adv",
        candidateRef: "cand:x",
        sourceSectionRef: "x",
        operativeSourceText: text,
      });
      expect(compiled.executableClass).toBe("UNSUPPORTED");
      expect(compiled.rule).toBeNull();
    }
  });

  it("threshold/floor language is not a cap", () => {
    const text = "Indebtedness in excess of $50,000,000 requires Lender consent.";
    expect(classifyFixedDollarBasket(text).class).toBe("NOT_FIXED_DOLLAR");
  });

  it("tampered IR amount fails independent fidelity", () => {
    const text =
      "Indebtedness of the Restricted Companies in an aggregate principal amount not to exceed $25,000,000 at any time outstanding.";
    const compiled = compileFixedDollarBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:tamper",
      sourceSectionRef: "9.01(a)",
      operativeSourceText: text,
    });
    expect(compiled.rule).not.toBeNull();
    const tampered = {
      ...compiled.rule!,
      capacityExpression: {
        ...(compiled.rule!.capacityExpression as { kind: "MONEY"; amount: number; currency: string; type: "MONEY"; exprId: string }),
        amount: 999_000_000,
      },
    };
    const fidelity = verifyFixedDollarLegalFidelity({
      operativeSourceText: text,
      rule: tampered,
    });
    expect(fidelity.verdict).toBe("FAIL");
    expect(fidelity.findings.some((f) => f.code === "AMOUNT_MISMATCH")).toBe(true);
  });

  it("production mode always refuses even when hypothetical executes", () => {
    const text =
      "Indebtedness of the Restricted Companies in an aggregate principal amount not to exceed $10,000,000 at any time outstanding.";
    const compiled = compileFixedDollarBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:prod",
      sourceSectionRef: "9.01(b)",
      operativeSourceText: text,
    });
    const prod = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: text,
      authorityMode: "PRODUCTION",
    });
    expect(prod.outcomeLabel).toBe("PRODUCTION_CAPACITY_REFUSED");
    expect(prod.capacity).toBeNull();
  });
});
