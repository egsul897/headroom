/**
 * Rule 191 — the analyzer must preserve a greater-of basket's
 * grower leg instead of emitting only its flat limb.
 *
 * The analyzer's greater-of regex required the limb separator
 * to be "and"/"," and the percent to be a bare numeral. Real
 * drafting is "greater of $1,000,000,000 or ten percent (10%)
 * of Consolidated Net Worth" (Aon 6.16(l) / 6.11(t)): the "or"
 * separator and the words + parenthesized-numeral percent are
 * the standard forms. Missing them dropped the grower leg, the
 * baskets carried only "Amount/threshold: $1,000,000,000", and
 * the compiler minted a FLAT $1B for a greater-of basket —
 * silently understating capacity whenever Net Worth exceeded
 * $10B. The emitted entry is "Greater of basket:" with a
 * SPACE: the compiler's greater-of branch matches /greater of/i
 * and "Greater-of" (hyphen) does not contain "greater of".
 * Words-only percents ("ten percent" with no numeral) are still
 * not parsed — a known gap, not silently assumed.
 */
import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function analyze(excerpt: string) {
  const candidate: CovenantCandidateRecord = {
    candidateId: "c1",
    sourceId: "src",
    nodeId: undefined,
    families: ["INDEBTEDNESS"],
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 5,
  };
  return analyzeProvision({
    sourceId: "src",
    documentTitle: "Indenture",
    candidate,
    definitions: [],
    structuralNodes: [],
  });
}

describe("Rule 191: greater-of basket extraction", () => {
  it("preserves the Aon 6.16(l) shape: 'or' separator + words + parenthesized percent", () => {
    const a = analyze(
      "Section 6.16. Indebtedness. The Parent will not permit any Subsidiary to create Indebtedness, except: " +
        "(l) other Indebtedness in an aggregate principal amount outstanding at no time exceeding an amount equal to " +
        "the greater of $1,000,000,000 or ten percent (10%) of Consolidated Net Worth at such time.",
    );
    expect(a.basketsAndThresholds).toContain(
      "Greater of basket: $1,000,000,000 and 10% of Consolidated Net Worth",
    );
    expect(a.basketsAndThresholds).not.toContain("Amount/threshold: $1,000,000,000");
  });

  it("handles the 'or' separator with a bare percent", () => {
    const a = analyze(
      "Section 6.01. Indebtedness. The Company shall not incur Indebtedness except: " +
        "(x) other Indebtedness in an aggregate principal amount not to exceed the greater of $150.0 million or 25% of Consolidated EBITDA.",
    );
    expect(a.basketsAndThresholds).toContain(
      "Greater of basket: $150.0 million and 25% of Consolidated EBITDA",
    );
    expect(a.basketsAndThresholds).not.toContain("Amount/threshold: $150.0 million");
  });

  it("still handles the 'and' separator (no regression)", () => {
    const a = analyze(
      "Section 6.02. Liens. The Company shall not create any Lien except: " +
        "(t) Liens securing Indebtedness in an aggregate principal amount not to exceed the greater of $100 million and 20% of Total Assets.",
    );
    expect(a.basketsAndThresholds).toContain(
      "Greater of basket: $100 million and 20% of Total Assets",
    );
  });

  it("handles a parenthesized bare percent", () => {
    const a = analyze(
      "Section 6.01. Indebtedness. The Company shall not incur Indebtedness except: " +
        "(y) other Indebtedness not to exceed the greater of $50 million or (15%) of Consolidated Net Worth.",
    );
    expect(a.basketsAndThresholds).toContain(
      "Greater of basket: $50 million and 15% of Consolidated Net Worth",
    );
  });

  it("does not double-count the flat limb as a separate basket", () => {
    const a = analyze(
      "Section 6.16. Indebtedness. Except: (l) other Indebtedness not to exceed the greater of $1,000,000,000 or ten percent (10%) of Consolidated Net Worth at such time.",
    );
    const flat = a.basketsAndThresholds.filter((b) => b.startsWith("Amount/threshold:"));
    expect(flat).toEqual([]);
  });
});
