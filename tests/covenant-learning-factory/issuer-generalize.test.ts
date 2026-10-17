import { describe, expect, it } from "vitest";
import {
  contentWords,
  heldOutAcceptance,
  issuerKey,
  skeleton,
  skeletonPattern,
  synthesizeIssuerGeneralized,
  DEFAULT_GENERALIZE_OPTIONS,
  type SeedUnit,
} from "../../lib/covenant-learning-factory/learned-rules/issuer-generalize";
import { phrasePatternCaptureRules } from "../../lib/covenant-learning-factory/learned-rules/apply";
import { compileRuleRegex } from "../../lib/covenant-learning-factory/learned-rules/types";

// Synthetic drafting only (invented issuers and wording; no benchmark text).
const u = (issuer: string, sourceId: string, text: string, family: string | null = "LIENS"): SeedUnit => ({
  sourceId,
  issuer,
  itemId: `${sourceId}#${text.length}`,
  kind: "candidate",
  family,
  text,
});

describe("skeleton", () => {
  it("abstracts amounts, percentages, ratios, section refs and defined terms; drops enumerators and page numbers", () => {
    const ids = skeleton("(k) 12 Zephyr Liens securing Widget Debt permitted by Section 6.4(c) not to exceed the greater of $7,500,000 and 12.5% of Quux EBITDA").map((t) => t.id);
    expect(ids).toEqual([
      "SLOT:TERM", "W:securing", "SLOT:TERM", "W:permitted", "W:by", "SLOT:SECREF", "W:not", "W:to", "W:exceed", "W:the", "W:greater", "W:of", "SLOT:AMOUNT", "W:and", "SLOT:PERCENT", "W:of",
    ]);
    expect(skeleton("the Net Ratio shall not exceed 4.25 to 1.00").map((t) => t.id)).toContain("SLOT:RATIO");
  });

  it("a sentence-initial function word is wording, not a defined term", () => {
    expect(skeleton("Notwithstanding anything herein, each Obligor may").map((t) => t.id).slice(0, 3)).toEqual(["W:notwithstanding", "W:anything", "W:herein"]);
  });

  it("the pattern matches other issuers' drafting of the same clause (different names, numbers, labels)", () => {
    const re = new RegExp(skeletonPattern(skeleton("(c) Liens securing Alpha Debt permitted under Section 7.03(b) in an aggregate amount not to exceed $10,000,000")));
    expect(re.test("(xii) Liens securing Beta Gamma Indebtedness permitted under Section 9.2 in an aggregate amount not to exceed $3,250,000")).toBe(true);
    expect(re.test("Liens securing obligations permitted under the Security Agreement")).toBe(false);
  });

  it("counts content words (non-stopword literals)", () => {
    expect(contentWords(skeleton("the Borrower shall not permit"))).toBe(3);
  });
});

describe("issuerKey", () => {
  it("prefers ticker, then CIK, then the fixture family", () => {
    expect(issuerKey({ sourceId: "x", ticker: "abc_alt", issuerCik: "0000123" })).toBe("T:ABC");
    expect(issuerKey({ sourceId: "x", ticker: null, issuerCik: "0000123" })).toBe("C:123");
    expect(issuerKey({ sourceId: "fixture:zeta-2024-ca:doc", ticker: null, issuerCik: "0000000000" })).toBe("F:ZETA");
  });
});

describe("synthesizeIssuerGeneralized", () => {
  const units = [
    u("T:AAA", "s1", "(a) Liens securing Purchase Money Debt permitted under Section 7.2(d) in an aggregate amount not to exceed $5,000,000 at any time"),
    u("T:BBB", "s2", "(iv) Liens securing Capital Lease Obligations permitted under Section 6.01(c) in an aggregate amount not to exceed $12,000,000 outstanding"),
    u("T:AAA", "s3", "(b) Liens on Specified Property granted to the Collateral Agent pursuant to the Security Documents"),
  ];

  it("emits a rule only for a skeleton shared by ≥2 issuers, records every support document, never literal names or numbers", () => {
    const out = synthesizeIssuerGeneralized(units);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.issuers).toEqual(["T:AAA", "T:BBB"]);
    expect(c.rule.provenance.packageKeys).toEqual(["clf-sweep:s1", "clf-sweep:s2"]);
    expect(c.rule.state).toBe("PROPOSED");
    expect(c.rule.pattern).not.toMatch(/Purchase|Capital|5,000|12,000|7\\.2|6\\.01/);
    expect(c.rule.provenance.generalized).toBe(true);
  });

  it("one issuer alone (any number of documents) is not enough", () => {
    const same = [units[0]!, { ...units[1]!, issuer: "T:AAA" }];
    expect(synthesizeIssuerGeneralized(same)).toHaveLength(0);
  });

  it("is deterministic (same ids and patterns regardless of input order)", () => {
    const a = synthesizeIssuerGeneralized(units).map((c) => [c.rule.ruleId, c.rule.pattern]);
    const b = synthesizeIssuerGeneralized([...units].reverse()).map((c) => [c.rule.ruleId, c.rule.pattern]);
    expect(b).toEqual(a);
  });

  it("rejects skeletons with too few content words", () => {
    const thin = [u("T:AAA", "s1", "(a) the Alpha Beta of the Gamma Delta and the Epsilon"), u("T:BBB", "s2", "(b) the Zeta Eta of the Theta Iota and the Kappa")];
    expect(synthesizeIssuerGeneralized(thin)).toHaveLength(0);
  });

  it("accepted rules are loadable capture rules whose regex compiles", () => {
    const c = synthesizeIssuerGeneralized(units)[0]!;
    const rs = { schemaVersion: "clf.learned-rules.v1" as const, rulesetVersion: 1, authorityStatus: "COMPUTED_NOT_CERTIFIED" as const, rules: [{ ...c.rule, state: "MECHANICALLY_REPLAYED" as const }], updatedAt: DEFAULT_GENERALIZE_OPTIONS.synthesizedAt };
    expect(phrasePatternCaptureRules(rs)).toHaveLength(1);
    expect(compileRuleRegex(rs.rules[0]!)).not.toBeNull();
  });
});

describe("heldOutAcceptance", () => {
  it("needs held-out credit, no unsupported-semantics error and mostly productive baskets", () => {
    expect(heldOutAcceptance(undefined).accepted).toBe(false);
    expect(heldOutAcceptance({ credited: 2, unsupported: 0, baskets: 3, idle: 1, heldOutIssuers: 3 }).accepted).toBe(true);
    expect(heldOutAcceptance({ credited: 0, unsupported: 0, baskets: 0, idle: 0, heldOutIssuers: 4 }).accepted).toBe(false);
    expect(heldOutAcceptance({ credited: 3, unsupported: 1, baskets: 3, idle: 0, heldOutIssuers: 4 }).accepted).toBe(false);
    expect(heldOutAcceptance({ credited: 1, unsupported: 0, baskets: 4, idle: 3, heldOutIssuers: 4 }).accepted).toBe(false);
    expect(heldOutAcceptance({ credited: 1, unsupported: 0, baskets: 1, idle: 0, heldOutIssuers: 0 }).accepted).toBe(false);
  });
});
