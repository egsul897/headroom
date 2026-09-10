/**
 * F-3 (Phase 3 Chewy remediation) - verifier quantitative scale normalization. Generic grammar only; every scenario is
 * invented drafting; no model call. Covers: scale grammar (mission section 5), dimensional meaning (section 3),
 * semantic equivalence (section 6), adversarial non-suppression (section 8), malformed inputs (section 9), provenance
 * (section 11), and the recorded Chewy path shape (a "$X.0 million" source figure against an IR MONEY literal).
 */
import { describe, expect, it } from "vitest";
import { AMOUNT_RE, parseScaledAmount } from "../../lib/contract-model/compiler/semantic-verification/amount-parser";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { reconcileInventories } from "../../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildFindingsFromReconciliation } from "../../lib/contract-model/compiler/semantic-verification/findings";
import type { IrInventory, IrInventoryItem, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";

const amounts = (text: string) => buildSourceInventory("f3-unit", text, "doc-x", "9.99", null).items.filter((i) => i.kind === "AMOUNT");
const parse = (raw: string) => parseScaledAmount(raw);
const ir = (items: { kind: IrInventoryItem["kind"]; value: number; currency?: string | null; path?: string }[]): IrInventory => ({
  candidateRef: "f3-unit",
  items: items.map((x, i) => ({ itemId: `ir-${i}`, kind: x.kind, ruleOrDefinitionId: "ir-rule:1", irPath: x.path ?? `rules[0].capacityExpression.operands[${i}]`, numericValue: x.value, textValue: null, currency: x.currency ?? null, isAlternativeWithinSelection: false, sourceCitation: null, sourceExcerpt: null }) as unknown as IrInventoryItem),
  ruleCount: 1,
  definitionCount: 0,
  inventoryAlgorithmVersion: "test",
});
const reconcileText = (text: string, irItems: Parameters<typeof ir>[0]) => reconcileInventories(buildSourceInventory("f3-unit", text, "doc-x", "9.99", null), ir(irItems));
const amountItems = (r: ReturnType<typeof reconcileInventories>) => r.items.filter((i) => i.sourceItem?.kind === "AMOUNT" || (i.classification === "IR_ONLY" && i.irItems[0]?.kind === "AMOUNT"));

describe("F-3 scale grammar (section 5)", () => {
  it.each([
    ["$720 million", 720_000_000, "USD", "million"],
    ["$720.0 million", 720_000_000, "USD", "million"],
    ["$1.25 billion", 1_250_000_000, "USD", "billion"],
    ["$25 thousand", 25_000, "USD", "thousand"],
    ["720 million dollars", 720_000_000, "USD", "million"],
    ["USD 720 million", 720_000_000, "USD", "million"],
    ["$720 MILLION", 720_000_000, "USD", "MILLION"],
    ["$720 Million", 720_000_000, "USD", "Million"],
    ["$0.72 billion", 720_000_000, "USD", "billion"],
    ["$720,000,000", 720_000_000, "USD", null],
    ["$720", 720, "USD", null],
    ["$720 thousand", 720_000, "USD", "thousand"],
    ["€720 million", 720_000_000, "EUR", "million"],
    ["£5.5 million", 5_500_000, "GBP", "million"],
  ])("%s -> %d %s", (raw, canonical, currency, token) => {
    const p = parse(raw);
    expect(p.canonicalValue).toBe(canonical);
    expect(p.currency).toBe(currency);
    expect(p.scaleToken).toBe(token);
    expect(p.exact).toBe(true);
    expect(p.scaleStatus).toBe(token ? "RESOLVED" : "NONE");
  });

  it("layout/punctuation variants are located in running text and resolve identically", () => {
    const text = 'an amount of $720.0\nmillion; then $720.0 million; and $720.0 million) or $720.0 million, and $720.0 million (the "Basket").';
    const found = amounts(text);
    expect(found).toHaveLength(5);
    for (const a of found) { expect(a.numericValue).toBe(720_000_000); expect(a.scaleStatus).toBe("RESOLVED"); expect(a.currency).toBe("USD"); }
    expect(found[0]!.rawText.replace(/\s+/g, " ")).toBe("$720.0 million");
  });

  it("the grammar never fabricates a monetary unit from nearby prose", () => {
    expect(amounts("the greater of $5 in the aggregate and the Applicable Amount")[0]!.numericValue).toBe(5);
    expect(amounts("a fee of $720 payable in millions of installments")[0]!.numericValue).toBe(720);
    expect(amounts("million dollars of nothing")).toHaveLength(0);
    expect(amounts("$ million")).toHaveLength(0);
    expect(amounts("AND 100% of Consolidated EBITDA")).toHaveLength(0);
  });
});

describe("F-3 dimensional meaning (section 3)", () => {
  it("MONEY / PERCENT / RATIO / bare NUMBER stay distinct kinds and are never coerced into each other", () => {
    const inv = buildSourceInventory("f3-unit", "not to exceed $720 million or 100% of X or 2.00x or 720", "doc-x", "9.99", null);
    const kinds = inv.items.filter((i) => ["AMOUNT", "PERCENT", "RATIO"].includes(i.kind)).map((i) => [i.kind, i.numericValue]);
    expect(kinds).toEqual(expect.arrayContaining([["AMOUNT", 720_000_000], ["PERCENT", 1], ["RATIO", 2]]));
    // a bare "720 million" (no currency symbol/code/word) is not an AMOUNT to the verifier
    expect(amounts("720 million")).toHaveLength(0);
    expect(amounts("720")).toHaveLength(0);
    // a MONEY figure never reconciles against a PERCENT or RATIO of the same number
    const r = reconcileText("$2 million", [{ kind: "PERCENT", value: 2_000_000 }, { kind: "RATIO", value: 2_000_000 }]);
    expect(amountItems(r).map((i) => i.classification)).toEqual(["NOT_ACCOUNTED_FOR"]);
    const r2 = reconcileText("72%", [{ kind: "AMOUNT", value: 0.72, currency: "USD" }]);
    expect(r2.items.find((i) => i.sourceItem?.kind === "PERCENT")!.classification).toBe("NOT_ACCOUNTED_FOR");
  });
});

describe("F-3 semantic equivalence (section 6) and non-suppression (section 8)", () => {
  it.each([
    ["$720 million", 720_000_000],
    ["$720.0 million", 720_000_000],
    ["$0.72 billion", 720_000_000],
    ["$720,000,000", 720_000_000],
    ["USD 720 million", 720_000_000],
    ["720 million dollars", 720_000_000],
  ])("%s reconciles ACCOUNTED_FOR against IR MONEY(720000000, USD)", (raw) => {
    const r = reconcileText(`not to exceed ${raw}`, [{ kind: "AMOUNT", value: 720_000_000, currency: "USD" }]);
    const items = amountItems(r);
    expect(items.map((i) => i.classification)).toEqual(["ACCOUNTED_FOR"]);
    expect(items[0]!.reason).toMatch(/canonical 720000000 USD/);
  });

  it.each([
    ["$720 million", 721_000_000, "USD"],
    ["$720 million", 720_000, "USD"],
    ["$1.2 billion", 1_200_000, "USD"],
    ["$720 million", 720_000_000, "EUR"],
  ])("%s vs IR %d %s stays a discrepancy", (raw, irValue, currency) => {
    const r = reconcileText(`not to exceed ${raw}`, [{ kind: "AMOUNT", value: irValue, currency }]);
    const items = amountItems(r);
    expect(items.map((i) => i.classification).sort()).toEqual(["IR_ONLY", "NOT_ACCOUNTED_FOR"]);
  });

  it("cross-currency: the reason names the currency mismatch; the IR side is reported IR_ONLY, never claimed", () => {
    const r = reconcileText("not to exceed $720 million", [{ kind: "AMOUNT", value: 720_000_000, currency: "EUR" }]);
    const na = r.items.find((i) => i.classification === "NOT_ACCOUNTED_FOR")!;
    expect(na.reason).toMatch(/different currency \(EUR\)/);
    expect(r.items.filter((i) => i.classification === "IR_ONLY")).toHaveLength(1);
  });

  it("12.5% vs 15% and 2.00x vs 2.50x remain discrepancies (untouched kinds)", () => {
    const r = reconcileText("12.5% of X and 2.00x", [{ kind: "PERCENT", value: 0.15 }, { kind: "RATIO", value: 2.5 }]);
    expect(r.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR")).toHaveLength(2);
  });

  it("an IR NUMBER node (no currency) keeps the pre-existing magnitude-only contract with a source dollar figure", () => {
    const r = reconcileText("not to exceed $720 million", [{ kind: "AMOUNT", value: 720_000_000, currency: null }]);
    expect(amountItems(r).map((i) => i.classification)).toEqual(["ACCOUNTED_FOR"]);
  });

  it("$720 million vs malformed \"$720 elephants\": not equal (plain $720 vs 720000000), the prose word carries no scale", () => {
    const p = parse("$720 elephants");
    expect(p.canonicalValue).toBe(720);
    expect(p.scaleStatus).toBe("NONE");
    const r = reconcileText("$720 elephants", [{ kind: "AMOUNT", value: 720_000_000, currency: "USD" }]);
    expect(amountItems(r).map((i) => i.classification).sort()).toEqual(["IR_ONLY", "NOT_ACCOUNTED_FOR"]);
  });
});

describe("F-3 malformed / ambiguous inputs (section 9)", () => {
  it.each([["$720 million billion", "million billion"], ["$720 mn", "mn"], ["$720 m", "m"], ["$720k", "k"]])("%s -> UNRESOLVED scale, value withheld, reconciled as AMBIGUOUS (review), never equal", (raw, token) => {
    const p = parse(raw);
    expect(p.scaleStatus).toBe("UNRESOLVED");
    expect(p.canonicalValue).toBeNull();
    expect(p.scaleToken).toBe(token);
    expect(p.parsedAmount).toBe(720);
    const r = reconcileText(`not to exceed ${raw}`, [{ kind: "AMOUNT", value: 720_000_000, currency: "USD" }]);
    const amb = r.items.find((i) => i.classification === "AMBIGUOUS" && i.sourceItem?.kind === "AMOUNT");
    expect(amb?.reason).toMatch(/does not resolve/);
    expect(r.items.some((i) => i.classification === "ACCOUNTED_FOR" && i.sourceItem?.kind === "AMOUNT")).toBe(false);
    // the deterministic finding layer surfaces it for review (UNCERTAIN), never as a confident MATERIAL number match
    const findings = buildFindingsFromReconciliation({ compilerInput: { companyId: "c", instrumentKey: "i", candidateRef: "f3-unit", sourceDocumentId: "doc-x", sourceSectionRef: "9.99" }, compilationResult: { rules: [{ sufficiency: "COMPLETE" }], definitions: [] } } as unknown as VerificationInput, r);
    expect(findings.some((f) => f.severity === "UNCERTAIN" && /does not resolve/.test(f.verifierReasoning))).toBe(true);
  });

  it("\"$720 mm\" and \"$720 bn\" are the intentionally supported abbreviations (source-system vocabulary) and resolve", () => {
    expect(parse("$720 mm").canonicalValue).toBe(720_000_000);
    expect(parse("$720 bn").canonicalValue).toBe(720_000_000_000);
  });

  it("qualifiers around a figure never disappear: the operator/condition markers are inventoried alongside the amount", () => {
    const inv = buildSourceInventory("f3-unit", "not more than $720 million, and approximately $720 million", "doc-x", "9.99", null);
    expect(inv.items.filter((i) => i.kind === "AMOUNT").map((i) => i.numericValue)).toEqual([720_000_000, 720_000_000]);
    expect(inv.items.some((i) => i.kind === "COMPARISON_OPERATOR" && /not more than/i.test(i.rawText))).toBe(true);
  });

  it("the global grammar never matches text without a figure", () => {
    for (const t of ["$ million", "million", "USD", "$"]) expect([...t.matchAll(AMOUNT_RE)]).toHaveLength(0);
  });
});

describe("F-3 provenance (section 11)", () => {
  it("a reviewer can reconstruct why \"$720.0 million\" became 720000000 USD", () => {
    const [a] = amounts("(x) $720.0 million and (y) 100% of Consolidated EBITDA");
    expect(a).toMatchObject({ rawText: "$720.0 million", parsedAmount: 720, scaleToken: "million", scaleMultiplier: 1_000_000, currency: "USD", scaleStatus: "RESOLVED", numericValue: 720_000_000, charStart: 4, charEnd: 18 });
  });

  it("exact integer arithmetic: no binary floating-point residue on decimal scales", () => {
    expect(parse("$0.72 billion").canonicalValue).toBe(720_000_000);
    expect(parse("$1.1 billion").canonicalValue).toBe(1_100_000_000);
    expect(parse("$12.345 million").canonicalValue).toBe(12_345_000);
    expect(parse("$12.345 million").exact).toBe(true);
    expect(parse("$1.2345 thousand")).toMatchObject({ canonicalValue: 1234.5, exact: false });
  });
});
