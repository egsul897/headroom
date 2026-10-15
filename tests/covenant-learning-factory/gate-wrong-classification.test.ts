/**
 * The generalization gate (>=2 train packages, held-out errors strictly fall,
 * no held-out regression) must not promote a wrong classification merely
 * because the rule's captures reduce precedent-matching errors.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateGeneralizationGate,
  findIssuersForGeneralizationSplit,
} from "@/lib/covenant-learning-factory/learned-rules/generalization-gate";
import { measureReplaySource, type ReplaySource } from "@/lib/covenant-learning-factory/learned-rules/replay-gate";
import { synthesizeCandidateRules } from "@/lib/covenant-learning-factory/learned-rules/synthesize";
import { emptyRuleSet, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import { buildComputationPackage } from "@/lib/covenant-learning-factory/sweep/build-package";

const NOW = "2026-10-15T00:00:00.000Z";
const clause = (amt: string) =>
  `each partial prepayment of the Term Loans shall be in a minimum aggregate principal amount of ${amt} and integral multiples of $1,000,000 in excess thereof`;

function src(sourceId: string, issuerCik: string, sentence: string, baseline: LearnedRuleSet): ReplaySource {
  const documentText = `Article II Prepayments.\nThe Borrower agrees that ${sentence}.\n`;
  const source = { sourceId, issuerCik, companyId: issuerCik };
  // Mislabeled precedent: a minimum-denomination clause recorded as a debt basket.
  const candidates = [{ candidateId: `${sourceId}-c`, sourceId, family: "DEBT_INCURRENCE", sectionRef: "Article II", excerpt: sentence }];
  const pkg = buildComputationPackage({ source, documentText, candidates, rules: baseline });
  const replay: ReplaySource = { sourceId, packageKey: pkg.packageKey, pkg, documentText, candidates, source, baselineErrorCount: 0 };
  replay.baselineErrorCount = measureReplaySource(replay, baseline);
  return replay;
}

describe("generalization gate vs wrong classification", () => {
  it("rejects a FIXED_DOLLAR permission rule learned from minimum-amount clauses even though errors fall", () => {
    const { train, heldout } = findIssuersForGeneralizationSplit(2, 1);
    const baseline = emptyRuleSet(0);
    const a = src("min-a", train[0]!, clause("$5,000,000"), baseline);
    const b = src("min-b", train[1]!, clause("$2,500,000"), baseline);
    const h = src("min-h", heldout[0]!, clause("$10,000,000"), baseline);
    expect(h.baselineErrorCount).toBeGreaterThan(0);

    const phrase = synthesizeCandidateRules({
      epoch: 9,
      now: NOW,
      signals: [a, b].map((s) => ({
        errorId: `e-${s.sourceId}`,
        class: "DISCOVERY_GAP" as const,
        message: "missed",
        packageKey: s.packageKey,
        evidence: { citationExcerpt: s.candidates[0]!.excerpt, expectedFamily: "DEBT_INCURRENCE" },
      })),
    }).find((r) => r.kind === "PHRASE_PATTERN");
    expect(phrase).toBeTruthy();
    // The precedent was classified as a fixed-dollar basket; the rule inherits that label.
    const wrong = { ...phrase!, effect: { ...phrase!.effect, category: "FIXED_DOLLAR" as const } };

    const gate = evaluateGeneralizationGate({
      baseline,
      candidate: wrong,
      sources: [a, b, h],
      goldens: [{ name: "uncertified", run: () => true }],
    });
    // Mechanically the captures reduce precedent-matching errors on held-out...
    expect(gate.heldoutFixed).toBeGreaterThan(0);
    expect(gate.sourcesSpanned).toBeGreaterThanOrEqual(2);
    // ...but the classification is unsupported by the matched text, so no promotion.
    expect(gate.accepted).toBe(false);
    expect(gate.rule.state).toBe("REJECTED");
    expect(gate.reason).toMatch(/classification|category|permission/i);
  });
});
