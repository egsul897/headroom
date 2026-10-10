import { describe, expect, it } from "vitest";
import {
  classifyFixedDollarBasket,
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  verifyFixedDollarLegalFidelity,
} from "../../../lib/contract-model/compiler/fixed-dollar-basket";

const SOLE_CAP =
  "Indebtedness of the Restricted Companies in an aggregate principal amount not to exceed $25,000,000 at any time outstanding.";

const MTN_O =
  "Debt of any Restricted Company organized outside the United States in an aggregate principal amount which does not exceed $50,000,000 at any time outstanding; and";

const GROWER =
  "Debt not to exceed the greater of $50,000,000 and 5% of Total Assets.";

const THRESHOLD_FLOOR = "Indebtedness in excess of $50,000,000 shall require consent.";

describe("fixed-dollar-basket vertical slice", () => {
  it("classifies sole-cap vs gated vs unsupported", () => {
    expect(classifyFixedDollarBasket(SOLE_CAP).class).toBe("FIXED_DOLLAR_SOLE_CAP");
    expect(classifyFixedDollarBasket(SOLE_CAP).amountUsd).toBe(25_000_000);
    const gated = classifyFixedDollarBasket(MTN_O);
    expect(gated.class).toBe("FIXED_DOLLAR_WITH_QUALITATIVE_GATES");
    expect(gated.amountUsd).toBe(50_000_000);
    expect(gated.residuals.some((r) => r.kind === "GEOGRAPHIC_SCOPE")).toBe(true);
    expect(classifyFixedDollarBasket(GROWER).class).toBe("NOT_FIXED_DOLLAR");
    expect(classifyFixedDollarBasket(THRESHOLD_FLOOR).class).toBe("NOT_FIXED_DOLLAR");
  });

  it("compiles sole-cap through normalizeSubmission into COMPLETE MONEY IR", () => {
    const compiled = compileFixedDollarBasket({
      companyId: "acme-co",
      instrumentKey: "instrument:acme",
      sourceDocumentId: "acme-doc",
      candidateRef: "cand:sole",
      sourceSectionRef: "def:Permitted Widget Debt(e)",
      operativeSourceText: SOLE_CAP,
    });
    expect(compiled.executableClass).toBe("VERIFIED_EXECUTABLE_CANDIDATE");
    expect(compiled.rule?.sufficiency).toBe("COMPLETE");
    expect(compiled.rule?.capacityExpression?.kind).toBe("MONEY");
    const fidelity = verifyFixedDollarLegalFidelity({
      operativeSourceText: SOLE_CAP,
      rule: compiled.rule!,
    });
    expect(fidelity.verdict).toBe("PASS");
  });

  it("MTN (o)-style foreign basket encodes geographic gate (no silent overclaim)", () => {
    const compiled = compileFixedDollarBasket({
      companyId: "product-proof-002-mtn",
      instrumentKey: "instrument:mtn-doc-a",
      sourceDocumentId: "mtn-doc-a",
      candidateRef: "cand:debt-o",
      sourceSectionRef: "def:Permitted Debt(o)",
      operativeSourceText: MTN_O,
    });
    expect(compiled.executableClass).toBe("VERIFIED_EXECUTABLE_CANDIDATE");
    expect(compiled.rule?.capacityExpression?.kind).toBe("IF");
    const fidelity = verifyFixedDollarLegalFidelity({
      operativeSourceText: MTN_O,
      rule: compiled.rule!,
    });
    expect(fidelity.verdict).toBe("PASS");
  });

  it("evaluates stipulated hypothetical capacity and refuses production capacity", () => {
    const compiled = compileFixedDollarBasket({
      companyId: "product-proof-002-mtn",
      instrumentKey: "instrument:mtn-doc-a",
      sourceDocumentId: "mtn-doc-a",
      candidateRef: "cand:debt-o",
      sourceSectionRef: "def:Permitted Debt(o)",
      operativeSourceText: MTN_O,
    });

    const hypo = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: MTN_O,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
    });
    expect(hypo.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(hypo.availableAmountUsd).toBe(50_000_000);
    expect(hypo.capacity?.outcome).toBe("EXECUTED");

    const missingGate = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: MTN_O,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      qualitativeGates: { "qualitative_gate:foreign_organization": false },
    });
    // Gate false → else branch $0 (not a false affirmative for foreign debt).
    expect(missingGate.availableAmountUsd === 0 || missingGate.outcomeLabel === "PARTIAL").toBe(true);

    const prod = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: MTN_O,
      authorityMode: "PRODUCTION",
    });
    expect(prod.outcomeLabel).toBe("PRODUCTION_CAPACITY_REFUSED");
    expect(prod.productionRefusal).toMatch(/PRODUCTION_CAPACITY_REFUSED/);
  });

  it("refuses COMPLETE claim when figure is a floor/threshold not a cap", () => {
    const compiled = compileFixedDollarBasket({
      companyId: "x",
      instrumentKey: "instrument:x",
      sourceDocumentId: "x",
      candidateRef: "cand:floor",
      sourceSectionRef: "9.01(z)",
      operativeSourceText: THRESHOLD_FLOOR,
    });
    expect(compiled.executableClass).toBe("UNSUPPORTED");
    expect(compiled.rule).toBeNull();
  });

  it("is reusable on Acme sole-cap (issuer-agnostic; no MTN hardcoding)", () => {
    const acme =
      "Debt of Restricted Subsidiaries in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.";
    const compiled = compileFixedDollarBasket({
      companyId: "acme",
      instrumentKey: "instrument:acme",
      sourceDocumentId: "acme",
      candidateRef: "cand:acme-e",
      sourceSectionRef: "def:Permitted Widget Debt(e)",
      operativeSourceText: acme,
    });
    const evald = evaluateFixedDollarCapacity({
      compile: compiled,
      operativeSourceText: acme,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
    });
    expect(evald.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(evald.availableAmountUsd).toBe(50_000_000);
    expect(JSON.stringify(compiled.rule)).not.toMatch(/\b(MTN|Vail|Mohawk|MHK|CONMED)\b/i);
  });
});
