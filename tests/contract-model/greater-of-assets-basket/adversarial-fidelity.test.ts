import { describe, expect, it } from "vitest";
import {
  classifyGreaterOfAssetsBasket,
  compileGreaterOfAssetsBasket,
  detectMutualSharedCapacity,
  evaluateGreaterOfCapacity,
  verifyGreaterOfLegalFidelity,
} from "../../../lib/contract-model/compiler/greater-of-assets-basket";

const TEXT =
  "additional Indebtedness shall not exceed the greater of (i) ten percent (10%) of the Total Consolidated Assets of the Company and its Restricted Subsidiaries as of the last day of the fiscal quarter or fiscal year immediately preceding such date of incurrence and (ii) $1,500,000,000; provided , that such Indebtedness is incurred by Restricted Subsidiaries;";

describe("greater-of adversarial fidelity", () => {
  it("tampered fixed limb fails fidelity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:t",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    expect(compiled.rule).not.toBeNull();
    const cap = compiled.rule!.capacityExpression as { kind: string; then?: unknown; operands?: unknown[] };
    // Walk to MAX and bump money limb.
    function bump(expr: unknown): unknown {
      if (!expr || typeof expr !== "object") return expr;
      const e = expr as Record<string, unknown>;
      if (e.kind === "MONEY" && e.amount === 1_500_000_000) return { ...e, amount: 9_999_000_000 };
      if (e.kind === "IF") return { ...e, then: bump(e.then), else: bump(e.else) };
      if (Array.isArray(e.operands)) return { ...e, operands: e.operands.map(bump) };
      return e;
    }
    const tampered = { ...compiled.rule!, capacityExpression: bump(cap) as typeof compiled.rule.capacityExpression };
    const fidelity = verifyGreaterOfLegalFidelity({ operativeSourceText: TEXT, rule: tampered });
    expect(fidelity.verdict).toBe("FAIL");
    expect(fidelity.findings.some((f) => f.code === "FIXED_LIMB_MISMATCH")).toBe(true);
  });

  it("wrong metric name fails fidelity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:m",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    function rewriteMetric(expr: unknown): unknown {
      if (!expr || typeof expr !== "object") return expr;
      const e = expr as Record<string, unknown>;
      if (e.kind === "METRIC_REFERENCE") return { ...e, metricName: "EBITDA" };
      if (e.kind === "IF") return { ...e, then: rewriteMetric(e.then), else: rewriteMetric(e.else) };
      if (Array.isArray(e.operands)) return { ...e, operands: e.operands.map(rewriteMetric) };
      return e;
    }
    const tampered = {
      ...compiled.rule!,
      capacityExpression: rewriteMetric(compiled.rule!.capacityExpression) as typeof compiled.rule.capacityExpression,
    };
    const fidelity = verifyGreaterOfLegalFidelity({ operativeSourceText: TEXT, rule: tampered });
    expect(fidelity.verdict).toBe("FAIL");
    expect(fidelity.findings.some((f) => f.code === "METRIC_MISMATCH")).toBe(true);
  });

  it("facility-difference remains UNSUPPORTED", () => {
    const text =
      "Secured Debt not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred";
    expect(classifyGreaterOfAssetsBasket(text).class).toBe("NOT_GREATER_OF_ASSETS");
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:fd",
      sourceSectionRef: "def:Permitted Debt(l)",
      operativeSourceText: text,
    });
    expect(compiled.executableClass).toBe("UNSUPPORTED");
    expect(compiled.rule).toBeNull();
  });

  it("false qualitative gate does not affirm capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:q",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const falseGate = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000,
      qualitativeGates: { "qualitative_gate:proviso_satisfied": false },
    });
    expect(falseGate.availableAmountUsd === 0 || falseGate.outcomeLabel !== "VERIFIED_EXECUTABLE").toBe(true);
  });

  it("currency mismatch on metric input does not silently affirm USD capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:fx",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const eur = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000,
      metricCurrency: "EUR",
    });
    expect(eur.outcomeLabel).toBe("NEEDS_METRIC_INPUT");
    expect(eur.availableAmountUsd).toBeNull();
  });

  it("stale or unauthenticated financial evidence refuses affirmative capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:stale",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const stale = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000,
      financialEvidenceMode: "STALE_OR_UNAUTHENTICATED",
    });
    expect(stale.outcomeLabel).not.toBe("VERIFIED_EXECUTABLE");
    expect(stale.availableAmountUsd).toBeNull();
  });

  it("entity-scope mismatch refuses affirmative capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:scope",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const mismatch = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000,
      metricEntityScope: "Unrestricted Subsidiaries only",
    });
    expect(mismatch.outcomeLabel).toBe("FAILED");
    expect(mismatch.availableAmountUsd).toBeNull();
  });

  it("amendment/version ambiguity refuses affirmative capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:ver",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const ambiguous = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000,
      sourceVersionId: "credit-agreement-amended-2025",
      expectedSourceVersionId: "credit-agreement-original-2024",
    });
    expect(ambiguous.outcomeLabel).toBe("FAILED");
    expect(ambiguous.availableAmountUsd).toBeNull();
  });

  it("one-way cross-reference alone does not invent shared capacity", () => {
    const oneWay = detectMutualSharedCapacity({
      textA: "Liens not to exceed the greater of (A) 10% of Total Assets and (B) $100; see also Section 7.03(g).",
      refA: "7.01(u)",
      textB: "Indebtedness not to exceed the greater of (i) 10% of Total Assets and (ii) $100.",
      refB: "7.03(g)",
    });
    expect(oneWay.shared).toBe(false);
  });

  it("deterministic replay yields identical available amount", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "adv",
      instrumentKey: "instrument:adv",
      sourceDocumentId: "adv",
      candidateRef: "cand:r",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: TEXT,
    });
    const a = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 12_000_000_000,
      asOf: "2026-06-30",
    });
    const b = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: TEXT,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 12_000_000_000,
      asOf: "2026-06-30",
    });
    expect(a.availableAmountUsd).toBe(b.availableAmountUsd);
    expect(a.outcomeLabel).toBe(b.outcomeLabel);
  });
});
