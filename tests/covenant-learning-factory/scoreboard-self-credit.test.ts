/**
 * Scoreboard self-credit guard + no-learned-rules score.
 * A learned capture rule seeded from a candidate must not earn credit for that candidate (or anything else in the
 * same document, or in a byte-identical copy of it); it may earn credit in another document. Missing / unbound seed
 * provenance fails closed (no learned credit at all) and is counted. Every source also carries a no-rules score.
 */
import { describe, expect, it } from "vitest";
import {
  aggregate,
  CREDIT_CROSS_ISSUER,
  CREDIT_SAME_ISSUER_OTHER_DOC,
  CREDIT_ISSUER_UNKNOWN,
  deriveSeedProvenance,
  REFUSED_NO_PROVENANCE,
  REFUSED_SELF_SEEDED,
  scoreSource,
  selfCreditGuard,
  type DevManifest,
  type ScoreboardSourceInput,
} from "@/lib/covenant-learning-factory/scoreboard";
import { normalizeLearnedRuleSet, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";

const manifest: DevManifest = { description: "test", sourceIds: [] };
const CLAUSE =
  "Holdings may make Restricted Payments to its equity holders in an aggregate amount not to exceed $7,500,000 in any fiscal year, so long as the proceeds are applied within ninety days.";
const DOC = `ARTICLE IX MISCELLANEOUS\n\nSection 9.17 Tax Distributions. ${CLAUSE}\n\nSection 9.18 Counterparts. This Agreement may be executed in counterparts.`;

function input(sourceId: string, contentSha256: string, withCandidate = true, opts: { issuerCik?: string; excerpt?: string; doc?: string } = {}): ScoreboardSourceInput {
  return {
    source: { sourceId, contentSha256, issuerCik: opts.issuerCik ?? null } as ScoreboardSourceInput["source"],
    documentText: opts.doc ?? DOC,
    candidates: withCandidate ? [{ candidateId: `${sourceId}#c1`, sourceId, family: "RESTRICTED_PAYMENTS", sectionRef: null, excerpt: opts.excerpt ?? CLAUSE }] : [],
    definitions: [],
    conditions: [],
  } as ScoreboardSourceInput;
}

const ruleSet = (note: string, extra: Record<string, unknown> = {}): LearnedRuleSet => normalizeLearnedRuleSet({
  schemaVersion: "clf-learned-rules/v1",
  rulesetVersion: 9,
  authorityStatus: "MECHANICALLY_REPLAYED_NOT_COUNSEL_VERIFIED",
  updatedAt: "1970-01-01T00:00:00.000Z",
  rules: [
    {
      ruleId: "lr:test-seed",
      kind: "PHRASE_PATTERN",
      state: "MECHANICALLY_REPLAYED",
      flags: "i",
      version: 1,
      pattern: "Holdings\\s+may\\s+make\\s+Restricted\\s+Payments\\s+to\\s+its\\s+equity",
      effect: { family: "RESTRICTED_PAYMENTS" },
      provenance: { note, epoch: 1, ...extra },
    },
  ],
} as never);
const SEED_NOTE = 'cluster size 1; seed="Holdings may make Restricted Payments to its equity holders in a"';
const rules = ruleSet(SEED_NOTE);
const OTHER_DOC = "Section 6.06 Restricted Payments. The Borrower shall not make any Restricted Payment, except as set forth below.";

const ids = { rulesetSha256: "r", snapshotSha256: "s" };
const seededIn = (...srcs: ScoreboardSourceInput[]) => deriveSeedProvenance(rules, srcs, ids);

describe("scoreboard self-credit guard", () => {
  it("precondition: the learned rule is what finds the clause (no-rules misses it, unguarded rules-on credits it)", () => {
    const a = input("edgar:a", "sha-a");
    const s = scoreSource(a, rules, manifest, undefined, { noRules: true });
    expect(s.noRules!.counts.DISCOVERY_GAP).toBe(1);
    expect(s.counts.DISCOVERY_GAP).toBe(0);
  });

  it("derives the seed from the recorded seed text as an exact prefix of a precedent item", () => {
    const p = seededIn(input("edgar:a", "sha-a", true, { issuerCik: "0000111" }), input("edgar:b", "sha-b", false, { doc: OTHER_DOC }));
    expect(p.rules["lr:test-seed"]).toMatchObject({ basis: "EXACT_SEED_TEXT_ITEM", complete: true, sourceIds: ["edgar:a"], contentSha256s: ["sha-a"], issuerCiks: ["111"] });
    expect(p.rules["lr:test-seed"]!.items).toEqual([{ sourceId: "edgar:a", kind: "candidate", itemId: "edgar:a#c1" }]);
    expect(p.summary).toMatchObject({ captureRules: 1, complete: 1, incomplete: 0, multiDocumentSeed: 0 });
  });

  it("is exact text, not the rule pattern: an item the case-insensitive pattern opens but whose text differs is not a seed", () => {
    const shouty = CLAUSE.replace("Holdings may make Restricted Payments to its equity holders", "HOLDINGS MAY MAKE RESTRICTED PAYMENTS TO ITS EQUITY HOLDERS");
    const b = input("edgar:b", "sha-b", true, { excerpt: shouty, doc: DOC.replace(CLAUSE, shouty) });
    const p = seededIn(input("edgar:a", "sha-a"), b);
    expect(p.rules["lr:test-seed"]!.sourceIds).toEqual(["edgar:a"]);
  });

  it("uses recorded packageKeys exactly when the rule carries them", () => {
    const r = ruleSet(SEED_NOTE, { packageKeys: ["clf-sweep:edgar:z"] });
    const p = deriveSeedProvenance(r, [input("edgar:a", "sha-a"), input("edgar:z", "sha-z")], ids);
    expect(p.rules["lr:test-seed"]).toMatchObject({ basis: "RECORDED_PACKAGE_KEYS", complete: true, sourceIds: ["edgar:z"] });
    const g = selfCreditGuard(r, p, ids);
    expect(g.refusal({ stableKey: "learned-lr:test-seed" }, { sourceId: "edgar:z" })).toBe(REFUSED_SELF_SEEDED);
    expect(g.refusal({ stableKey: "learned-lr:test-seed" }, { sourceId: "edgar:a" })).toBeNull();
  });

  it("fails closed on a cluster whose members are not all identified by exact seed text", () => {
    const r = ruleSet('cluster size 2; seed="Holdings may make Restricted Payments to its equity holders in a"');
    const p = deriveSeedProvenance(r, [input("edgar:a", "sha-a"), input("edgar:b", "sha-b", false, { doc: OTHER_DOC })], ids);
    expect(p.rules["lr:test-seed"]).toMatchObject({ complete: false, sourceIds: ["edgar:a"] });
    const g = selfCreditGuard(r, p, ids);
    expect(g.rulesWithoutProvenance).toBe(1);
    expect(g.refusal({ stableKey: "learned-lr:test-seed" }, { sourceId: "edgar:other" })).toBe(REFUSED_NO_PROVENANCE);
  });

  it("keeps cross-issuer generalization credit and labels it by issuer relation", () => {
    const guard = selfCreditGuard(rules, seededIn(input("edgar:a", "sha-a", true, { issuerCik: "111" })), ids);
    const cross = scoreSource(input("edgar:x", "sha-x", true, { issuerCik: "222" }), rules, manifest, undefined, { guard });
    expect(cross.counts.DISCOVERY_GAP).toBe(0);
    expect(cross.learnedCredit).toEqual({ [CREDIT_CROSS_ISSUER]: 1 });
    const same = scoreSource(input("edgar:y", "sha-y", true, { issuerCik: "0000111" }), rules, manifest, undefined, { guard });
    expect(same.counts.DISCOVERY_GAP).toBe(0);
    expect(same.learnedCredit).toEqual({ [CREDIT_SAME_ISSUER_OTHER_DOC]: 1 });
  });

  it("refuses credit in the seed document and counts it", () => {
    const a = input("edgar:a", "sha-a");
    const guard = selfCreditGuard(rules, seededIn(a), ids);
    const s = scoreSource(a, rules, manifest, undefined, { guard });
    expect(s.counts.DISCOVERY_GAP).toBe(1);
    expect(s.selfCredit).toEqual({ [REFUSED_SELF_SEEDED]: 1 });
  });

  it("refuses credit in a byte-identical copy of the seed document under another sourceId", () => {
    const guard = selfCreditGuard(rules, seededIn(input("edgar:a", "sha-a")), ids);
    const s = scoreSource(input("edgar:copy", "sha-a"), rules, manifest, undefined, { guard });
    expect(s.counts.DISCOVERY_GAP).toBe(1);
    expect(s.selfCredit).toEqual({ [REFUSED_SELF_SEEDED]: 1 });
  });

  it("still credits the rule in a different document", () => {
    const guard = selfCreditGuard(rules, seededIn(input("edgar:a", "sha-a")), ids);
    const s = scoreSource(input("edgar:other", "sha-other"), rules, manifest, undefined, { guard });
    expect(s.counts.DISCOVERY_GAP).toBe(0);
    expect(s.selfCredit).toEqual({});
  });

  it("rejects a rule without a recorded seed note (no provenance)", () => {
    const p = deriveSeedProvenance(ruleSet("hand-written"), [input("edgar:a", "sha-a")], ids);
    expect(p.rules["lr:test-seed"]).toMatchObject({ basis: "NONE", complete: false });
  });

  it("fails closed without provenance: no learned credit anywhere, rule counted", () => {
    const guard = selfCreditGuard(rules, null, ids);
    expect(guard.rulesWithoutProvenance).toBe(1);
    expect(guard.unboundReason).toMatch(/no seed provenance/);
    const s = scoreSource(input("edgar:other", "sha-other"), rules, manifest, undefined, { guard });
    expect(s.counts.DISCOVERY_GAP).toBe(1);
    expect(s.selfCredit).toEqual({ [REFUSED_NO_PROVENANCE]: 1 });
  });

  it("fails closed when a rule has no derivable seed", () => {
    const p = seededIn(input("edgar:b", "sha-b", false, { doc: OTHER_DOC }));
    expect(p.summary.incomplete).toBe(1);
    expect(p.rules["lr:test-seed"]!.basis).toBe("NONE");
    const guard = selfCreditGuard(rules, p, ids);
    expect(guard.rulesWithoutProvenance).toBe(1);
    const s = scoreSource(input("edgar:other", "sha-other"), rules, manifest, undefined, { guard });
    expect(s.selfCredit).toEqual({ [REFUSED_NO_PROVENANCE]: 1 });
  });

  it("fails closed when provenance is bound to another ruleset or snapshot", () => {
    const p = seededIn(input("edgar:a", "sha-a"));
    for (const other of [{ rulesetSha256: "x", snapshotSha256: "s" }, { rulesetSha256: "r", snapshotSha256: "y" }, { rulesetSha256: "r", snapshotSha256: null }]) {
      const g = selfCreditGuard(rules, p, other);
      expect(g.unboundReason).not.toBeNull();
      expect(g.rulesWithoutProvenance).toBe(1);
      expect(g.refusal({ stableKey: "learned-lr:test-seed" }, { sourceId: "edgar:other" })).toBe(REFUSED_NO_PROVENANCE);
    }
  });

  it("refuses every document holding the identical seed text (cannot tell which one the rule came from)", () => {
    const p = seededIn(input("edgar:a", "sha-a"), input("edgar:b", "sha-b"));
    expect(p.rules["lr:test-seed"]!.sourceIds).toEqual(["edgar:a", "edgar:b"]);
    expect(p.summary.multiDocumentSeed).toBe(1);
    const g = selfCreditGuard(rules, p, ids);
    expect(g.refusal({ stableKey: "learned-lr:test-seed" }, { sourceId: "edgar:b" })).toBe(REFUSED_SELF_SEEDED);
  });

  it("never touches non-learned baskets", () => {
    const g = selfCreditGuard(rules, null, ids);
    expect(g.refusal({ stableKey: "region-7.01-a" }, { sourceId: "edgar:a" })).toBeNull();
  });
});

describe("no-learned-rules score alongside", () => {
  it("aggregates noRulesTotals and refused self-credit by split", () => {
    const a = input("edgar:a", "sha-a");
    const guard = selfCreditGuard(rules, seededIn(a), ids);
    const s = scoreSource(a, rules, manifest, undefined, { guard, noRules: true });
    const x = scoreSource(input("edgar:x", "sha-x", true, { issuerCik: "222" }), rules, manifest, undefined, { guard, noRules: true });
    const r = aggregate([s, x], { mode: "snapshot", rulesetVersion: 9, rulesetSha256: "r", selfCredit: { provenanceSha256: "p", rulesWithoutProvenance: 0, unboundReason: null } });
    expect(r.selfCredit!.credited.HELDOUT).toEqual({ [CREDIT_ISSUER_UNKNOWN]: 1 });
    expect(r.noRulesTotals!.HELDOUT).toMatchObject({ sources: 2, DISCOVERY_GAP: 2 });
    expect(r.selfCredit!.refused.HELDOUT).toEqual({ [REFUSED_SELF_SEEDED]: 1 });
  });

  it("refuses to aggregate a report where only some sources carry a no-rules score", () => {
    const a = scoreSource(input("edgar:a", "sha-a"), rules, manifest, undefined, { noRules: true });
    const b = scoreSource(input("edgar:b", "sha-b"), rules, manifest);
    expect(() => aggregate([a, b], { mode: "snapshot", rulesetVersion: 9 })).toThrow(/no-rules score missing/);
  });

  it("the sweep path is unchanged when no guard is passed", () => {
    const a = input("edgar:a", "sha-a");
    expect(scoreSource(a, rules, manifest)).toEqual(scoreSource(a, rules, manifest, undefined, {}));
    expect(scoreSource(a, rules, manifest).selfCredit).toBeUndefined();
  });
});
