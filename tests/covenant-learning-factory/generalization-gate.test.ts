/**
 * Held-out generalization gate.
 *
 * A literal single-source phrase is rejected. A generalized rule built from
 * two or more packages is MECHANICALLY_REPLAYED only when it reduces errors
 * on held-out packages it was not built from, with no golden or held-out
 * regression. Nothing is marked INDEPENDENTLY_VERIFIED.
 */

import { describe, expect, it } from "vitest";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import {
  assignGeneralizationCohort,
  evaluateGeneralizationGate,
  findIssuersForGeneralizationSplit,
  generalizationSplitKey,
  MIN_GENERALIZATION_SUPPORT,
} from "@/lib/covenant-learning-factory/learned-rules/generalization-gate";
import { measureReplaySource, type ReplaySource } from "@/lib/covenant-learning-factory/learned-rules/replay-gate";
import { generalizePhrase } from "@/lib/covenant-learning-factory/learned-rules/generalize";
import { synthesizeCandidateRules } from "@/lib/covenant-learning-factory/learned-rules/synthesize";
import {
  emptyRuleSet,
  type LearnedRule,
  type LearnedRuleSet,
} from "@/lib/covenant-learning-factory/learned-rules/types";
import { buildComputationPackage } from "@/lib/covenant-learning-factory/sweep/build-package";

const NOW = "2026-10-14T00:00:00.000Z";

function wrap(sentence: string): string {
  return `Article IX Miscellaneous.\nThe Borrower may make ${sentence} in any fiscal year when no Event of Default exists.\n`;
}

const TRAIN_A = "distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000";
const TRAIN_B = "dividends to the Issuer under the builder basket for Restricted Payments not to exceed $12,500,000";
const HELD = "dividends to the Company under the builder basket for Restricted Payments not to exceed $2,000,000";
const LITERAL = "distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000";

function replaySource(args: {
  sourceId: string;
  issuerCik: string;
  sentence: string;
  baseline: LearnedRuleSet;
}): ReplaySource {
  const documentText = wrap(args.sentence);
  const source = { sourceId: args.sourceId, issuerCik: args.issuerCik, companyId: args.issuerCik };
  const candidates = [
    {
      candidateId: `${args.sourceId}-rp`,
      sourceId: args.sourceId,
      family: "RESTRICTED_PAYMENTS",
      sectionRef: "Article IX",
      excerpt: args.sentence,
    },
  ];
  const pkg = buildComputationPackage({
    source,
    documentText,
    candidates,
    rules: args.baseline,
  });
  const replay: ReplaySource = {
    sourceId: args.sourceId,
    packageKey: pkg.packageKey,
    pkg,
    documentText,
    candidates,
    source,
    baselineErrorCount: 0,
  };
  replay.baselineErrorCount = measureReplaySource(replay, args.baseline);
  return replay;
}

function issuers() {
  return findIssuersForGeneralizationSplit(2, 1);
}

describe("generalization split", () => {
  it("is deterministic and issuer-stable, and both cohorts occur", () => {
    const key = generalizationSplitKey({ issuerCik: "1234", packageKey: "pkg-a" });
    expect(generalizationSplitKey({ issuerCik: "0000001234", packageKey: "pkg-b" })).toBe(key);
    expect(assignGeneralizationCohort(key)).toBe(assignGeneralizationCohort(key));

    const seen = new Set<string>();
    for (let i = 1; i <= 40; i++) {
      seen.add(
        assignGeneralizationCohort(
          generalizationSplitKey({ issuerCik: String(i).padStart(10, "0") }),
        ),
      );
    }
    expect(seen.has("TRAIN")).toBe(true);
    expect(seen.has("HELD_OUT")).toBe(true);
    expect(MIN_GENERALIZATION_SUPPORT).toBe(2);
  });
});

describe("candidate synthesis generalization", () => {
  it("clusters paraphrases across packages into one general rule", () => {
    const { train } = issuers();
    const rules = synthesizeCandidateRules({
      epoch: 3,
      now: NOW,
      signals: [
        {
          errorId: "e-train-a",
          class: "DISCOVERY_GAP",
          message: "missed restricted payment",
          packageKey: "pkg-train-a",
          evidence: { citationExcerpt: TRAIN_A, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
        {
          errorId: "e-train-b",
          class: "DISCOVERY_GAP",
          message: "missed restricted payment",
          packageKey: "pkg-train-b",
          evidence: { citationExcerpt: TRAIN_B, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
      ],
    });
    const phrases = rules.filter((r) => r.kind === "PHRASE_PATTERN");
    expect(phrases).toHaveLength(1);
    const rule = phrases[0]!;
    expect(rule.provenance.sourcesSpanned).toBeGreaterThanOrEqual(2);
    expect(rule.provenance.packageKeys?.sort()).toEqual(["pkg-train-a", "pkg-train-b"]);
    expect(rule.provenance.generalized).toBe(true);
    expect(rule.pattern.includes("5,000,000")).toBe(false);
    expect(rule.pattern.includes("12,500,000")).toBe(false);
    const re = new RegExp(rule.pattern, "i");
    expect(re.test(TRAIN_A)).toBe(true);
    expect(re.test(TRAIN_B)).toBe(true);
    expect(re.test(HELD)).toBe(true);
    expect(generalizePhrase(TRAIN_A).signature).toBe(generalizePhrase(TRAIN_B).signature);
    void train;
  });
});

describe("held-out generalization gate", () => {
  it("rejects a literal single-source rule even when the same phrase fixes held-out", () => {
    const { train, heldout } = issuers();
    const baseline = emptyRuleSet(0);
    const trainSrc = replaySource({
      sourceId: "lit-train",
      issuerCik: train[0]!,
      sentence: LITERAL,
      baseline,
    });
    const heldSrc = replaySource({
      sourceId: "lit-held",
      issuerCik: heldout[0]!,
      sentence: LITERAL,
      baseline,
    });
    expect(trainSrc.baselineErrorCount).toBeGreaterThan(0);
    expect(heldSrc.baselineErrorCount).toBeGreaterThan(0);
    expect(assignGeneralizationCohort(generalizationSplitKey({ issuerCik: train[0] }))).toBe("TRAIN");
    expect(assignGeneralizationCohort(generalizationSplitKey({ issuerCik: heldout[0] }))).toBe("HELD_OUT");

    const literal: LearnedRule = {
      ruleId: "lr:literal-one-source",
      version: 0,
      kind: "PHRASE_PATTERN",
      pattern: LITERAL.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"),
      flags: "i",
      effect: { family: "RESTRICTED_PAYMENTS" },
      provenance: {
        ledgerErrorIds: ["e-lit"],
        synthesizedAt: NOW,
        epoch: 1,
        packageKeys: [trainSrc.packageKey],
        sourcesSpanned: 1,
        generalized: false,
      },
      state: "PROPOSED",
    };

    const gate = evaluateGeneralizationGate({
      baseline,
      candidate: literal,
      sources: [trainSrc, heldSrc],
      goldens: [{ name: "uncertified", run: () => true }],
    });

    expect(gate.accepted).toBe(false);
    expect(gate.rule.state).toBe("REJECTED");
    expect(gate.rule.state).not.toBe("INDEPENDENTLY_VERIFIED");
    expect(gate.rule.state).not.toBe("MECHANICALLY_REPLAYED");
    expect(gate.sourcesSpanned).toBeLessThan(2);
    expect(gate.reason).toMatch(/support|literal/i);
  });

  it("accepts a generalized multi-source rule that reduces held-out errors", () => {
    const { train, heldout } = issuers();
    const baseline = emptyRuleSet(0);
    const trainA = replaySource({
      sourceId: "gen-train-a",
      issuerCik: train[0]!,
      sentence: TRAIN_A,
      baseline,
    });
    const trainB = replaySource({
      sourceId: "gen-train-b",
      issuerCik: train[1]!,
      sentence: TRAIN_B,
      baseline,
    });
    const held = replaySource({
      sourceId: "gen-held",
      issuerCik: heldout[0]!,
      sentence: HELD,
      baseline,
    });

    const synthesized = synthesizeCandidateRules({
      epoch: 4,
      now: NOW,
      signals: [
        {
          errorId: "e-a",
          class: "DISCOVERY_GAP",
          message: "missed",
          packageKey: trainA.packageKey,
          evidence: { citationExcerpt: TRAIN_A, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
        {
          errorId: "e-b",
          class: "DISCOVERY_GAP",
          message: "missed",
          packageKey: trainB.packageKey,
          evidence: { citationExcerpt: TRAIN_B, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
      ],
    });
    const phrase = synthesized.find((r) => r.kind === "PHRASE_PATTERN");
    expect(phrase).toBeTruthy();

    const gate = evaluateGeneralizationGate({
      baseline,
      candidate: phrase!,
      sources: [trainA, trainB, held],
      goldens: [{ name: "uncertified", run: () => true }],
    });

    expect(gate.accepted).toBe(true);
    expect(gate.goldenOk).toBe(true);
    expect(gate.rule.state).toBe("MECHANICALLY_REPLAYED");
    expect(gate.rule.state).not.toBe("INDEPENDENTLY_VERIFIED");
    expect(gate.rule.metrics?.adjudicationClass).toBe("MECHANICAL_REPLAY");
    expect(gate.sourcesSpanned).toBeGreaterThanOrEqual(2);
    expect(gate.heldoutFixed).toBeGreaterThan(0);
    expect(gate.trainFixed).toBeGreaterThan(0);
    expect(gate.rule.metrics?.trainFixed).toBe(gate.trainFixed);
    expect(gate.rule.metrics?.heldoutFixed).toBe(gate.heldoutFixed);
    expect(gate.rule.metrics?.sourcesSpanned).toBe(gate.sourcesSpanned);
    expect(gate.errorsAfter).toBeLessThan(gate.errorsBefore);

    const captured = extractBasketClauses({
      documentId: held.sourceId,
      text: wrap(HELD),
      rules: { ...baseline, rules: [gate.rule] },
    });
    expect(captured.some((c) => /builder basket/i.test(c.operativeText))).toBe(true);
  });

  it("rejects a generalized rule that does not improve held-out or fails a golden", () => {
    const { train, heldout } = issuers();
    const baseline = emptyRuleSet(0);
    const trainA = replaySource({
      sourceId: "neg-train-a",
      issuerCik: train[0]!,
      sentence: TRAIN_A,
      baseline,
    });
    const trainB = replaySource({
      sourceId: "neg-train-b",
      issuerCik: train[1]!,
      sentence: TRAIN_B,
      baseline,
    });
    const unrelated = replaySource({
      sourceId: "neg-held",
      issuerCik: heldout[0]!,
      sentence: "liens on equipment securing purchase money obligations in the ordinary course",
      baseline,
    });
    const synthesized = synthesizeCandidateRules({
      epoch: 5,
      now: NOW,
      signals: [
        {
          errorId: "n-a",
          class: "DISCOVERY_GAP",
          message: "missed",
          packageKey: trainA.packageKey,
          evidence: { citationExcerpt: TRAIN_A, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
        {
          errorId: "n-b",
          class: "DISCOVERY_GAP",
          message: "missed",
          packageKey: trainB.packageKey,
          evidence: { citationExcerpt: TRAIN_B, expectedFamily: "RESTRICTED_PAYMENTS" },
        },
      ],
    });
    const phrase = synthesized.find((r) => r.kind === "PHRASE_PATTERN")!;

    const noTransfer = evaluateGeneralizationGate({
      baseline,
      candidate: phrase,
      sources: [trainA, trainB, unrelated],
      goldens: [{ name: "uncertified", run: () => true }],
    });
    expect(noTransfer.accepted).toBe(false);
    expect(noTransfer.rule.state).toBe("REJECTED");
    expect(noTransfer.heldoutFixed).toBe(0);

    const goldenFail = evaluateGeneralizationGate({
      baseline,
      candidate: phrase,
      sources: [
        trainA,
        trainB,
        replaySource({
          sourceId: "gold-held",
          issuerCik: heldout[0]!,
          sentence: HELD,
          baseline,
        }),
      ],
      goldens: [{ name: "breaks", run: () => false }],
    });
    expect(goldenFail.accepted).toBe(false);
    expect(goldenFail.goldenOk).toBe(false);
    expect(goldenFail.rule.state).toBe("REJECTED");
    expect(goldenFail.rule.state).not.toBe("INDEPENDENTLY_VERIFIED");
  });
});
