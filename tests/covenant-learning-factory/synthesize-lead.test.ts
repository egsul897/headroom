import { describe, expect, it } from "vitest";
import { synthesizeCandidateRules } from "@/lib/covenant-learning-factory/learned-rules/synthesize";

const gap = (id: string, pkg: string, excerpt: string) => ({
  errorId: id, class: "DISCOVERY_GAP", message: "precedent candidate x family=GENERAL_CONDITIONS_AND_EXCEPTIONS not reflected",
  packageKey: pkg, evidence: { expectedFamily: "GENERAL_CONDITIONS_AND_EXCEPTIONS", citationExcerpt: excerpt },
});

describe("synthesizeCandidateRules", () => {
  it("clusters the same clause opening across documents and matches its own seed", () => {
    const a = "(b)      each partial prepayment of any Borrowing (other than a Borrowing of Swing Line Loans) shall be in an aggregate amount of $5,000,000 or a larger multiple";
    const b = "(c) each partial prepayment of any Borrowing (other than a Borrowing of Swing Line Loans) shall be in an aggregate principal amount of $1,000,000 and integral";
    const rules = synthesizeCandidateRules({ signals: [gap("1", "p1", a), gap("2", "p2", b)], epoch: 1 }).filter((r) => r.kind === "PHRASE_PATTERN");
    expect(rules[0]!.provenance.sourcesSpanned).toBe(2);
    // Seeds state minimum prepayment amounts, not a ceiling: no FIXED_DOLLAR capacity is carried (P1).
    expect(rules[0]!.effect.category).not.toBe("FIXED_DOLLAR");
    expect(new RegExp(rules[0]!.pattern, "i").test(a.replace(/\s+/g, " "))).toBe(true);
  });
  it("matches a seed across '.', ')(' and line breaks", () => {
    const s = "Section 6.12(j)(i):\nAggregate amount of obligations of the Borrower subject to Liens filed";
    const r = synthesizeCandidateRules({ signals: [gap("1", "p1", s)], epoch: 1 }).find((x) => x.kind === "PHRASE_PATTERN")!;
    expect(new RegExp(r.pattern, "i").test(s)).toBe(true);
  });
  it("ignores unbound conditions, which the replay never re-checks", () => {
    const sig = { errorId: "c", class: "COVERAGE_GAP", message: "NEEDS_INPUT: condition/exception z not bound", packageKey: "p", evidence: { conditionId: "z", citationExcerpt: "Except as otherwise required by statute, liens and debt shall be limited" } };
    expect(synthesizeCandidateRules({ signals: [sig], epoch: 1 })).toEqual([]);
  });
});
