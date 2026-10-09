/**
 * EDGAR line-wraps mid-phrase defined terms ("Consolidated\\nTotal Assets").
 * Surface-form matching must allow flexible whitespace — same discipline as IPV-09 plurals.
 */
import { describe, expect, it } from "vitest";
import { termFormAppearsInText, termSurfaceForms } from "../../lib/contract-model/compiler/context-retrieval/definition-graph";
import { countInlineEnumerationMarkers } from "../../lib/contract-model/compiler/coverage-audit/signals";

describe("defined-term surface forms across whitespace", () => {
  it("matches Consolidated Total Assets when wrapped with a newline", () => {
    const text =
      "Finance Lease Obligations not to exceed the greater of (x) $50,000,000 and (y) 3.0% of Consolidated\nTotal Assets (measured on the date of incurrence)";
    expect(termFormAppearsInText("Consolidated Total Assets", text)).toBe(true);
    expect(termSurfaceForms("Consolidated Total Assets").some((f) => termFormAppearsInText(f, text))).toBe(true);
  });

  it("does not fuzzy-match a different defined term", () => {
    const text = "3.0% of Consolidated Total Tangible Assets";
    expect(termFormAppearsInText("Consolidated Total Assets", text)).toBe(false);
  });
});

describe("greater-of / lesser-of legs are not independent enumerated units", () => {
  it("counts only the basket letter, not (x)/(y) comparison legs", () => {
    const text =
      "(d) Finance Lease Obligations in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 3.0% of Consolidated Total Assets at any one time outstanding;";
    expect(countInlineEnumerationMarkers(text)).toEqual(["(d)"]);
  });

  it("still counts genuine sibling baskets", () => {
    const text =
      "(a) Indebtedness not to exceed $10,000,000; (b) Indebtedness incurred to refinance existing debt; (c) Indebtedness owed to Affiliates.";
    expect(countInlineEnumerationMarkers(text).sort()).toEqual(["(a)", "(b)", "(c)"]);
  });
});
