/**
 * Adjudication honesty: mechanical replay ≠ independent verification.
 * Proves a replay-only rule cannot reach INDEPENDENTLY_VERIFIED / VERIFIED
 * without held-out adjudicated goldens.
 */

import { describe, expect, it } from "vitest";
import {
  assertIndependentVerificationEvidence,
  assertNotTreatedAsVerifiedAuthority,
  LearnedRulePromotionError,
  promoteToIndependentlyVerified,
} from "@/lib/covenant-learning-factory/learned-rules/promotion";
import {
  bumpRuleSet,
  writeLearnedRules,
  loadLatestLearnedRules,
} from "@/lib/covenant-learning-factory/learned-rules/load";
import {
  emptyRuleSet,
  isIndependentlyVerified,
  isMechanicallyReplayedOnly,
  normalizeLearnedRuleState,
  type IndependentVerificationEvidence,
  type LearnedRule,
} from "@/lib/covenant-learning-factory/learned-rules/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function mechanicalRule(overrides?: Partial<LearnedRule>): LearnedRule {
  return {
    ruleId: "lr:replay-only-1",
    version: 1,
    kind: "PHRASE_PATTERN",
    pattern: "Restricted\\s+Payments",
    flags: "i",
    effect: { family: "RESTRICTED_PAYMENTS" },
    provenance: {
      ledgerErrorIds: ["e1"],
      synthesizedAt: "2026-10-14T00:00:00.000Z",
      epoch: 1,
      note: "synthesized from kf_precedent self-check",
    },
    state: "MECHANICALLY_REPLAYED",
    metrics: {
      errorsBefore: 2,
      errorsAfter: 1,
      sourcesReplayed: 2,
      goldenOk: true,
      adjudicationClass: "MECHANICAL_REPLAY",
    },
    ...overrides,
  };
}

const validHeldOut: IndependentVerificationEvidence = {
  heldOutSourceIds: ["held-out-mhk"],
  adjudicatedGoldenRefs: ["golden:mhk-rp-basket"],
  synthesisSourceIds: ["src-alpha", "src-beta"],
  replaySourceIds: ["src-alpha", "src-beta"],
  reviewerNote: "Counsel adjudicated held-out golden against MHK package",
  adjudicatedAt: "2026-10-14T12:00:00.000Z",
};

describe("learned-rule adjudication honesty", () => {
  it("normalizes legacy ACCEPTED to MECHANICALLY_REPLAYED", () => {
    expect(normalizeLearnedRuleState("ACCEPTED")).toBe("MECHANICALLY_REPLAYED");
    expect(isMechanicallyReplayedOnly(mechanicalRule({ state: "ACCEPTED" }))).toBe(true);
    expect(isIndependentlyVerified(mechanicalRule({ state: "ACCEPTED" }))).toBe(false);
  });

  it("bumpRuleSet ACCEPT path writes MECHANICALLY_REPLAYED not VERIFIED", () => {
    const dir = mkdtempSync(join(tmpdir(), "clf-adj-"));
    try {
      const next = bumpRuleSet({
        previous: emptyRuleSet(0),
        accepted: [mechanicalRule({ state: "PROPOSED" })],
        rejectedIds: [],
        epoch: 1,
      });
      writeLearnedRules(next, dir);
      const loaded = loadLatestLearnedRules(dir);
      const rule = loaded.rules.find((r) => r.ruleId === "lr:replay-only-1");
      expect(rule?.state).toBe("MECHANICALLY_REPLAYED");
      expect(rule?.metrics?.adjudicationClass).toBe("MECHANICAL_REPLAY");
      expect(isIndependentlyVerified(rule!)).toBe(false);
      expect(loaded.rules.every((r) => r.state !== "INDEPENDENTLY_VERIFIED")).toBe(true);
      expect(loaded.rules.every((r) => (r.state as string) !== "VERIFIED")).toBe(true);
      expect(loaded.writtenFrom?.mechanicallyReplayedRuleIds).toContain("lr:replay-only-1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replay-only rule cannot reach INDEPENDENTLY_VERIFIED / VERIFIED without held-out goldens", () => {
    const rule = mechanicalRule();
    expect(isMechanicallyReplayedOnly(rule)).toBe(true);

    // Production/compute must refuse to treat mechanical replay as verified authority.
    expect(() => assertNotTreatedAsVerifiedAuthority(rule)).toThrow(LearnedRulePromotionError);
    expect(() => assertNotTreatedAsVerifiedAuthority(rule)).toThrow(/not INDEPENDENTLY_VERIFIED/);

    // Empty / missing held-out evidence cannot promote.
    expect(() =>
      promoteToIndependentlyVerified(rule, {
        ...validHeldOut,
        heldOutSourceIds: [],
        adjudicatedGoldenRefs: [],
        reviewerNote: "",
      }),
    ).toThrow(/heldOutSourceIds|adjudicatedGoldenRefs|reviewerNote/);

    expect(() =>
      assertIndependentVerificationEvidence({
        ...validHeldOut,
        adjudicatedGoldenRefs: [],
      }),
    ).toThrow(/adjudicatedGoldenRefs/);

    // Contaminated held-out (overlap with synthesis/replay) blocked.
    expect(() =>
      promoteToIndependentlyVerified(rule, {
        ...validHeldOut,
        heldOutSourceIds: ["src-alpha"],
      }),
    ).toThrow(/disjoint/);

    // Still MECHANICALLY_REPLAYED — never VERIFIED / INDEPENDENTLY_VERIFIED.
    expect(rule.state).toBe("MECHANICALLY_REPLAYED");
    expect(isIndependentlyVerified(rule)).toBe(false);
    expect((rule.state as string) === "VERIFIED").toBe(false);
  });

  it("promotion succeeds only with substantive held-out adjudicated goldens", () => {
    const promoted = promoteToIndependentlyVerified(mechanicalRule(), validHeldOut);
    expect(promoted.state).toBe("INDEPENDENTLY_VERIFIED");
    expect(promoted.metrics?.adjudicationClass).toBe("INDEPENDENT_HELD_OUT");
    expect(promoted.independentVerification?.adjudicatedGoldenRefs).toEqual([
      "golden:mhk-rp-basket",
    ]);
    // Independently verified is still not production ContractRule authority —
    // assertNotTreatedAsVerifiedAuthority only blocks mechanical/proposed states.
    expect(() => assertNotTreatedAsVerifiedAuthority(promoted)).not.toThrow();
  });
});
