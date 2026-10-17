/**
 * Scoreboard self-credit guard + no-learned-rules score.
 * A learned capture rule seeded from a candidate must not earn credit for that candidate (or anything else in the
 * same document, or in a byte-identical copy of it); it may earn credit in another document. Missing / unbound seed
 * provenance fails closed (no learned credit at all) and is counted. Every source also carries a no-rules score.
 */
import { describe, expect, it } from "vitest";
import {
  aggregate,
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

function input(sourceId: string, contentSha256: string, withCandidate = true): ScoreboardSourceInput {
  return {
    source: { sourceId, contentSha256 } as ScoreboardSourceInput["source"],
    documentText: DOC,
    candidates: withCandidate ? [{ candidateId: `${sourceId}#c1`, sourceId, family: "RESTRICTED_PAYMENTS", sectionRef: null, excerpt: CLAUSE }] : [],
    definitions: [],
    conditions: [],
  } as ScoreboardSourceInput;
}

const rules: LearnedRuleSet = normalizeLearnedRuleSet({
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
      provenance: { note: 'cluster size 1; seed="Holdings may make Restricted Payments to its equity"', epoch: 1 },
    },
  ],
} as never);

const ids = { rulesetSha256: "r", snapshotSha256: "s" };
const seededIn = (...srcs: ScoreboardSourceInput[]) => deriveSeedProvenance(rules, srcs, ids);

describe("scoreboard self-credit guard", () => {
  it("precondition: the learned rule is what finds the clause (no-rules misses it, unguarded rules-on credits it)", () => {
    const a = input("edgar:a", "sha-a");
    const s = scoreSource(a, rules, manifest, undefined, { noRules: true });
    expect(s.noRules!.counts.DISCOVERY_GAP).toBe(1);
    expect(s.counts.DISCOVERY_GAP).toBe(0);
  });

  it("derives the seed document generically from the candidate the rule pattern opens", () => {
    const p = seededIn(input("edgar:a", "sha-a"), input("edgar:b", "sha-b", false));
    expect(p.rules["lr:test-seed"]).toMatchObject({ sourceIds: ["edgar:a"], contentSha256s: ["sha-a"] });
    expect(p.rules["lr:test-seed"]!.items).toEqual([{ sourceId: "edgar:a", contentSha256: "sha-a", kind: "candidate", itemId: "edgar:a#c1" }]);
    expect(p.summary).toEqual({ captureRules: 1, withSeed: 1, withoutSeed: 0, multiSourceSeed: 0 });
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

  it("fails closed without provenance: no learned credit anywhere, rule counted", () => {
    const guard = selfCreditGuard(rules, null, ids);
    expect(guard.rulesWithoutProvenance).toBe(1);
    expect(guard.unboundReason).toMatch(/no seed provenance/);
    const s = scoreSource(input("edgar:other", "sha-other"), rules, manifest, undefined, { guard });
    expect(s.counts.DISCOVERY_GAP).toBe(1);
    expect(s.selfCredit).toEqual({ [REFUSED_NO_PROVENANCE]: 1 });
  });

  it("fails closed when a rule has no derivable seed", () => {
    const p = seededIn(input("edgar:b", "sha-b", false));
    expect(p.summary.withoutSeed).toBe(1);
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

  it("refuses every document of a multi-document seed (cannot tell which one the rule came from)", () => {
    const p = seededIn(input("edgar:a", "sha-a"), input("edgar:b", "sha-b"));
    expect(p.rules["lr:test-seed"]!.sourceIds).toEqual(["edgar:a", "edgar:b"]);
    expect(p.summary.multiSourceSeed).toBe(1);
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
    const r = aggregate([s], { mode: "snapshot", rulesetVersion: 9, rulesetSha256: "r", selfCredit: { provenanceSha256: "p", rulesWithoutProvenance: 0, unboundReason: null } });
    expect(r.noRulesTotals!.HELDOUT).toMatchObject({ sources: 1, DISCOVERY_GAP: 1 });
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
