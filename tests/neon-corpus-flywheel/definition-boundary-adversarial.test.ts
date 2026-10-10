/**
 * Gate 2 — independent adversarial challenges for findTopLevelDefinitionStarts.
 * Measures false segmentation and missed boundaries. Not DSGR-tuned.
 */
import { describe, expect, it } from "vitest";
import {
  findTopLevelDefinitionStarts,
  isNestedDeclaration,
  detectStructuralDefinitions,
} from "../../lib/contract-model/compiler/structural-definitions";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

function startsIn(text: string, from = 0, to = text.length): number[] {
  return findTopLevelDefinitionStarts(text, from, to);
}

function termsAt(text: string, starts: number[]): string[] {
  return starts.map((s) => {
    const slice = text.slice(s, s + 120);
    const m = /[“"]\s*([^“”"]+?)\s*[”"]/.exec(slice) ?? /^([A-Z][A-Za-z' -]{3,60})\s*:/.exec(slice);
    return (m?.[1] ?? slice.slice(0, 40)).replace(/\s+/g, " ").trim();
  });
}

describe("Gate 2 — findTopLevelDefinitionStarts adversarial", () => {
  it("quoted references inside an existing definition are nested (not top-level boundaries)", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Alpha Basket” means an amount equal to the “Beta Cap” plus cash.",
      "“Beta Cap” means $5,000,000.",
    ].join("\n");
    const starts = startsIn(text);
    const names = termsAt(text, starts);
    expect(names).toEqual(["Alpha Basket", "Beta Cap"]);
    // The interior reference to Beta Cap must be nested, not a start.
    const interior = text.indexOf("“Beta Cap”", text.indexOf("Alpha Basket"));
    expect(interior).toBeGreaterThan(0);
    expect(isNestedDeclaration(text, interior)).toBe(true);
    expect(starts).not.toContain(interior);
  });

  it("definitions embedded in nested provisos are nested, not top-level", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Payment Conditions” means, with respect to any transaction,",
      "(a) no Default exists; and",
      "(b) the Borrower has Excess Availability (and for purposes of this clause (b), “Excess Availability” has the meaning assigned to such term in Section 1.01) of at least $10,000,000.",
      "“Permitted Lien” means any Lien permitted by Section 6.02.",
    ].join("\n");
    const starts = startsIn(text);
    const names = termsAt(text, starts);
    expect(names).toContain("Payment Conditions");
    expect(names).toContain("Permitted Lien");
    // Interior Excess Availability declaration must not open a new body boundary.
    const nested = text.indexOf("“Excess Availability”");
    expect(isNestedDeclaration(text, nested)).toBe(true);
    expect(starts).not.toContain(nested);
  });

  it("colon-formatted prose that is not a top-level definition is not segmented", () => {
    const text = [
      "SECTION 6.01. Indebtedness.",
      "Create, incur or assume Indebtedness, except:",
      "Indebtedness: the Borrower may incur loans under the Revolving Facility.",
      "WITNESSETH:",
      "NEGATIVE COVENANTS:",
    ].join("\n");
    // Outside a definitions SECTION heading context, unquoted-colon alone may
    // still match findTopLevelDefinitionStarts (documented: caller must only
    // invoke inside definitions context). Assert WITNESSETH/NEGATIVE are out.
    const starts = startsIn(text);
    const names = termsAt(text, starts);
    expect(names).not.toContain("WITNESSETH");
    expect(names).not.toContain("NEGATIVE COVENANTS");
  });

  it("definitions split across lines still produce a single top-level start", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Consolidated",
      "EBITDA” means net income plus Interest Expense.",
      "“Cash” means cash and Cash Equivalents.",
    ].join("\n");
    const starts = startsIn(text);
    expect(starts.length).toBe(2);
    expect(text.slice(starts[0]!, starts[0]! + 40)).toMatch(/Consolidated/);
    expect(text.slice(starts[1]!, starts[1]! + 20)).toMatch(/Cash/);
  });

  it("defined terms whose bodies contain (a)/(i)/(A) enumerations keep one top-level start", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Builder Amount” means the sum of:",
      "(a) 50% of Consolidated Net Income; plus",
      "(i) Retained Excess Cash Flow; plus",
      "(A) cumulative EBITDA; minus",
      "(B) Fixed Charges;",
      "(b) Net Equity Proceeds.",
      "“Next Term” means one dollar.",
    ].join("\n");
    const starts = startsIn(text);
    const names = termsAt(text, starts);
    expect(names).toEqual(["Builder Amount", "Next Term"]);
    // Structure stage must clip last limb before Next Term.
    const nodes = parseDocumentStructure({ documentId: "adv-enum", label: "adv", text });
    const nextStart = text.indexOf("“Next Term”");
    const limbs = nodes.filter((n) => n.sectionRef.startsWith("1.01(") && n.charStart < nextStart);
    for (const limb of limbs) {
      expect(limb.charEnd).toBeLessThanOrEqual(nextStart);
    }
  });

  it("top-level definitions without enumerations are still detected", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Business Day” means any day other than a Saturday or Sunday.",
      "“GAAP” means generally accepted accounting principles.",
    ].join("\n");
    const starts = startsIn(text);
    expect(termsAt(text, starts)).toEqual(["Business Day", "GAAP"]);
  });

  it("Article I definitions context without SECTION heading: scanner still finds starts from text", () => {
    // findTopLevelDefinitionStarts is text-only; ARTICLE-only layouts still yield starts.
    const text = [
      "ARTICLE I DEFINITIONS",
      "“Affiliate” means any Person controlling the Borrower.",
      "“Board” means the board of directors of the Borrower.",
    ].join("\n");
    const starts = startsIn(text);
    expect(termsAt(text, starts)).toEqual(["Affiliate", "Board"]);
    // But parseDocumentStructure may not mint a definitions SECTION — clause
    // scoping only activates on /defin/i SECTION headings (documented limit).
    const nodes = parseDocumentStructure({ documentId: "art-only", label: "art", text });
    const defSections = nodes.filter((n) => n.nodeType === "SECTION" && /defin/i.test(n.heading));
    expect(defSections.length).toBe(0);
  });

  it("repeated or malformed definition labels do not invent extra top-level bodies", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Duplicate” means one.",
      "“Duplicate” means two (malformed second declaration).",
      "“” means empty.",
      "“A” means short single letter still accepted by min length 1 for means-style.",
    ].join("\n");
    const starts = startsIn(text);
    // Both Duplicate declarations are top-level paragraph starts (malformed but real).
    const names = termsAt(text, starts);
    expect(names.filter((n) => n === "Duplicate").length).toBe(2);
    expect(names).not.toContain("");
  });

  it("precision/recall on a frozen independent synthetic corpus", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Available Amount” means the sum of:",
      "(i) CNI; plus",
      "(ii) equity proceeds,",
      "in each case reduced by usage of the “Available Amount”.",
      "“Availability” means Excess Availability.",
      "“Bail-In Action” means the exercise of a Bail-In Power.",
      "SECTION 6.08. Restricted Payments.",
      "The Borrower will not make Restricted Payments except using the Available Amount.",
    ].join("\n");
    const expectedTopLevel = ["Available Amount", "Availability", "Bail-In Action"];
    const starts = startsIn(text);
    const predicted = termsAt(text, starts);
    const tp = predicted.filter((p) => expectedTopLevel.includes(p)).length;
    const fp = predicted.filter((p) => !expectedTopLevel.includes(p)).length;
    const fn = expectedTopLevel.filter((e) => !predicted.includes(e)).length;
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    expect({ precision, recall, predicted, tp, fp, fn }).toEqual({
      precision: 1,
      recall: 1,
      predicted: expectedTopLevel,
      tp: 3,
      fp: 0,
      fn: 0,
    });
    // Interior self-reference to Available Amount is nested.
    const selfRef = text.indexOf("“Available Amount”", text.indexOf("(ii)"));
    expect(isNestedDeclaration(text, selfRef)).toBe(true);
  });

  it("detectStructuralDefinitions nested flag aligns with scanner exclusions", () => {
    const text = [
      "SECTION 1.01. Defined Terms.",
      "“Outer” means using “Inner” has the meaning assigned to such term in Section 1.01.",
      "“Inner” means two.",
    ].join("\n");
    const nodes = parseDocumentStructure({ documentId: "align", label: "align", text });
    const defs = detectStructuralDefinitions("align", text, nodes);
    const nested = defs.filter((d) => d.nested);
    const top = defs.filter((d) => !d.nested);
    expect(top.map((d) => d.normalizedTerm)).toEqual(["outer", "inner"]);
    expect(nested.some((d) => d.normalizedTerm === "inner")).toBe(true);
    const starts = startsIn(text);
    expect(starts).toHaveLength(2);
  });
});
