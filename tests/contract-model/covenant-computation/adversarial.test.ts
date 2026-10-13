/**
 * Adversarial checks: no interest-for-fixed-charges alias, no invented
 * first-lien or partial builder, no correction that outruns the clause.
 */
import { describe, expect, it } from "vitest";
import { metricInput, money, rationalFromString } from "@/lib/contract-model/definition-execution";
import {
  InMemoryLearningSink,
  matthewsCovenantPackage,
  runCovenantComputation,
  type ComputationPackage,
} from "@/lib/contract-model/covenant-computation";
import { evaluateBasket } from "@/lib/contract-model/covenant-computation/baskets";

function withoutFixedCharges(): ComputationPackage {
  const pkg = matthewsCovenantPackage();
  return {
    ...pkg,
    packageKey: "matthews-no-fixed-charges",
    documents: pkg.documents.map((doc) =>
      doc.role === "COMPLIANCE_CERTIFICATE"
        ? { ...doc, text: doc.text.replace(/Consolidated Fixed Charges: \$54\.640 million\n/, "") }
        : doc,
    ),
  };
}

describe("covenant computation adversarial", () => {
  it("does not alias interest expense into fixed charge coverage", () => {
    const book = runCovenantComputation(withoutFixedCharges(), { createdAt: "2026-10-13T00:00:00.000Z" });
    const fccr = book.ratios.find((r) => r.ratioKey === "FIXED_CHARGE_COVERAGE");
    const interest = book.ratios.find((r) => r.ratioKey === "INTEREST_COVERAGE");
    expect(fccr?.status).toBe("NEEDS_INPUT");
    expect(fccr?.canonical).toBeNull();
    expect(fccr?.missingInputs.join(" ")).toMatch(/Fixed Charges/i);
    expect(interest?.status).toBe("UNKNOWN");
    expect(interest?.canonical).toBeNull();
    expect(book.mistakes).toEqual([]);
  });

  it("refuses a correction that relabels a ratio basket as fixed-dollar", () => {
    const sink = new InMemoryLearningSink();
    const book = runCovenantComputation(matthewsCovenantPackage(), {
      sink,
      createdAt: "2026-10-13T00:00:00.000Z",
      corrections: [
        {
          stableKey: "matw-409a",
          field: "basket.category",
          corrected: "FIXED_DOLLAR",
          rationale: "treat the 2.00x test as a dollar cap",
          citationExcerpt: "Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00",
        },
      ],
    });
    expect(book.baskets.find((b) => b.stableKey === "matw-409a")?.category).toBe("RATIO_BASED");
    expect(book.correctionsRefused[0]?.reason).toMatch(/disagrees/);
    expect(sink.errors.some((e) => e.class === "CALCULATION_MISMATCH")).toBe(true);
    expect(sink.artifacts[0]?.state).toBe("PROPOSED");
  });

  it("does not call an unlimited-and-capped clause unlimited", () => {
    const pkg = miniPackage(
      "The Company may incur unlimited Indebtedness in an aggregate principal amount not to exceed $5,000,000.",
    );
    const book = runCovenantComputation(pkg, { createdAt: "2026-10-13T00:00:00.000Z" });
    expect(book.baskets[0]?.category).toBe("UNKNOWN");
    expect(book.baskets[0]?.capCanonical).toBeNull();
  });

  it("does not present a fixed greater-of limb when the metric currency differs", () => {
    const text = "additional Indebtedness not to exceed the greater of $100,000,000 and 10% of Total Assets.";
    const pkg = miniPackage(text);
    const metrics = [
      metricInput(
        "Total Assets",
        money(rationalFromString("1791.719"), "USD_MILLIONS", { exprId: null, inputKeys: ["Total Assets"] }),
        { source: pkg.documents[0]!.documentId, sourceVersion: null, note: "Total Assets: $1,791.719 million" },
      ),
    ];
    const basket = evaluateBasket(pkg, pkg.baskets[0]!, metrics, []);
    expect(basket.category).toBe("GROWER_GREATER_OF");
    expect(basket.capStatus).toBe("NEEDS_INPUT");
    expect(basket.capCanonical).toBeNull();
    expect(basket.missingInputs.join(" ")).toMatch(/currency alignment/);
  });

  it("evaluates a greater-of cap only when both limbs share a unit", () => {
    const text = "additional Indebtedness not to exceed the greater of $100,000,000 and 10% of Total Assets.";
    const pkg = miniPackage(text);
    const metrics = [
      metricInput(
        "Total Assets",
        money(rationalFromString("2000000000"), "USD", { exprId: null, inputKeys: ["Total Assets"] }),
        { source: pkg.documents[0]!.documentId, sourceVersion: null, note: "Total Assets: $2,000,000,000" },
      ),
    ];
    const basket = evaluateBasket(pkg, pkg.baskets[0]!, metrics, []);
    expect(basket.capStatus).toBe("COMPUTED");
    expect(basket.capCanonical).toBe("200000000");
    expect(basket.remainingStatus).toBe("NEEDS_INPUT");
  });

  it("does not sum a partial Available Amount", () => {
    const text = "Restricted Payments may be made in an amount equal to the sum of $50,000,000 and 50% of Consolidated Net Income.";
    const pkg = miniPackage(text);
    const book = runCovenantComputation(pkg, { createdAt: "2026-10-13T00:00:00.000Z" });
    expect(book.baskets[0]?.category).toBe("BUILDER_AVAILABLE_AMOUNT");
    expect(book.baskets[0]?.capCanonical).toBeNull();
    expect(book.baskets[0]?.missingInputs.join(" ")).toMatch(/Consolidated Net Income/);
  });

  it("types a reclassification as reclass and does not invent the transfer", () => {
    const pkg = miniPackage("The Company may reclassify Indebtedness incurred under clause (a) as incurred under clause (b).");
    const book = runCovenantComputation(pkg, { createdAt: "2026-10-13T00:00:00.000Z" });
    expect(book.baskets[0]?.category).toBe("RECLASS");
    expect(book.baskets[0]?.capStatus).toBe("NEEDS_INPUT");
    expect(book.baskets[0]?.capCanonical).toBeNull();
  });
});

function miniPackage(operativeText: string): ComputationPackage {
  return {
    packageKey: "adversarial-mini",
    companyId: "example",
    instrumentKey: "example-indenture",
    asOf: "2024-12-31",
    documents: [{ documentId: "example-indenture", role: "INDENTURE", text: operativeText }],
    baskets: [
      {
        stableKey: "ex-1",
        sectionRef: "§1",
        covenantFamily: "DEBT_INCURRENCE",
        documentId: "example-indenture",
        operativeText,
      },
    ],
  };
}
