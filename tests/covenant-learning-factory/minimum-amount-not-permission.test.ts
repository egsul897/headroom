/**
 * Minimum-amount conditions must not become contractual basket permissions.
 * A dollar amount alone never establishes FIXED_DOLLAR capacity, and a learned
 * PHRASE_PATTERN does not inherit PERMISSION from a basket precedent.
 */
import { describe, expect, it } from "vitest";
import { categorize, evaluateBasket } from "@/lib/contract-model/covenant-computation/baskets";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import { synthesizeCandidateRules } from "@/lib/covenant-learning-factory/learned-rules/synthesize";
import { emptyRuleSet, type LearnedRule, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import type { ComputationPackage } from "@/lib/contract-model/covenant-computation/types";

const NOW = "2026-10-15T00:00:00.000Z";

const MIN_PREPAY =
  "Each partial prepayment of the Term Loans shall be in a minimum aggregate principal amount of $5,000,000 and integral multiples of $1,000,000 in excess thereof.";
const MIN_BORROW =
  "Each Borrowing of Revolving Loans shall be in an aggregate principal amount of not less than $1,000,000 or a whole multiple of $500,000 in excess thereof.";
const MAX_INV =
  "The Borrower may make other Investments in an aggregate amount outstanding at any time not to exceed $25,000,000.";
const MIN_MAX =
  "The Borrower may make Investments in joint ventures, each in a minimum amount of $1,000,000, in an aggregate amount not to exceed $25,000,000 at any time outstanding.";
const REPORTING =
  "The Borrower shall deliver notice to the Administrative Agent of any Investment in an aggregate amount in excess of $10,000,000 within five Business Days.";

function learnedSet(rule: Partial<LearnedRule> & Pick<LearnedRule, "pattern" | "effect">): LearnedRuleSet {
  return {
    ...emptyRuleSet(1),
    rules: [
      {
        ruleId: "lr:test-learned",
        version: 1,
        kind: "PHRASE_PATTERN",
        flags: "i",
        provenance: { ledgerErrorIds: ["e1"], synthesizedAt: NOW, epoch: 1, packageKeys: ["a", "b"], sourcesSpanned: 2 },
        state: "MECHANICALLY_REPLAYED",
        ...rule,
      },
    ],
  };
}

function pkgFor(text: string): ComputationPackage {
  return {
    packageKey: "p",
    documents: [{ documentId: "d", role: "CREDIT_AGREEMENT", text }],
    baskets: [],
    ratios: [],
    omissions: [],
  } as unknown as ComputationPackage;
}

function capture(text: string, rules: LearnedRuleSet) {
  return extractBasketClauses({ documentId: "d", text: `Article II Loans.\n${text}\n`, rules }).filter((c) =>
    c.stableKey.startsWith("learned-"),
  );
}

describe("A. minimum $5M partial prepayment", () => {
  it("creates no independent basket permission even when a learned rule captures it", () => {
    const rules = learnedSet({
      pattern: "partial\\s+prepayment\\s+of\\s+the\\s+term\\s+loans",
      effect: { family: "DEBT_INCURRENCE", category: "FIXED_DOLLAR" },
    });
    const got = capture(MIN_PREPAY, rules);
    expect(got.length).toBe(1);
    expect(got[0]!.role).not.toBe("PERMISSION");
    expect(categorize(MIN_PREPAY, rules)).not.toBe("FIXED_DOLLAR");
    const b = evaluateBasket(pkgFor(MIN_PREPAY), got[0]!, [], [], rules);
    expect(b.capCanonical).toBeNull();
    expect(b.category).not.toBe("FIXED_DOLLAR");
  });
});

describe("B. minimum $1M borrowing increment", () => {
  it("has no fixed-dollar capacity", () => {
    expect(categorize(MIN_BORROW)).not.toBe("FIXED_DOLLAR");
    const synthesized = synthesizeCandidateRules({
      epoch: 1,
      now: NOW,
      signals: [
        { errorId: "b1", class: "MISCLASSIFIED", message: "category", packageKey: "pa", evidence: { citationExcerpt: MIN_BORROW } },
      ],
    });
    expect(synthesized.some((r) => r.effect.category === "FIXED_DOLLAR")).toBe(false);
  });
});

describe("C. maximum $25M permitted investment", () => {
  it("is a valid fixed-dollar ceiling", () => {
    expect(categorize(MAX_INV)).toBe("FIXED_DOLLAR");
    const clause = { stableKey: "c", sectionRef: "7.02(k)", covenantFamily: "INVESTMENTS", documentId: "d", operativeText: MAX_INV, role: "PERMISSION" as const };
    const b = evaluateBasket(pkgFor(MAX_INV), clause, [], [], undefined);
    expect(b.category).toBe("FIXED_DOLLAR");
    expect(b.capCanonical).not.toBeNull();
    expect(String(b.capCanonical)).toMatch(/25000000/);
  });
});

describe("D. minimum and maximum in one clause", () => {
  it("uses only the ceiling as capacity", () => {
    expect(categorize(MIN_MAX)).toBe("FIXED_DOLLAR");
    const clause = { stableKey: "d", sectionRef: "7.02(m)", covenantFamily: "INVESTMENTS", documentId: "d", operativeText: MIN_MAX, role: "PERMISSION" as const };
    const b = evaluateBasket(pkgFor(MIN_MAX), clause, [], [], undefined);
    expect(b.category).toBe("FIXED_DOLLAR");
    expect(String(b.capCanonical)).toMatch(/25000000/);
    expect(String(b.capCanonical)).not.toMatch(/^1000000/);
  });
});

describe("E. learned pattern matching a clause with a different contractual function", () => {
  it("does not inherit permission or fixed-dollar classification", () => {
    // Precedent was a $ investment basket; the same opening matches a reporting threshold.
    const rules = learnedSet({
      pattern: "of\\s+any\\s+investment\\s+in\\s+an\\s+aggregate\\s+amount",
      effect: { family: "INVESTMENTS", category: "FIXED_DOLLAR" },
    });
    const got = capture(REPORTING, rules);
    expect(got.length).toBe(1);
    expect(got[0]!.role).not.toBe("PERMISSION");
    expect(categorize(REPORTING, rules)).not.toBe("FIXED_DOLLAR");
  });

  it("a cluster whose seeds only state minimums does not carry FIXED_DOLLAR", () => {
    const rules = synthesizeCandidateRules({
      epoch: 2,
      now: NOW,
      signals: [
        { errorId: "e1", class: "DISCOVERY_GAP", message: "missed", packageKey: "pa", evidence: { citationExcerpt: MIN_PREPAY, expectedFamily: "DEBT_INCURRENCE" } },
        { errorId: "e2", class: "DISCOVERY_GAP", message: "missed", packageKey: "pb", evidence: { citationExcerpt: MIN_PREPAY.replace("$5,000,000", "$2,500,000"), expectedFamily: "DEBT_INCURRENCE" } },
      ],
    });
    const phrases = rules.filter((r) => r.kind === "PHRASE_PATTERN");
    expect(phrases.length).toBeGreaterThan(0);
    for (const r of phrases) expect(r.effect.category).not.toBe("FIXED_DOLLAR");
  });
});
